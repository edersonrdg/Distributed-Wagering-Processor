import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';

@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('wager_transactions_total')
    private readonly transactionsCounter: Counter<string>,
    @InjectMetric('wager_duplicates_total')
    private readonly duplicatesCounter: Counter<string>,
    @InjectMetric('wager_lock_conflicts_total')
    private readonly lockConflictsCounter: Counter<string>,
    @InjectMetric('sqs_retries_total')
    private readonly retriesCounter: Counter<string>,
    @InjectMetric('sqs_dlq_messages_total')
    private readonly dlqCounter: Counter<string>,
    @InjectMetric('outbox_lag_count')
    private readonly outboxLagGauge: Gauge<string>,
    @InjectMetric('processing_latency_seconds')
    private readonly latencyHistogram: Histogram<string>,
  ) {}

  recordTransaction(status: string, kind: string) {
    this.transactionsCounter.labels(status, kind).inc();
  }

  recordDuplicate() {
    this.duplicatesCounter.inc();
  }

  recordLockConflict() {
    this.lockConflictsCounter.inc();
  }

  recordRetry() {
    this.retriesCounter.inc();
  }

  recordDlq() {
    this.dlqCounter.inc();
  }

  setOutboxLag(count: number) {
    this.outboxLagGauge.set(count);
  }

  startLatencyTimer() {
    return this.latencyHistogram.startTimer();
  }
}
