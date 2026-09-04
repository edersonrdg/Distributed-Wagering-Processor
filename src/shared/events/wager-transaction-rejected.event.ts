import { FailureCode } from '../../core/domain/failure-codes.enum';
import { MoneyProps } from '../../core/domain/money.value-object';
import { WagerTransactionKind } from '../../core/domain/wager-transaction.entity';
import {
  IntegrationEvent,
  IntegrationEventProps,
} from '../../core/events/integration-event.base';

export interface WagerTransactionRejectedData {
  transactionId: string;
  providerId: string;
  walletId: string;
  kind: WagerTransactionKind;
  failureCode: FailureCode;
  money: MoneyProps;
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
  readonly eventType = 'WagerTransactionRejected';
  readonly version = 1;

  static create(
    props: Omit<
      IntegrationEventProps<WagerTransactionRejectedData>,
      'occurredAt'
    >,
  ): WagerTransactionRejected {
    return new WagerTransactionRejected({
      ...props,
      occurredAt: new Date(),
    });
  }
}
