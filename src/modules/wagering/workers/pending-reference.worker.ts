import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityManager } from '@mikro-orm/core';
import { WagerTransactionEntity } from '../../../shared/database/entities/wager-transaction.entity';
import { WagerTransactionStatus } from '../../../core/domain/wager-transaction.entity';
import { ProcessWageringService } from '../services/process-wagering.service';
import { ProcessWagerDto } from '../dto/process-wager.dto';

@Injectable()
export class PendingReferenceWorker {
  private readonly logger = new Logger(PendingReferenceWorker.name);

  constructor(
    private readonly em: EntityManager,
    private readonly processWageringService: ProcessWageringService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async retryPendingReferences() {
    const em = this.em.fork();

    const pendingTransactions = await em.find(
      WagerTransactionEntity,
      {
        status: WagerTransactionStatus.PendingReference,
      },
      { limit: 50 },
    );

    for (const entity of pendingTransactions) {
      const dto: ProcessWagerDto = {
        providerId: entity.providerId,
        externalTransactionId: entity.externalTransactionId,
        idempotencyKey: entity.idempotencyKey,
        payloadHash: entity.payloadHash,
        walletId: entity.walletId,
        playerId: entity.playerId,
        roundId: entity.roundId,
        gameId: entity.gameId,
        kind: entity.kind,
        money: { amount: entity.money.amount, currency: entity.money.currency },
        referenceExternalTransactionId: entity.referenceExternalTransactionId!,
      };

      try {
        const result = await this.processWageringService.execute(dto);

        if (result.status === WagerTransactionStatus.Processed) {
          this.logger.log(
            `Pending reference resolved for transaction ${entity.id}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Still pending or failed to resolve reference for ${entity.id}`,
        );
      }
    }
  }
}
