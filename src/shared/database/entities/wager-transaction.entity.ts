import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/core';
import { MoneyEmbeddable } from './money-embeddable';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../../core/domain/wager-transaction.entity';

const WagerTransactionSchema = defineEntity({
  name: 'WagerTransactionEntity',
  tableName: 'wager_transactions',
  uniques: [{ properties: ['providerId', 'idempotencyKey'] }],
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    providerId: p.string(),
    externalTransactionId: p.string(),
    idempotencyKey: p.string(),
    payloadHash: p.string(),
    walletId: p.uuid(),
    playerId: p.uuid(),
    roundId: p.string(),
    gameId: p.string(),
    kind: p.enum(() => WagerTransactionKind),
    money: () => p.embedded(MoneyEmbeddable).prefix('money_'),
    referenceExternalTransactionId: p.string().nullable(),
    status: p.enum(() => WagerTransactionStatus),
    referenceTransactionId: p.string().nullable(),
    failureCode: p.string().nullable(),
    processedAt: p.datetime().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export class WagerTransactionEntity extends WagerTransactionSchema.class {}
WagerTransactionSchema.setClass(WagerTransactionEntity);
