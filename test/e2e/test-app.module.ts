import { Module } from '@nestjs/common';
import { CalculationsModule } from '../../src/calculations/calculations.module';
import { ConventionsModule } from '../../src/conventions/conventions.module';
import { HealthModule } from '../../src/health/health.module';
import { PersistenceModule } from '../../src/persistence/persistence.module';

/** e2e 装配：与生产 AppModule 同构，仅把 PostgreSQL 换成内存实现 */
@Module({
  imports: [
    PersistenceModule.forInMemory(),
    CalculationsModule,
    ConventionsModule,
    HealthModule,
  ],
})
export class TestAppModule {}
