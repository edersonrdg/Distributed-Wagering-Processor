import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/core';

const OutboxMessageSchema = defineEntity({
  name: 'OutboxMessageEntity',
  tableName: 'outbox_messages',
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    aggregateId: p.uuid(),
    eventType: p.string(),
    payload: p.json(),
    occurredAt: p.datetime(),
    attempts: p.integer().default(0),
    nextAttemptAt: p.datetime().nullable(),
    publishedAt: p.datetime().nullable(),
  },
});

export class OutboxMessageEntity extends OutboxMessageSchema.class {}
OutboxMessageSchema.setClass(OutboxMessageEntity);
