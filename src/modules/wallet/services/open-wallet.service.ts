import { Injectable, ConflictException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';
import { WalletEntity } from '../../../shared/database/entities/wallet.entity';
import { WagerTransactionEntity } from '../../../shared/database/entities/wager-transaction.entity';
import { WalletLedgerEntryEntity } from '../../../shared/database/entities/wallet-ledger-entry.entity';
import { Wallet } from '../../../core/domain/wallet.aggregate';
import { Money } from '../../../core/domain/money.value-object';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
  LedgerDirection,
} from '../../../core/domain/wager-transaction.entity';
import { OpenWalletDto } from '../dto/open-wallet.dto';

@Injectable()
export class OpenWalletService {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(dto: OpenWalletDto) {
    return await this.entityManager.transactional(async (transactionEntity) => {
      const existingWallet = await transactionEntity.findOne(WalletEntity, {
        playerId: dto.playerId,
        currency: dto.initialBalance.currency,
      });

      if (existingWallet) {
        throw new ConflictException(
          'Wallet already exists for this player and currency',
        );
      }

      const initialMoney = Money.from(dto.initialBalance);
      const wallet = Wallet.open({
        id: randomUUID(),
        playerId: dto.playerId,
        initialBalance: initialMoney,
      });

      const walletEntity = transactionEntity.create(WalletEntity, {
        id: wallet.id,
        playerId: wallet.playerId,
        currency: wallet.currency,
        balance: {
          amount: wallet.balance.toString(),
          currency: wallet.balance.currency,
        },
        version: wallet.version,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
      });
      transactionEntity.persist(walletEntity);

      if (initialMoney.isPositive()) {
        const transactionId = randomUUID();

        const openingTxEntity = transactionEntity.create(
          WagerTransactionEntity,
          {
            id: transactionId,
            providerId: 'INTERNAL',
            externalTransactionId: transactionId,
            idempotencyKey: `OPENING-${wallet.id}`,
            payloadHash: 'OPENING',
            walletId: wallet.id,
            playerId: wallet.playerId,
            roundId: 'OPENING',
            gameId: 'INTERNAL',
            kind: WagerTransactionKind.Opening,
            money: {
              amount: initialMoney.toString(),
              currency: initialMoney.currency,
            },
            status: WagerTransactionStatus.Processed,
            processedAt: new Date(),
            createdAt: new Date(),
          },
        );
        transactionEntity.persist(openingTxEntity);

        const ledgerEntity = transactionEntity.create(WalletLedgerEntryEntity, {
          id: randomUUID(),
          walletId: wallet.id,
          transactionId: transactionId,
          direction: LedgerDirection.Credit,
          money: {
            amount: initialMoney.toString(),
            currency: initialMoney.currency,
          },
          balanceBefore: { amount: '0.00', currency: initialMoney.currency },
          balanceAfter: {
            amount: initialMoney.toString(),
            currency: initialMoney.currency,
          },
          createdAt: new Date(),
        });
        transactionEntity.persist(ledgerEntity);
      }

      return {
        id: wallet.id,
        playerId: wallet.playerId,
        balance: wallet.balance.toJSON(),
        version: wallet.version,
      };
    });
  }
}
