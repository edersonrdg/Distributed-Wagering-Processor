import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ProcessWagerDto, ProcessWagerResult } from '../dto/process-wager.dto';
import { Money } from '../../../core/domain/money.value-object';
import {
  LedgerDirection,
  WagerTransaction,
  WagerTransactionKind,
} from '../../../core/domain/wager-transaction.entity';
import { randomUUID } from 'node:crypto';
import { EntityManager, LockMode } from '@mikro-orm/core';
import { WalletEntity } from '../../../shared/database/entities/wallet.entity';
import { Wallet } from '../../../core/domain/wallet.aggregate';
import { WalletLedgerEntry } from '../../../core/domain/wallet-ledger-entry.entity';
import { WagerTransactionEntity } from '../../../shared/database/entities/wager-transaction.entity';
import { WalletLedgerEntryEntity } from '../../../shared/database/entities/wallet-ledger-entry.entity';

@Injectable()
export class ProcessWageringService {
  private logger = new Logger(ProcessWageringService.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(dto: ProcessWagerDto): Promise<ProcessWagerResult> {
    if (!dto.idempotencyKey) {
      throw new BadRequestException('Header idempotency-key is required');
    }

    return await this.entityManager.transactional(async (tsxEntityManager) => {
      this.logger.log(`Processing transaction domain`);
      const transactionMoney = Money.from(dto.money);
      const transaction = WagerTransaction.create({
        ...dto,
        id: randomUUID(),
        money: transactionMoney,
      });

      this.logger.log(`Fetching transaction entity with ID: ${transaction.id}`);
      let wagerTransactionEntity: WagerTransactionEntity | null = null;

      if (transaction.requiresReference()) {
        wagerTransactionEntity = await tsxEntityManager.findOne(
          WagerTransactionEntity,
          {
            providerId: dto.providerId,
            externalTransactionId: dto.referenceExternalTransactionId!,
          },
        );

        if (!wagerTransactionEntity) {
          transaction.markPendingReference();

          this.logger.log(
            `Creating pending transaction entity for ID: ${transaction.id}`,
          );
          const pendingTxEntity = tsxEntityManager.create(
            WagerTransactionEntity,
            {
              ...transaction,
              money: {
                amount: transaction.money.toString(),
                currency: transaction.money.currency,
              },
              status: transaction.status,
            },
          );

          tsxEntityManager.persist(pendingTxEntity);

          this.logger.log(
            `Pending transaction entity created: ${JSON.stringify(transaction)}`,
          );

          return {
            transactionId: transaction.id,
            status: transaction.status,
            idempotentReplay: false,
          };
        }
      }

      this.logger.log(
        `Fetching wallet with ID: ${dto.walletId} (Optimistic Locking)`,
      );
      const walletEntity = await tsxEntityManager.findOne(
        WalletEntity,
        {
          id: dto.walletId,
        },
        {
          lockMode: LockMode.OPTIMISTIC,
        },
      );

      if (!walletEntity) {
        throw new NotFoundException(`Wallet with id ${dto.walletId} not found`);
      }

      const wallet = Wallet.rehydrate({
        id: walletEntity.id,
        playerId: walletEntity.playerId,
        currency: walletEntity.currency,
        balance: Money.from({
          amount: walletEntity.balance.amount,
          currency: walletEntity.balance.currency,
        }),
        version: walletEntity.version,
        createdAt: walletEntity.createdAt,
        updatedAt: walletEntity.updatedAt,
      });

      const ledgerEntry = this.applyLedgerEntryRule(transaction, wallet);
      transaction.markProcessed(wagerTransactionEntity?.id, new Date());

      this.logger.log(
        `Marking transaction as processed: ${JSON.stringify(transaction)}`,
      );
      const transactionEntity = tsxEntityManager.create(
        WagerTransactionEntity,
        {
          ...transaction,
          money: {
            amount: transaction.money.toString(),
            currency: transaction.money.currency,
          },
          status: transaction.status,
        },
      );

      tsxEntityManager.persist(transactionEntity);

      if (ledgerEntry) {
        const ledgerEntryEntity = tsxEntityManager.create(
          WalletLedgerEntryEntity,
          {
            ...ledgerEntry,
            money: {
              amount: ledgerEntry.money.toString(),
              currency: ledgerEntry.money.currency,
            },
            balanceBefore: {
              amount: ledgerEntry.balanceBefore.toString(),
              currency: ledgerEntry.balanceBefore.currency,
            },
            balanceAfter: {
              amount: ledgerEntry.balanceAfter.toString(),
              currency: ledgerEntry.balanceAfter.currency,
            },
          },
        );
        tsxEntityManager.persist(ledgerEntryEntity);

        walletEntity.balance.amount = wallet.balance.toString();
        tsxEntityManager.persist(walletEntity);
      }

      return {
        transactionId: transaction.id,
        status: transaction.status,
        balance: wallet.balance.toJSON(),
        idempotentReplay: false,
      };
    });
  }

  private applyLedgerEntryRule(
    transaction: WagerTransaction,
    wallet: Wallet,
  ): WalletLedgerEntry | null {
    if (!transaction.affectsBalance()) {
      return null;
    }

    const direction =
      transaction.kind === WagerTransactionKind.Bet
        ? LedgerDirection.Debit
        : LedgerDirection.Credit;

    const saveBalance = wallet.balance;

    if (direction === LedgerDirection.Debit) {
      wallet.debit(transaction.money);
    } else {
      wallet.credit(transaction.money);
    }

    return WalletLedgerEntry.create({
      id: randomUUID(),
      walletId: wallet.id,
      transactionId: transaction.id,
      direction: direction,
      money: transaction.money,
      balanceBefore: saveBalance,
      balanceAfter: wallet.balance,
    });
  }
}
