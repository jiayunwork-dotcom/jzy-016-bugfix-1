import {
  compressorActualExitTemperature,
  GasModel,
  isentropicTemperatureRatio,
} from './isentropic';

/**
 * 压缩段结果（状态 1 → 状态 2）。
 * 比功均以「压气机耗功量」为正表示，J/kg。
 */
export interface CompressorResult {
  inletTemperature: number;
  pressureRatio: number;
  isentropicEfficiency: number;
  /** 等熵压缩终点温度 T2s，K */
  isentropicExitTemperature: number;
  /** 实际压缩终点温度 T2，K */
  actualExitTemperature: number;
  /** 等熵比功（耗功量），J/kg */
  isentropicSpecificWork: number;
  /** 实际比功（耗功量），J/kg */
  specificWork: number;
}

/**
 * 压缩过程：
 * 1. 等熵终点温度由 T1、压比、gamma 经等熵关系唯一确定；
 * 2. 计入压气机效率后实际温升高于等熵温升，效率为 1 时重合。
 */
export function runCompressor(
  inletTemperature: number,
  pressureRatio: number,
  compressorEfficiency: number,
  gas: GasModel,
): CompressorResult {
  const T2s =
    inletTemperature *
    isentropicTemperatureRatio(pressureRatio, gas.gamma);
  const T2 = compressorActualExitTemperature(
    inletTemperature,
    T2s,
    compressorEfficiency,
  );

  return {
    inletTemperature,
    pressureRatio,
    isentropicEfficiency: compressorEfficiency,
    isentropicExitTemperature: T2s,
    actualExitTemperature: T2,
    isentropicSpecificWork: gas.cp * (T2s - inletTemperature),
    specificWork: gas.cp * (T2 - inletTemperature),
  };
}
