import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { CalculationRecordEntity } from './persistence/entities/calculation-record.entity';

/**
 * PostgreSQL 16 连接配置，全部来自环境变量（docker-compose 注入）。
 * synchronize 仅用于该算例服务一键建表；多副本/正式发布应改迁移。
 */
export function buildTypeOrmOptions(): TypeOrmModuleOptions {
  const synchronize = (process.env.DB_SYNCHRONIZE ?? 'true') !== 'false';
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER ?? 'brayton',
    password: process.env.DB_PASSWORD ?? 'brayton_secret',
    database: process.env.DB_NAME ?? 'brayton',
    entities: [CalculationRecordEntity],
    synchronize,
    // 数据库容器启动慢时自动重试，避免 api 早于 db 就绪而崩溃
    retryAttempts: 15,
    retryDelay: 3000,
    logging: process.env.DB_LOGGING === 'true',
  };
}
