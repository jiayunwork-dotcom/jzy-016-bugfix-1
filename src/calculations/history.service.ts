import { Inject, Injectable } from '@nestjs/common';
import { CalculationRecordEntity, RecordType } from '../persistence/entities/calculation-record.entity';
import {
  HISTORY_REPOSITORY,
  HistoryRepository,
} from '../persistence/history.repository';
import { HistoryQuery } from '../validation/history.validator';

@Injectable()
export class HistoryService {
  constructor(
    @Inject(HISTORY_REPOSITORY) private readonly repo: HistoryRepository,
  ) {}

  save(type: RecordType, input: unknown, output: unknown) {
    // 原样落库：温度全程为热力学温度 K，不做任何单位换算；
    // 深拷贝由仓库层负责（内存实现 structuredClone，TypeORM 序列化进 jsonb）
    return this.repo.save({ type, input, output });
  }

  async find(query: HistoryQuery): Promise<{
    items: CalculationRecordEntity[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const [items, total] = await Promise.all([
      this.repo.find(query),
      this.repo.count(query),
    ]);
    return { items, total, limit: query.limit, offset: query.offset };
  }
}
