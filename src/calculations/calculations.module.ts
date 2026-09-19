import { Module } from '@nestjs/common';
import { CyclesController } from './cycles.controller';
import { CyclesService } from './cycles.service';
import { HistoryService } from './history.service';

@Module({
  controllers: [CyclesController],
  providers: [CyclesService, HistoryService],
  exports: [CyclesService, HistoryService],
})
export class CalculationsModule {}
