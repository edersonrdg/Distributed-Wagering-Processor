import { defineEntity, p } from '@mikro-orm/core';

const MoneySchema = defineEntity({
  name: 'Money',
  embeddable: true,
  properties: {
    amount: p.decimal().precision(19).scale(2),
    currency: p.string().length(3),
  },
});

export class MoneyEmbeddable extends MoneySchema.class {}
MoneySchema.setClass(MoneyEmbeddable);
