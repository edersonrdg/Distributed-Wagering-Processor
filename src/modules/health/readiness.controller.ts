import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './indicators/database-health.indicator';
import { SqsHealthIndicator } from './indicators/sqs-health.indicator';

@Controller('health')
export class ReadinessController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly sqs: SqsHealthIndicator,
  ) {}

  @Get('ready')
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.database.isHealthy('database'),
      () => this.sqs.isHealthy('sqs'),
    ]);
  }
}
