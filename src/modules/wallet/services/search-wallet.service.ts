import { EntityManager } from '@mikro-orm/core';
import { Injectable, NotFoundException } from '@nestjs/common';
import { WalletEntity } from '../../../shared/database/entities/wallet.entity';
import { WalletLedgerEntryEntity } from '../../../shared/database/entities/wallet-ledger-entry.entity';

@Injectable()
export class SearchWalletService {
  constructor(private readonly entityManager: EntityManager) {}

  async getWallet(walletId: string) {
    const wallet = await this.entityManager.findOne(WalletEntity, {
      id: walletId,
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: {
        amount: wallet.balance.amount,
        currency: wallet.balance.currency,
      },
      version: wallet.version,
    };
  }

  async getLedger(walletId: string, cursor?: string, limit = 50) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const query: Record<string, any> = { walletId };

    if (cursor) {
      const decodedCursor = new Date(
        Buffer.from(cursor, 'base64').toString('ascii'),
      );
      query.createdAt = { $lt: decodedCursor };
    }

    const entries = await this.entityManager.find(
      WalletLedgerEntryEntity,
      query,
      {
        orderBy: { createdAt: 'DESC' },
        limit: parsedLimit,
      },
    );

    const nextCursor =
      entries.length === parsedLimit
        ? Buffer.from(
            entries[entries.length - 1].createdAt.toISOString(),
          ).toString('base64')
        : null;

    return {
      data: entries.map((entry) => ({
        id: entry.id,
        transactionId: entry.transactionId,
        direction: entry.direction,
        money: { amount: entry.money.amount, currency: entry.money.currency },
        balanceBefore: {
          amount: entry.balanceBefore.amount,
          currency: entry.balanceBefore.currency,
        },
        balanceAfter: {
          amount: entry.balanceAfter.amount,
          currency: entry.balanceAfter.currency,
        },
        createdAt: entry.createdAt,
      })),
      nextCursor,
    };
  }
}
