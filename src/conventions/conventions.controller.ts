import { Controller, Get } from '@nestjs/common';
import { ConventionsService } from './conventions.service';

/** 约定回显接口：默认比热比、材料上限处理方式、各项容差 */
@Controller('conventions')
export class ConventionsController {
  constructor(private readonly conventions: ConventionsService) {}

  @Get()
  echo() {
    return this.conventions.echo();
  }
}
