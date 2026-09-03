import { WagerTransactionKind } from '../../../core/domain/wager-transaction.entity';

export interface ProcessWagerDto {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: {
    amount: string;
    currency: string;
  };
  referenceExternalTransactionId?: string;
}

export interface ProcessWagerResult {
  transactionId: string;
  status: string;
  balance?: { amount: string; currency: string };
  idempotentReplay: boolean;
}
