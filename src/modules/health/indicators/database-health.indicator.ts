import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { MikroORM } from '@mikro-orm/core';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly orm: MikroORM,
  ) {}

  async isHealthy(key = 'database') {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.orm.em.getConnection().execute('select 1');
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
