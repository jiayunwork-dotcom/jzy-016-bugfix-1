import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { CalculationsModule } from '../src/calculations/calculations.module';
import { CyclesService } from '../src/calculations/cycles.service';
import { HistoryService } from '../src/calculations/history.service';
import { PersistenceModule } from '../src/persistence/persistence.module';
import { InMemoryHistoryRepository } from '../src/persistence/repositories/in-memory-history.repository';
import { HISTORY_REPOSITORY } from '../src/persistence/history.repository';
import { ValidationException } from '../src/calculations/validation.exception';

async function buildApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [PersistenceModule.forInMemory(), CalculationsModule],
  }).compile();
  return {
    cycles: moduleRef.get(CyclesService),
    history: moduleRef.get(HistoryService),
    repo: moduleRef.get(HISTORY_REPOSITORY) as InMemoryHistoryRepository,
  };
}

const goodCase = {
  pressureRatio: 12,
  ambientTemperature: 300,
  turbineInletTemperature: 1400,
  compressorEfficiency: 0.86,
  turbineEfficiency: 0.9,
  gamma: 1.4,
};

describe('CyclesService 编排', () => {
  test('实际/理想单点核算返回完整四状态点', async () => {
    const { cycles } = await buildApp();
    const actual = await cycles.computeActual(goodCase);
    expect(actual.kind).toBe('actual');
    expect(actual.states.compressorOutlet.temperature).toBeGreaterThan(300);
    expect(actual.thermalEfficiency).toBeLessThan(
      actual.idealClosedFormEfficiency,
    );

    const ideal = await cycles.computeIdeal({
      pressureRatio: 12,
      ambientTemperature: 300,
      turbineInletTemperature: 1400,
      gamma: 1.4,
    });
    expect(ideal.thermalEfficiency).toBeCloseTo(
      ideal.idealClosedFormEfficiency,
      12,
    );
  });

  test('非法单点抛 ValidationException，携带字段错误', async () => {
    const { cycles } = await buildApp();
    await expect(
      cycles.computeActual({ ...goodCase, pressureRatio: 1 }),
    ).rejects.toBeInstanceOf(ValidationException);
  });

  test('批量部分失败：非法组带 caseNumber/字段，合法组有结果，汇总计数正确', async () => {
    const { cycles } = await buildApp();
    const out = await cycles.batch({
      cases: [
        goodCase,
        { ...goodCase, compressorEfficiency: 0 },
        { ...goodCase, pressureRatio: 20, turbineInletTemperature: 1500 },
      ],
    });
    expect(out.total).toBe(3);
    expect(out.succeeded).toBe(2);
    expect(out.failed).toBe(1);
    expect(out.cases[0].ok).toBe(true);
    expect(out.cases[0].result?.netWork).toBeGreaterThan(0);
    expect(out.cases[1].ok).toBe(false);
    expect(out.cases[1].caseNumber).toBe(2);
    expect(out.cases[1].errors?.map((e) => e.field)).toContain(
      'compressorEfficiency',
    );
    expect(out.cases[2].ok).toBe(true);
    // 失败组绝不产出貌似正常的效率
    expect(out.cases[1].result).toBeUndefined();
  });

  test('批量包络非法（缺 cases）整体 400', async () => {
    const { cycles } = await buildApp();
    await expect(cycles.batch({ nope: [] })).rejects.toBeInstanceOf(
      ValidationException,
    );
  });
});

describe('历史持久化', () => {
  test('每次核算都落库并可按类型/数值条件查询', async () => {
    const { cycles, history } = await buildApp();
    await cycles.computeActual({ ...goodCase, pressureRatio: 8 });
    await cycles.computeActual({ ...goodCase, pressureRatio: 20 });
    await cycles.scan({
      ambientTemperature: 300,
      turbineInletTemperature: 1400,
      compressorEfficiency: 0.86,
      turbineEfficiency: 0.9,
      gamma: 1.4,
      minPressureRatio: 2,
      maxPressureRatio: 30,
      step: 1,
    });

    const cyclesPage = await history.find({ type: 'cycle', limit: 50, offset: 0 });
    expect(cyclesPage.total).toBe(2);
    expect(cyclesPage.items.every((r) => r.type === 'cycle')).toBe(true);

    const scans = await history.find({ type: 'scan', limit: 50, offset: 0 });
    expect(scans.total).toBe(1);
    expect((scans.items[0].output as { shape: string }).shape).toBe(
      'RISE_THEN_FALL',
    );

    const filtered = await history.find({
      pressureRatio: 8,
      limit: 50,
      offset: 0,
    });
    expect(filtered.total).toBe(1);
    expect((filtered.items[0].input as { pressureRatio: number }).pressureRatio).toBe(8);
  });

  test('批量核算也持久化为 batch 记录，成功失败都在 output 里', async () => {
    const { cycles, history } = await buildApp();
    await cycles.batch({
      cases: [goodCase, { ...goodCase, pressureRatio: 1 }],
    });
    const page = await history.find({ type: 'batch', limit: 50, offset: 0 });
    expect(page.total).toBe(1);
    const out = page.items[0].output as { succeeded: number; failed: number };
    expect(out.succeeded).toBe(1);
    expect(out.failed).toBe(1);
  });

  test('非法单点不产生历史记录', async () => {
    const { cycles, history } = await buildApp();
    await expect(
      cycles.computeActual({ ...goodCase, gamma: 0.5 }),
    ).rejects.toBeInstanceOf(ValidationException);
    const page = await history.find({ limit: 50, offset: 0 });
    expect(page.total).toBe(0);
  });
});

describe('并发：多路请求结果互不干扰、历史不错乱', () => {
  test('N 路不同压比并发核算，各自返回正确结果且历史条数精确', async () => {
    const { cycles, history } = await buildApp();
    const pressureRatios = Array.from({ length: 24 }, (_, i) => 2 + i * 0.75);

    const results = await Promise.all(
      pressureRatios.map((pr) =>
        cycles.computeActual({ ...goodCase, pressureRatio: pr }),
      ),
    );

    // 每一路只看到自己的压比，不存在串扰
    results.forEach((r, i) => {
      expect(r.input.pressureRatio).toBeCloseTo(pressureRatios[i], 12);
      expect(r.states.compressorOutlet.relativePressure).toBeCloseTo(
        pressureRatios[i],
        12,
      );
      expect(r.heatAdded).toBeGreaterThan(0);
    });

    const page = await history.find({ type: 'cycle', limit: 200, offset: 0 });
    expect(page.total).toBe(pressureRatios.length);
    const persisted = page.items.map((r) =>
      (r.input as { pressureRatio: number }).pressureRatio,
    );
    pressureRatios.forEach((pr) => {
      expect(persisted.some((p) => Math.abs(p - pr) < 1e-9)).toBe(true);
    });
  });

  test('并发混合：单点/扫描/批量同时到达，记录类型各自归位', async () => {
    const { cycles, history } = await buildApp();
    await Promise.all([
      cycles.computeActual(goodCase),
      cycles.computeIdeal({
        pressureRatio: 10,
        ambientTemperature: 300,
        turbineInletTemperature: 1400,
        gamma: 1.4,
      }),
      cycles.scan({
        ambientTemperature: 300,
        turbineInletTemperature: 1400,
        compressorEfficiency: 0.86,
        turbineEfficiency: 0.9,
        gamma: 1.4,
        minPressureRatio: 2,
        maxPressureRatio: 30,
        step: 2,
      }),
      cycles.batch({ cases: [goodCase, { ...goodCase, pressureRatio: 5 }] }),
    ]);

    const counts = await Promise.all([
      history.find({ type: 'cycle', limit: 200, offset: 0 }),
      history.find({ type: 'scan', limit: 200, offset: 0 }),
      history.find({ type: 'batch', limit: 200, offset: 0 }),
    ]);
    expect(counts[0].total).toBe(2);
    expect(counts[1].total).toBe(1);
    expect(counts[2].total).toBe(1);
  });

  test('保存的记录被深拷贝，后续修改请求对象不改写历史', async () => {
    const { cycles, history } = await buildApp();
    const payload = { ...goodCase, pressureRatio: 9 };
    await cycles.computeActual(payload);
    payload.pressureRatio = 999; // 事后篡改
    const page = await history.find({ type: 'cycle', limit: 10, offset: 0 });
    expect((page.items[0].input as { pressureRatio: number }).pressureRatio).toBe(9);
  });
});
