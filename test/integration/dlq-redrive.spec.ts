import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { EntityManager } from '@mikro-orm/core';
import { bootTestApp, stopTestApp, type TestApp } from '../support/infra';
import { waitUntil } from '../support/test-utils';
import { WageringSqsConsumer } from '../../src/modules/wagering/workers/wagering-sqs.consumer';
import { ProcessWageringService } from '../../src/modules/wagering/services/process-wagering.service';
import { MetricsService } from '../../src/modules/observability/metrics.service';
import { SQS_CLIENT } from '../../src/shared/sqs/sqs.constants';
import { SqsProducerService } from '../../src/shared/sqs/sqs-producer.service';
import { WagerTransactionEntity } from '../../src/shared/database/entities/wager-transaction.entity';
import { WagerTransactionKind } from '../../src/core/domain/wager-transaction.entity';
import { generateHashPayload } from '../../src/modules/wagering/utils/payload-hash.utils';

describe('SQS DLQ redrive after retry exhaustion (real Postgres + LocalStack)', () => {
  let testApp: TestApp;
  let client: SQSClient;
  let em: EntityManager;
  let processWageringService: ProcessWageringService;
  let metrics: MetricsService;
  let sqsProducer: SqsProducerService;

  beforeAll(async () => {
    testApp = await bootTestApp();
    client = testApp.app.get(SQS_CLIENT);
    em = testApp.app.get(EntityManager);
    processWageringService = testApp.app.get(ProcessWageringService);
    metrics = testApp.app.get(MetricsService);
    sqsProducer = testApp.app.get(SqsProducerService);
  }, 120_000);

  afterAll(async () => {
    await stopTestApp(testApp);
  });

  test('a message that keeps failing business validation is moved to the DLQ after exhausting retries', async () => {
    const suffix = Date.now();
    const { QueueUrl: dlqUrl } = await client.send(
      new CreateQueueCommand({
        QueueName: `wager-dlq-${suffix}.fifo`,
        Attributes: { FifoQueue: 'true', ContentBasedDeduplication: 'false' },
      }),
    );
    const { Attributes } = await client.send(
      new GetQueueAttributesCommand({
        QueueUrl: dlqUrl,
        AttributeNames: ['QueueArn'],
      }),
    );
    const dlqArn = Attributes?.QueueArn as string;

    const { QueueUrl: mainUrl } = await client.send(
      new CreateQueueCommand({
        QueueName: `wager-main-${suffix}.fifo`,
        Attributes: {
          FifoQueue: 'true',
          ContentBasedDeduplication: 'false',
          VisibilityTimeout: '1',
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: dlqArn,
            maxReceiveCount: '2',
          }),
        },
      }),
    );
    const queueUrl = mainUrl as string;

    const body = {
      providerId: 'provider-dlq',
      externalTransactionId: `ext-${randomUUID()}`,
      playerId: randomUUID(),
      walletId: randomUUID(),
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: { amount: '10.00', currency: 'BRL' },
    };
    const idempotencyKey = `idem-${randomUUID()}`;
    const payloadHash = generateHashPayload(body);
    const data = { ...body, idempotencyKey, payloadHash };

    await sqsProducer.send(
      queueUrl,
      { data, payloadHash },
      { deduplicationId: randomUUID(), groupId: 'wager-dlq-test' },
    );

    const configStub = { get: () => queueUrl } as never;
    const consumer = new WageringSqsConsumer(
      client,
      configStub,
      processWageringService,
      metrics,
    );
    consumer.onModuleInit();

    try {
      await waitUntil(async () => {
        const { Messages } = await client.send(
          new ReceiveMessageCommand({
            QueueUrl: dlqUrl,
            WaitTimeSeconds: 1,
            MaxNumberOfMessages: 1,
          }),
        );
        return Boolean(Messages?.length);
      }, 20_000);
    } finally {
      await consumer.onModuleDestroy();
    }

    const txRow = await em.fork().findOne(WagerTransactionEntity, {
      providerId: body.providerId,
      idempotencyKey,
    });
    expect(txRow).toBeNull();
  }, 30_000);
});
