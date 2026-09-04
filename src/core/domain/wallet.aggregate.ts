import { Money } from './money.value-object';

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: {
    id: string;
    playerId: string;
    initialBalance: Money;
  }): Wallet {
    if (props.initialBalance.isNegative()) {
      throw new Error('Initial balance cannot be negative');
    }

    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      new Date(),
      new Date(),
    );
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }
  get balanceBeforeTransaction(): Money {
    return this._balance;
  }
  get version(): number {
    return this._version;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(amount: Money): void {
    this.assertSameCurrency(amount);
    if (amount.isNegative()) throw new Error('Debit amount must be positive');

    if (this._balance.isLessThan(amount)) {
      throw new Error('Insufficient funds');
    }

    this._balance = this._balance.subtract(amount);
    this.incrementVersion();
  }

  credit(amount: Money): void {
    this.assertSameCurrency(amount);
    if (amount.isNegative()) throw new Error('Credit amount must be positive');

    this._balance = this._balance.add(amount);
    this.incrementVersion();
  }

  private incrementVersion(): void {
    this._version += 1;
    this._updatedAt = new Date();
  }

  private assertSameCurrency(money: Money): void {
    if (this.currency !== money.currency) {
      throw new Error('Wallet and transaction currency must match');
    }
  }
}
