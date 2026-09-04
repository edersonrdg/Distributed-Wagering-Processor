import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import {
  EntityManager,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { bootTestApp, stopTestApp, type TestApp } from '../support/infra';
import { InboxMessageEntity } from '../../src/shared/database/entities/inbox-message.entity';

describe('Transactional Inbox redelivery (real Postgres)', () => {
  let testApp: TestApp;
  let em: EntityManager;

  beforeAll(async () => {
    testApp = await bootTestApp();
    em = testApp.app.get(EntityManager);
  }, 60000);

  afterAll(async () => {
    await stopTestApp(testApp);
  });

  test('redelivering the same SQS message id is silently blocked by the unique constraint', async () => {
    const messageId = `sqs-${randomUUID()}`;
    const consumerName = 'wagering-processor';

    const first = em.fork();
    first.persist(
      first.create(InboxMessageEntity, {
        messageId,
        consumerName,
        payloadHash: 'hash-1',
      }),
    );
    await first.flush();

    const redelivery = em.fork();
    redelivery.persist(
      redelivery.create(InboxMessageEntity, {
        messageId,
        consumerName,
        payloadHash: 'hash-1',
      }),
    );

    await expect(redelivery.flush()).rejects.toThrow(
      UniqueConstraintViolationException,
    );

    const rows = await em
      .fork()
      .find(InboxMessageEntity, { messageId, consumerName });
    expect(rows).toHaveLength(1);
  });

  test('the same message id is allowed for a different consumer (composite unique key)', async () => {
    const messageId = `sqs-${randomUUID()}`;

    const a = em.fork();
    a.persist(
      a.create(InboxMessageEntity, {
        messageId,
        consumerName: 'consumer-a',
        payloadHash: 'hash',
      }),
    );
    await a.flush();

    const b = em.fork();
    b.persist(
      b.create(InboxMessageEntity, {
        messageId,
        consumerName: 'consumer-b',
        payloadHash: 'hash',
      }),
    );
    await expect(b.flush()).resolves.toBeUndefined();

    const rows = await em.fork().find(InboxMessageEntity, { messageId });
    expect(rows).toHaveLength(2);
  });
});
