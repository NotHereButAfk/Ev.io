import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { STORE_ITEMS } from './storecatalog.mjs';

const PRICE = { common: '20.00', epic: '40.00', legendary: '60.00', mythic: '80.00' };
const TERMS_VERSION = '2026-08-31';
const items = new Map(STORE_ITEMS.map((skin) => [skin.id, { ...skin, price: PRICE[skin.rarity] }]));

function loadPrivatePaymentEnv(baseEnv) {
  const values = {};
  try {
    const source = readFileSync(new URL('./.paypal.env', import.meta.url), 'utf8');
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^(PAYPAL_CLIENT_ID|PAYPAL_CLIENT_SECRET|PAYPAL_ENV)=([A-Za-z0-9_-]+)$/);
      if (match) values[match[1]] = match[2];
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error('[store] Unable to read private payment configuration');
  }
  return { ...values, ...baseEnv };
}

const send = (res, status, value) => {
  const payload = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(payload);
};

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) throw new Error('Request too large');
  }
  return JSON.parse(raw || '{}');
}

function isSameOrigin(req) {
  const fetchSite = String(req.headers?.['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite === 'cross-site') return false;
  const origin = req.headers?.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function createPaymentService(accounts, { fetchImpl = fetch, env = process.env } = {}) {
  if (!accounts?.pool || !accounts?.session) return null;
  env = loadPrivatePaymentEnv(env);
  const clientId = env.PAYPAL_CLIENT_ID || '';
  const secret = env.PAYPAL_CLIENT_SECRET || '';
  const environment = env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
  const api = environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  let access = null;

  const initialized = accounts.pool.query(`
    CREATE TABLE IF NOT EXISTS store_orders (
      id UUID PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      paypal_order_id VARCHAR(32) UNIQUE,
      paypal_capture_id VARCHAR(32) UNIQUE,
      skin_id VARCHAR(80) NOT NULL,
      skin_kind VARCHAR(16) NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'USD',
      status VARCHAR(20) NOT NULL DEFAULT 'created',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      captured_at TIMESTAMPTZ
    );
    ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20);
    ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
  `);

  async function accessToken() {
    if (access && access.expires > Date.now() + 60_000) return access.token;
    const response = await fetchImpl(`${api}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!response.ok) throw new Error('PayPal authentication failed');
    const data = await response.json();
    access = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
    return access.token;
  }

  async function paypal(path, options = {}) {
    const token = await accessToken();
    const response = await fetchImpl(`${api}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.method && options.method !== 'GET'
          ? { 'PayPal-Request-Id': options.requestId || randomUUID() }
          : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || 'PayPal request failed');
    return data;
  }

  return async (req, res, pathname) => {
    if (!pathname.startsWith('/api/store/')) return false;
    await initialized;
    if (req.method === 'GET' && pathname === '/api/store/config') {
      send(res, 200, { ok: true, configured: !!(clientId && secret), clientId: clientId || null, environment, prices: PRICE }); return true;
    }
    if (req.method !== 'GET' && !isSameOrigin(req)) {
      send(res, 403, { ok: false, err: 'Cross-site checkout requests are not allowed' }); return true;
    }
    const user = await accounts.session(req);
    if (!user) { send(res, 401, { ok: false, err: 'Log in to purchase skins' }); return true; }
    if (!clientId || !secret) { send(res, 503, { ok: false, err: 'Checkout is awaiting merchant configuration' }); return true; }
    try {
      if (req.method === 'POST' && pathname === '/api/store/client-token') {
        const token = await paypal('/v1/identity/generate-token', { method: 'POST', body: '{}' });
        if (!token.client_token) throw new Error('PayPal did not issue a client token');
        send(res, 200, { ok: true, clientToken: token.client_token }); return true;
      }
      if (req.method === 'POST' && pathname === '/api/store/orders') {
        const { skinId, termsAccepted, termsVersion } = await readBody(req);
        if (termsAccepted !== true || termsVersion !== TERMS_VERSION) {
          send(res, 400, { ok: false, err: 'Accept the current Digital Skin Purchase Terms to continue' }); return true;
        }
        const item = items.get(String(skinId));
        if (!item) { send(res, 400, { ok: false, err: 'Skin is not for sale' }); return true; }
        const owned = await accounts.pool.query('SELECT 1 FROM user_skins WHERE user_id=$1 AND skin_id=$2', [user.id, item.id]);
        if (owned.rowCount) { send(res, 409, { ok: false, err: 'Skin already owned' }); return true; }
        const localId = randomUUID();
        const order = await paypal('/v2/checkout/orders', {
          method: 'POST', requestId: localId,
          body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ reference_id: localId, custom_id: `${user.id}:${item.id}`, description: `KYX.IO ${item.name} skin`, amount: { currency_code: 'USD', value: item.price } }], application_context: { shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' } }),
        });
        await accounts.pool.query('INSERT INTO store_orders(id,user_id,paypal_order_id,skin_id,skin_kind,amount_cents,status,terms_version,terms_accepted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW())', [localId, user.id, order.id, item.id, item.kind, Math.round(Number(item.price) * 100), 'created', TERMS_VERSION]);
        send(res, 201, { ok: true, orderId: order.id }); return true;
      }
      const captureMatch = pathname.match(/^\/api\/store\/orders\/([A-Z0-9]+)\/capture$/i);
      if (req.method === 'POST' && captureMatch) {
        const orderId = captureMatch[1];
        // Atomically claim the order before contacting PayPal. Two browser
        // callbacks can otherwise capture the same approved order at once.
        const claimed = await accounts.pool.query(
          "UPDATE store_orders SET status='capturing' WHERE paypal_order_id=$1 AND user_id=$2 AND status IN ('created','capture_failed') RETURNING *",
          [orderId, user.id]
        );
        let order = claimed.rows[0];
        if (!order) {
          const found = await accounts.pool.query('SELECT * FROM store_orders WHERE paypal_order_id=$1 AND user_id=$2', [orderId, user.id]);
          order = found.rows[0];
          if (!order) { send(res, 404, { ok: false, err: 'Order not found' }); return true; }
          if (order.status === 'completed') { send(res, 200, { ok: true, skinId: order.skin_id, kind: order.skin_kind }); return true; }
          send(res, 409, { ok: false, err: 'This payment is already being confirmed' }); return true;
        }
        let capture;
        try {
          capture = await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST', body: '{}', requestId: order.id });
        } catch (error) {
          await accounts.pool.query("UPDATE store_orders SET status='capture_failed' WHERE id=$1 AND status='capturing'", [order.id]);
          throw error;
        }
        const payment = capture.purchase_units?.[0]?.payments?.captures?.[0];
        const paidCents = Math.round(Number(payment?.amount?.value || 0) * 100);
        if (capture.status !== 'COMPLETED' || payment?.status !== 'COMPLETED' || payment?.amount?.currency_code !== order.currency || paidCents !== order.amount_cents) {
          await accounts.pool.query("UPDATE store_orders SET status='capture_failed' WHERE id=$1 AND status='capturing'", [order.id]);
          send(res, 409, { ok: false, err: 'Payment was not completed for the expected amount' }); return true;
        }
        const client = await accounts.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query("UPDATE store_orders SET status='completed',paypal_capture_id=$1,captured_at=NOW() WHERE id=$2 AND status='capturing'", [payment.id, order.id]);
          await client.query('INSERT INTO user_skins(user_id,skin_id,skin_kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [user.id, order.skin_id, order.skin_kind]);
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
        send(res, 200, { ok: true, skinId: order.skin_id, kind: order.skin_kind }); return true;
      }
      send(res, 404, { ok: false, err: 'Not found' }); return true;
    } catch (error) {
      console.error('[store]', error?.message || error);
      send(res, 502, { ok: false, err: 'Payment service could not complete this request' }); return true;
    }
  };
}
