import { Module } from '@nestjs/common';
import { ProcessWageringService } from './services/process-wagering.service';
import { WageringController } from './wagering.controller';
import { SearchWageringService } from './services/search-wagering.service';

@Module({
  controllers: [WageringController],
  providers: [ProcessWageringService, SearchWageringService],
})
export class WageringModule {}
