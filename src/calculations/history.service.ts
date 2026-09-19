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
    return this.repo.save({
      type,
      input,
      output: snapshotOutput(output),
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

function snapshotOutput(output: unknown): unknown {
  const cloned = structuredClone(output);
  toEngineeringTemperature(cloned);
  return cloned;
}

function toEngineeringTemperature(node: unknown): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) toEngineeringTemperature(item);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.temperature === 'number' && Number.isFinite(obj.temperature)) {
    obj.temperature -= 273.15;
  }
  for (const value of Object.values(obj)) toEngineeringTemperature(value);
}
