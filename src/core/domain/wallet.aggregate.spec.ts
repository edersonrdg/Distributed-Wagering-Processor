import { describe, expect, test } from 'bun:test';
import { Wallet } from './wallet.aggregate';
import { Money } from './money.value-object';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });

describe('Wallet aggregate', () => {
  describe('open()', () => {
    test('opens with a positive initial balance at version 1', () => {
      const wallet = Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: brl('100.00'),
      });

      expect(wallet.balance.toString()).toBe('100.00');
      expect(wallet.version).toBe(1);
      expect(wallet.currency).toBe('BRL');
    });

    test('rejects a negative initial balance', () => {
      expect(() =>
        Wallet.open({
          id: 'wallet-1',
          playerId: 'player-1',
          initialBalance: brl('-1.00'),
        }),
      ).toThrow(/Initial balance cannot be negative/);
    });

    test('allows a zero initial balance', () => {
      const wallet = Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: brl('0.00'),
      });
      expect(wallet.balance.isZero()).toBe(true);
    });
  });

  describe('debit()', () => {
    test('reduces the balance and increments the version', () => {
      const wallet = Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: brl('100.00'),
      });

      wallet.debit(brl('30.00'));

      expect(wallet.balance.toString()).toBe('70.00');
      expect(wallet.version).toBe(2);
    });

    test('blocks a negative balance (insufficient funds)', () => {
      const wallet = Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: brl('10.00'),
      });

      expect(() => wallet.debit(brl('20.00'))).toThrow(/Insufficient funds/);
      expect(wallet.balance.toString()).toBe('10.00');
      expect(wallet.version).toBe(1);
    });

    test('allows debiting exactly the full balance down to zero', () => {
      const wallet = Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: brl('50.00'),
      });

      wallet.debit(brl('50.00'));
      expect(wallet.balance.isZero()).toBe(true);
    });

    test('rejects a negative debit amount', () => {
      const wallet = Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: brl('50.00'),
      });

      expect(() => wallet.debit(brl('-10.00'))).toThrow(
        /Debit amount must be positive/,
      );
    });

    test('rejects debiting a different currency', () => {
      const wallet = Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: brl('50.00'),
      });

      expect(() =>
        wallet.debit(Money.from({ amount: '10.00', currency: 'USD' })),
      ).toThrow(/currency must match/);
    });
  });

  describe('credit()', () => {
    test('increases the balance and increments the version', () => {
      const wallet = Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: brl('100.00'),
      });

      wallet.credit(brl('25.00'));

      expect(wallet.balance.toString()).toBe('125.00');
      expect(wallet.version).toBe(2);
    });

    test('rejects a negative credit amount', () => {
      const wallet = Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: brl('50.00'),
      });

      expect(() => wallet.credit(brl('-1.00'))).toThrow(
        /Credit amount must be positive/,
      );
    });

    test('rejects crediting a different currency', () => {
      const wallet = Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: brl('50.00'),
      });

      expect(() =>
        wallet.credit(Money.from({ amount: '10.00', currency: 'USD' })),
      ).toThrow(/currency must match/);
    });
  });

  describe('rehydrate()', () => {
    test('reconstructs a wallet from persisted state without mutating it', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const wallet = Wallet.rehydrate({
        id: 'wallet-1',
        playerId: 'player-1',
        currency: 'BRL',
        balance: brl('42.00'),
        version: 7,
        createdAt: now,
        updatedAt: now,
      });

      expect(wallet.version).toBe(7);
      expect(wallet.balance.toString()).toBe('42.00');
    });

    test('multiple sequential operations increment version monotonically', () => {
      const wallet = Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: brl('100.00'),
      });

      wallet.debit(brl('10.00'));
      wallet.credit(brl('5.00'));
      wallet.debit(brl('20.00'));

      expect(wallet.version).toBe(4);
      expect(wallet.balance.toString()).toBe('75.00');
    });
  });
});
