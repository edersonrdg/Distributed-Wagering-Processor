import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { EntityManager } from '@mikro-orm/core';
import {
  CreateQueueCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { bootTestApp, stopTestApp, type TestApp } from '../support/infra';
import { OutboxRelayWorker } from '../../src/modules/wagering/workers/outbox-relay.worker';
import { SqsProducerService } from '../../src/shared/sqs/sqs-producer.service';
import { MetricsService } from '../../src/modules/observability/metrics.service';
import { SQS_CLIENT } from '../../src/shared/sqs/sqs.constants';
import { OutboxMessageEntity } from '../../src/shared/database/entities/outbox-message.entity';
import { OutboxMessage } from '../../src/core/domain/outbox-message.entity';
import { WagerTransactionProcessed } from '../../src/shared/events/wager-transaction-processed.event';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../src/core/domain/wager-transaction.entity';

describe('Outbox relay under concurrency (real Postgres + LocalStack FIFO queue)', () => {
  let testApp: TestApp;
  let em: EntityManager;
  let client: SQSClient;
  let sqsProducer: SqsProducerService;
  let metrics: MetricsService;
  let queueUrl: string;

  beforeAll(async () => {
    testApp = await bootTestApp();
    em = testApp.app.get(EntityManager);
    client = testApp.app.get(SQS_CLIENT);
    sqsProducer = testApp.app.get(SqsProducerService);
    metrics = testApp.app.get(MetricsService);

    const { QueueUrl } = await client.send(
      new CreateQueueCommand({
        QueueName: `outbox-relay-${Date.now()}.fifo`,
        Attributes: { FifoQueue: 'true', ContentBasedDeduplication: 'false' },
      }),
    );
    queueUrl = QueueUrl as string;
  }, 120_000);

  afterAll(async () => {
    await stopTestApp(testApp);
  });

  test('two concurrent relay passes over the same pending row publish exactly one SQS message', async () => {
    const event = WagerTransactionProcessed.create({
      eventId: randomUUID(),
      aggregateId: randomUUID(),
      correlationId: randomUUID(),
      data: {
        transactionId: randomUUID(),
        providerId: 'provider-1',
        walletId: randomUUID(),
        kind: WagerTransactionKind.Bet,
        status: WagerTransactionStatus.Processed,
        money: { amount: '10.00', currency: 'BRL' },
      },
    });
    const outboxDomain = OutboxMessage.enqueue(event);

    const seedEm = em.fork();
    seedEm.persist(
      seedEm.create(OutboxMessageEntity, {
        id: outboxDomain.id,
        aggregateId: outboxDomain.aggregateId,
        eventType: outboxDomain.eventType,
        payload: outboxDomain.payload,
        occurredAt: outboxDomain.occurredAt,
        attempts: outboxDomain.attempts,
      }),
    );
    await seedEm.flush();

    const configStub = { get: () => queueUrl } as never;
    const workerA = new OutboxRelayWorker(em, sqsProducer, configStub, metrics);
    const workerB = new OutboxRelayWorker(em, sqsProducer, configStub, metrics);

    await Promise.all([workerA.relayMessages(), workerB.relayMessages()]);

    const received: string[] = [];
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const { Messages } = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 2,
        }),
      );
      for (const message of Messages ?? []) {
        received.push(message.Body ?? '');
        if (message.ReceiptHandle) {
          await client.send(
            new DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
        }
      }
      if (!Messages?.length) break;
    }

    expect(received).toHaveLength(1);

    const row = await em
      .fork()
      .findOneOrFail(OutboxMessageEntity, { id: outboxDomain.id });
    expect(row.publishedAt).not.toBeNull();
  }, 30_000);
});
