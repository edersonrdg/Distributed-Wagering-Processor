import { describe, expect, test } from 'bun:test';
import {
  LedgerDirection,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from './wager-transaction.entity';
import { Money } from './money.value-object';
import { FailureCode } from './failure-codes.enum';

const money = Money.from({ amount: '10.00', currency: 'BRL' });

function createTransaction(
  overrides: Partial<Parameters<typeof WagerTransaction.create>[0]> = {},
) {
  return WagerTransaction.create({
    id: 'tx-1',
    providerId: 'provider-1',
    externalTransactionId: 'ext-1',
    idempotencyKey: 'idem-1',
    payloadHash: 'hash-1',
    walletId: 'wallet-1',
    playerId: 'player-1',
    roundId: 'round-1',
    gameId: 'game-1',
    kind: WagerTransactionKind.Bet,
    money,
    ...overrides,
  });
}

describe('WagerTransaction entity', () => {
  describe('create()', () => {
    test('starts in PENDING status', () => {
      const tx = createTransaction();
      expect(tx.status).toBe(WagerTransactionStatus.Pending);
    });

    test('requires a reference id for REFUND', () => {
      expect(() =>
        createTransaction({ kind: WagerTransactionKind.Refund }),
      ).toThrow(/REFUND requires referenceExternalTransactionId/);
    });

    test('requires a reference id for ROLLBACK', () => {
      expect(() =>
        createTransaction({ kind: WagerTransactionKind.Rollback }),
      ).toThrow(/ROLLBACK requires referenceExternalTransactionId/);
    });

    test('accepts REFUND when a reference id is provided', () => {
      const tx = createTransaction({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: 'ext-original',
      });
      expect(tx.requiresReference()).toBe(true);
    });
  });

  describe('state transitions', () => {
    test('markProcessed() moves PENDING -> PROCESSED and stamps processedAt', () => {
      const tx = createTransaction();
      const at = new Date('2026-01-01T00:00:00Z');
      tx.markProcessed('ref-tx', at);

      expect(tx.status).toBe(WagerTransactionStatus.Processed);
      expect(tx.referenceTransactionId).toBe('ref-tx');
      expect(tx.processedAt).toEqual(at);
    });

    test('reject() moves PENDING -> REJECTED with a failure code', () => {
      const tx = createTransaction();
      tx.reject(FailureCode.INSUFFICIENT_FUNDS);

      expect(tx.status).toBe(WagerTransactionStatus.Rejected);
      expect(tx.failureCode).toBe(FailureCode.INSUFFICIENT_FUNDS);
    });

    test('fail() moves PENDING -> FAILED with a failure code', () => {
      const tx = createTransaction();
      tx.fail(FailureCode.UNKNOWN_ERROR);

      expect(tx.status).toBe(WagerTransactionStatus.Failed);
      expect(tx.failureCode).toBe(FailureCode.UNKNOWN_ERROR);
    });

    test('markPendingReference() moves PENDING -> PENDING_REFERENCE', () => {
      const tx = createTransaction();
      tx.markPendingReference();
      expect(tx.status).toBe(WagerTransactionStatus.PendingReference);
    });

    test.each([
      [
        'PROCESSED',
        (tx: WagerTransaction) => tx.markProcessed(undefined, new Date()),
      ],
      [
        'REJECTED',
        (tx: WagerTransaction) => tx.reject(FailureCode.UNKNOWN_ERROR),
      ],
      ['FAILED', (tx: WagerTransaction) => tx.fail(FailureCode.UNKNOWN_ERROR)],
    ])(
      'cannot transition out of terminal state %s again',
      (_label, terminalize) => {
        const tx = createTransaction();
        terminalize(tx);
        expect(tx.isTerminal()).toBe(true);

        expect(() => tx.markProcessed(undefined, new Date())).toThrow(
          /Cannot transition from terminal state/,
        );
        expect(() => tx.reject(FailureCode.UNKNOWN_ERROR)).toThrow(
          /Cannot transition from terminal state/,
        );
        expect(() => tx.fail(FailureCode.UNKNOWN_ERROR)).toThrow(
          /Cannot transition from terminal state/,
        );
        expect(() => tx.markPendingReference()).toThrow(
          /Cannot transition from terminal state/,
        );
      },
    );

    test('PENDING_REFERENCE is not terminal and can still transition', () => {
      const tx = createTransaction();
      tx.markPendingReference();
      expect(tx.isTerminal()).toBe(false);

      tx.markProcessed('ref-tx', new Date());
      expect(tx.status).toBe(WagerTransactionStatus.Processed);
    });
  });

  describe('business rules', () => {
    test('affectsBalance() is false only for LOSS', () => {
      expect(
        createTransaction({ kind: WagerTransactionKind.Loss }).affectsBalance(),
      ).toBe(false);
      for (const kind of [
        WagerTransactionKind.Bet,
        WagerTransactionKind.Win,
        WagerTransactionKind.Opening,
      ]) {
        expect(createTransaction({ kind }).affectsBalance()).toBe(true);
      }
    });

    test('requiresReference() is true only for REFUND/ROLLBACK', () => {
      expect(
        createTransaction({
          kind: WagerTransactionKind.Bet,
        }).requiresReference(),
      ).toBe(false);
      expect(
        createTransaction({
          kind: WagerTransactionKind.Rollback,
          referenceExternalTransactionId: 'ext-original',
        }).requiresReference(),
      ).toBe(true);
    });

    test('matchesPayload() compares against the stored payload hash', () => {
      const tx = createTransaction({ payloadHash: 'expected-hash' });
      expect(tx.matchesPayload('expected-hash')).toBe(true);
      expect(tx.matchesPayload('different-hash')).toBe(false);
    });

    test('ledgerDirectionFor() requires a reference transaction', () => {
      const tx = createTransaction();
      expect(() => tx.ledgerDirectionFor(undefined)).toThrow(
        /Reference transaction required/,
      );
    });

    test('ledgerDirectionFor() is DEBIT when reversing a WIN', () => {
      const original = createTransaction({ kind: WagerTransactionKind.Win });
      const rollback = createTransaction({
        kind: WagerTransactionKind.Rollback,
        referenceExternalTransactionId: 'ext-original',
      });
      expect(rollback.ledgerDirectionFor(original)).toBe(LedgerDirection.Debit);
    });

    test('ledgerDirectionFor() is CREDIT when reversing a BET', () => {
      const original = createTransaction({ kind: WagerTransactionKind.Bet });
      const rollback = createTransaction({
        kind: WagerTransactionKind.Rollback,
        referenceExternalTransactionId: 'ext-original',
      });
      expect(rollback.ledgerDirectionFor(original)).toBe(
        LedgerDirection.Credit,
      );
    });
  });
});
