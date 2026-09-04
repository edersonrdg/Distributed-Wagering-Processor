import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { startInfra, stopInfra, type Infra } from '../support/infra';

describe('AppController (e2e, real Postgres + LocalStack)', () => {
  let infra: Infra;
  let app: INestApplication<App>;

  beforeAll(async () => {
    infra = await startInfra();

    const { AppModule } = await import('../../src/app.module.js');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app?.close();
    await stopInfra(infra);
  }, 60000);

  test('/ (GET)', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toBe('Hello World!');
  });
});
