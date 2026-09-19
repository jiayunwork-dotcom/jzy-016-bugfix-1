import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CalculationRecordEntity, RecordType } from '../entities/calculation-record.entity';
import {
  HISTORY_NUMERIC_INPUT_FIELDS,
  HistoryRepository,
} from '../history.repository';
import { HistoryQuery } from '../../validation/history.validator';

/**
 * 内存仓库：自动化测试与无数据库环境使用。
 * 每次保存深拷贝输入输出，杜绝请求间共享可变对象造成的串扰。
 */
@Injectable()
export class InMemoryHistoryRepository implements HistoryRepository {
  private records: CalculationRecordEntity[] = [];

  async save(record: {
    type: RecordType;
    input: unknown;
    output: unknown;
  }): Promise<CalculationRecordEntity> {
    const entity = new CalculationRecordEntity();
    entity.id = randomUUID();
    entity.type = record.type;
    entity.input = structuredClone(record.input);
    entity.output = structuredClone(record.output);
    entity.createdAt = new Date();
    // 复制后再入库，防止调用方继续持有/修改对象
    this.records.push(structuredClone(entity));
    return structuredClone(entity);
  }

  private matches(record: CalculationRecordEntity, query: HistoryQuery): boolean {
    if (query.type && record.type !== query.type) return false;
    const input = (record.input ?? {}) as Record<string, unknown>;
    for (const field of HISTORY_NUMERIC_INPUT_FIELDS) {
      const wanted = (query as unknown as Record<string, number | undefined>)[field];
      if (wanted === undefined) continue;
      const top = input[field];
      let hit = typeof top === 'number' && top === wanted;
      if (!hit && Array.isArray((input as { cases?: unknown[] }).cases)) {
        hit = (input as { cases: Array<Record<string, unknown>> }).cases.some(
          (c) => typeof c[field] === 'number' && c[field] === wanted,
        );
      }
      if (!hit) return false;
    }
    return true;
  }

  async find(query: HistoryQuery): Promise<CalculationRecordEntity[]> {
    return this.records
      .filter((r) => this.matches(r, query))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(query.offset, query.offset + query.limit)
      .map((r) => structuredClone(r));
  }

  async count(query: HistoryQuery): Promise<number> {
    return this.records.filter((r) => this.matches(r, query)).length;
  }
}
