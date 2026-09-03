import { randomUUID } from 'node:crypto';
import { IntegrationEvent } from '../events/integration-event.base';

export interface OutboxMessageState {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt?: Date;
  publishedAt?: Date;
}

export class OutboxMessage {
  private constructor(
    public readonly id: string,
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly payload: Readonly<Record<string, unknown>>,
    public readonly occurredAt: Date,
    private _attempts: number,
    private _nextAttemptAt?: Date,
    private _publishedAt?: Date,
  ) {}

  static enqueue(event: IntegrationEvent<unknown>): OutboxMessage {
    return new OutboxMessage(
      randomUUID(),
      event.aggregateId,
      event.eventType,
      event.toJSON(),
      event.occurredAt,
      0,
    );
  }

  static rehydrate(state: OutboxMessageState): OutboxMessage {
    return new OutboxMessage(
      state.id,
      state.aggregateId,
      state.eventType,
      state.payload,
      state.occurredAt,
      state.attempts,
      state.nextAttemptAt,
      state.publishedAt,
    );
  }

  get attempts(): number {
    return this._attempts;
  }
  get nextAttemptAt(): Date | undefined {
    return this._nextAttemptAt;
  }
  get publishedAt(): Date | undefined {
    return this._publishedAt;
  }

  isPending(): boolean {
    return this._publishedAt === undefined;
  }

  isDue(now: Date): boolean {
    if (!this.isPending()) return false;
    if (!this._nextAttemptAt) return true;
    return now >= this._nextAttemptAt;
  }

  markPublished(at: Date): void {
    if (!this.isPending()) throw new Error('Outbox message already published');
    this._publishedAt = at;
  }

  scheduleRetry(now: Date): void {
    if (!this.isPending())
      throw new Error('Cannot schedule retry for published message');
    this._attempts += 1;
    const backoffSeconds = Math.pow(2, this._attempts);
    this._nextAttemptAt = new Date(now.getTime() + backoffSeconds * 1000);
  }
}
