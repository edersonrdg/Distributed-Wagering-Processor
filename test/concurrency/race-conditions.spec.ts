import { beforeAll, afterAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { RequestContext, MikroORM } from '@mikro-orm/core';
import { ClsService } from 'nestjs-cls';
import { bootTestApp, stopTestApp, type TestApp } from '../support/infra';
import { assertLedgerReconciles } from '../support/test-utils';
import { OpenWalletService } from '../../src/modules/wallet/services/open-wallet.service';
import { ProcessWageringService } from '../../src/modules/wagering/services/process-wagering.service';
import { ReconciliationService } from '../../src/modules/wallet/services/reconciliation-wallet.service';
import { WalletEntity } from '../../src/shared/database/entities/wallet.entity';
import { WagerTransactionKind } from '../../src/core/domain/wager-transaction.entity';
import { generateHashPayload } from '../../src/modules/wagering/utils/payload-hash.utils';

describe('Concurrency and Race Conditions (real Postgres)', () => {
  let testApp: TestApp;
  let orm: MikroORM;
  let cls: ClsService;
  let openWalletService: OpenWalletService;
  let processWageringService: ProcessWageringService;
  let reconciliationService: ReconciliationService;

  beforeAll(async () => {
    testApp = await bootTestApp();
    orm = testApp.app.get(MikroORM);
    cls = testApp.app.get(ClsService);
    openWalletService = testApp.app.get(OpenWalletService);
    processWageringService = testApp.app.get(ProcessWageringService);
    reconciliationService = testApp.app.get(ReconciliationService);
  }, 120_000);

  afterAll(async () => {
    await stopTestApp(testApp);
  });

  const execWagerConcurrently = async (body: any) => {
    return RequestContext.create(orm.em, async () => {
      return cls.run(() =>
        processWageringService.execute({
          ...body,
          payloadHash: generateHashPayload(body),
        }),
      );
    });
  };

  test('Idempotência Maciça: envia 50 requisições idênticas em paralelo e debita apenas uma vez', async () => {
    const playerId = randomUUID();
    const opened = await RequestContext.create(orm.em, () =>
      openWalletService.execute({
        playerId,
        initialBalance: { amount: '100.00', currency: 'BRL' },
      }),
    );
    const walletId = opened.id;

    const transactionId = randomUUID();
    const idempotencyKey = `provider-1:${transactionId}`;

    const payload = {
      providerId: 'provider-1',
      externalTransactionId: transactionId,
      idempotencyKey,
      playerId,
      walletId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: { amount: '20.00', currency: 'BRL' },
    };

    const promises = Array.from({ length: 50 }).map(() =>
      execWagerConcurrently(payload),
    );
    const responses = await Promise.all(promises);

    const successes = responses.filter(
      (r) => r.status === 'PROCESSED' && r.idempotentReplay === false,
    );
    const replays = responses.filter(
      (r) => r.status === 'PROCESSED' && r.idempotentReplay === true,
    );

    expect(successes.length).toBe(1);
    expect(replays.length).toBe(49);

    const wallet = await orm.em
      .fork()
      .findOneOrFail(WalletEntity, { id: walletId });
    expect(wallet.balance.amount).toBe('80.00');

    const reconciliation = await RequestContext.create(orm.em, () =>
      assertLedgerReconciles(reconciliationService, walletId),
    );
    expect(reconciliation.consistent).toBe(true);
  });

  test('Hot Wallet Limit: duas apostas de 80 disputando 100 de saldo concorrentemente', async () => {
    const playerId = randomUUID();
    const opened = await RequestContext.create(orm.em, () =>
      openWalletService.execute({
        playerId,
        initialBalance: { amount: '100.00', currency: 'BRL' },
      }),
    );
    const walletId = opened.id;

    const payload1 = {
      providerId: 'provider-1',
      externalTransactionId: randomUUID(),
      idempotencyKey: `idem-1-${randomUUID()}`,
      playerId,
      walletId,
      roundId: 'round-2',
      gameId: 'game-2',
      kind: WagerTransactionKind.Bet,
      money: { amount: '80.00', currency: 'BRL' },
    };

    const payload2 = {
      providerId: 'provider-1',
      externalTransactionId: randomUUID(),
      idempotencyKey: `idem-2-${randomUUID()}`,
      playerId,
      walletId,
      roundId: 'round-2',
      gameId: 'game-2',
      kind: WagerTransactionKind.Bet,
      money: { amount: '80.00', currency: 'BRL' },
    };

    const [res1, res2] = await Promise.all([
      execWagerConcurrently(payload1),
      execWagerConcurrently(payload2),
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain('PROCESSED');
    expect(statuses).toContain('REJECTED');

    const wallet = await orm.em
      .fork()
      .findOneOrFail(WalletEntity, { id: walletId });
    expect(wallet.balance.amount).toBe('20.00');
    const reconciliation = await RequestContext.create(orm.em, () =>
      assertLedgerReconciles(reconciliationService, walletId),
    );
    expect(reconciliation.consistent).toBe(true);
  });
});
