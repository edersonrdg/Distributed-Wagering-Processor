import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  LocalstackContainer,
  type StartedLocalStackContainer,
} from '@testcontainers/localstack';
import { CreateQueueCommand, SQSClient } from '@aws-sdk/client-sqs';
import { applyTestEnv } from './test-utils';

export interface Infra {
  postgres: StartedPostgreSqlContainer;
  localstack: StartedLocalStackContainer;
  queueUrl: string;
}

export async function startInfra(): Promise<Infra> {
  const postgres = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('wagering_test')
    .withUsername('wagering')
    .withPassword('wagering')
    .start();

  const localstack = await new LocalstackContainer(
    'localstack/localstack:3.8',
  ).start();
  const sqsEndpoint = localstack.getConnectionUri();

  const client = new SQSClient({
    region: 'us-east-1',
    endpoint: sqsEndpoint,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  const { QueueUrl } = await client.send(
    new CreateQueueCommand({ QueueName: 'wager-events' }),
  );
  const queueUrl = QueueUrl ?? '';

  applyTestEnv({
    NODE_ENV: 'test',
    DB_HOST: postgres.getHost(),
    DB_PORT: String(postgres.getPort()),
    DB_USER: postgres.getUsername(),
    DB_PASSWORD: postgres.getPassword(),
    DB_NAME: postgres.getDatabase(),
    DB_DEBUG: 'false',
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'test',
    AWS_SECRET_ACCESS_KEY: 'test',
    SQS_ENDPOINT: sqsEndpoint,
    SQS_WAGER_QUEUE_URL: queueUrl,
  });

  return { postgres, localstack, queueUrl };
}

export async function stopInfra(infra: Partial<Infra>): Promise<void> {
  await infra.localstack?.stop();
  await infra.postgres?.stop();
}
