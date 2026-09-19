import { MAX_BATCH_CASES } from '../thermo/constants';
import { CycleInput } from '../thermo/cycle';
import { validateCycleInput } from './cycle.validator';
import { FieldError } from './utils';

export interface BatchItemResult {
  /** 工况组序号（1 基，人类可读） */
  caseNumber: number;
  /** 下标（0 基） */
  index: number;
  ok: boolean;
  /** 该组归一化输入（仅成功时有值） */
  input?: CycleInput;
  /** 该组失败原因（仅失败时有值） */
  errors?: FieldError[];
}

/**
 * 批量校验：任一组非法都要指明「第几组、哪个参数」，
 * 其余组照常返回，绝不让一组非法拖垮整批。
 */
export function validateBatch(raw: unknown): {
  items: BatchItemResult[];
  envelopeError: FieldError | null;
} {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      items: [],
      envelopeError: {
        field: '(body)',
        code: 'INVALID_VALUE',
        message: '请求体必须是 { cases: [...] } 形式',
      },
    };
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.cases)) {
    return {
      items: [],
      envelopeError: {
        field: 'cases',
        code: 'INVALID_VALUE',
        message: '缺少字段 cases，或 cases 不是数组',
      },
    };
  }
  if (obj.cases.length === 0) {
    return {
      items: [],
      envelopeError: {
        field: 'cases',
        code: 'INVALID_VALUE',
        message: 'cases 不能为空数组',
      },
    };
  }
  if (obj.cases.length > MAX_BATCH_CASES) {
    return {
      items: [],
      envelopeError: {
        field: 'cases',
        code: 'OUT_OF_RANGE',
        message: `单批最多 ${MAX_BATCH_CASES} 组工况，收到 ${obj.cases.length} 组`,
      },
    };
  }

  const items: BatchItemResult[] = obj.cases.map(
    (caseRaw: unknown, index: number) => {
      if (typeof caseRaw !== 'object' || caseRaw === null) {
        return {
          caseNumber: index + 1,
          index,
          ok: false,
          errors: [
            {
              field: '(case)',
              code: 'INVALID_VALUE',
              message: `第 ${index + 1} 组工况必须是对象`,
            },
          ],
        };
      }
      // 批量默认按实际循环核算；显式 kind: 'ideal' 走理想路径
      const kind =
        (caseRaw as Record<string, unknown>).kind === 'ideal'
          ? ('ideal' as const)
          : ('actual' as const);
      const { value, errors } = validateCycleInput(caseRaw, kind);
      if (value) {
        return { caseNumber: index + 1, index, ok: true, input: value };
      }
      return { caseNumber: index + 1, index, ok: false, errors };
    },
  );

  return { items, envelopeError: null };
}
