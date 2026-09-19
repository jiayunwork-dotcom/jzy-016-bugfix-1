import { Injectable } from '@nestjs/common';
import {
  computeCycle,
  CycleInput,
  CycleResult,
  DEMO_CASE,
  PressureRatioScanInput,
  scanPressureRatio,
  PressureRatioScanResult,
} from '../thermo';
import {
  BatchItemResult,
  validateBatch,
  validateCycleInput,
  validateScanInput,
} from '../validation';
import { HistoryService } from './history.service';
import { ValidationException } from './validation.exception';

export interface BatchCaseOutput {
  caseNumber: number;
  index: number;
  ok: boolean;
  result?: CycleResult;
  errors?: BatchItemResult['errors'];
}

export interface BatchOutput {
  total: number;
  succeeded: number;
  failed: number;
  cases: BatchCaseOutput[];
}

@Injectable()
export class CyclesService {
  constructor(private readonly history: HistoryService) {}

  /** 单点实际循环 */
  async computeActual(raw: unknown): Promise<CycleResult> {
    return this.computeSingle(raw, 'actual');
  }

  /** 单点理想循环（不计部件效率） */
  async computeIdeal(raw: unknown): Promise<CycleResult> {
    return this.computeSingle(raw, 'ideal');
  }

  private async computeSingle(
    raw: unknown,
    kind: 'actual' | 'ideal',
  ): Promise<CycleResult> {
    const { value, errors } = validateCycleInput(raw, kind);
    if (!value) throw new ValidationException(errors);

    const result = computeCycle(value);
    await this.history.save('cycle', value, result);
    return result;
  }

  /** 压比区间扫描寻优 */
  async scan(raw: unknown): Promise<PressureRatioScanResult> {
    const { value, errors } = validateScanInput(raw);
    if (!value) throw new ValidationException(errors, '扫描参数非法');

    const result = scanPressureRatio(value);
    await this.history.save('scan', value, {
      count: result.count,
      optimum: result.optimum,
      shape: result.shape,
      points: result.points,
    });
    return result;
  }

  /**
   * 批量核算：部分失败不影响其余组别。
   * 每组（含失败原因）与整批汇总都持久化。
   */
  async batch(raw: unknown): Promise<BatchOutput> {
    const { items, envelopeError } = validateBatch(raw);
    if (envelopeError) {
      throw new ValidationException([envelopeError], '批量请求非法');
    }

    const cases: BatchCaseOutput[] = items.map((item) => {
      if (item.ok && item.input) {
        return {
          caseNumber: item.caseNumber,
          index: item.index,
          ok: true,
          result: computeCycle(item.input),
        };
      }
      return {
        caseNumber: item.caseNumber,
        index: item.index,
        ok: false,
        errors: item.errors,
      };
    });

    const output: BatchOutput = {
      total: cases.length,
      succeeded: cases.filter((c) => c.ok).length,
      failed: cases.filter((c) => !c.ok).length,
      cases,
    };

    // 入库存的是归一化输入（成功组）与原始非法片段（失败组）
    const rawCases =
      raw && typeof raw === 'object' && Array.isArray((raw as { cases?: unknown }).cases)
        ? ((raw as { cases: unknown[] }).cases as unknown[])
        : [];
    await this.history.save(
      'batch',
      { cases: rawCases },
      {
        total: output.total,
        succeeded: output.succeeded,
        failed: output.failed,
        cases: cases.map((c) =>
          c.ok
            ? { caseNumber: c.caseNumber, index: c.index, ok: true, result: c.result }
            : { caseNumber: c.caseNumber, index: c.index, ok: false, errors: c.errors },
        ),
      },
    );

    return output;
  }

  /** 内置示范算例（不写历史，固定演示数据） */
  demo(): CycleResult {
    return computeCycle(DEMO_CASE);
  }

  demoInput(): CycleInput {
    return DEMO_CASE;
  }
}
