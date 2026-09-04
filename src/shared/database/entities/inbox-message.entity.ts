import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/core';

const InboxMessageSchema = defineEntity({
  name: 'InboxMessageEntity',
  tableName: 'inbox_messages',
  uniques: [{ properties: ['consumerName', 'messageId'] }],
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    messageId: p.string(),
    consumerName: p.string(),
    payloadHash: p.string(),
    receivedAt: p.datetime().onCreate(() => new Date()),
    processedAt: p.datetime().nullable(),
  },
});

export class InboxMessageEntity extends InboxMessageSchema.class {}
InboxMessageSchema.setClass(InboxMessageEntity);
