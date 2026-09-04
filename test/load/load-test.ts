import http from 'k6/http';
import { check, sleep } from 'k6';
import type { Options } from 'k6/options';

export const options: Options = {
  stages: [
    { duration: '10s', target: 50 },
    { duration: '30s', target: 50 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const WALLET_ID = __ENV.WALLET_ID || 'COLOQUE_SEU_WALLET_ID_AQUI';
const PLAYER_ID = __ENV.PLAYER_ID || 'COLOQUE_SEU_PLAYER_ID_AQUI';

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function () {
  if (!WALLET_ID || !PLAYER_ID) {
    throw new Error(
      'WALLET_ID e PLAYER_ID precisam ser passados via variável de ambiente ou hardcoded no script.',
    );
  }

  const transactionId = uuidv4();

  const payload = JSON.stringify({
    providerId: 'load-test-k6',
    externalTransactionId: transactionId,
    playerId: PLAYER_ID,
    walletId: WALLET_ID,
    roundId: `round-${__VU}`,
    gameId: 'fortune-chimp',
    kind: __ITER % 2 === 0 ? 'BET' : 'WIN',
    money: { amount: '1.00', currency: 'BRL' },
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'idempotency-key': `load-test-k6:${transactionId}`,
    },
  };

  const res = http.post(`${BASE_URL}/wagering/transactions`, payload, params);

  check(res, {
    'sistema respondeu corretamente (Processed ou Business Reject)': (r) =>
      [200, 400, 409].includes(r.status),
    'nenhum erro de infraestrutura (Não é 500)': (r) => r.status !== 500,
  });

  sleep(0.05);
}
