import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SQSClient } from '@aws-sdk/client-sqs';
import type { EnvConfig } from '../../config/env.validation';
import { SQS_CLIENT } from './sqs.constants';
import { SqsProducerService } from './sqs-producer.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SQS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) =>
        new SQSClient({
          region: config.get('AWS_REGION', { infer: true }),
          endpoint: config.get('SQS_ENDPOINT', { infer: true }),
          credentials: {
            accessKeyId: config.get('AWS_ACCESS_KEY_ID', { infer: true }),
            secretAccessKey: config.get('AWS_SECRET_ACCESS_KEY', {
              infer: true,
            }),
          },
        }),
    },
    SqsProducerService,
  ],
  exports: [SQS_CLIENT, SqsProducerService],
})
export class SqsModule {}
