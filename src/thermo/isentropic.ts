import { DEFAULT_GAS_CONSTANT } from './constants';

/**
 * 工质气体模型。
 *
 * 自洽关系（理想气体、定比热）：
 *   cp = gamma / (gamma - 1) * R
 *   cv = R / (gamma - 1)
 *
 * 因此比热比 gamma 一变，cp/cv 必然跟着变——
 * 比热绝不允许写成与 gamma 脱钩的死数。
 */
export interface GasModel {
  /** 比热比 */
  gamma: number;
  /** 气体常数 J/(kg·K) */
  R: number;
  /** 定压比热 J/(kg·K)，由 gamma 与 R 自洽推出 */
  cp: number;
  /** 定容比热 J/(kg·K) */
  cv: number;
}

export function createGasModel(
  gamma: number,
  R: number = DEFAULT_GAS_CONSTANT,
): GasModel {
  return {
    gamma,
    R,
    cp: (gamma / (gamma - 1)) * R,
    cv: R / (gamma - 1),
  };
}

/**
 * 理想气体等熵过程的温比—压比关系：
 *   T_out / T_in = pr ^ ((gamma - 1) / gamma)
 */
export function isentropicTemperatureRatio(
  pressureRatio: number,
  gamma: number,
): number {
  return Math.pow(pressureRatio, (gamma - 1) / gamma);
}

/**
 * 理想（闭式）布雷顿循环热效率：
 *   eta_ideal = 1 - pr ^ ((1 - gamma) / gamma)
 *
 * 只取决于压比与比热比，与涡轮入口温度无关。
 */
export function idealEfficiencyClosedForm(
  pressureRatio: number,
  gamma: number,
): number {
  return 1 - Math.pow(pressureRatio, (1 - gamma) / gamma);
}

/**
 * 压气机实际出口温度。
 * 压气机等熵效率定义：
 *   eta_c = (T2s - T1) / (T2 - T1)
 * 故 T2 = T1 + (T2s - T1) / eta_c；eta_c = 1 时 T2 = T2s。
 */
export function compressorActualExitTemperature(
  inletTemperature: number,
  isentropicExitTemperature: number,
  compressorEfficiency: number,
): number {
  return (
    inletTemperature +
    (isentropicExitTemperature - inletTemperature) / compressorEfficiency
  );
}

/**
 * 涡轮实际出口温度。
 * 涡轮等熵效率定义（等熵焓降为基准）：
 *   eta_t = (T3 - T4) / (T3 - T4s)
 * 故 T4 = T3 - eta_t * (T3 - T4s)；
 * eta_t < 1 时实际出口温度高于等熵出口温度，eta_t = 1 时两者重合。
 */
export function turbineActualExitTemperature(
  turbineInletTemperature: number,
  isentropicExitTemperature: number,
  turbineEfficiency: number,
): number {
  return (
    turbineInletTemperature -
    turbineEfficiency * (turbineInletTemperature - isentropicExitTemperature)
  );
}
