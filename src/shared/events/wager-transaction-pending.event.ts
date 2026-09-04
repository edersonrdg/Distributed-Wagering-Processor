import {
  IntegrationEvent,
  IntegrationEventProps,
} from '../../core/events/integration-event.base';

export interface WagerTransactionPendingReferenceData {
  transactionId: string;
  providerId: string;
  referenceExternalTransactionId: string;
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
  readonly eventType = 'WagerTransactionPendingReference';
  readonly version = 1;

  static create(
    props: Omit<
      IntegrationEventProps<WagerTransactionPendingReferenceData>,
      'occurredAt'
    >,
  ): WagerTransactionPendingReference {
    return new WagerTransactionPendingReference({
      ...props,
      occurredAt: new Date(),
    });
  }
}
