import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/core';
import { MoneyEmbeddable } from './money-embeddable';
import { LedgerDirection } from '../../../core/domain/wager-transaction.entity';

const WalletLedgerEntrySchema = defineEntity({
  name: 'WalletLedgerEntryEntity',
  tableName: 'wallet_ledger_entries',
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    walletId: p.uuid().index(),
    transactionId: p.uuid(),
    direction: p.enum(() => LedgerDirection),
    money: () => p.embedded(MoneyEmbeddable).prefix('money_'),
    balanceBefore: () => p.embedded(MoneyEmbeddable).prefix('balance_before_'),
    balanceAfter: () => p.embedded(MoneyEmbeddable).prefix('balance_after_'),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export class WalletLedgerEntryEntity extends WalletLedgerEntrySchema.class {}
WalletLedgerEntrySchema.setClass(WalletLedgerEntryEntity);
