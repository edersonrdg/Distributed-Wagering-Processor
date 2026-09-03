import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { WagerTransactionEntity } from '../../../shared/database/entities/wager-transaction.entity';

@Injectable()
export class SearchWageringService {
  constructor(private readonly entityManager: EntityManager) {}

  async getTransactionById(transactionId: string) {
    const wagerTransaction = await this.entityManager.findOne(
      WagerTransactionEntity,
      {
        id: transactionId,
      },
    );
    if (!wagerTransaction) {
      throw new NotFoundException('Transaction not found');
    }
    return this.mapToResponse(wagerTransaction);
  }

  async getTransactionByExternalId(
    providerId: string,
    externalTransactionId: string,
  ) {
    const wagerTransaction = await this.entityManager.findOne(
      WagerTransactionEntity,
      {
        providerId,
        externalTransactionId,
      },
    );
    if (!wagerTransaction) {
      throw new NotFoundException('Transaction not found');
    }
    return this.mapToResponse(wagerTransaction);
  }

  private mapToResponse(tx: WagerTransactionEntity) {
    return {
      id: tx.id,
      providerId: tx.providerId,
      externalTransactionId: tx.externalTransactionId,
      walletId: tx.walletId,
      playerId: tx.playerId,
      kind: tx.kind,
      status: tx.status,
      money: { amount: tx.money.amount, currency: tx.money.currency },
      processedAt: tx.processedAt,
      createdAt: tx.createdAt,
      failureCode: tx.failureCode,
    };
  }
}
