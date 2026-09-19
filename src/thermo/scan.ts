import { DEFAULT_GAS_CONSTANT, DEFAULT_GAMMA, MAX_SCAN_POINTS } from './constants';
import { computeCycle, CycleInput, CycleKind, CycleResult } from './cycle';

/** 压比区间扫描输入（T1 与 T3 钉死，仅压比变化） */
export interface PressureRatioScanInput {
  kind: CycleKind;
  ambientTemperature: number;
  turbineInletTemperature: number;
  compressorEfficiency: number;
  turbineEfficiency: number;
  gamma: number;
  gasConstant: number;
  /** 压比扫描下界（> 1） */
  minPressureRatio: number;
  /** 压比扫描上界（>= 下界） */
  maxPressureRatio: number;
  /** 步长（> 0） */
  step: number;
  materialTemperatureLimit?: number | null;
}

export interface ScanPoint {
  pressureRatio: number;
  netWork: number;
  thermalEfficiency: number | null;
  heatAdded: number;
}

/** 扫描观察到的净功曲线形态——用于显式体现先升后降的拐点 */
export type ScanShape =
  | 'RISE_THEN_FALL'
  | 'MONOTONE_RISE'
  | 'MONOTONE_FALL'
  | 'FLAT_OR_OTHER';

export interface ScanOptimum {
  pressureRatio: number;
  netWork: number;
  thermalEfficiency: number | null;
  /** 最优点在序列中的下标（0 基） */
  index: number;
}

export interface PressureRatioScanResult {
  input: PressureRatioScanInput;
  points: ScanPoint[];
  count: number;
  optimum: ScanOptimum;
  shape: ScanShape;
}

/**
 * 构造闭区间 [min, max] 的压比扫描网格。
 * 末点不超过 max；若最后一个步进点未恰好落在 max，则补一个 max 点，
 * 保证扫描边界总被覆盖。
 */
export function buildScanGrid(
  min: number,
  max: number,
  step: number,
): number[] {
  const ratios: number[] = [];
  let pr = min;
  const eps = 1e-12 * Math.max(1, Math.abs(max - min));
  while (pr < max - eps) {
    ratios.push(pr);
    pr += step;
  }
  ratios.push(max);

  if (ratios.length > MAX_SCAN_POINTS) {
    throw new Error(
      `扫描网格过密：${ratios.length} 点，上限 ${MAX_SCAN_POINTS}`,
    );
  }
  return ratios;
}

function detectShape(points: ScanPoint[]): ScanShape {
  if (points.length < 3) return 'FLAT_OR_OTHER';
  let anyRise = false;
  let anyFall = false;
  let riseBeforeFall = false;
  let seenFall = false;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].netWork - points[i - 1].netWork;
    const band =
      1e-9 * Math.max(1, Math.abs(points[i].netWork), Math.abs(points[i - 1].netWork));
    if (delta > band) {
      anyRise = true;
      if (seenFall) riseBeforeFall = false; // 出现回升，不是单峰
    } else if (delta < -band) {
      anyFall = true;
      if (anyRise) riseBeforeFall = true;
      seenFall = true;
    }
  }
  if (riseBeforeFall) return 'RISE_THEN_FALL';
  if (anyRise && !anyFall) return 'MONOTONE_RISE';
  if (anyFall && !anyRise) return 'MONOTONE_FALL';
  return 'FLAT_OR_OTHER';
}

/**
 * 在钉死的进气温度与涡轮入口温度下对压比做区间扫描，
 * 逐点返回比净功与热效率，并回报净功最高的压比点。
 *
 * 计入部件效率后，比净功随压比先升后降（存在拐点），
 * shape 字段显式给出曲线形态；绝不沿用「压比越大越好」的理想式结论。
 */
export function scanPressureRatio(
  input: PressureRatioScanInput,
): PressureRatioScanResult {
  const ratios = buildScanGrid(
    input.minPressureRatio,
    input.maxPressureRatio,
    input.step,
  );

  const base: Omit<CycleInput, 'pressureRatio'> = {
    kind: input.kind,
    ambientTemperature: input.ambientTemperature,
    turbineInletTemperature: input.turbineInletTemperature,
    compressorEfficiency: input.compressorEfficiency,
    turbineEfficiency: input.turbineEfficiency,
    gamma: input.gamma,
    gasConstant: input.gasConstant,
    materialTemperatureLimit: input.materialTemperatureLimit,
  };

  const points: ScanPoint[] = ratios.map((pressureRatio) => {
    const r: CycleResult = computeCycle({ ...base, pressureRatio });
    return {
      pressureRatio,
      netWork: r.netWork,
      thermalEfficiency: r.thermalEfficiency,
      heatAdded: r.heatAdded,
    };
  });

  let bestIndex = 0;
  for (let i = 1; i < points.length; i++) {
    // 并列时保留较低压比（先出现者），确定性输出
    if (points[i].netWork > points[bestIndex].netWork) bestIndex = i;
  }
  const best = points[bestIndex];

  return {
    input,
    points,
    count: points.length,
    optimum: {
      pressureRatio: best.pressureRatio,
      netWork: best.netWork,
      thermalEfficiency: best.thermalEfficiency,
      index: bestIndex,
    },
    shape: detectShape(points),
  };
}

export { DEFAULT_GAMMA, DEFAULT_GAS_CONSTANT };
