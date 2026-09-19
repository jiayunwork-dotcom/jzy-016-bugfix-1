/** 单个字段的校验问题 */
export interface FieldError {
  field: string;
  code:
    | 'MISSING'
    | 'NOT_A_NUMBER'
    | 'NOT_FINITE'
    | 'OUT_OF_RANGE'
    | 'INVALID_VALUE';
  message: string;
  rejectedValue?: unknown;
  constraint?: string;
}

export function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * 校验一个必须存在的有限数值字段。
 * 返回 FieldError 表示有问题；返回 null 表示通过。
 */
export function checkFiniteNumber(
  obj: Record<string, unknown>,
  field: string,
  label: string,
): FieldError | null {
  if (!isPresent(obj[field])) {
    return {
      field,
      code: 'MISSING',
      message: `缺少字段「${label}」(${field})`,
    };
  }
  const value = obj[field];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return {
      field,
      code: 'NOT_A_NUMBER',
      message: `「${label}」(${field}) 必须是数值`,
      rejectedValue: value,
    };
  }
  if (!Number.isFinite(value)) {
    return {
      field,
      code: 'NOT_FINITE',
      message: `「${label}」(${field}) 必须是有限值，不得为 Infinity/-Infinity`,
      rejectedValue: value,
    };
  }
  return null;
}

/** 数值范围检查（在有限性检查之后使用） */
export function checkRange(
  field: string,
  label: string,
  value: number,
  spec: {
    min?: number;
    max?: number;
    minExclusive?: boolean;
    maxExclusive?: boolean;
  },
): FieldError | null {
  const { min, max, minExclusive, maxExclusive } = spec;
  let bad = false;
  if (min !== undefined) {
    bad = minExclusive ? value <= min : value < min;
  }
  if (!bad && max !== undefined) {
    bad = maxExclusive ? value >= max : value > max;
  }
  if (!bad) return null;

  const parts: string[] = [];
  if (min !== undefined) {
    parts.push(`${minExclusive ? '> ' : '>= '}${min}`);
  }
  if (max !== undefined) {
    parts.push(`${maxExclusive ? '< ' : '<= '}${max}`);
  }
  return {
    field,
    code: 'OUT_OF_RANGE',
    message: `「${label}」(${field}) 越界，要求 ${parts.join(' 且 ')}，实际为 ${value}`,
    rejectedValue: value,
    constraint: parts.join(' 且 '),
  };
}

/** 可选的有限数值字段：未给返回 null（通过），给了必须是有限数 */
export function checkOptionalFiniteNumber(
  obj: Record<string, unknown>,
  field: string,
  label: string,
): FieldError | null {
  if (!isPresent(obj[field])) return null;
  return checkFiniteNumber(obj, field, label);
}
