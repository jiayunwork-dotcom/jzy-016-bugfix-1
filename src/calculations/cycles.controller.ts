import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CyclesService } from './cycles.service';
import { HistoryService } from './history.service';
import { validateHistoryQuery } from '../validation';
import { ValidationException } from './validation.exception';

/**
 * 布雷顿循环计算路由：
 *   POST /cycles/ideal       理想循环（不计部件效率）
 *   POST /cycles/actual      实际循环（计入压气机/涡轮等熵效率）
 *   POST /cycles/scan        压比区间扫描寻优
 *   POST /cycles/batch       多组工况批量核算
 *   GET  /cycles/demo        内置示范算例
 *   GET  /cycles/history     历史条件查询
 */
@Controller('cycles')
export class CyclesController {
  constructor(
    private readonly cycles: CyclesService,
    private readonly historyService: HistoryService,
  ) {}

  @Post('ideal')
  @HttpCode(HttpStatus.OK)
  ideal(@Body() body: unknown) {
    return this.cycles.computeIdeal(body);
  }

  @Post('actual')
  @HttpCode(HttpStatus.OK)
  actual(@Body() body: unknown) {
    return this.cycles.computeActual(body);
  }

  @Post('scan')
  @HttpCode(HttpStatus.OK)
  scan(@Body() body: unknown) {
    return this.cycles.scan(body);
  }

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  batch(@Body() body: unknown) {
    // 部分失败也是 200：逐组 ok/errors 表达，单组非法不拖垮整批
    return this.cycles.batch(body);
  }

  @Get('demo')
  demo() {
    return { input: this.cycles.demoInput(), result: this.cycles.demo() };
  }

  @Get('history')
  async history(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    // query string 默认是字符串，数值字段统一转型
    const normalized: Record<string, unknown> = { ...query };
    for (const f of [
      'pressureRatio',
      'gamma',
      'ambientTemperature',
      'turbineInletTemperature',
      'limit',
      'offset',
    ]) {
      if (normalized[f] !== undefined) {
        normalized[f] = Number(normalized[f]);
      }
    }
    const { value, errors } = validateHistoryQuery(normalized);
    if (!value) {
      throw new ValidationException(errors, '历史查询参数非法');
    }
    const page = await this.historyService.find(value);
    res.setHeader('X-Total-Count', String(page.total));
    return page;
  }
}
