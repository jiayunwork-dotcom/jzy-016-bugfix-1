import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalculationsModule } from './calculations/calculations.module';
import { ConventionsModule } from './conventions/conventions.module';
import { HealthModule } from './health/health.module';
import { PersistenceModule } from './persistence/persistence.module';
import { buildTypeOrmOptions } from './db.config';

/**
 * 生产装配：PostgreSQL 16 + TypeORM。
 * e2e 测试不引用此模块，而是用 PersistenceModule.forInMemory() 自建应用。
 */
@Module({
  imports: [
    TypeOrmModule.forRoot(buildTypeOrmOptions()),
    PersistenceModule.forTypeOrm(),
    CalculationsModule,
    ConventionsModule,
    HealthModule,
  ],
})
export class AppModule {}
