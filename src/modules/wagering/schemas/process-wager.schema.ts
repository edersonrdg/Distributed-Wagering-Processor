import { z } from 'zod';
import { WagerTransactionKind } from '../../../core/domain/wager-transaction.entity';

export const processWagerSchema = z.object({
  providerId: z.string().min(1),
  externalTransactionId: z.string().min(1),
  playerId: z.string().uuid(),
  walletId: z.string().uuid(),
  roundId: z.string().min(1),
  gameId: z.string().min(1),
  kind: z.enum(WagerTransactionKind),
  money: z.object({
    amount: z
      .string()
      .regex(
        /^-?\d+\.\d{2}$/,
        'Amount must be a decimal string with exactly 2 decimal places',
      ),
    currency: z.string().length(3),
  }),
  referenceExternalTransactionId: z.string().optional(),
});

export type ProcessWagerPayload = z.infer<typeof processWagerSchema>;
