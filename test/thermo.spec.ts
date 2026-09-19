import {
  compressorActualExitTemperature,
  createGasModel,
  idealEfficiencyClosedForm,
  isentropicTemperatureRatio,
  turbineActualExitTemperature,
} from '../src/thermo/isentropic';
import { runCompressor } from '../src/thermo/compressor';
import { runTurbine } from '../src/thermo/turbine';
import { computeCycle, CycleInput } from '../src/thermo/cycle';
import { DEMO_CASE } from '../src/thermo/demo';
import { MATERIAL_LIMIT_MARKER, TOLERANCES } from '../src/thermo/constants';

const T1 = 300;
const T3 = 1400;
const base = {
  ambientTemperature: T1,
  turbineInletTemperature: T3,
  gamma: 1.4,
  gasConstant: 287,
};

function actualInput(over: Partial<CycleInput> = {}): CycleInput {
  return {
    kind: 'actual',
    pressureRatio: 12,
    compressorEfficiency: 0.86,
    turbineEfficiency: 0.9,
    materialTemperatureLimit: null,
    ...base,
    ...over,
  };
}

describe('气体模型自洽', () => {
  test('cp/cv 由 gamma 与 R 推出且 cp-cv=R', () => {
    const g = createGasModel(1.4, 287);
    expect(g.cp).toBeCloseTo((1.4 / 0.4) * 287, 9);
    expect(g.cv).toBeCloseTo(287 / 0.4, 9);
    expect(g.cp - g.cv).toBeCloseTo(287, 9);
  });

  test('比热比一变，同温差焓变必然跟着变（不存在脱钩死数）', () => {
    const dT = 100;
    const h1 = createGasModel(1.33, 287).cp * dT;
    const h2 = createGasModel(1.4, 287).cp * dT;
    const h3 = createGasModel(1.67, 287).cp * dT;
    expect(h1).not.toBeCloseTo(h2, 6);
    expect(h2).not.toBeCloseTo(h3, 6);
    // 单调：gamma 越大 cp 越小
    expect(h1).toBeGreaterThan(h2);
    expect(h2).toBeGreaterThan(h3);
  });
});

describe('等熵关系与部件实际过程', () => {
  test('等熵温比 = pr^((gamma-1)/gamma)', () => {
    expect(isentropicTemperatureRatio(8, 1.4)).toBeCloseTo(
      Math.pow(8, 0.4 / 1.4),
      12,
    );
  });

  test('压气机：效率<1 实际出口高于等熵出口；效率=1 重合', () => {
    const T2s = T1 * isentropicTemperatureRatio(12, 1.4);
    expect(
      compressorActualExitTemperature(T1, T2s, 0.86),
    ).toBeGreaterThan(T2s);
    expect(compressorActualExitTemperature(T1, T2s, 1)).toBeCloseTo(T2s, 12);

    const c = runCompressor(T1, 12, 0.86, createGasModel(1.4));
    expect(c.actualExitTemperature).toBeGreaterThan(c.isentropicExitTemperature);
    expect(c.specificWork).toBeGreaterThan(c.isentropicSpecificWork);
  });

  test('涡轮：效率<1 实际出口高于等熵出口；效率=1 重合', () => {
    const T4s = T3 / isentropicTemperatureRatio(12, 1.4);
    expect(turbineActualExitTemperature(T3, T4s, 0.9)).toBeGreaterThan(T4s);
    expect(turbineActualExitTemperature(T3, T4s, 1)).toBeCloseTo(T4s, 12);

    const t = runTurbine(T3, 12, 0.9, createGasModel(1.4));
    expect(t.actualExitTemperature).toBeGreaterThan(t.isentropicExitTemperature);
    expect(t.specificWork).toBeLessThan(t.isentropicSpecificWork);
  });
});

describe('硬约束', () => {
  test('两侧效率为 1 时热效率精确回到理想闭式，且与 T3 无关', () => {
    for (const pr of [4, 8, 12, 20]) {
      for (const tInlet of [800, 1400, 2000]) {
        const r = computeCycle(
          actualInput({
            pressureRatio: pr,
            turbineInletTemperature: tInlet,
            compressorEfficiency: 1,
            turbineEfficiency: 1,
          }),
        );
        const expected = idealEfficiencyClosedForm(pr, 1.4);
        expect(Math.abs((r.thermalEfficiency as number) - expected)).toBeLessThan(
          TOLERANCES.efficiencyClosedForm,
        );
        expect(r.thermalEfficiency).toBeCloseTo(
          1 - Math.pow(pr, (1 - 1.4) / 1.4),
          12,
        );
      }
    }
  });

  test('两侧效率为 1，压比 8 提到 20，热效率升高', () => {
    const e8 = computeCycle(
      actualInput({ pressureRatio: 8, compressorEfficiency: 1, turbineEfficiency: 1 }),
    ).thermalEfficiency as number;
    const e20 = computeCycle(
      actualInput({ pressureRatio: 20, compressorEfficiency: 1, turbineEfficiency: 1 }),
    ).thermalEfficiency as number;
    expect(e20).toBeGreaterThan(e8);
    expect(e8).toBeCloseTo(0.44795524316309376, 12);
    expect(e20).toBeCloseTo(0.5751093795080318, 12);
  });

  test('压气机效率单独从 1 降到 0.8，同工况比净功下降', () => {
    const full = computeCycle(
      actualInput({ compressorEfficiency: 1, turbineEfficiency: 1 }),
    );
    const degraded = computeCycle(
      actualInput({ compressorEfficiency: 0.8, turbineEfficiency: 1 }),
    );
    expect(degraded.netWork).toBeLessThan(full.netWork);
    // 不同 gamma、不同 T3 下同样成立
    for (const gamma of [1.33, 1.67]) {
      const a = computeCycle(
        actualInput({ gamma, gasConstant: 287, compressorEfficiency: 1, turbineEfficiency: 1 }),
      );
      const b = computeCycle(
        actualInput({ gamma, gasConstant: 287, compressorEfficiency: 0.8, turbineEfficiency: 1 }),
      );
      expect(b.netWork).toBeLessThan(a.netWork);
    }
  });

  test('涡轮入口恰等于压气机实际出口时加热量为零、比净功不得为正、热效率为 null', () => {
    const c = runCompressor(T1, 12, 0.8, createGasModel(1.4));
    const T2 = c.actualExitTemperature;
    const r = computeCycle(
      actualInput({
        turbineInletTemperature: T2,
        compressorEfficiency: 0.8,
        turbineEfficiency: 0.9,
      }),
    );
    expect(Math.abs(r.heatAdded)).toBeLessThan(
      r.gas.cp * TOLERANCES.heatZeroTemperature,
    );
    expect(r.netWork).toBeLessThanOrEqual(0);
    expect(r.thermalEfficiency).toBeNull();
    expect(r.heatAddedPositive).toBe(false);
  });

  test('加热量为负（T3 低于 T2）时同样不编造效率且净功为负', () => {
    const c = runCompressor(T1, 12, 0.86, createGasModel(1.4));
    const r = computeCycle(
      actualInput({
        turbineInletTemperature: c.actualExitTemperature - 50,
      }),
    );
    expect(r.heatAdded).toBeLessThan(0);
    expect(r.netWork).toBeLessThan(0);
    expect(r.thermalEfficiency).toBeNull();
  });

  test('实际循环热效率低于同压比理想闭式', () => {
    const r = computeCycle(actualInput());
    expect(r.thermalEfficiency).not.toBeNull();
    expect(r.thermalEfficiency as number).toBeLessThan(
      r.idealClosedFormEfficiency,
    );
  });

  test('理想路径不接受部件效率影响：ideal 与两侧效率=1 的 actual 完全一致', () => {
    const ideal = computeCycle({
      kind: 'ideal',
      pressureRatio: 12,
      ...base,
      compressorEfficiency: 1,
      turbineEfficiency: 1,
      materialTemperatureLimit: null,
    });
    expect(ideal.thermalEfficiency).toBeCloseTo(
      ideal.idealClosedFormEfficiency,
      12,
    );
    expect(ideal.compressor.isentropicEfficiency).toBe(1);
    expect(ideal.turbine.isentropicEfficiency).toBe(1);
  });
});

describe('四个状态点与材料温度上限', () => {
  test('状态点温度/压力合理，排气压力回到进气压力', () => {
    const r = computeCycle(actualInput());
    expect(r.states.compressorInlet.temperature).toBe(T1);
    expect(r.states.compressorInlet.relativePressure).toBe(1);
    expect(r.states.compressorOutlet.relativePressure).toBe(12);
    expect(r.states.turbineInlet.temperature).toBe(T3);
    expect(r.states.turbineInlet.relativePressure).toBe(12);
    expect(r.states.exhaust.relativePressure).toBe(1);
    // 温度链
    expect(r.states.compressorOutlet.temperature).toBeGreaterThan(T1);
    expect(r.states.turbineInlet.temperature).toBeGreaterThan(
      r.states.compressorOutlet.temperature,
    );
  });

  test('净功 = 涡轮比功 - 压气机比功；效率 = 净功/加热量', () => {
    const r = computeCycle(actualInput());
    expect(r.netWork).toBeCloseTo(
      r.turbine.specificWork - r.compressor.specificWork,
      9,
    );
    expect(r.thermalEfficiency).toBeCloseTo(
      r.netWork / r.heatAdded,
      12,
    );
  });

  test('材料上限超限时只标注不截断；未给上限不标注', () => {
    const limited = computeCycle(
      actualInput({ materialTemperatureLimit: 1300 }),
    );
    expect(limited.materialLimit.exceeded).toBe(true);
    expect(limited.materialLimit.marker).toBe(MATERIAL_LIMIT_MARKER);
    // 关键：T3 仍是 1400，结果与不设上限完全相同
    const unlimited = computeCycle(actualInput({ materialTemperatureLimit: null }));
    expect(limited.netWork).toBeCloseTo(unlimited.netWork, 12);
    expect(limited.states.turbineInlet.temperature).toBe(T3);

    const notExceeded = computeCycle(
      actualInput({ materialTemperatureLimit: 1500 }),
    );
    expect(notExceeded.materialLimit.exceeded).toBe(false);
    expect(notExceeded.materialLimit.marker).toBeNull();

    expect(unlimited.materialLimit.limitProvided).toBe(false);
    expect(unlimited.materialLimit.marker).toBeNull();
  });
});

describe('内置示范算例', () => {
  test('压比 12、航空改型效率量级、典型 T3；净功为正且效率低于理想闭式', () => {
    expect(DEMO_CASE.pressureRatio).toBe(12);
    expect(DEMO_CASE.compressorEfficiency).toBeGreaterThan(0.8);
    expect(DEMO_CASE.turbineEfficiency).toBeGreaterThan(0.85);
    const r = computeCycle(DEMO_CASE);
    expect(r.netWork).toBeGreaterThan(0);
    expect(r.thermalEfficiency).not.toBeNull();
    expect(r.thermalEfficiency as number).toBeLessThan(
      r.idealClosedFormEfficiency,
    );
  });
});
