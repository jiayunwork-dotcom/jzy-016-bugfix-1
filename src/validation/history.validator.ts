import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
} from '../thermo/constants';
import { FieldError } from './utils';

export type HistoryType = 'cycle' | 'scan' | 'batch';

export interface HistoryQuery {
  type?: HistoryType;
  pressureRatio?: number;
  gamma?: number;
  ambientTemperature?: number;
  turbineInletTemperature?: number;
  limit: number;
  offset: number;
}

const ALLOWED_TYPES: HistoryType[] = ['cycle', 'scan', 'batch'];

function asFinite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 校验历史查询的 query string（全部条件可选） */
export function validateHistoryQuery(
  raw: Record<string, unknown>,
): { value: HistoryQuery | null; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const q: HistoryQuery = {
    limit: DEFAULT_HISTORY_LIMIT,
    offset: 0,
  };

  if (raw.type !== undefined) {
    if (!ALLOWED_TYPES.includes(raw.type as HistoryType)) {
      errors.push({
        field: 'type',
        code: 'INVALID_VALUE',
        message: `type 仅支持 ${ALLOWED_TYPES.join('/')}，收到 ${String(raw.type)}`,
        rejectedValue: raw.type,
      });
    } else {
      q.type = raw.type as HistoryType;
    }
  }

  const numericFields = [
    'pressureRatio',
    'gamma',
    'ambientTemperature',
    'turbineInletTemperature',
    'limit',
    'offset',
  ] as const;
  for (const f of numericFields) {
    if (raw[f] === undefined) continue;
    const n = asFinite(raw[f]);
    if (n === null) {
      errors.push({
        field: f,
        code: 'NOT_A_NUMBER',
        message: `查询参数 ${f} 必须是有限数值`,
        rejectedValue: raw[f],
      });
      continue;
    }
    if (f === 'limit') q.limit = n;
    else if (f === 'offset') q.offset = n;
    else q[f] = n;
  }

  if (q.limit < 1 || q.limit > MAX_HISTORY_LIMIT) {
    errors.push({
      field: 'limit',
      code: 'OUT_OF_RANGE',
      message: `limit 需在 [1, ${MAX_HISTORY_LIMIT}] 内`,
    });
  }
  if (q.offset < 0) {
    errors.push({
      field: 'offset',
      code: 'OUT_OF_RANGE',
      message: 'offset 不能为负',
    });
  }

  return { value: errors.length ? null : q, errors };
}
