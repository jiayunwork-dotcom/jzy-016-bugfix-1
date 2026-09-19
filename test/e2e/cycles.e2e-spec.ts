import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestAppModule } from './test-app.module';
import { AllExceptionsFilter } from '../../src/all-exceptions.filter';

describe('布雷顿循环服务 (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    // 固定监听，避免 supertest 为每个并发请求临时开/关监听器造成 ECONNRESET
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  const goodCase = {
    pressureRatio: 12,
    ambientTemperature: 300,
    turbineInletTemperature: 1400,
    compressorEfficiency: 0.86,
    turbineEfficiency: 0.9,
    gamma: 1.4,
  };

  describe('GET /conventions', () => {
    test('回显默认比热比、材料上限策略与容差', async () => {
      const res = await request(server).get('/conventions').expect(200);
      expect(res.body.gasModel.defaultGamma).toBe(1.4);
      expect(res.body.gasModel.defaultGasConstant).toBe(287);
      expect(res.body.materialTemperatureLimit.policy).toBe(
        'FLAG_ONLY_NEVER_CLAMP',
      );
      expect(res.body.materialTemperatureLimit.marker).toBe('受入口温度限制');
      expect(res.body.tolerances.efficiencyClosedForm).toBe(1e-9);
      expect(res.body.zeroHeatRule).toContain('null');
    });
  });

  describe('GET /health', () => {
    test('存活与就绪探针可用', async () => {
      await request(server).get('/health/live').expect(200);
      const ready = await request(server).get('/health/ready').expect(200);
      expect(ready.body.status).toBe('ok');
      expect(ready.body.checks.database.status).toBe('up');
    });
  });

  describe('POST /cycles/ideal', () => {
    test('效率=1 闭式，且与 T3 无关；压比 8→20 效率升高', async () => {
      const mk = (pr: number, T3: number) =>
        request(server)
          .post('/cycles/ideal')
          .send({ pressureRatio: pr, ambientTemperature: 300, turbineInletTemperature: T3, gamma: 1.4 });

      const r1 = await mk(8, 1400).expect(200);
      const r2 = await mk(20, 1400).expect(200);
      const r3 = await mk(20, 1800).expect(200);
      expect(r1.body.thermalEfficiency).toBeCloseTo(
        1 - Math.pow(8, (1 - 1.4) / 1.4),
        10,
      );
      expect(r2.body.thermalEfficiency).toBeGreaterThan(r1.body.thermalEfficiency);
      expect(r3.body.thermalEfficiency).toBeCloseTo(
        r2.body.thermalEfficiency,
        12,
      );
    });
  });

  describe('POST /cycles/actual', () => {
    test('返回四状态点、比净功为正、实际效率低于理想闭式', async () => {
      const res = await request(server)
        .post('/cycles/actual')
        .send(goodCase)
        .expect(200);
      const { states, netWork, thermalEfficiency, idealClosedFormEfficiency, heatAdded } = res.body;
      expect(states.compressorInlet.relativePressure).toBe(1);
      expect(states.compressorOutlet.relativePressure).toBe(12);
      expect(states.turbineInlet.relativePressure).toBe(12);
      expect(states.exhaust.relativePressure).toBe(1);
      expect(netWork).toBeGreaterThan(0);
      expect(thermalEfficiency).toBeLessThan(idealClosedFormEfficiency);
      expect(heatAdded).toBeGreaterThan(0);
    });

    test('压气机效率下降则净功下降', async () => {
      const full = await request(server)
        .post('/cycles/actual')
        .send({ ...goodCase, compressorEfficiency: 1, turbineEfficiency: 1 });
      const degraded = await request(server)
        .post('/cycles/actual')
        .send({ ...goodCase, compressorEfficiency: 0.8, turbineEfficiency: 1 });
      expect(degraded.body.netWork).toBeLessThan(full.body.netWork);
    });

    test('T3 等于压气机出口：加热量零、净功非正、效率为 null', async () => {
      // 先用一次结果拿 T2
      const first = await request(server)
        .post('/cycles/actual')
        .send({ ...goodCase, compressorEfficiency: 0.8 });
      const T2 = first.body.states.compressorOutlet.temperature;
      const res = await request(server)
        .post('/cycles/actual')
        .send({ ...goodCase, compressorEfficiency: 0.8, turbineInletTemperature: T2 })
        .expect(200);
      expect(Math.abs(res.body.heatAdded)).toBeLessThan(1e-3);
      expect(res.body.netWork).toBeLessThanOrEqual(0);
      expect(res.body.thermalEfficiency).toBeNull();
    });

    test('材料上限只标注不静默截断', async () => {
      const res = await request(server)
        .post('/cycles/actual')
        .send({ ...goodCase, materialTemperatureLimit: 1300 })
        .expect(200);
      expect(res.body.materialLimit.exceeded).toBe(true);
      expect(res.body.materialLimit.marker).toBe('受入口温度限制');
      expect(res.body.materialLimit.effectiveTurbineInletTemperature).toBe(1400);
      expect(res.body.states.turbineInlet.temperature).toBe(1400);
    });

    test('非法参数：缺字段/非数值/非有限值/越界返回 400 且指明参数', async () => {
      const cases = [
        { ...goodCase, pressureRatio: undefined },
        { ...goodCase, gamma: 'x' },
        { ...goodCase, turbineInletTemperature: Infinity },
        { ...goodCase, compressorEfficiency: 1.5 },
        { ...goodCase, turbineInletTemperature: 200 },
      ];
      for (const c of cases) {
        const res = await request(server)
          .post('/cycles/actual')
          .send(c)
          .expect(400);
        expect(res.body.error).toBe('VALIDATION_FAILED');
        expect(Array.isArray(res.body.errors)).toBe(true);
        expect(res.body.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('POST /cycles/scan', () => {
    const scanBody = {
      ambientTemperature: 300,
      turbineInletTemperature: 1400,
      compressorEfficiency: 0.86,
      turbineEfficiency: 0.9,
      gamma: 1.4,
      minPressureRatio: 2,
      maxPressureRatio: 40,
      step: 0.5,
    };

    test('扫描结果观察到净功先升后降拐点并返回最优点', async () => {
      const res = await request(server)
        .post('/cycles/scan')
        .send(scanBody)
        .expect(200);
      expect(res.body.shape).toBe('RISE_THEN_FALL');
      expect(res.body.optimum.index).toBeGreaterThan(0);
      expect(res.body.optimum.index).toBeLessThan(res.body.count - 1);
      for (const p of res.body.points) {
        expect(p.netWork).toBeLessThanOrEqual(res.body.optimum.netWork + 1e-9);
      }
      expect(res.body.points.at(-1).netWork).toBeLessThan(
        0.8 * res.body.optimum.netWork,
      );
    });

    test('扫描非法入参 400', async () => {
      await request(server)
        .post('/cycles/scan')
        .send({ ...scanBody, step: 0 })
        .expect(400);
      await request(server)
        .post('/cycles/scan')
        .send({ ...scanBody, maxPressureRatio: 1 })
        .expect(400);
    });
  });

  describe('POST /cycles/batch', () => {
    test('部分失败其余成功：200 + 逐组 ok/errors', async () => {
      const res = await request(server)
        .post('/cycles/batch')
        .send({
          cases: [
            goodCase,
            { ...goodCase, pressureRatio: 0.5 },
            { ...goodCase, gamma: 1 },
            { kind: 'ideal', pressureRatio: 10, ambientTemperature: 300, turbineInletTemperature: 1400, gamma: 1.4 },
            { ...goodCase, turbineEfficiency: 0 },
          ],
        })
        .expect(200);
      expect(res.body.total).toBe(5);
      expect(res.body.succeeded).toBe(2);
      expect(res.body.failed).toBe(3);
      expect(res.body.cases[0].ok).toBe(true);
      expect(res.body.cases[1].caseNumber).toBe(2);
      expect(res.body.cases[1].errors[0].field).toBe('pressureRatio');
      expect(res.body.cases[2].errors[0].field).toBe('gamma');
      expect(res.body.cases[3].ok).toBe(true);
      expect(res.body.cases[3].result.kind).toBe('ideal');
      expect(res.body.cases[4].errors[0].field).toBe('turbineEfficiency');
    });

    test('缺 cases 整体 400', async () => {
      const res = await request(server)
        .post('/cycles/batch')
        .send({ nope: [] })
        .expect(400);
      expect(res.body.errors[0].field).toBe('cases');
    });
  });

  describe('GET /cycles/demo 与历史', () => {
    test('demo 净功为正且低于理想闭式', async () => {
      const res = await request(server).get('/cycles/demo').expect(200);
      expect(res.body.input.pressureRatio).toBe(12);
      expect(res.body.result.netWork).toBeGreaterThan(0);
      expect(res.body.result.thermalEfficiency).toBeLessThan(
        res.body.result.idealClosedFormEfficiency,
      );
    });

    test('历史落库并支持条件查询', async () => {
      await request(server)
        .post('/cycles/actual')
        .send({ ...goodCase, pressureRatio: 7 });
      const res = await request(server)
        .get('/cycles/history?type=cycle&pressureRatio=7')
        .expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(res.body.items[0].type).toBe('cycle');
      expect(res.body.items[0].input.pressureRatio).toBe(7);
    });
  });

  describe('并发互不串扰 (HTTP)', () => {
    test('30 路并发 actual 请求各自结果正确、历史无丢失', async () => {
      const ratios = Array.from({ length: 30 }, (_, i) => 2 + i * 0.9);
      const responses = await Promise.all(
        ratios.map((pr) =>
          request(server)
            .post('/cycles/actual')
            .send({ ...goodCase, pressureRatio: pr }),
        ),
      );
      responses.forEach((res, i) => {
        expect(res.status).toBe(200);
        expect(res.body.input.pressureRatio).toBeCloseTo(ratios[i], 10);
        expect(res.body.netWork).toEqual(expect.any(Number));
      });

      const hist = await request(server)
        .get('/cycles/history?type=cycle&limit=500')
        .expect(200);
      const prs = hist.body.items.map((i: { input: { pressureRatio: number } }) => i.input.pressureRatio);
      for (const pr of ratios) {
        expect(prs.some((p: number) => Math.abs(p - pr) < 1e-9)).toBe(true);
      }
    });
  });
});
