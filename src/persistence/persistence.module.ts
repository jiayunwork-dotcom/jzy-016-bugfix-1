import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalculationRecordEntity } from './entities/calculation-record.entity';
import { HISTORY_REPOSITORY } from './history.repository';
import { TypeOrmHistoryRepository } from './repositories/typeorm-history.repository';
import { InMemoryHistoryRepository } from './repositories/in-memory-history.repository';

/**
 * 持久化模块：全局单例，任一实现都绑定到同一个 HISTORY_REPOSITORY 令牌。
 * - forTypeOrm()：生产，PostgreSQL 16 + TypeORM
 * - forInMemory()：测试/无数据库环境
 */
@Global()
@Module({})
export class PersistenceModule {
  static forTypeOrm(): DynamicModule {
    const repositoryProvider: Provider = {
      provide: HISTORY_REPOSITORY,
      useClass: TypeOrmHistoryRepository,
    };
    return {
      module: PersistenceModule,
      imports: [TypeOrmModule.forFeature([CalculationRecordEntity])],
      providers: [repositoryProvider],
      exports: [HISTORY_REPOSITORY, TypeOrmModule],
    };
  }

  static forInMemory(): DynamicModule {
    return {
      module: PersistenceModule,
      providers: [InMemoryHistoryRepository,
        {
          provide: HISTORY_REPOSITORY,
          useExisting: InMemoryHistoryRepository,
        },
      ],
      exports: [HISTORY_REPOSITORY, InMemoryHistoryRepository],
    };
  }
}
