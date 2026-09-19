import { DEFAULT_GAS_CONSTANT } from '../thermo/constants';
import { CycleInput, CycleKind } from '../thermo/cycle';
import {
  checkFiniteNumber,
  checkOptionalFiniteNumber,
  checkRange,
  FieldError,
} from './utils';

/** 字段中文名（错误信息里指明哪个参数） */
const LABELS = {
  pressureRatio: '压比',
  ambientTemperature: '进气温度',
  turbineInletTemperature: '涡轮入口温度',
  compressorEfficiency: '压气机等熵效率',
  turbineEfficiency: '涡轮等熵效率',
  gamma: '比热比',
  gasConstant: '气体常数',
  materialTemperatureLimit: '涡轮入口材料温度上限',
} as const;

/**
 * 校验并归一化单点循环输入。
 * @param kind ideal 时不要求两侧效率字段（强制取 1）
 */
export function validateCycleInput(
  raw: unknown,
  kind: CycleKind,
): { value: CycleInput | null; errors: FieldError[] } {
  const errors: FieldError[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      value: null,
      errors: [
        {
          field: '(body)',
          code: 'INVALID_VALUE',
          message: '请求体必须是一个工况对象',
        },
      ],
    };
  }
  const obj = raw as Record<string, unknown>;

  const required: (keyof typeof LABELS)[] =
    kind === 'actual'
      ? [
          'pressureRatio',
          'ambientTemperature',
          'turbineInletTemperature',
          'compressorEfficiency',
          'turbineEfficiency',
          'gamma',
        ]
      : [
          'pressureRatio',
          'ambientTemperature',
          'turbineInletTemperature',
          'gamma',
        ];

  for (const field of required) {
    const err = checkFiniteNumber(obj, field, LABELS[field]);
    if (err) errors.push(err);
  }
  const gasConstantErr = checkOptionalFiniteNumber(
    obj,
    'gasConstant',
    LABELS.gasConstant,
  );
  if (gasConstantErr) errors.push(gasConstantErr);
  const limitErr = checkOptionalFiniteNumber(
    obj,
    'materialTemperatureLimit',
    LABELS.materialTemperatureLimit,
  );
  if (limitErr) errors.push(limitErr);

  // 存在且有限后才做范围/关系检查，避免级联噪声
  const num = (f: string) =>
    typeof obj[f] === 'number' && Number.isFinite(obj[f])
      ? (obj[f] as number)
      : null;

  const pr = num('pressureRatio');
  if (pr !== null) {
    const e = checkRange('pressureRatio', LABELS.pressureRatio, pr, {
      min: 1,
      minExclusive: true,
    });
    if (e) errors.push(e);
  }

  const T1 = num('ambientTemperature');
  if (T1 !== null) {
    const e = checkRange(
      'ambientTemperature',
      LABELS.ambientTemperature,
      T1,
      { min: 0, minExclusive: true },
    );
    if (e) errors.push(e);
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
  if (R !== null) {
    const e = checkRange('gasConstant', LABELS.gasConstant, R, {
      min: 0,
      minExclusive: true,
    });
    if (e) errors.push(e);
  }

  if (kind === 'actual') {
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
  }

  // 关系约束：涡轮入口温度不得低于进气温度
  const T3 = num('turbineInletTemperature');
  if (T1 !== null && T3 !== null && T3 < T1) {
    errors.push({
      field: 'turbineInletTemperature',
      code: 'OUT_OF_RANGE',
      message: `「${LABELS.turbineInletTemperature}」(${T3} K) 不得低于「${LABELS.ambientTemperature}」(${T1} K)`,
      rejectedValue: T3,
      constraint: `turbineInletTemperature >= ambientTemperature (${T1})`,
    });
  }

  // 材料上限若提供必须为正
  const limit = num('materialTemperatureLimit');
  if (limit !== null && limit <= 0) {
    errors.push({
      field: 'materialTemperatureLimit',
      code: 'OUT_OF_RANGE',
      message: `「${LABELS.materialTemperatureLimit}」必须为正的热力学温度`,
      rejectedValue: limit,
    });
  }

  if (errors.length > 0) return { value: null, errors };

  return {
    value: {
      kind,
      pressureRatio: pr as number,
      ambientTemperature: T1 as number,
      turbineInletTemperature: T3 as number,
      compressorEfficiency:
        kind === 'actual'
          ? (num('compressorEfficiency') as number)
          : 1,
      turbineEfficiency:
        kind === 'actual' ? (num('turbineEfficiency') as number) : 1,
      gamma: gamma as number,
      gasConstant: R ?? DEFAULT_GAS_CONSTANT,
      materialTemperatureLimit: limit,
    },
    errors: [],
  };
}
