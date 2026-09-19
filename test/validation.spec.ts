import { validateCycleInput } from '../src/validation/cycle.validator';
import { validateScanInput } from '../src/validation/scan.validator';
import { validateBatch } from '../src/validation/batch.validator';
import { validateHistoryQuery } from '../src/validation/history.validator';

const good = {
  pressureRatio: 12,
  ambientTemperature: 300,
  turbineInletTemperature: 1400,
  compressorEfficiency: 0.86,
  turbineEfficiency: 0.9,
  gamma: 1.4,
};

describe('单点输入校验', () => {
  test('合法输入通过并补默认 R', () => {
    const { value, errors } = validateCycleInput(good, 'actual');
    expect(errors).toHaveLength(0);
    expect(value?.gasConstant).toBe(287);
    expect(value?.materialTemperatureLimit).toBeNull();
  });

  test.each([
    ['缺字段', { ...good, pressureRatio: undefined }, 'pressureRatio', 'MISSING'],
    ['非数值', { ...good, gamma: '高' }, 'gamma', 'NOT_A_NUMBER'],
    ['NaN', { ...good, gamma: NaN }, 'gamma', 'NOT_A_NUMBER'],
    ['Infinity', { ...good, gamma: Infinity }, 'gamma', 'NOT_FINITE'],
    ['压比不大于1', { ...good, pressureRatio: 1 }, 'pressureRatio', 'OUT_OF_RANGE'],
    ['压比为0.5', { ...good, pressureRatio: 0.5 }, 'pressureRatio', 'OUT_OF_RANGE'],
    ['进气温度非正', { ...good, ambientTemperature: 0 }, 'ambientTemperature', 'OUT_OF_RANGE'],
    ['gamma不大于1', { ...good, gamma: 1 }, 'gamma', 'OUT_OF_RANGE'],
    ['压气机效率0', { ...good, compressorEfficiency: 0 }, 'compressorEfficiency', 'OUT_OF_RANGE'],
    ['压气机效率1.2', { ...good, compressorEfficiency: 1.2 }, 'compressorEfficiency', 'OUT_OF_RANGE'],
    ['涡轮效率-0.1', { ...good, turbineEfficiency: -0.1 }, 'turbineEfficiency', 'OUT_OF_RANGE'],
    ['T3低于T1', { ...good, turbineInletTemperature: 290 }, 'turbineInletTemperature', 'OUT_OF_RANGE'],
    ['R为负', { ...good, gasConstant: -1 }, 'gasConstant', 'OUT_OF_RANGE'],
  ] as const)('%s 被拒并指向参数 %s', (_name, input, field, code) => {
    const { value, errors } = validateCycleInput(input, 'actual');
    expect(value).toBeNull();
    const hit = errors.find((e) => e.field === field);
    expect(hit).toBeDefined();
    expect(hit?.code).toBe(code);
  });

  test('效率 = 1 边界合法', () => {
    const { errors } = validateCycleInput(
      { ...good, compressorEfficiency: 1, turbineEfficiency: 1 },
      'actual',
    );
    expect(errors).toHaveLength(0);
  });

  test('T3 恰等于 T1 合法（加热量为零是物理结果不是非法入参）', () => {
    const { errors } = validateCycleInput(
      { ...good, turbineInletTemperature: 300 },
      'actual',
    );
    expect(errors).toHaveLength(0);
  });

  test('理想路径不要求效率字段，归一化为 1', () => {
    const { value, errors } = validateCycleInput(
      {
        pressureRatio: 8,
        ambientTemperature: 300,
        turbineInletTemperature: 1400,
        gamma: 1.4,
      },
      'ideal',
    );
    expect(errors).toHaveLength(0);
    expect(value?.compressorEfficiency).toBe(1);
    expect(value?.turbineEfficiency).toBe(1);
  });

  test('一次性报告多个非法字段', () => {
    const { errors } = validateCycleInput(
      { pressureRatio: 0.5, gamma: 0.9 },
      'actual',
    );
    expect(errors.length).toBeGreaterThanOrEqual(4);
    expect(errors.map((e) => e.field)).toEqual(
      expect.arrayContaining(['pressureRatio', 'gamma', 'ambientTemperature', 'turbineInletTemperature']),
    );
  });
});

describe('扫描输入校验', () => {
  const goodScan = {
    ambientTemperature: 300,
    turbineInletTemperature: 1400,
    compressorEfficiency: 0.86,
    turbineEfficiency: 0.9,
    gamma: 1.4,
    minPressureRatio: 2,
    maxPressureRatio: 40,
    step: 0.5,
  };

  test('合法通过', () => {
    expect(validateScanInput(goodScan).errors).toHaveLength(0);
  });

  test.each([
    ['最小压比<=1', { minPressureRatio: 1 }, 'minPressureRatio'],
    ['步长为0', { step: 0 }, 'step'],
    ['步长为负', { step: -1 }, 'step'],
    ['最大压比小于最小压比', { minPressureRatio: 30, maxPressureRatio: 10 }, 'maxPressureRatio'],
    ['缺效率', { compressorEfficiency: undefined }, 'compressorEfficiency'],
    ['T3低于T1', { turbineInletTemperature: 200 }, 'turbineInletTemperature'],
  ] as const)('%s', (_name, over, field) => {
    const { value, errors } = validateScanInput({ ...goodScan, ...over });
    expect(value).toBeNull();
    expect(errors.find((e) => e.field === field)).toBeDefined();
  });
});

describe('批量校验：部分失败其余成功', () => {
  test('逐组指明第几组、哪个参数，合法组照常返回', () => {
    const { items, envelopeError } = validateBatch({
      cases: [
        good,
        { ...good, pressureRatio: 0.8 }, // 第2组压比非法
        'not-an-object', // 第3组结构非法
        { kind: 'ideal', pressureRatio: 5, ambientTemperature: 300, turbineInletTemperature: 1200, gamma: 1.4 }, // 第4组 ideal ok
        { ...good, turbineEfficiency: 2 }, // 第5组涡轮效率越界
      ],
    });
    expect(envelopeError).toBeNull();
    expect(items).toHaveLength(5);
    expect(items[0].ok).toBe(true);
    expect(items[1].ok).toBe(false);
    expect(items[1].caseNumber).toBe(2);
    expect(items[1].errors?.[0].field).toBe('pressureRatio');
    expect(items[2].ok).toBe(false);
    expect(items[2].caseNumber).toBe(3);
    expect(items[3].ok).toBe(true);
    expect(items[4].ok).toBe(false);
    expect(items[4].errors?.[0].field).toBe('turbineEfficiency');
  });

  test('cases 缺失/非数组/空数组给出包络错误', () => {
    expect(validateBatch({}).envelopeError?.field).toBe('cases');
    expect(validateBatch({ cases: 'x' }).envelopeError?.field).toBe('cases');
    expect(validateBatch({ cases: [] }).envelopeError?.field).toBe('cases');
    expect(validateBatch(null).envelopeError).not.toBeNull();
  });

  test('显式 kind=ideal 的组按理想循环校验', () => {
    const { items } = validateBatch({
      cases: [
        { kind: 'ideal', pressureRatio: 8, ambientTemperature: 300, turbineInletTemperature: 1400, gamma: 1.4 },
      ],
    });
    expect(items[0].ok).toBe(true);
    expect(items[0].input?.kind).toBe('ideal');
  });
});

describe('历史查询参数校验', () => {
  test('全空合法，默认分页', () => {
    const { value } = validateHistoryQuery({});
    expect(value?.limit).toBe(50);
    expect(value?.offset).toBe(0);
  });

  test('type 白名单', () => {
    expect(validateHistoryQuery({ type: 'scan' }).value?.type).toBe('scan');
    expect(validateHistoryQuery({ type: 'nope' }).errors[0].field).toBe('type');
  });

  test('limit 越界拒绝', () => {
    expect(validateHistoryQuery({ limit: 0 }).errors[0].field).toBe('limit');
    expect(validateHistoryQuery({ limit: 999999 }).errors[0].field).toBe('limit');
  });
});
