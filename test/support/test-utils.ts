export function applyTestEnv(overrides: Record<string, string>): void {
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
}

export async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs = 200,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

export interface ReconciliationResult {
  walletId: string;
  storedBalance: { amount: string; currency: string };
  calculatedBalance: { amount: string; currency: string };
  difference: { amount: string; currency: string };
  consistent: boolean;
  checkedEntries: number;
}

export async function assertLedgerReconciles(
  reconciliationService: {
    execute(walletId: string): Promise<ReconciliationResult>;
  },
  walletId: string,
): Promise<ReconciliationResult> {
  const result = await reconciliationService.execute(walletId);
  if (!result.consistent) {
    throw new Error(
      `Ledger reconciliation failed for wallet ${walletId}: stored=${result.storedBalance.amount} calculated=${result.calculatedBalance.amount}`,
    );
  }
  return result;
}
