import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CalculationRecordEntity, RecordType } from '../entities/calculation-record.entity';
import {
  HISTORY_NUMERIC_INPUT_FIELDS,
  HistoryRepository,
} from '../history.repository';
import { HistoryQuery } from '../../validation/history.validator';

@Injectable()
export class TypeOrmHistoryRepository implements HistoryRepository {
  constructor(
    @InjectRepository(CalculationRecordEntity)
    private readonly repo: Repository<CalculationRecordEntity>,
  ) {}

  async save(record: {
    type: RecordType;
    input: unknown;
    output: unknown;
  }): Promise<CalculationRecordEntity> {
    const entity = this.repo.create({
      type: record.type,
      input: record.input,
      output: record.output,
    });
    return this.repo.save(entity);
  }

  private applyFilters(qb: ReturnType<Repository<CalculationRecordEntity>['createQueryBuilder']>, query: HistoryQuery) {
    qb.where('1=1');
    if (query.type) {
      qb.andWhere('record.type = :type', { type: query.type });
    }
    // 数值条件落到 jsonb input 上。批量记录顶层 input 无这些字段，
    // 故对其做 input->cases 的 OR 匹配；单点记录走 input->>'field'。
    for (const field of HISTORY_NUMERIC_INPUT_FIELDS) {
      const value = (query as unknown as Record<string, number | undefined>)[field];
      if (value === undefined) continue;
      qb.andWhere(
        new Brackets((qb2) => {
          qb2.where(
            `(record.input->>'${field}')::double precision = :v_${field}`,
            { [`v_${field}`]: value },
          ).orWhere(
            `EXISTS (SELECT 1 FROM jsonb_array_elements(record.input->'cases') c WHERE (c->>'${field}')::double precision = :v_${field})`,
          );
        }),
      );
    }
  }

  async find(query: HistoryQuery): Promise<CalculationRecordEntity[]> {
    const qb = this.repo.createQueryBuilder('record');
    this.applyFilters(qb, query);
    qb.orderBy('record.createdAt', 'DESC')
      .addOrderBy('record.id', 'DESC')
      .limit(query.limit)
      .offset(query.offset);
    return qb.getMany();
  }

  async count(query: HistoryQuery): Promise<number> {
    const qb = this.repo.createQueryBuilder('record');
    this.applyFilters(qb, query);
    return qb.getCount();
  }
}
