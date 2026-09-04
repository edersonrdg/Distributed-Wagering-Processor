import { beforeAll, afterAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { RequestContext, MikroORM } from '@mikro-orm/core';
import { ClsService } from 'nestjs-cls';
import { bootTestApp, stopTestApp, type TestApp } from '../support/infra';
import { assertLedgerReconciles } from '../support/test-utils';
import { OpenWalletService } from '../../src/modules/wallet/services/open-wallet.service';
import { ProcessWageringService } from '../../src/modules/wagering/services/process-wagering.service';
import { ReconciliationService } from '../../src/modules/wallet/services/reconciliation-wallet.service';
import { WagerTransactionEntity } from '../../src/shared/database/entities/wager-transaction.entity';
import { WalletLedgerEntryEntity } from '../../src/shared/database/entities/wallet-ledger-entry.entity';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../src/core/domain/wager-transaction.entity';
import { FailureCode } from '../../src/core/domain/failure-codes.enum';
import { generateHashPayload } from '../../src/modules/wagering/utils/payload-hash.utils';
import { ConflictException } from '@nestjs/common';

describe('Business Rules (Real Postgres Integration)', () => {
  let testApp: TestApp;
  let orm: MikroORM;
  let cls: ClsService;
  let openWalletService: OpenWalletService;
  let processWageringService: ProcessWageringService;
  let reconciliationService: ReconciliationService;

  let walletId: string;
  const playerId = randomUUID();
  const providerId = 'integration-provider';

  beforeAll(async () => {
    testApp = await bootTestApp();
    orm = testApp.app.get(MikroORM);
    cls = testApp.app.get(ClsService);
    openWalletService = testApp.app.get(OpenWalletService);
    processWageringService = testApp.app.get(ProcessWageringService);
    reconciliationService = testApp.app.get(ReconciliationService);

    const opened = await RequestContext.create(orm.em, async () => {
      return await openWalletService.execute({
        playerId,
        initialBalance: { amount: '100.00', currency: 'BRL' },
      });
    });
    walletId = opened.id;
  }, 120_000);

  afterAll(async () => {
    await stopTestApp(testApp);
  });

  const execWager = async (body: any) => {
    return RequestContext.create(orm.em, async () => {
      return cls.run(() =>
        processWageringService.execute({
          ...body,
          idempotencyKey: body.idempotencyKey || randomUUID(),
          payloadHash: generateHashPayload(body),
        }),
      );
    });
  };

  test('BET deduz saldo e registra ledger', async () => {
    const txId = randomUUID();
    const result = await execWager({
      providerId,
      externalTransactionId: txId,
      playerId,
      walletId,
      roundId: 'r1',
      gameId: 'g1',
      kind: WagerTransactionKind.Bet,
      money: { amount: '20.00', currency: 'BRL' },
    });

    expect(result.status).toBe(WagerTransactionStatus.Processed);
    expect(result.balance?.amount).toBe('80.00');

    const ledger = await orm.em.fork().findOne(WalletLedgerEntryEntity, {
      transactionId: result.transactionId,
    });
    expect(ledger).not.toBeNull();
  });

  test('LOSS processa com sucesso sem alterar saldo nem gerar ledger', async () => {
    const em = orm.em.fork();
    const ledgerCountBefore = await em.count(WalletLedgerEntryEntity, {
      walletId,
    });

    const result = await execWager({
      providerId,
      externalTransactionId: randomUUID(),
      playerId,
      walletId,
      roundId: 'r1',
      gameId: 'g1',
      kind: WagerTransactionKind.Loss,
      money: { amount: '10.00', currency: 'BRL' },
    });

    expect(result.status).toBe(WagerTransactionStatus.Processed);
    expect(result.balance?.amount).toBe('80.00');

    const ledgerCountAfter = await em.count(WalletLedgerEntryEntity, {
      walletId,
    });
    expect(ledgerCountAfter).toBe(ledgerCountBefore);
  });

  test('BET sem saldo suficiente é REJECTED com INSUFFICIENT_FUNDS', async () => {
    const txId = randomUUID();
    const result = await execWager({
      providerId,
      externalTransactionId: txId,
      playerId,
      walletId,
      roundId: 'r1',
      gameId: 'g1',
      kind: WagerTransactionKind.Bet,
      money: { amount: '900.00', currency: 'BRL' },
    });

    expect(result.status).toBe(WagerTransactionStatus.Rejected);

    const tx = await orm.em
      .fork()
      .findOneOrFail(WagerTransactionEntity, { id: result.transactionId });
    expect(tx.failureCode).toBe(FailureCode.INSUFFICIENT_FUNDS);
  });

  test('Conflito de Moeda é REJECTED com CURRENCY_MISMATCH', async () => {
    const txId = randomUUID();
    const result = await execWager({
      providerId,
      externalTransactionId: txId,
      playerId,
      walletId,
      roundId: 'r1',
      gameId: 'g1',
      kind: WagerTransactionKind.Win,
      money: { amount: '10.00', currency: 'USD' },
    });

    expect(result.status).toBe(WagerTransactionStatus.Rejected);

    const tx = await orm.em
      .fork()
      .findOneOrFail(WagerTransactionEntity, { id: result.transactionId });
    expect(tx.failureCode).toBe(FailureCode.CURRENCY_MISMATCH);
  });

  test('Idempotency Key idêntica com payload diferente lança ConflictException', async () => {
    const idempotencyKey = 'idem-conflict-123';

    await execWager({
      providerId,
      externalTransactionId: randomUUID(),
      playerId,
      walletId,
      roundId: 'r1',
      gameId: 'g1',
      kind: WagerTransactionKind.Win,
      money: { amount: '10.00', currency: 'BRL' },
      idempotencyKey,
    });

    await expect(
      execWager({
        providerId,
        externalTransactionId: randomUUID(),
        playerId,
        walletId,
        roundId: 'r1',
        gameId: 'g1',
        kind: WagerTransactionKind.Win,
        money: { amount: '50.00', currency: 'BRL' },
        idempotencyKey,
      }),
    ).rejects.toThrow(ConflictException);
  });

  test('REFUND sem a transação original existente fica PENDING_REFERENCE', async () => {
    const refId = `ext-missing-${randomUUID()}`;
    const result = await execWager({
      providerId,
      externalTransactionId: randomUUID(),
      playerId,
      walletId,
      roundId: 'r1',
      gameId: 'g1',
      kind: WagerTransactionKind.Refund,
      money: { amount: '5.00', currency: 'BRL' },
      referenceExternalTransactionId: refId,
    });

    expect(result.status).toBe(WagerTransactionStatus.PendingReference);
  });

  test('Invariante final: Saldo da carteira corresponde rigorosamente à soma do Ledger', async () => {
    const reconciliation = await RequestContext.create(orm.em, async () => {
      return await assertLedgerReconciles(reconciliationService, walletId);
    });

    expect(reconciliation.consistent).toBe(true);
  });
});
