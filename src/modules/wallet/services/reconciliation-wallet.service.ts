import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import Big from 'big.js';
import { WalletEntity } from '../../../shared/database/entities/wallet.entity';
import { WalletLedgerEntryEntity } from '../../../shared/database/entities/wallet-ledger-entry.entity';
import { LedgerDirection } from '../../../core/domain/wager-transaction.entity';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(walletId: string) {
    const wallet = await this.entityManager.findOne(WalletEntity, {
      id: walletId,
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const entries = await this.entityManager.find(WalletLedgerEntryEntity, {
      walletId,
    });

    let calculatedBalance = new Big('0.00');
    let checkedEntries = 0;

    for (const entry of entries) {
      const amount = new Big(entry.money.amount);
      if (entry.direction === LedgerDirection.Credit) {
        calculatedBalance = calculatedBalance.plus(amount);
      } else if (entry.direction === LedgerDirection.Debit) {
        calculatedBalance = calculatedBalance.minus(amount);
      }
      checkedEntries++;
    }

    const storedBalance = new Big(wallet.balance.amount);
    const difference = storedBalance.minus(calculatedBalance);
    const consistent = difference.eq(0);

    const result = {
      walletId: wallet.id,
      storedBalance: {
        amount: storedBalance.toFixed(2),
        currency: wallet.currency,
      },
      calculatedBalance: {
        amount: calculatedBalance.toFixed(2),
        currency: wallet.currency,
      },
      difference: { amount: difference.toFixed(2), currency: wallet.currency },
      consistent,
      checkedEntries,
    };

    if (!consistent) {
      this.logger.error(`Reconciliation failed for wallet ${walletId}`, result);
    }

    return result;
  }
}
