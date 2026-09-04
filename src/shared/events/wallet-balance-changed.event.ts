import { MoneyProps } from '../../core/domain/money.value-object';
import { LedgerDirection } from '../../core/domain/wager-transaction.entity';
import {
  IntegrationEvent,
  IntegrationEventProps,
} from '../../core/events/integration-event.base';

export interface WalletBalanceChangedData {
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: MoneyProps;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  walletVersion: number;
}

export class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
  readonly eventType = 'WalletBalanceChanged';
  readonly version = 1;

  static create(
    props: Omit<IntegrationEventProps<WalletBalanceChangedData>, 'occurredAt'>,
  ): WalletBalanceChanged {
    return new WalletBalanceChanged({
      ...props,
      occurredAt: new Date(),
    });
  }
}
