import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  LocalstackContainer,
  type StartedLocalStackContainer,
} from '@testcontainers/localstack';
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SQSClient,
  type Message,
} from '@aws-sdk/client-sqs';
import { SqsProducerService } from '../../src/shared/sqs/sqs-producer.service';
import { SqsConsumerService } from '../../src/shared/sqs/sqs-consumer.service';
import { waitUntil } from '../support/test-utils';

class TestConsumer extends SqsConsumerService {
  readonly processed: string[] = [];
  protected readonly queueUrl: string;
  private readonly failFor: Set<string>;

  constructor(
    client: SQSClient,
    queueUrl: string,
    failFor: Set<string> = new Set(),
  ) {
    super(client);
    this.queueUrl = queueUrl;
    this.failFor = failFor;
  }

  protected handleMessage(message: Message): Promise<void> {
    const body = JSON.parse(message.Body ?? '{}') as { id: string };
    if (this.failFor.has(body.id)) {
      return Promise.reject(
        new Error(`Simulated failure for message ${body.id}`),
      );
    }
    this.processed.push(body.id);
    return Promise.resolve();
  }
}

describe('SQS messaging (real LocalStack)', () => {
  let localstack: StartedLocalStackContainer;
  let client: SQSClient;

  beforeAll(async () => {
    localstack = await new LocalstackContainer(
      'localstack/localstack:3.8',
    ).start();
    client = new SQSClient({
      region: 'us-east-1',
      endpoint: localstack.getConnectionUri(),
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
  }, 120_000);

  afterAll(async () => {
    await localstack?.stop();
  });

  test('concurrently produced messages are all processed exactly once, regardless of delivery order (race + determinism)', async () => {
    const { QueueUrl } = await client.send(
      new CreateQueueCommand({ QueueName: `race-${Date.now()}` }),
    );
    const queueUrl = QueueUrl as string;
    const producer = new SqsProducerService(client);

    const ids = Array.from({ length: 20 }, (_, i) => `msg-${i}`);
    await Promise.all(ids.map((id) => producer.send(queueUrl, { id })));

    const consumer = new TestConsumer(client, queueUrl);
    consumer.onModuleInit();
    try {
      await waitUntil(() => consumer.processed.length >= ids.length, 20_000);
    } finally {
      await consumer.onModuleDestroy();
    }

    expect(new Set(consumer.processed)).toEqual(new Set(ids));
    expect(consumer.processed).toHaveLength(ids.length);
  }, 30_000);

  test('a message that keeps failing is retried and eventually routed to the dead-letter queue', async () => {
    const suffix = Date.now();
    const { QueueUrl: dlqUrl } = await client.send(
      new CreateQueueCommand({ QueueName: `dlq-${suffix}` }),
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
        QueueName: `main-${suffix}`,
        Attributes: {
          VisibilityTimeout: '1',
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: dlqArn,
            maxReceiveCount: '2',
          }),
        },
      }),
    );
    const queueUrl = mainUrl as string;

    const producer = new SqsProducerService(client);
    await producer.send(queueUrl, { id: 'poison' });

    const consumer = new TestConsumer(client, queueUrl, new Set(['poison']));
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

    expect(consumer.processed).not.toContain('poison');
  }, 30_000);
});
