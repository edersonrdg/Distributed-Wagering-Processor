import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient, type Message } from '@aws-sdk/client-sqs';
import { SqsConsumerService } from '../../../shared/sqs/sqs-consumer.service';
import { ProcessWageringService } from '../services/process-wagering.service';
import { InboxMessage } from '../../../core/domain/inbox-message.entity';
import { ProcessWagerDto } from '../dto/process-wager.dto';
import type { EnvConfig } from '../../../config/env.validation';
import { MetricsService } from '../../observability/metrics.service';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class WageringSqsConsumer extends SqsConsumerService {
  protected readonly queueUrl: string;
  protected readonly MAX_RECEIVE_COUNT = 5;

  constructor(
    client: SQSClient,
    config: ConfigService<EnvConfig, true>,
    private readonly processWageringService: ProcessWageringService,
    private readonly metrics: MetricsService,
    private readonly cls: ClsService,
  ) {
    super(client);
    this.queueUrl = config.get('SQS_WAGER_QUEUE_URL', { infer: true });
  }

  protected async handleMessage(message: Message): Promise<void> {
    if (!message.Body || !message.MessageId) {
      this.logger.warn('Received empty message or message without ID');
      return;
    }

    const payload = JSON.parse(message.Body);
    const data: ProcessWagerDto = payload.data;

    const inbox = InboxMessage.receive({
      messageId: message.MessageId,
      consumerName: 'wagering-processor',
      payloadHash: payload.payloadHash || 'N/A',
    });

    await this.cls.run(async () => {
      try {
        await this.processWageringService.execute(data, inbox);
        this.logger.log(`Message ${message.MessageId} processed successfully`);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('already processed')
        ) {
          this.metrics.recordDuplicate();
          this.logger.warn(
            `Message ${message.MessageId} is a duplicate (Inbox hit). Acking.`,
          );
          return;
        }

        const receiveCount = Number(
          message.Attributes?.ApproximateReceiveCount || 1,
        );

        if (receiveCount >= this.MAX_RECEIVE_COUNT) {
          this.metrics.recordDlq();
          this.logger.error(
            `Message ${message.MessageId} moving to DLQ after ${receiveCount} attempts.`,
          );
        } else {
          this.metrics.recordRetry();
        }

        throw error;
      }
    });
  }
}
