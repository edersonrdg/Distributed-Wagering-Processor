import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { EnvConfig } from './config/env.validation';
import { StructuredJsonLogger } from './common/logger/structured-json.logger';
import { ClsService } from 'nestjs-cls';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(new StructuredJsonLogger(app.get(ClsService)));
  app.enableShutdownHooks();

  const config = app.get(ConfigService<EnvConfig, true>);
  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
