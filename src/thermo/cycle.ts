import {
  MATERIAL_LIMIT_MARKER,
  MATERIAL_LIMIT_POLICY,
  TOLERANCES,
} from './constants';
import {
  createGasModel,
  GasModel,
  idealEfficiencyClosedForm,
} from './isentropic';
import { runCompressor } from './compressor';
import { runTurbine } from './turbine';

export type CycleKind = 'actual' | 'ideal';

/** 归一化的循环核算输入（已通过校验） */
export interface CycleInput {
  kind: CycleKind;
  /** 压比（> 1） */
  pressureRatio: number;
  /** 压气机进气温度 T1，K（热力学温度，> 0） */
  ambientTemperature: number;
  /** 涡轮入口温度 T3，K */
  turbineInletTemperature: number;
  /** 压气机等熵效率 eta_c ∈ (0, 1]（理想循环恒为 1） */
  compressorEfficiency: number;
  /** 涡轮等熵效率 eta_t ∈ (0, 1]（理想循环恒为 1） */
  turbineEfficiency: number;
  /** 比热比 gamma（> 1） */
  gamma: number;
  /** 气体常数 J/(kg·K)，缺省取空气值 */
  gasConstant: number;
  /** 涡轮入口材料温度上限，K；未提供则不截断也不标注 */
  materialTemperatureLimit?: number | null;
}

/** 一个状态点：T 为热力学温度 K，p 为以进气压力归一化的相对压力 */
export interface CycleState {
  index: number;
  name: string;
  temperature: number;
  relativePressure: number;
}

export interface MaterialLimitResult {
  policy: typeof MATERIAL_LIMIT_POLICY;
  limitProvided: boolean;
  materialTemperatureLimit: number | null;
  exceeded: boolean;
  /** 超限标注；未超限或未提供上限为 null */
  marker: string | null;
  /** 无论是否超限，实际参与计算的入口温度，绝不静默截断 */
  effectiveTurbineInletTemperature: number;
}

/**
 * 循环核算结果（压缩 / 加热 / 膨胀 / 排气四个状态点）。
 * 所有比热量、比功单位 J/kg；热效率为无量纲分数。
 */
export interface CycleResult {
  kind: CycleKind;
  input: CycleInput;
  gas: GasModel;
  states: {
    /** 状态 1：压气机进气 */
    compressorInlet: CycleState;
    /** 状态 2：压气机实际出口（燃烧室入口） */
    compressorOutlet: CycleState;
    /** 状态 3：涡轮入口（燃烧室出口） */
    turbineInlet: CycleState;
    /** 状态 4：涡轮实际出口（排气，压力回到进气压力） */
    exhaust: CycleState;
  };
  compressor: ReturnType<typeof runCompressor>;
  turbine: ReturnType<typeof runTurbine>;
  /** 定压加入的比热量 q_in = cp·(T3 - T2)，J/kg */
  heatAdded: number;
  /** 加热量是否为正（为零/为负时热效率无定义） */
  heatAddedPositive: boolean;
  /** 比净功 w_net = w_t - w_c，J/kg */
  netWork: number;
  /** 热效率；加热量不大于 0 时为 null，禁止除零编造假效率 */
  thermalEfficiency: number | null;
  /** 同压比下的理想闭式效率，恒定有值，便于对照 */
  idealClosedFormEfficiency: number;
  materialLimit: MaterialLimitResult;
}

function buildMaterialLimit(
  turbineInletTemperature: number,
  limit: number | null | undefined,
): MaterialLimitResult {
  const provided = typeof limit === 'number' && Number.isFinite(limit);
  const exceeded = provided ? turbineInletTemperature > limit : false;
  return {
    policy: MATERIAL_LIMIT_POLICY,
    limitProvided: provided,
    materialTemperatureLimit: provided ? limit : null,
    exceeded,
    marker: exceeded ? MATERIAL_LIMIT_MARKER : null,
    // 关键：永远不截到上限，标注归标注、计算照原值
    effectiveTurbineInletTemperature: turbineInletTemperature,
  };
}

/**
 * 单点循环核算。
 *
 * kind = 'ideal' 时两侧部件效率强制为 1，效率结果精确回到闭式：
 *   eta = 1 - pr^((1-gamma)/gamma)，与涡轮入口温度无关。
 * kind = 'actual' 时按给定的压气机/涡轮等熵效率计入不可逆损失。
 */
export function computeCycle(input: CycleInput): CycleResult {
  const gas = createGasModel(input.gamma, input.gasConstant);

  // 理想路径：部件效率恒为 1
  const etaC = input.kind === 'ideal' ? 1 : input.compressorEfficiency;
  const etaT = input.kind === 'ideal' ? 1 : input.turbineEfficiency;

  const compressor = runCompressor(
    input.ambientTemperature,
    input.pressureRatio,
    etaC,
    gas,
  );
  const turbine = runTurbine(
    input.turbineInletTemperature,
    input.pressureRatio,
    etaT,
    gas,
  );

  // 加热段：定压过程
  const heatAdded =
    gas.cp * (input.turbineInletTemperature - compressor.actualExitTemperature);

  // 比净功 = 涡轮比功 - 压气机比功
  const netWork = turbine.specificWork - compressor.specificWork;

  // 加热量为零（含负值）时不得除零编造热效率
  const heatZeroBand = gas.cp * TOLERANCES.heatZeroTemperature;
  const heatAddedPositive = heatAdded > heatZeroBand;
  const thermalEfficiency = heatAddedPositive ? netWork / heatAdded : null;

  // 理想闭式始终可算（只依赖压比与比热比）
  const idealClosedFormEfficiency = idealEfficiencyClosedForm(
    input.pressureRatio,
    input.gamma,
  );

  const T2 = compressor.actualExitTemperature;
  const materialLimit = buildMaterialLimit(
    input.turbineInletTemperature,
    input.materialTemperatureLimit,
  );

  return {
    kind: input.kind,
    input,
    gas,
    states: {
      compressorInlet: {
        index: 1,
        name: '压气机进气',
        temperature: input.ambientTemperature,
        relativePressure: 1,
      },
      compressorOutlet: {
        index: 2,
        name: '压气机出口（燃烧室入口）',
        temperature: T2,
        relativePressure: input.pressureRatio,
      },
      turbineInlet: {
        index: 3,
        name: '涡轮入口（燃烧室出口）',
        temperature: input.turbineInletTemperature,
        relativePressure: input.pressureRatio,
      },
      exhaust: {
        index: 4,
        name: '涡轮排气（压力回到进气压力）',
        temperature: turbine.actualExitTemperature,
        relativePressure: 1,
      },
    },
    compressor,
    turbine,
    heatAdded,
    heatAddedPositive,
    netWork,
    thermalEfficiency,
    idealClosedFormEfficiency,
    materialLimit,
  };
}
