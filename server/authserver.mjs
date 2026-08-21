// Authoritative game server host (Phase 4) — wraps AuthRoom with the
// connection-level protections the room itself doesn't handle:
//   • origin allow-list          (ALLOWED_ORIGINS env; loopback-only by default)
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
import { createReadStream, statSync } from 'fs';
import { extname, join, normalize, resolve, sep } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { WebSocketServer } from 'ws';
import { AuthRoom, TICK_MS } from './authroom.mjs';

const MAX_MSG_BYTES = 2 * 1024;             // a single command is tiny
const RATE_TOKENS = 60, RATE_REFILL_MS = 1000;   // ~60 msgs/sec sustained
const HEARTBEAT_MS = 5000, DEAD_MS = 12000;
const SEND_BUFFER_CAP = 256 * 1024;         // skip snapshot if socket is backed up
const MAX_NAME = 24;

const MIME = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

const CLEAN_HTML_ROUTES = new Map([
  ['/login', '/login.html'],
  ['/register', '/register.html'],
  ['/privacy', '/privacy.html'],
  ['/terms', '/terms.html'],
]);

function staticHandler(root) {
  const base = resolve(root);
  return (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
    }

    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('Bad request'); return; }
    if (pathname.includes('\0')) { res.writeHead(400); res.end('Bad request'); return; }
    if (pathname === '/') pathname = '/index.html';
    else pathname = CLEAN_HTML_ROUTES.get(pathname) || pathname;

    const relative = normalize(pathname.replace(/^[/\\]+/, ''));
    const file = resolve(join(base, relative));
    if (file !== base && !file.startsWith(base + sep)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    let stat;
    try { stat = statSync(file); } catch { res.writeHead(404); res.end('Not found'); return; }
    if (!stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }

    const ext = extname(file).toLowerCase();
    const immutable = pathname.startsWith('/assets/');
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  };
}

const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

function isLoopbackOrigin(origin) {
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function originOk(origin) {
  if (ALLOWED.includes('*')) return true;
  if (!origin) return false;
  // An unset allow-list is safe for local development but cannot accidentally
  // expose a production server to arbitrary browser origins.
  if (!ALLOWED.length) return isLoopbackOrigin(origin);
  return ALLOWED.includes(origin);
}

export function randomGuestName(usedNames = new Set(), random = Math.random) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const name = `Guest${Math.floor(random() * 1_000_000).toString().padStart(6, '0')}`;
    if (!usedNames.has(name)) return name;
  }
  for (let number = 0; number < 1_000_000; number++) {
    const name = `Guest${number.toString().padStart(6, '0')}`;
    if (!usedNames.has(name)) return name;
  }
  return 'Guest000000';
}

function sanitizeName(n, usedNames = new Set()) {
  const c = String(n ?? '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, MAX_NAME);
  if (!c || c === '__guest__' || /^(guest|recruit)$/i.test(c)) {
    return randomGuestName(usedNames);
  }
  return c;
}

export function makeAuthServer({ server, port, staticRoot, targetPopulation = 0 } = {}) {
  const room = new AuthRoom(undefined, { targetPopulation });
  const staticFallback = staticRoot
    ? staticHandler(staticRoot)
    : (_req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('kyx auth server'); };
  const handler = (req, res) => {
    let pathname = '';
    try { pathname = new URL(req.url || '/', 'http://localhost').pathname; } catch {}
    if (req.method === 'GET' && pathname === '/api/matchmake') {
      const humans = Array.from(room.players.values()).filter((player) => !player.isBot).length;
      const capacity = room.targetPopulation || 8;
      const remainingMs = Math.max(0, room.matchDurationMs - (Date.now() - room.matchStart));
      const body = JSON.stringify({
        available: humans < capacity,
        humans, players: room.players.size, capacity,
        mapId: room.arena.id, mapName: room.arena.name,
        matchStart: room.matchStart, matchDurationMs: room.matchDurationMs,
        remainingMs,
      });
      const origin = req.headers.origin;
      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      };
      if (origin && originOk(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers.Vary = 'Origin';
      }
      res.writeHead(200, headers); res.end(body); return;
    }
    staticFallback(req, res);
  };
  const http = server || createServer(handler);
  const wss = new WebSocketServer({ server: http, maxPayload: MAX_MSG_BYTES });

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
          conn.id = room.add(send, sanitizeName(
            msg.name,
            new Set(Array.from(room.players.values()).map((player) => player.name)),
          ));
          if (conn.id == null) ws.close(1013, 'match full');
          break;
        case 'input':
          if (conn.id != null) room.onInput(conn.id, msg);
          break;
        case 'fire':
          if (conn.id != null) room.onFire(conn.id, msg);
          break;
        case 'reload':
          if (conn.id != null) room.onReload(conn.id, msg);
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

  const close = () => new Promise((resolveClose) => {
    clearInterval(loop); clearInterval(hb);
    for (const ws of wss.clients) { try { ws.terminate(); } catch {} }
    wss.close(() => http.close(() => resolveClose()));
  });

  if (port) http.listen(port, () => console.log(`[auth] listening on :${port} (tick ${TICK_MS.toFixed(1)}ms)`));
  return { wss, room, http, close };
}

// standalone entry
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const staticRoot = process.env.STATIC_ROOT || resolve(here, '../dist');
  const targetPopulation = Number.parseInt(process.env.MATCH_PLAYERS || '8', 10);
  makeAuthServer({ port: process.env.PORT || 8788, staticRoot, targetPopulation });
}
