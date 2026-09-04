import { MoneyProps } from '../../core/domain/money.value-object';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../core/domain/wager-transaction.entity';
import {
  IntegrationEvent,
  IntegrationEventProps,
} from '../../core/events/integration-event.base';

export interface WagerTransactionProcessedData {
  transactionId: string;
  providerId: string;
  walletId: string;
  kind: WagerTransactionKind;
  status: WagerTransactionStatus;
  money: MoneyProps;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
  readonly eventType = 'WagerTransactionProcessed';
  readonly version = 1;

  static create(
    props: Omit<
      IntegrationEventProps<WagerTransactionProcessedData>,
      'occurredAt'
    >,
  ): WagerTransactionProcessed {
    return new WagerTransactionProcessed({
      ...props,
      occurredAt: new Date(),
    });
  }
}
