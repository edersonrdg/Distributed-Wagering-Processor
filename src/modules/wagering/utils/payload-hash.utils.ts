import * as crypto from 'node:crypto';

function sortObjectKeys(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);

  return Object.keys(obj)
    .sort()
    .reduce(
      (acc, key) => {
        acc[key] = sortObjectKeys(obj[key]);
        return acc;
      },
      {} as Record<string, any>,
    );
}

export const generateHashPayload = (
  payload: Record<string, unknown>,
): string => {
  const sortedPayload = sortObjectKeys(payload);
  const canonicalString = JSON.stringify(sortedPayload);
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
};
