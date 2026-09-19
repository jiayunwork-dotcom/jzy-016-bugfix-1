import { CycleInput } from './cycle';

/**
 * 内置示范算例：
 * - 压比 12
 * - 两侧效率取航空改型燃气轮机常用量级（0.86 / 0.90）
 * - 进气 300 K、涡轮入口 1400 K 典型值
 *
 * 该算例比净功为正，且实际热效率低于同压比的理想闭式。
 */
export const DEMO_CASE: CycleInput = {
  kind: 'actual',
  pressureRatio: 12,
  ambientTemperature: 300,
  turbineInletTemperature: 1400,
  compressorEfficiency: 0.86,
  turbineEfficiency: 0.9,
  gamma: 1.4,
  gasConstant: 287,
};
