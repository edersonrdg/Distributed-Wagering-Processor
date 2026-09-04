import {
  BadRequestException,
  ConflictException,
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
  WagerTransactionStatus,
} from '../../../core/domain/wager-transaction.entity';
import { randomUUID } from 'node:crypto';
import { EntityManager, LockMode } from '@mikro-orm/core';
import { WalletEntity } from '../../../shared/database/entities/wallet.entity';
import { Wallet } from '../../../core/domain/wallet.aggregate';
import { WalletLedgerEntry } from '../../../core/domain/wallet-ledger-entry.entity';
import { WagerTransactionEntity } from '../../../shared/database/entities/wager-transaction.entity';
import { WalletLedgerEntryEntity } from '../../../shared/database/entities/wallet-ledger-entry.entity';
import { WalletBalanceChanged } from '../../../shared/events/wallet-balance-changed.event';
import { OutboxMessageEntity } from '../../../shared/database/entities/outbox-message.entity';
import { OutboxMessage } from '../../../core/domain/outbox-message.entity';
import { WagerTransactionProcessed } from '../../../shared/events/wager-transaction-processed.event';
import { WagerTransactionRejected } from '../../../shared/events/wager-transaction-rejected.event';
import { InboxMessage } from '../../../core/domain/inbox-message.entity';
import { InboxMessageEntity } from '../../../shared/database/entities/inbox-message.entity';
import { FailureCode } from '../../../core/domain/failure-codes.enum';

@Injectable()
export class ProcessWageringService {
  private logger = new Logger(ProcessWageringService.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(
    dto: ProcessWagerDto,
    inbox?: InboxMessage,
  ): Promise<ProcessWagerResult> {
    const idempotencyCheck = await this.checkIdempotency(dto);
    if (idempotencyCheck) {
      return idempotencyCheck;
    }

    return await this.entityManager.transactional(async (tsxEntityManager) => {
      if (inbox) {
        inbox.markProcessed(new Date());
        const inboxEntity = tsxEntityManager.create(InboxMessageEntity, {
          id: inbox.id,
          messageId: inbox.messageId,
          consumerName: inbox.consumerName,
          payloadHash: inbox.payloadHash,
          receivedAt: inbox.receivedAt,
          processedAt: inbox.processedAt,
        });
        tsxEntityManager.persist(inboxEntity);
      }

      const transactionMoney = Money.from(dto.money);
      const transaction = WagerTransaction.create({
        ...dto,
        id: randomUUID(),
        money: transactionMoney,
      });

      let wagerTransactionEntity: WagerTransactionEntity | null = null;
      let referenceDomain: WagerTransaction | undefined = undefined;

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

          return {
            transactionId: transaction.id,
            status: transaction.status,
            idempotentReplay: false,
          };
        }

        referenceDomain = WagerTransaction.rehydrate({
          ...wagerTransactionEntity,
          money: Money.from(wagerTransactionEntity.money),
        });
      }

      const walletEntity = await tsxEntityManager.findOne(
        WalletEntity,
        { id: dto.walletId },
        { lockMode: LockMode.OPTIMISTIC },
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

      let ledgerEntry: WalletLedgerEntry | null = null;
      let businessFailureCode: FailureCode | null = null;

      try {
        ledgerEntry = this.applyLedgerEntryRule(
          transaction,
          wallet,
          referenceDomain,
        );
        transaction.markProcessed(wagerTransactionEntity?.id, new Date());
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('Insufficient funds')) {
            businessFailureCode = FailureCode.INSUFFICIENT_FUNDS;
          } else if (error.message.includes('Currency mismatch')) {
            businessFailureCode = FailureCode.CURRENCY_MISMATCH;
          } else {
            businessFailureCode = FailureCode.BUSINESS_RULE_VIOLATION;
          }
        } else {
          businessFailureCode = FailureCode.UNKNOWN_ERROR;
        }

        transaction.reject(businessFailureCode);
        this.logger.warn(
          `Transaction ${transaction.id} rejected: ${businessFailureCode}`,
        );
      }

      const transactionEntity = tsxEntityManager.create(
        WagerTransactionEntity,
        {
          ...transaction,
          money: {
            amount: transaction.money.toString(),
            currency: transaction.money.currency,
          },
          status: transaction.status,
          failureCode: transaction.failureCode,
        },
      );
      tsxEntityManager.persist(transactionEntity);

      if (transaction.status === WagerTransactionStatus.Processed) {
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

          const balanceChangeEvent = WalletBalanceChanged.create({
            eventId: randomUUID(),
            aggregateId: wallet.id,
            correlationId: transaction.id,
            data: {
              walletId: wallet.id,
              transactionId: transaction.id,
              direction: ledgerEntry.direction,
              money: ledgerEntry.money.toJSON(),
              balanceBefore: ledgerEntry.balanceBefore.toJSON(),
              balanceAfter: ledgerEntry.balanceAfter.toJSON(),
              walletVersion: wallet.version,
            },
          });

          const outboxBalance = OutboxMessage.enqueue(balanceChangeEvent);
          tsxEntityManager.persist(
            tsxEntityManager.create(OutboxMessageEntity, {
              id: outboxBalance.id,
              aggregateId: outboxBalance.aggregateId,
              eventType: outboxBalance.eventType,
              payload: outboxBalance.payload,
              occurredAt: outboxBalance.occurredAt,
              attempts: outboxBalance.attempts,
              nextAttemptAt: outboxBalance.nextAttemptAt,
              publishedAt: outboxBalance.publishedAt,
            }),
          );
        }

        const processedWagerEvent = WagerTransactionProcessed.create({
          eventId: randomUUID(),
          aggregateId: transaction.id,
          correlationId: transaction.id,
          data: {
            transactionId: transaction.id,
            providerId: transaction.providerId,
            walletId: transaction.walletId,
            kind: transaction.kind,
            status: transaction.status,
            money: transaction.money.toJSON(),
          },
        });

        const outboxWager = OutboxMessage.enqueue(processedWagerEvent);
        tsxEntityManager.persist(
          tsxEntityManager.create(OutboxMessageEntity, {
            id: outboxWager.id,
            aggregateId: outboxWager.aggregateId,
            eventType: outboxWager.eventType,
            payload: outboxWager.payload,
            occurredAt: outboxWager.occurredAt,
            attempts: outboxWager.attempts,
            nextAttemptAt: outboxWager.nextAttemptAt,
            publishedAt: outboxWager.publishedAt,
          }),
        );
      } else if (transaction.status === WagerTransactionStatus.Rejected) {
        const rejectedEvent = WagerTransactionRejected.create({
          eventId: randomUUID(),
          aggregateId: transaction.id,
          correlationId: transaction.id,
          data: {
            transactionId: transaction.id,
            providerId: transaction.providerId,
            walletId: transaction.walletId,
            kind: transaction.kind,
            failureCode: transaction.failureCode!,
            money: transaction.money.toJSON(),
          },
        });

        const outboxRejected = OutboxMessage.enqueue(rejectedEvent);
        tsxEntityManager.persist(
          tsxEntityManager.create(OutboxMessageEntity, {
            id: outboxRejected.id,
            aggregateId: outboxRejected.aggregateId,
            eventType: outboxRejected.eventType,
            payload: outboxRejected.payload,
            occurredAt: outboxRejected.occurredAt,
            attempts: outboxRejected.attempts,
            nextAttemptAt: outboxRejected.nextAttemptAt,
            publishedAt: outboxRejected.publishedAt,
          }),
        );
      }

      return {
        transactionId: transaction.id,
        status: transaction.status,
        balance: wallet.balance.toJSON(),
        idempotentReplay: false,
      };
    });
  }

  private async checkIdempotency(
    dto: ProcessWagerDto,
  ): Promise<ProcessWagerResult | undefined> {
    if (!dto.idempotencyKey) {
      throw new BadRequestException('Header idempotency-key is required');
    }
    const existingTxEntity = await this.entityManager.findOne(
      WagerTransactionEntity,
      {
        providerId: dto.providerId,
        idempotencyKey: dto.idempotencyKey,
      },
    );

    if (existingTxEntity) {
      if (existingTxEntity.payloadHash !== dto.payloadHash) {
        throw new ConflictException(
          'Idempotency conflict: payload hash mismatch',
        );
      }
      return {
        transactionId: existingTxEntity.id,
        status: existingTxEntity.status,
        idempotentReplay: true,
      };
    }
    return undefined;
  }

  private applyLedgerEntryRule(
    transaction: WagerTransaction,
    wallet: Wallet,
    reference?: WagerTransaction,
  ): WalletLedgerEntry | null {
    if (!transaction.affectsBalance()) {
      return null;
    }

    const direction = reference
      ? transaction.ledgerDirectionFor(reference)
      : transaction.kind === WagerTransactionKind.Bet
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
