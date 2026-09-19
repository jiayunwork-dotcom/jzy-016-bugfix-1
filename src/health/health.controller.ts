import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { HealthService } from './health.service';

/** 运行状态端点，供监控采集（liveness/readiness） */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    const status = await this.health.check();
    if (status.status !== 'ok') {
      throw new HttpException(status, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return status;
  }

  @Get()
  async check() {
    return this.health.check();
  }
}
