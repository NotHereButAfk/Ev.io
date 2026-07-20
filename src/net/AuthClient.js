// Authoritative-server client (Phase 4) — client-side prediction with
// server reconciliation + remote-player interpolation.
//
//   • predicts the local player every client tick with the SAME MoveSim the
//     server runs, buffering unacked inputs
//   • on each snapshot, snaps the local sim state to the server's authoritative
//     you-state at ackTick and REPLAYS the still-unacked inputs on top, so the
//     view stays responsive but never diverges from server truth
//   • buffers remote players and renders them ~2 ticks in the past, lerping
//     between the two bracketing snapshots (smooth despite 20Hz updates)
//
// Transport-agnostic: pass any object with send(str) + onmessage; a WebSocket
// works directly. Purely optional — the game runs offline without it.

import { createState, step, makeInput, DT } from '../sim/MoveSim.js';

const INTERP_DELAY = 2 * DT * 1000;         // render remotes 2 ticks behind (ms)

export class AuthClient {
  constructor(url, { name = 'Recruit' } = {}) {
    this.url = url;
    this.name = name;
    this.you = null;                        // server-assigned id
    this.connected = false;
    this.seq = 0;
    this.fireSeq = 0;
    this.pending = [];                      // unacked {seq, inp}
    this.sim = null;                        // predicted local state
    this.simWorld = null;
    this.remotes = new Map();               // id -> {name, buf:[{t,x,y,z,yaw,crouch}]}
    this.self = { health: 100, shield: 0, alive: true, mag: 30, kills: 0, deaths: 0, score: 0 };
    this.events = [];                       // drained by the game each frame
    this.arena = null;
    this.onWelcome = null;
    this._acc = 0;
  }

  connect() {
    const ws = (typeof WebSocket !== 'undefined')
      ? new WebSocket(this.url) : null;
    if (!ws) return;
    this.ws = ws;
    ws.onopen = () => { this.connected = true; ws.send(JSON.stringify({ t: 'hello', name: this.name })); };
    ws.onmessage = (ev) => this._recv(ev.data);
    ws.onclose = () => { this.connected = false; };
    ws.onerror = () => {};
  }

  _recv(data) {
    let m; try { m = JSON.parse(data); } catch { return; }
    switch (m.t) {
      case 'welcome':
        this.you = m.you;
        this.arena = m.arena;
        this.simWorld = {
          half: m.arena.half, killY: -25,
          platforms: m.arena.platforms, boxes: m.arena.boxes,
          gravLifts: [], teleporters: [],
        };
        this.sim = createState(0, 0, 0);
        this.onWelcome?.(m.arena);
        break;
      case 'ping':
        this.ws?.send(JSON.stringify({ t: 'pong', id: m.id }));
        break;
      case 'snapshot':
        this._reconcile(m);
        break;
    }
  }

  _reconcile(snap) {
    if (!this.sim) return;
    // authoritative self
    const y = snap.you;
    this.self = { health: y.health, shield: y.shield, alive: y.alive,
                  mag: y.mag, kills: y.kills, deaths: y.deaths, score: y.score };
    // snap predicted state to server truth
    this.sim = { ...this.sim,
      px: y.x, py: y.y, pz: y.z, vx: y.vx, vy: y.vy, vz: y.vz,
      onGround: y.onGround, crouch: y.crouch };
    // drop acked inputs, replay the rest
    this.pending = this.pending.filter((c) => c.seq > snap.ack);
    for (const c of this.pending) this.sim = step(this.sim, c.inp, this.simWorld);

    // remote interpolation buffers
    const t = performance.now();
    for (const pl of snap.players) {
      if (pl.id === this.you) continue;
      let r = this.remotes.get(pl.id);
      if (!r) { r = { name: pl.name, buf: [] }; this.remotes.set(pl.id, r); }
      r.name = pl.name;
      r.buf.push({ t, x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw, crouch: pl.crouch,
                   alive: pl.alive, health: pl.health });
      if (r.buf.length > 20) r.buf.shift();
    }
    // reap gone players
    const present = new Set(snap.players.map((p) => p.id));
    for (const id of [...this.remotes.keys()]) if (!present.has(id)) this.remotes.delete(id);

    if (snap.events?.length) this.events.push(...snap.events);
  }

  // Feed one client input; predicts locally + ships to the server.
  sendInput(raw) {
    if (!this.connected || !this.sim) return;
    const inp = makeInput(raw);
    this.seq++;
    this.pending.push({ seq: this.seq, inp });
    this.sim = step(this.sim, inp, this.simWorld);      // immediate prediction
    this.ws.send(JSON.stringify({
      t: 'input', seq: this.seq, tick: this.sim.tick,
      mx: raw.mx | 0, mz: raw.mz | 0,
      yaw: raw.yaw ?? 0, pitch: raw.pitch ?? 0,
      sprint: raw.sprint ? 1 : 0, crouch: raw.crouch ? 1 : 0,
      jump: raw.jumpJust ? 1 : 0, crouchDown: raw.crouchJust ? 1 : 0, tele: raw.teleJust ? 1 : 0,
    }));
  }

  sendFire(wid, yaw, pitch) {
    if (!this.connected) return;
    this.fireSeq++;
    this.ws.send(JSON.stringify({ t: 'fire', seq: this.fireSeq, wid, yaw, pitch }));
  }

  // Predicted local position (for the camera/viewmodel owner).
  localPos() { return this.sim ? { x: this.sim.px, y: this.sim.py, z: this.sim.pz } : null; }

  // Interpolated remote players at render time.
  remoteStates() {
    const renderT = performance.now() - INTERP_DELAY;
    const out = [];
    for (const [id, r] of this.remotes) {
      const buf = r.buf;
      if (buf.length === 0) continue;
      let a = buf[0], b = buf[buf.length - 1];
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i].t <= renderT && buf[i + 1].t >= renderT) { a = buf[i]; b = buf[i + 1]; break; }
      }
      const span = (b.t - a.t) || 1;
      const f = Math.max(0, Math.min(1, (renderT - a.t) / span));
      out.push({
        id, name: r.name, alive: b.alive, health: b.health,
        x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f,
        yaw: a.yaw + (b.yaw - a.yaw) * f, crouch: b.crouch,
      });
    }
    return out;
  }

  drainEvents() { const e = this.events; this.events = []; return e; }
  disconnect() { try { this.ws?.close(); } catch {} }
}
