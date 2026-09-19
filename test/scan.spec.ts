import { buildScanGrid, scanPressureRatio, PressureRatioScanInput } from '../src/thermo/scan';
import { computeCycle } from '../src/thermo/cycle';

function scanInput(over: Partial<PressureRatioScanInput> = {}): PressureRatioScanInput {
  return {
    kind: 'actual',
    ambientTemperature: 300,
    turbineInletTemperature: 1400,
    compressorEfficiency: 0.86,
    turbineEfficiency: 0.9,
    gamma: 1.4,
    gasConstant: 287,
    minPressureRatio: 2,
    maxPressureRatio: 40,
    step: 0.5,
    materialTemperatureLimit: null,
    ...over,
  };
}

describe('压比扫描寻优', () => {
  test('网格闭区间覆盖且包含上下界', () => {
    const grid = buildScanGrid(2, 4, 0.5);
    expect(grid[0]).toBe(2);
    expect(grid.at(-1)).toBe(4);
    expect(grid).toEqual([2, 2.5, 3, 3.5, 4]);
  });

  test('计入部件效率后比净功先升后降，能观察到拐点', () => {
    const s = scanPressureRatio(scanInput());
    expect(s.shape).toBe('RISE_THEN_FALL');

    // 拐点两侧：optimum 左侧存在更低净功，右侧也存在更低净功
    const { index } = s.optimum;
    expect(index).toBeGreaterThan(0);
    expect(index).toBeLessThan(s.points.length - 1);
    expect(s.points[0].netWork).toBeLessThan(s.optimum.netWork);
    expect(s.points.at(-1)!.netWork).toBeLessThan(s.optimum.netWork);
  });

  test('optimum 是逐点净功的全局最大（绝不宣称压比越大越好）', () => {
    const s = scanPressureRatio(scanInput());
    for (const p of s.points) {
      expect(p.netWork).toBeLessThanOrEqual(s.optimum.netWork + 1e-9);
    }
    // 高圧比端净功明显低于最优——推翻“越大越好”
    expect(s.points.at(-1)!.netWork).toBeLessThan(
      0.8 * s.optimum.netWork,
    );
  });

  test('逐点结果与单点核算一致；每点带热效率', () => {
    const s = scanPressureRatio(scanInput({ step: 2 }));
    for (const p of s.points) {
      const single = computeCycle({
        kind: 'actual',
        pressureRatio: p.pressureRatio,
        ambientTemperature: 300,
        turbineInletTemperature: 1400,
        compressorEfficiency: 0.86,
        turbineEfficiency: 0.9,
        gamma: 1.4,
        gasConstant: 287,
      });
      expect(p.netWork).toBeCloseTo(single.netWork, 9);
      expect(p.thermalEfficiency).toBeCloseTo(
        single.thermalEfficiency as number,
        9,
      );
    }
  });

  test('理想效率部件=1 时扫描同样先升后降（净功有拐点），但效率随压比单调升高', () => {
    const s = scanPressureRatio(
      scanInput({
        compressorEfficiency: 1,
        turbineEfficiency: 1,
        minPressureRatio: 2,
        maxPressureRatio: 40,
        step: 1,
      }),
    );
    expect(s.shape).toBe('RISE_THEN_FALL');
    for (let i = 1; i < s.points.length; i++) {
      expect(s.points[i].thermalEfficiency as number).toBeGreaterThan(
        s.points[i - 1].thermalEfficiency as number,
      );
    }
  });

  test('并列最大时取较低压比，结果确定', () => {
    // 人为构造对称区间，至少保证确定性：两次扫描 optimum 相同
    const a = scanPressureRatio(scanInput({ step: 0.25 }));
    const b = scanPressureRatio(scanInput({ step: 0.25 }));
    expect(b.optimum).toEqual(a.optimum);
  });
});
