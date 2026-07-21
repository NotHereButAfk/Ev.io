// Authoritative game server host (Phase 4) — wraps AuthRoom with the
// connection-level protections the room itself doesn't handle:
//   • origin allow-list          (VITE-style ALLOWED_ORIGINS env, * in dev)
//   • message schema + size cap   (reject non-JSON / oversized / unknown types)
//   • per-connection rate limit    (token bucket on inbound messages)
//   • replay guard                 (monotonic input/fire seq — in AuthRoom)
//   • heartbeat / dead-socket reap (ping/pong with timeout)
//   • backpressure                 (drop snapshots to a saturated socket)
//   • duplicate-session handling   (a new hello on a live socket is rejected)
//
// Run standalone:  node server/authserver.mjs         (PORT=8788)
// Embedded test:   import { makeAuthServer } from './authserver.mjs'

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { AuthRoom, TICK_MS } from './authroom.mjs';

const MAX_MSG_BYTES = 2 * 1024;             // a single command is tiny
const RATE_TOKENS = 60, RATE_REFILL_MS = 1000;   // ~60 msgs/sec sustained
const HEARTBEAT_MS = 5000, DEAD_MS = 12000;
const SEND_BUFFER_CAP = 256 * 1024;         // skip snapshot if socket is backed up
const MAX_NAME = 24;

const ALLOWED = (process.env.ALLOWED_ORIGINS || '*')
  .split(',').map((s) => s.trim()).filter(Boolean);

function originOk(origin) {
  if (ALLOWED.includes('*')) return true;
  if (!origin) return false;
  return ALLOWED.includes(origin);
}

function sanitizeName(n) {
  const c = String(n ?? '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, MAX_NAME);
  return c || 'Recruit';
}

export function makeAuthServer({ server, port } = {}) {
  const http = server || createServer((_req, res) => { res.writeHead(200); res.end('kyx auth server'); });
  const wss = new WebSocketServer({ server: http, maxPayload: MAX_MSG_BYTES });
  const room = new AuthRoom();

  wss.on('connection', (ws, req) => {
    if (!originOk(req.headers.origin)) { ws.close(1008, 'origin'); return; }

    const conn = {
      id: null, alive: true, lastSeen: Date.now(),
      tokens: RATE_TOKENS, lastRefill: Date.now(),
    };

    const send = (obj) => {
      if (ws.readyState !== ws.OPEN) return;
      if (ws.bufferedAmount > SEND_BUFFER_CAP) return;   // backpressure: shed load
      ws.send(JSON.stringify(obj));
    };

    ws.on('message', (raw) => {
      conn.lastSeen = Date.now();
      if (raw.length > MAX_MSG_BYTES) { ws.close(1009, 'too big'); return; }

      // rate limit (token bucket)
      const now = Date.now();
      const refill = ((now - conn.lastRefill) / RATE_REFILL_MS) * RATE_TOKENS;
      conn.tokens = Math.min(RATE_TOKENS, conn.tokens + refill);
      conn.lastRefill = now;
      if (conn.tokens < 1) return;                       // silently drop over-rate
      conn.tokens -= 1;

      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;

      switch (msg.t) {
        case 'hello':
          if (conn.id != null) return;                   // duplicate session on live socket
          conn.id = room.add(send, sanitizeName(msg.name));
          break;
        case 'input':
          if (conn.id != null) room.onInput(conn.id, msg);
          break;
        case 'fire':
          if (conn.id != null) room.onFire(conn.id, msg);
          break;
        case 'ability':
          if (conn.id != null) room.onAbility(conn.id, msg);
          break;
        case 'pong':
          break;                                         // liveness handled by lastSeen
        default:
          return;                                        // unknown type ignored
      }
    });

    ws.on('close', () => { if (conn.id != null) room.remove(conn.id); conn.alive = false; });
    ws.on('error', () => { try { ws.close(); } catch {} });

    ws._conn = conn;
    ws._send = send;
  });

  // fixed-20Hz authoritative loop
  const loop = setInterval(() => room.update(), TICK_MS);

  // heartbeat / dead-socket reaping
  const hb = setInterval(() => {
    const now = Date.now();
    for (const ws of wss.clients) {
      const c = ws._conn;
      if (!c) continue;
      if (now - c.lastSeen > DEAD_MS) { try { ws.terminate(); } catch {} continue; }
      ws._send?.({ t: 'ping', id: now });
    }
  }, HEARTBEAT_MS);

  const close = () => { clearInterval(loop); clearInterval(hb); wss.close(); http.close(); };

  if (port) http.listen(port, () => console.log(`[auth] listening on :${port} (tick ${TICK_MS.toFixed(1)}ms)`));
  return { wss, room, http, close };
}

// standalone entry
if (import.meta.url === `file://${process.argv[1]}`) {
  makeAuthServer({ port: process.env.PORT || 8788 });
}
