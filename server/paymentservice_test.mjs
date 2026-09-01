import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createPaymentService } from './paymentservice.mjs';

class FakePool {
  constructor() {
    this.orders = [];
    this.skins = [];
  }

  async query(sql, args = []) {
    const text = sql.replace(/\s+/g, ' ').trim();
    if (text.startsWith('CREATE TABLE') || ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [], rowCount: 0 };
    if (text.startsWith('SELECT 1 FROM user_skins')) {
      const found = this.skins.some((skin) => skin.user_id === args[0] && skin.skin_id === args[1]);
      return { rows: found ? [{ '?column?': 1 }] : [], rowCount: found ? 1 : 0 };
    }
    if (text.startsWith('INSERT INTO store_orders')) {
      this.orders.push({
        id: args[0], user_id: args[1], paypal_order_id: args[2], skin_id: args[3], skin_kind: args[4],
        amount_cents: args[5], status: args[6], terms_version: args[7], currency: 'USD',
      });
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("UPDATE store_orders SET status='capturing'")) {
      const order = this.orders.find((candidate) => candidate.paypal_order_id === args[0] && candidate.user_id === args[1] && ['created', 'capture_failed'].includes(candidate.status));
      if (!order) return { rows: [], rowCount: 0 };
      order.status = 'capturing';
      return { rows: [{ ...order }], rowCount: 1 };
    }
    if (text.startsWith('SELECT * FROM store_orders')) {
      const order = this.orders.find((candidate) => candidate.paypal_order_id === args[0] && candidate.user_id === args[1]);
      return { rows: order ? [{ ...order }] : [], rowCount: order ? 1 : 0 };
    }
    if (text.startsWith("UPDATE store_orders SET status='capture_failed'")) {
      const order = this.orders.find((candidate) => candidate.id === args[0] && candidate.status === 'capturing');
      if (order) order.status = 'capture_failed';
      return { rows: [], rowCount: order ? 1 : 0 };
    }
    if (text.startsWith("UPDATE store_orders SET status='completed'")) {
      const order = this.orders.find((candidate) => candidate.id === args[1] && candidate.status === 'capturing');
      if (order) { order.status = 'completed'; order.paypal_capture_id = args[0]; }
      return { rows: [], rowCount: order ? 1 : 0 };
    }
    if (text.startsWith('INSERT INTO user_skins')) {
      const duplicate = this.skins.some((skin) => skin.user_id === args[0] && skin.skin_id === args[1]);
      if (!duplicate) this.skins.push({ user_id: args[0], skin_id: args[1], skin_kind: args[2] });
      return { rows: [], rowCount: duplicate ? 0 : 1 };
    }
    throw new Error(`Unexpected SQL in payment test: ${text}`);
  }

  async connect() {
    return { query: this.query.bind(this), release() {} };
  }
}

function response(body, ok = true, status = ok ? 200 : 500) {
  return { ok, status, async json() { return body; } };
}

function request(method, pathname, body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = { host: 'kryx.live', origin: 'https://kryx.live', ...headers };
  return req;
}

async function invoke(handler, method, pathname, body, headers) {
  const output = { status: 0, headers: {}, body: '' };
  const res = {
    writeHead(status, responseHeaders) { output.status = status; output.headers = responseHeaders; },
    end(value = '') { output.body += value; },
  };
  const handled = await handler(request(method, pathname, body, headers), res, pathname);
  output.json = JSON.parse(output.body);
  output.handled = handled;
  return output;
}

const pool = new FakePool();
const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url, options });
  if (url.endsWith('/v1/oauth2/token')) return response({ access_token: 'ACCESS', expires_in: 3600 });
  if (url.endsWith('/v1/identity/generate-token')) return response({ client_token: 'CLIENT_TOKEN' });
  if (url.endsWith('/v2/checkout/orders')) return response({ id: 'PAYPALORDER1' });
  if (url.endsWith('/v2/checkout/orders/PAYPALORDER1/capture')) {
    return response({
      status: 'COMPLETED',
      purchase_units: [{ payments: { captures: [{ id: 'CAPTURE1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '20.00' } }] } }],
    });
  }
  throw new Error(`Unexpected PayPal request: ${url}`);
};
const accounts = {
  pool,
  session: async (req) => req.headers.authorization === 'guest' ? null : { id: 7 },
};
const service = createPaymentService(accounts, {
  fetchImpl,
  env: { PAYPAL_CLIENT_ID: 'CLIENT_ID', PAYPAL_CLIENT_SECRET: 'SECRET', PAYPAL_ENV: 'sandbox' },
});

let result = await invoke(service, 'GET', '/api/store/config');
assert.equal(result.status, 200);
assert.equal(result.json.configured, true);
assert.equal(result.json.prices.common, '20.00');

result = await invoke(service, 'POST', '/api/store/client-token', undefined, { authorization: 'guest' });
assert.equal(result.status, 401);

result = await invoke(service, 'POST', '/api/store/client-token', undefined, { origin: 'https://evil.example' });
assert.equal(result.status, 403);

result = await invoke(service, 'POST', '/api/store/client-token');
assert.equal(result.status, 200);
assert.equal(result.json.clientToken, 'CLIENT_TOKEN');

result = await invoke(service, 'POST', '/api/store/orders', { skinId: 'ember', termsAccepted: false, termsVersion: '2026-08-31' });
assert.equal(result.status, 400);

result = await invoke(service, 'POST', '/api/store/orders', { skinId: 'not-for-sale', termsAccepted: true, termsVersion: '2026-08-31' });
assert.equal(result.status, 400);

result = await invoke(service, 'POST', '/api/store/orders', { skinId: 'ember', termsAccepted: true, termsVersion: '2026-08-31' });
assert.equal(result.status, 201);
assert.equal(result.json.orderId, 'PAYPALORDER1');
const createCall = calls.find((call) => call.url.endsWith('/v2/checkout/orders'));
assert.equal(JSON.parse(createCall.options.body).purchase_units[0].amount.value, '20.00');

result = await invoke(service, 'POST', '/api/store/orders/PAYPALORDER1/capture');
assert.equal(result.status, 200);
assert.deepEqual(result.json, { ok: true, skinId: 'ember', kind: 'weapon' });
assert.equal(pool.skins.length, 1);

const captureCount = () => calls.filter((call) => call.url.endsWith('/capture')).length;
assert.equal(captureCount(), 1);
result = await invoke(service, 'POST', '/api/store/orders/PAYPALORDER1/capture');
assert.equal(result.status, 200);
assert.equal(captureCount(), 1, 'completed captures must be idempotent');

const unconfigured = createPaymentService(accounts, { fetchImpl, env: {} });
result = await invoke(unconfigured, 'GET', '/api/store/config');
assert.equal(result.status, 200);
assert.equal(result.json.configured, false);
result = await invoke(unconfigured, 'POST', '/api/store/client-token');
assert.equal(result.status, 503);

console.log('payment service tests passed');
