import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient, type Message } from '@aws-sdk/client-sqs';
import { SqsConsumerService } from '../../../shared/sqs/sqs-consumer.service';
import { ProcessWageringService } from '../services/process-wagering.service';
import { InboxMessage } from '../../../core/domain/inbox-message.entity';
import { ProcessWagerDto } from '../dto/process-wager.dto';
import type { EnvConfig } from '../../../config/env.validation';

@Injectable()
export class WageringSqsConsumer extends SqsConsumerService {
  protected readonly queueUrl: string;

  constructor(
    client: SQSClient,
    config: ConfigService<EnvConfig, true>,
    private readonly processWageringService: ProcessWageringService,
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

    // Constrói o objeto de domínio do Inbox persistente
    const inbox = InboxMessage.receive({
      messageId: message.MessageId,
      consumerName: 'wagering-processor',
      payloadHash: payload.payloadHash || 'N/A',
    });

    try {
      await this.processWageringService.execute(data, inbox);

      this.logger.log(`Message ${message.MessageId} processed successfully`);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('already processed')
      ) {
        this.logger.warn(
          `Message ${message.MessageId} is a duplicate (Inbox hit). Acking.`,
        );
        return;
      }
      throw error;
    }
  }
}
