import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/core';
import { MoneyEmbeddable } from './money-embeddable';

const WalletSchema = defineEntity({
  name: 'WalletEntity',
  tableName: 'wallets',
  checks: [{ expression: 'balance_amount >= 0' }],
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    playerId: p.uuid(),
    currency: p.string().length(3),
    balance: () => p.embedded(MoneyEmbeddable).prefix('balance_'),
    version: p.integer().version(),
    createdAt: p.datetime().onCreate(() => new Date()),
    updatedAt: p
      .datetime()
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),
  },
});

export class WalletEntity extends WalletSchema.class {}
WalletSchema.setClass(WalletEntity);
