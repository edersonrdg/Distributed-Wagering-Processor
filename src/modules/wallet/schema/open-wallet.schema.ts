import { z } from 'zod';

export const openWalletSchema = z.object({
  playerId: z.string().uuid(),
  initialBalance: z.object({
    amount: z
      .string()
      .regex(/^-?\d+\.\d{2}$/, 'Amount must have 2 decimal places'),
    currency: z.string().length(3),
  }),
});

export type OpenWalletPayload = z.infer<typeof openWalletSchema>;
