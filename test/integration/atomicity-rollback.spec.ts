import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { EntityManager, RequestContext, MikroORM } from '@mikro-orm/core';
import { ClsService } from 'nestjs-cls';
import { bootTestApp, stopTestApp, type TestApp } from '../support/infra';
import { assertLedgerReconciles } from '../support/test-utils';
import { OpenWalletService } from '../../src/modules/wallet/services/open-wallet.service';
import { ProcessWageringService } from '../../src/modules/wagering/services/process-wagering.service';
import { ReconciliationService } from '../../src/modules/wallet/services/reconciliation-wallet.service';
import { MetricsService } from '../../src/modules/observability/metrics.service';
import { WalletEntity } from '../../src/shared/database/entities/wallet.entity';
import { WagerTransactionEntity } from '../../src/shared/database/entities/wager-transaction.entity';
import { WalletLedgerEntryEntity } from '../../src/shared/database/entities/wallet-ledger-entry.entity';
import { OutboxMessageEntity } from '../../src/shared/database/entities/outbox-message.entity';
import { InboxMessageEntity } from '../../src/shared/database/entities/inbox-message.entity';
import { WagerTransactionKind } from '../../src/core/domain/wager-transaction.entity';
import { InboxMessage } from '../../src/core/domain/inbox-message.entity';
import { generateHashPayload } from '../../src/modules/wagering/utils/payload-hash.utils';

describe('Unit of Work atomicity (real Postgres, fault injected mid-transaction)', () => {
  let testApp: TestApp;
  let em: EntityManager;
  let orm: MikroORM;
  let cls: ClsService;
  let openWalletService: OpenWalletService;
  let processWageringService: ProcessWageringService;
  let reconciliationService: ReconciliationService;
  let metrics: MetricsService;

  beforeAll(async () => {
    testApp = await bootTestApp();
    em = testApp.app.get(EntityManager);
    orm = testApp.app.get(MikroORM);
    cls = testApp.app.get(ClsService);
    openWalletService = testApp.app.get(OpenWalletService);
    processWageringService = testApp.app.get(ProcessWageringService);
    reconciliationService = testApp.app.get(ReconciliationService);
    metrics = testApp.app.get(MetricsService);
  }, 120_000);

  afterAll(async () => {
    await stopTestApp(testApp);
  });

  test('a failure right before commit rolls back wallet, ledger, inbox and outbox together', async () => {
    const playerId = randomUUID();

    const opened = await RequestContext.create(orm.em, async () => {
      return await openWalletService.execute({
        playerId,
        initialBalance: { amount: '100.00', currency: 'BRL' },
      });
    });

    const walletId = opened.id;

    const [walletBefore, txCountBefore, ledgerCountBefore, outboxCountBefore] =
      await Promise.all([
        em.fork().findOneOrFail(WalletEntity, { id: walletId }),
        em.fork().count(WagerTransactionEntity, {}),
        em.fork().count(WalletLedgerEntryEntity, { walletId }),
        em.fork().count(OutboxMessageEntity, {}),
      ]);

    const body = {
      providerId: 'provider-atomicity',
      externalTransactionId: `ext-${randomUUID()}`,
      playerId,
      walletId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: { amount: '30.00', currency: 'BRL' },
    };
    const idempotencyKey = `idem-${randomUUID()}`;
    const dto = {
      ...body,
      idempotencyKey,
      payloadHash: generateHashPayload(body),
    };
    const inbox = InboxMessage.receive({
      messageId: `sqs-msg-${randomUUID()}`,
      consumerName: 'wagering-processor',
      payloadHash: dto.payloadHash,
    });

    const spy = spyOn(metrics, 'recordTransaction').mockImplementation(() => {
      throw new Error('Injected failure before commit');
    });

    await expect(
      RequestContext.create(orm.em, async () => {
        return cls.run(() => processWageringService.execute(dto, inbox));
      }),
    ).rejects.toThrow('Injected failure before commit');

    spy.mockRestore();

    const [
      walletAfter,
      txCountAfter,
      ledgerCountAfter,
      outboxCountAfter,
      inboxRow,
      txRow,
    ] = await Promise.all([
      em.fork().findOneOrFail(WalletEntity, { id: walletId }),
      em.fork().count(WagerTransactionEntity, {}),
      em.fork().count(WalletLedgerEntryEntity, { walletId }),
      em.fork().count(OutboxMessageEntity, {}),
      em.fork().findOne(InboxMessageEntity, { messageId: inbox.messageId }),
      em.fork().findOne(WagerTransactionEntity, {
        providerId: dto.providerId,
        idempotencyKey,
      }),
    ]);

    expect(walletAfter.balance.amount).toBe(walletBefore.balance.amount);
    expect(walletAfter.version).toBe(walletBefore.version);
    expect(txCountAfter).toBe(txCountBefore);
    expect(ledgerCountAfter).toBe(ledgerCountBefore);
    expect(outboxCountAfter).toBe(outboxCountBefore);
    expect(inboxRow).toBeNull();
    expect(txRow).toBeNull();

    const reconciliation = await RequestContext.create(orm.em, async () => {
      return await assertLedgerReconciles(reconciliationService, walletId);
    });

    expect(reconciliation.storedBalance.amount).toBe('100.00');
  });
});
