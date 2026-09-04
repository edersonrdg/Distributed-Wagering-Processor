import { Global, Module } from '@nestjs/common';
import {
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
  providers: [
    MetricsService,
    makeCounterProvider({
      name: 'wager_transactions_total',
      help: 'Total de transações de apostas processadas',
      labelNames: ['status', 'kind'],
    }),
    makeCounterProvider({
      name: 'wager_duplicates_total',
      help: 'Total de duplicatas detectadas (Inbox ou Idempotência)',
    }),
    makeCounterProvider({
      name: 'wager_lock_conflicts_total',
      help: 'Total de conflitos de concorrência (Optimistic Lock)',
    }),
    makeCounterProvider({
      name: 'sqs_retries_total',
      help: 'Total de retries e falhas no processamento SQS',
    }),
    makeCounterProvider({
      name: 'sqs_dlq_messages_total',
      help: 'Total de mensagens movidas para DLQ por esgotamento de retries',
    }),
    makeGaugeProvider({
      name: 'outbox_lag_count',
      help: 'Total de mensagens pendentes de publicação na Outbox',
    }),
    makeHistogramProvider({
      name: 'processing_latency_seconds',
      help: 'Latência do processamento financeiro',
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    }),
  ],
  exports: [MetricsService],
})
export class ObservabilityModule {}
