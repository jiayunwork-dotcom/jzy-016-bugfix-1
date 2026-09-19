import { CalculationRecordEntity, RecordType } from './entities/calculation-record.entity';
import { HistoryQuery } from '../validation/history.validator';

/** 历史记录的仓库抽象：TypeORM 与内存实现共用，便于无数据库测试与并发隔离 */
export interface HistoryRepository {
  save(record: {
    type: RecordType;
    input: unknown;
    output: unknown;
  }): Promise<CalculationRecordEntity>;
  find(query: HistoryQuery): Promise<CalculationRecordEntity[]>;
  count(query: HistoryQuery): Promise<number>;
}

export const HISTORY_REPOSITORY = Symbol('HISTORY_REPOSITORY');

/** 历史可过滤的输入数值字段（存在 jsonb input 中） */
export const HISTORY_NUMERIC_INPUT_FIELDS = [
  'pressureRatio',
  'gamma',
  'ambientTemperature',
  'turbineInletTemperature',
] as const;
