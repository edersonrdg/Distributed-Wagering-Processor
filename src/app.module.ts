import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './shared/database/database.module';
import { SqsModule } from './shared/sqs/sqs.module';
import { HealthModule } from './modules/health/health.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { WageringModule } from './modules/wagering/wagering.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { ClsModule } from 'nestjs-cls';
import { randomUUID } from 'node:crypto';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnv,
    }),
    DatabaseModule,
    ScheduleModule.forRoot(),
    ObservabilityModule,
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req: any) =>
          req.headers['x-correlation-id'] ?? randomUUID(),
      },
    }),
    SqsModule,
    HealthModule,
    WalletModule,
    WageringModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
