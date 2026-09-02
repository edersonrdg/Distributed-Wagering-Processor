import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorService } from '@nestjs/terminus';
import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import { SQS_CLIENT } from '../../../shared/sqs/sqs.constants';
import type { EnvConfig } from '../../../config/env.validation';

@Injectable()
export class SqsHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(SQS_CLIENT) private readonly client: SQSClient,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async isHealthy(key = 'sqs') {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.client.send(
        new GetQueueAttributesCommand({
          QueueUrl: this.config.get('SQS_WAGER_QUEUE_URL', { infer: true }),
          AttributeNames: ['QueueArn'],
        }),
      );
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
