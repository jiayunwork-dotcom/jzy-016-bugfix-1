import { Injectable } from '@nestjs/common';
import {
  DEFAULT_GAMMA,
  DEFAULT_GAS_CONSTANT,
  MATERIAL_LIMIT_POLICY,
  MATERIAL_LIMIT_MARKER,
  TOLERANCES,
  MAX_BATCH_CASES,
  MAX_SCAN_POINTS,
} from '../thermo/constants';

@Injectable()
export class ConventionsService {
  echo() {
    return {
      gasModel: {
        defaultGamma: DEFAULT_GAMMA,
        defaultGasConstant: DEFAULT_GAS_CONSTANT,
        /** 比热自洽关系：gamma 变 cp 必变，不存在脱钩死数 */
        consistency: {
          formula: 'cp = gamma/(gamma-1)*R; cv = R/(gamma-1); cp - cv = R',
          note: 'cp/cv 由 gamma 与 R 推出，不接受与比热比脱钩的独立 cp',
        },
      },
      materialTemperatureLimit: {
        policy: MATERIAL_LIMIT_POLICY,
        marker: MATERIAL_LIMIT_MARKER,
        behavior:
          '提供上限且 T3 超限时仅在结果中显式标注「受入口温度限制」，绝不截断到上限；未提供上限则不截断、不标注，按原值计算。',
      },
      tolerances: TOLERANCES,
      efficiencyDomain: {
        compressorEfficiency: '(0, 1]',
        turbineEfficiency: '(0, 1]',
        pressureRatio: '(1, +inf)',
        gamma: '(1, +inf)',
        ambientTemperature: '(0, +inf) K',
      },
      zeroHeatRule:
        '加热量不大于零时 thermalEfficiency 返回 null，严禁除零编造效率；netWork 照常返回。',
      scan: {
        shapeRequired: 'RISE_THEN_FALL',
        note: '计入部件效率后比净功随压比先升后降，扫描结果须体现拐点；并列时取较低压比。',
        maxScanPoints: MAX_SCAN_POINTS,
      },
      batch: { maxCases: MAX_BATCH_CASES },
    };
  }
}
