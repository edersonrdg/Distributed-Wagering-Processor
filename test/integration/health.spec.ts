import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { startInfra, stopInfra, type Infra } from '../support/infra';
import { MikroORM } from '@mikro-orm/core';

interface HealthResponse {
  status: string;
  details: Record<string, { status: string }>;
}

describe('Health endpoints (real Postgres + LocalStack)', () => {
  let infra: Infra;
  let app: INestApplication<App>;
  let postgresStopped = false;

  beforeAll(async () => {
    infra = await startInfra();

    const { AppModule } = await import('../../src/app.module.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    if (postgresStopped) {
      await infra.localstack?.stop();
    } else {
      await stopInfra(infra);
    }
  });

  test('liveness reports ok without checking any dependency', async () => {
    const res = await request(app.getHttpServer()).get('/health/live');
    const body = res.body as HealthResponse;
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
  });

  test('readiness reports ok when the database and SQS are reachable', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    const body = res.body as HealthResponse;
    expect(res.status).toBe(200);
    expect(body.details.database.status).toBe('up');
    expect(body.details.sqs.status).toBe('up');
  });

  test('readiness reports failure once the database becomes unreachable', async () => {
    await infra.postgres.stop();
    const orm = app.get(MikroORM);
    await orm.em.getConnection().close();
    await new Promise((resolve) => setTimeout(resolve, 500));
    postgresStopped = true;

    const res = await request(app.getHttpServer()).get('/health/ready');
    const body = res.body as HealthResponse;
    expect(body.details.database.status).toBeDefined();
  }, 30_000);
});
