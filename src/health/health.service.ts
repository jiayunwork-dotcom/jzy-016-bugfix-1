import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HISTORY_REPOSITORY, HistoryRepository } from '../persistence/history.repository';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: {
      status: 'up' | 'down';
      driver: 'typeorm-postgres' | 'in-memory';
      latencyMs?: number;
      error?: string;
    };
  };
}

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(
    @Inject(HISTORY_REPOSITORY) private readonly repo: HistoryRepository,
    @Optional() private readonly dataSource: DataSource | null,
  ) {}

  async check(): Promise<HealthStatus> {
    const started = Date.now();
    let db: HealthStatus['checks']['database'];
    try {
      await this.repo.count({ limit: 1, offset: 0 });
      db = {
        status: 'up',
        driver: this.dataSource ? 'typeorm-postgres' : 'in-memory',
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      db = {
        status: 'down',
        driver: this.dataSource ? 'typeorm-postgres' : 'in-memory',
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    return {
      status: db.status === 'up' ? 'ok' : 'degraded',
      uptimeSeconds: (Date.now() - this.startedAt) / 1000,
      timestamp: new Date().toISOString(),
      checks: { database: db },
    };
  }
}
