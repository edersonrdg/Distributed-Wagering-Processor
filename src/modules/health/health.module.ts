import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseModule } from '../../shared/database/database.module';
import { SqsModule } from '../../shared/sqs/sqs.module';
import { LivenessController } from './liveness.controller';
import { ReadinessController } from './readiness.controller';
import { DatabaseHealthIndicator } from './indicators/database-health.indicator';
import { SqsHealthIndicator } from './indicators/sqs-health.indicator';

@Module({
  imports: [TerminusModule, DatabaseModule, SqsModule],
  controllers: [LivenessController, ReadinessController],
  providers: [DatabaseHealthIndicator, SqsHealthIndicator],
})
export class HealthModule {}
