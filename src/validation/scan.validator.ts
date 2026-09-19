import { DEFAULT_GAS_CONSTANT, MAX_SCAN_POINTS } from '../thermo/constants';
import { PressureRatioScanInput } from '../thermo/scan';
import {
  checkFiniteNumber,
  checkOptionalFiniteNumber,
  checkRange,
  FieldError,
} from './utils';

const LABELS = {
  ambientTemperature: '进气温度',
  turbineInletTemperature: '涡轮入口温度',
  compressorEfficiency: '压气机等熵效率',
  turbineEfficiency: '涡轮等熵效率',
  gamma: '比热比',
  gasConstant: '气体常数',
  minPressureRatio: '最小压比',
  maxPressureRatio: '最大压比',
  step: '扫描步长',
  materialTemperatureLimit: '涡轮入口材料温度上限',
} as const;

export function validateScanInput(raw: unknown): {
  value: PressureRatioScanInput | null;
  errors: FieldError[];
} {
  const errors: FieldError[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      value: null,
      errors: [
        {
          field: '(body)',
          code: 'INVALID_VALUE',
          message: '请求体必须是一个扫描参数对象',
        },
      ],
    };
  }
  const obj = raw as Record<string, unknown>;

  const fields = [
    'ambientTemperature',
    'turbineInletTemperature',
    'compressorEfficiency',
    'turbineEfficiency',
    'gamma',
    'minPressureRatio',
    'maxPressureRatio',
    'step',
  ] as const;
  for (const field of fields) {
    const err = checkFiniteNumber(obj, field, LABELS[field]);
    if (err) errors.push(err);
  }
  const gasErr = checkOptionalFiniteNumber(obj, 'gasConstant', LABELS.gasConstant);
  if (gasErr) errors.push(gasErr);
  const limitErr = checkOptionalFiniteNumber(
    obj,
    'materialTemperatureLimit',
    LABELS.materialTemperatureLimit,
  );
  if (limitErr) errors.push(limitErr);

  const num = (f: string) =>
    typeof obj[f] === 'number' && Number.isFinite(obj[f])
      ? (obj[f] as number)
      : null;

  const T1 = num('ambientTemperature');
  if (T1 !== null && T1 <= 0) {
    errors.push({
      field: 'ambientTemperature',
      code: 'OUT_OF_RANGE',
      message: '「进气温度」必须为正的热力学温度',
      rejectedValue: T1,
    });
  }
  const gamma = num('gamma');
  if (gamma !== null) {
    const e = checkRange('gamma', LABELS.gamma, gamma, {
      min: 1,
      minExclusive: true,
    });
    if (e) errors.push(e);
  }
  const R = num('gasConstant');
  if (R !== null && R <= 0) {
    errors.push({
      field: 'gasConstant',
      code: 'OUT_OF_RANGE',
      message: '「气体常数」必须为正',
      rejectedValue: R,
    });
  }
  for (const field of ['compressorEfficiency', 'turbineEfficiency'] as const) {
    const eta = num(field);
    if (eta !== null) {
      const e = checkRange(field, LABELS[field], eta, {
        min: 0,
        minExclusive: true,
        max: 1,
      });
      if (e) errors.push(e);
    }
  }

  const minPr = num('minPressureRatio');
  if (minPr !== null) {
    const e = checkRange('minPressureRatio', LABELS.minPressureRatio, minPr, {
      min: 1,
      minExclusive: true,
    });
    if (e) errors.push(e);
  }
  const step = num('step');
  if (step !== null) {
    const e = checkRange('step', LABELS.step, step, {
      min: 0,
      minExclusive: true,
    });
    if (e) errors.push(e);
  }
  const maxPr = num('maxPressureRatio');
  const T3 = num('turbineInletTemperature');
  if (minPr !== null && maxPr !== null && maxPr < minPr) {
    errors.push({
      field: 'maxPressureRatio',
      code: 'OUT_OF_RANGE',
      message: `「最大压比」(${maxPr}) 不得小于「最小压比」(${minPr})`,
      rejectedValue: maxPr,
    });
  }
  if (
    minPr !== null &&
    maxPr !== null &&
    step !== null &&
    step > 0 &&
    maxPr >= minPr
  ) {
    const estimatedPoints = Math.floor((maxPr - minPr) / step) + 2;
    if (estimatedPoints > MAX_SCAN_POINTS) {
      errors.push({
        field: 'step',
        code: 'OUT_OF_RANGE',
        message: `扫描网格约 ${estimatedPoints} 点，超过上限 ${MAX_SCAN_POINTS}，请加大步长或缩小区间`,
        rejectedValue: step,
      });
    }
  }
  if (T1 !== null && T3 !== null && T3 < T1) {
    errors.push({
      field: 'turbineInletTemperature',
      code: 'OUT_OF_RANGE',
      message: `「涡轮入口温度」(${T3} K) 不得低于「进气温度」(${T1} K)`,
      rejectedValue: T3,
    });
  }
  const limit = num('materialTemperatureLimit');
  if (limit !== null && limit <= 0) {
    errors.push({
      field: 'materialTemperatureLimit',
      code: 'OUT_OF_RANGE',
      message: '「涡轮入口材料温度上限」必须为正的热力学温度',
      rejectedValue: limit,
    });
  }

  if (errors.length > 0) return { value: null, errors };

  return {
    value: {
      kind: 'actual',
      ambientTemperature: T1 as number,
      turbineInletTemperature: T3 as number,
      compressorEfficiency: num('compressorEfficiency') as number,
      turbineEfficiency: num('turbineEfficiency') as number,
      gamma: gamma as number,
      gasConstant: R ?? DEFAULT_GAS_CONSTANT,
      minPressureRatio: minPr as number,
      maxPressureRatio: maxPr as number,
      step: step as number,
      materialTemperatureLimit: limit,
    },
    errors: [],
  };
}
