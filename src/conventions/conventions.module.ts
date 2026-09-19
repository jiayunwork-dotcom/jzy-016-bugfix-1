import { Module } from '@nestjs/common';
import { ConventionsController } from './conventions.controller';
import { ConventionsService } from './conventions.service';

@Module({
  controllers: [ConventionsController],
  providers: [ConventionsService],
})
export class ConventionsModule {}
