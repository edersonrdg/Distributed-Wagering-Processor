import { describe, expect, test } from 'bun:test';
import { generateHashPayload } from './payload-hash.utils';

describe('generateHashPayload (canonical payload hash)', () => {
  test('is deterministic for the same payload', () => {
    const payload = { providerId: 'p1', amount: '10.00', currency: 'BRL' };
    expect(generateHashPayload(payload)).toBe(generateHashPayload(payload));
  });

  test('is independent of key order (canonical form)', () => {
    const a = { providerId: 'p1', amount: '10.00', currency: 'BRL' };
    const b = { currency: 'BRL', amount: '10.00', providerId: 'p1' };
    expect(generateHashPayload(a)).toBe(generateHashPayload(b));
  });

  test('is independent of key order in nested objects', () => {
    const a = { money: { amount: '10.00', currency: 'BRL' }, providerId: 'p1' };
    const b = { providerId: 'p1', money: { currency: 'BRL', amount: '10.00' } };
    expect(generateHashPayload(a)).toBe(generateHashPayload(b));
  });

  test('produces different hashes for different payloads under the same idempotency key', () => {
    const payloadA = {
      idempotencyKey: 'same-key',
      amount: '10.00',
      currency: 'BRL',
    };
    const payloadB = {
      idempotencyKey: 'same-key',
      amount: '20.00',
      currency: 'BRL',
    };
    expect(generateHashPayload(payloadA)).not.toBe(
      generateHashPayload(payloadB),
    );
  });

  test('produces a 64-char lowercase hex sha256 digest', () => {
    const hash = generateHashPayload({ a: 1 });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('distinguishes payloads that differ only in array order', () => {
    const a = { tags: ['a', 'b'] };
    const b = { tags: ['b', 'a'] };
    expect(generateHashPayload(a)).not.toBe(generateHashPayload(b));
  });
});
