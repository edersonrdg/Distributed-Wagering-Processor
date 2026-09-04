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
      const decodedCursor = Buffer.from(cursor, 'base64').toString('utf-8');
      const [timestamp, id] = decodedCursor.split('|');

      if (timestamp && id) {
        query.$or = [
          { createdAt: { $lt: new Date(timestamp) } },
          { createdAt: new Date(timestamp), id: { $lt: id } },
        ];
      }
    }

    const entries = await this.entityManager.find(
      WalletLedgerEntryEntity,
      query,
      {
        orderBy: { createdAt: 'DESC', id: 'DESC' },
        limit: parsedLimit,
      },
    );

    let nextCursor: string | null = null;
    if (entries.length === parsedLimit) {
      const lastEntry = entries[entries.length - 1];
      const cursorData = `${lastEntry.createdAt.toISOString()}|${lastEntry.id}`;
      nextCursor = Buffer.from(cursorData).toString('base64');
    }

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
