import * as crypto from 'node:crypto';

export const generateHashPayload = (
  payload: Record<string, unknown>,
): string => {
  const canonicalString = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
};
