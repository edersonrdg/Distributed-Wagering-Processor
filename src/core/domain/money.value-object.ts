import Big from 'big.js';

export interface MoneyProps {
  amount: string;
  currency: string;
}

export class Money {
  private constructor(
    private readonly value: Big,
    public readonly currency: string,
  ) {}

  static from(props: MoneyProps): Money {
    if (!/^-?\d+\.\d{2}$/.test(props.amount)) {
      throw new Error(
        `Invalid money format: ${props.amount}. Must be a decimal string with 2 scales.`,
      );
    }
    return new Money(new Big(props.amount), props.currency);
  }

  static zero(currency: string): Money {
    return new Money(new Big('0.00'), currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value), this.currency);
  }

  negate(): Money {
    return new Money(this.value.times(-1), this.currency);
  }

  isZero(): boolean {
    return this.value.eq(0);
  }

  isPositive(): boolean {
    return this.value.gt(0);
  }

  isNegative(): boolean {
    return this.value.lt(0);
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lt(other.value);
  }

  equals(other: Money): boolean {
    if (this.currency !== other.currency) return false;
    return this.value.eq(other.value);
  }

  toJSON(): MoneyProps {
    return {
      amount: this.toString(),
      currency: this.currency,
    };
  }

  toString(): string {
    return this.value.toFixed(2);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: ${this.currency} vs ${other.currency}`,
      );
    }
  }
}
