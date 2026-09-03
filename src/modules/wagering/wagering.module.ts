import { Module } from '@nestjs/common';
import { ProcessWageringService } from './services/process-wagering.service';
import { WageringController } from './wagering.controller';
import { SearchWageringService } from './services/search-wagering.service';
import { OutboxRelayWorker } from './workers/outbox-relay.worker';
import { PendingReferenceWorker } from './workers/pending-reference.worker';
import { WageringSqsConsumer } from './workers/wagering-sqs.consumer';

@Module({
  controllers: [WageringController],
  providers: [
    ProcessWageringService,
    SearchWageringService,
    OutboxRelayWorker,
    PendingReferenceWorker,
    WageringSqsConsumer,
  ],
})
export class WageringModule {}
