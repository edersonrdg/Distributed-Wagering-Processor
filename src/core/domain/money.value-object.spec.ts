import { describe, expect, test } from 'bun:test';
import { Money } from './money.value-object';

describe('Money value object', () => {
  describe('from()', () => {
    test('accepts a well-scaled decimal string', () => {
      const money = Money.from({ amount: '10.50', currency: 'BRL' });
      expect(money.toString()).toBe('10.50');
      expect(money.currency).toBe('BRL');
    });

    test('accepts negative decimal strings', () => {
      const money = Money.from({ amount: '-5.00', currency: 'BRL' });
      expect(money.isNegative()).toBe(true);
    });

    test('rejects values with more than 2 decimal places', () => {
      expect(() => Money.from({ amount: '10.123', currency: 'BRL' })).toThrow(
        /Invalid money format/,
      );
    });

    test('rejects values with fewer than 2 decimal places', () => {
      expect(() => Money.from({ amount: '10.5', currency: 'BRL' })).toThrow(
        /Invalid money format/,
      );
    });

    test('rejects integers without a decimal point', () => {
      expect(() => Money.from({ amount: '10', currency: 'BRL' })).toThrow(
        /Invalid money format/,
      );
    });

    test('rejects non-numeric strings (NaN-like input)', () => {
      expect(() => Money.from({ amount: 'NaN', currency: 'BRL' })).toThrow(
        /Invalid money format/,
      );
      expect(() => Money.from({ amount: 'abc.de', currency: 'BRL' })).toThrow(
        /Invalid money format/,
      );
    });

    test('rejects empty strings', () => {
      expect(() => Money.from({ amount: '', currency: 'BRL' })).toThrow(
        /Invalid money format/,
      );
    });
  });

  describe('zero()', () => {
    test('creates a zero-value Money in the given currency', () => {
      const zero = Money.zero('BRL');
      expect(zero.isZero()).toBe(true);
      expect(zero.toString()).toBe('0.00');
    });
  });

  describe('arithmetic', () => {
    test('adds two amounts without floating point drift', () => {
      const a = Money.from({ amount: '0.10', currency: 'BRL' });
      const b = Money.from({ amount: '0.20', currency: 'BRL' });
      expect(a.add(b).toString()).toBe('0.30');
    });

    test('subtracts two amounts correctly', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '3.33', currency: 'BRL' });
      expect(a.subtract(b).toString()).toBe('6.67');
    });

    test('negate() flips the sign', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      expect(a.negate().toString()).toBe('-10.00');
    });

    test('blocks addition across different currencies', () => {
      const brl = Money.from({ amount: '10.00', currency: 'BRL' });
      const usd = Money.from({ amount: '10.00', currency: 'USD' });
      expect(() => brl.add(usd)).toThrow(/Currency mismatch/);
    });

    test('blocks subtraction across different currencies', () => {
      const brl = Money.from({ amount: '10.00', currency: 'BRL' });
      const usd = Money.from({ amount: '10.00', currency: 'USD' });
      expect(() => brl.subtract(usd)).toThrow(/Currency mismatch/);
    });

    test('blocks comparison across different currencies', () => {
      const brl = Money.from({ amount: '10.00', currency: 'BRL' });
      const usd = Money.from({ amount: '10.00', currency: 'USD' });
      expect(() => brl.isLessThan(usd)).toThrow(/Currency mismatch/);
    });
  });

  describe('comparisons', () => {
    test('equals() is currency- and value-sensitive', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.00', currency: 'BRL' });
      const c = Money.from({ amount: '10.00', currency: 'USD' });
      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
    });

    test('isLessThan() compares magnitudes within the same currency', () => {
      const a = Money.from({ amount: '5.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.00', currency: 'BRL' });
      expect(a.isLessThan(b)).toBe(true);
      expect(b.isLessThan(a)).toBe(false);
    });

    test('isPositive()/isNegative()/isZero() classify the value', () => {
      expect(Money.from({ amount: '1.00', currency: 'BRL' }).isPositive()).toBe(
        true,
      );
      expect(
        Money.from({ amount: '-1.00', currency: 'BRL' }).isNegative(),
      ).toBe(true);
      expect(Money.from({ amount: '0.00', currency: 'BRL' }).isZero()).toBe(
        true,
      );
    });
  });

  describe('serialization', () => {
    test('toJSON() round-trips through from()', () => {
      const original = Money.from({ amount: '42.42', currency: 'BRL' });
      const rehydrated = Money.from(original.toJSON());
      expect(rehydrated.equals(original)).toBe(true);
    });
  });
});
