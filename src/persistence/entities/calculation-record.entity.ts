import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type RecordType = 'cycle' | 'scan' | 'batch';

/**
 * 每次核算与扫描的输入输出持久化记录。
 * input/output 以 JSONB 原样保存，历史查询不丢字段。
 */
@Entity('calculation_records')
export class CalculationRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 16 })
  type!: RecordType;

  @Column({ type: 'jsonb' })
  input!: unknown;

  @Column({ type: 'jsonb' })
  output!: unknown;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
