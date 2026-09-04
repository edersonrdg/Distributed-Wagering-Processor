import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { EntityManager } from '@mikro-orm/core';
import { bootTestApp, stopTestApp, type TestApp } from '../support/infra';
import { WalletEntity } from '../../src/shared/database/entities/wallet.entity';
import { WagerTransactionEntity } from '../../src/shared/database/entities/wager-transaction.entity';
import { WalletLedgerEntryEntity } from '../../src/shared/database/entities/wallet-ledger-entry.entity';
import {
  LedgerDirection,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../src/core/domain/wager-transaction.entity';

describe('Database constraints (real Postgres)', () => {
  let testApp: TestApp;
  let em: EntityManager;

  beforeAll(async () => {
    testApp = await bootTestApp();
    em = testApp.app.get(EntityManager);
  }, 60000);

  afterAll(async () => {
    await stopTestApp(testApp);
  });

  test('rejects a wallet row with a negative balance at the database level', async () => {
    const fork = em.fork();
    const wallet = fork.create(WalletEntity, {
      playerId: randomUUID(),
      currency: 'BRL',
      balance: { amount: '-10.00', currency: 'BRL' },
    });
    fork.persist(wallet);

    await expect(fork.flush()).rejects.toThrow(/check constraint|violates/i);
  });

  test('allows a zero balance but rejects any negative amount after an update', async () => {
    const fork = em.fork();
    const wallet = fork.create(WalletEntity, {
      playerId: randomUUID(),
      currency: 'BRL',
      balance: { amount: '0.00', currency: 'BRL' },
    });
    fork.persist(wallet);
    await fork.flush();

    wallet.balance.amount = '-0.01';
    await expect(fork.flush()).rejects.toThrow(/check constraint|violates/i);
  });

  test('rejects a wager_transaction row that duplicates (providerId, idempotencyKey)', async () => {
    const fork = em.fork();
    const providerId = `provider-${randomUUID()}`;
    const idempotencyKey = `idem-${randomUUID()}`;
    const common = {
      providerId,
      idempotencyKey,
      payloadHash: 'hash',
      walletId: randomUUID(),
      playerId: randomUUID(),
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: { amount: '10.00', currency: 'BRL' },
      status: WagerTransactionStatus.Processed,
      createdAt: new Date(),
    };

    fork.persist(
      fork.create(WagerTransactionEntity, {
        ...common,
        externalTransactionId: 'ext-1',
      }),
    );
    await fork.flush();

    fork.persist(
      fork.create(WagerTransactionEntity, {
        ...common,
        externalTransactionId: 'ext-2',
      }),
    );
    await expect(fork.flush()).rejects.toThrow(/unique|duplicate/i);
  });

  test('a ledger entry references a real wallet_id without a formal FK but reconciliation still balances', async () => {
    const fork = em.fork();
    const walletId = randomUUID();
    const wallet = fork.create(WalletEntity, {
      id: walletId,
      playerId: randomUUID(),
      currency: 'BRL',
      balance: { amount: '50.00', currency: 'BRL' },
    });
    fork.persist(wallet);

    const entry = fork.create(WalletLedgerEntryEntity, {
      walletId,
      transactionId: randomUUID(),
      direction: LedgerDirection.Credit,
      money: { amount: '50.00', currency: 'BRL' },
      balanceBefore: { amount: '0.00', currency: 'BRL' },
      balanceAfter: { amount: '50.00', currency: 'BRL' },
    });
    fork.persist(entry);
    await fork.flush();

    const found = await fork
      .fork()
      .findOne(WalletLedgerEntryEntity, { walletId });
    expect(found?.money.amount).toBe('50.00');
  });
});
