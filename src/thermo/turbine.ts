import {
  GasModel,
  isentropicTemperatureRatio,
  turbineActualExitTemperature,
} from './isentropic';

/**
 * 膨胀段结果（状态 3 → 状态 4）。
 * 比功均以「涡轮出功量」为正表示，J/kg。
 */
export interface TurbineResult {
  inletTemperature: number;
  pressureRatio: number;
  isentropicEfficiency: number;
  /** 等熵膨胀终点温度 T4s，K */
  isentropicExitTemperature: number;
  /** 实际膨胀终点温度 T4，K */
  actualExitTemperature: number;
  /** 等熵比功（出功量），J/kg */
  isentropicSpecificWork: number;
  /** 实际比功（出功量），J/kg */
  specificWork: number;
}

/**
 * 膨胀过程：排气压力回到进气压力（膨胀压比等于压缩压比）。
 * 实际出口温度由等熵焓降定义反解；效率小于 1 时
 * T4 高于 T4s，效率为 1 时两者重合。
 */
export function runTurbine(
  turbineInletTemperature: number,
  pressureRatio: number,
  turbineEfficiency: number,
  gas: GasModel,
): TurbineResult {
  const T4s =
    turbineInletTemperature /
    isentropicTemperatureRatio(pressureRatio, gas.gamma);
  const T4 = turbineActualExitTemperature(
    turbineInletTemperature,
    T4s,
    turbineEfficiency,
  );

  return {
    inletTemperature: turbineInletTemperature,
    pressureRatio,
    isentropicEfficiency: turbineEfficiency,
    isentropicExitTemperature: T4s,
    actualExitTemperature: T4,
    isentropicSpecificWork: gas.cp * (turbineInletTemperature - T4s),
    specificWork: gas.cp * (turbineInletTemperature - T4),
  };
}
