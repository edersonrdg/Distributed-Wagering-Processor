import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityManager } from '@mikro-orm/core';
import { OutboxMessageEntity } from '../../../shared/database/entities/outbox-message.entity';
import { OutboxMessage } from '../../../core/domain/outbox-message.entity';
import { SqsProducerService } from '../../../shared/sqs/sqs-producer.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OutboxRelayWorker {
  private readonly logger = new Logger(OutboxRelayWorker.name);
  private readonly topicUrl: string;

  constructor(
    private readonly em: EntityManager,
    private readonly sqsProducer: SqsProducerService,
    config: ConfigService,
  ) {
    this.topicUrl = config.get<string>('SQS_EVENTS_QUEUE_URL') || '';
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async relayMessages() {
    const em = this.em.fork();

    const pendingMessages = await em.find(
      OutboxMessageEntity,
      {
        publishedAt: null,
        $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: new Date() } }],
      },
      { limit: 50, orderBy: { occurredAt: 'ASC' } },
    );

    if (pendingMessages.length === 0) return;

    for (const entity of pendingMessages) {
      const outboxDomain = OutboxMessage.rehydrate(entity as any);

      try {
        await this.sqsProducer.send(this.topicUrl, outboxDomain.payload, {
          deduplicationId: outboxDomain.id,
          groupId: outboxDomain.eventType,
        });

        outboxDomain.markPublished(new Date());
        entity.publishedAt = outboxDomain.publishedAt;

        await em.flush();
        this.logger.log(`Outbox message ${entity.id} published successfully`);
      } catch (error) {
        this.logger.error(
          `Failed to publish outbox message ${entity.id}`,
          error,
        );
        outboxDomain.scheduleRetry(new Date());
        entity.attempts = outboxDomain.attempts;
        entity.nextAttemptAt = outboxDomain.nextAttemptAt;
        await em.flush();
      }
    }
  }
}
