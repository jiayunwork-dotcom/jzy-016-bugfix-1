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
    // 全系统温度一律使用热力学温度 K，快照必须与现场响应逐字段一致；
    // 深拷贝仅为隔离调用方后续对结果对象的修改，禁止做任何单位换算。
    return this.repo.save({
      type,
      input,
      output: structuredClone(output),
    });
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
