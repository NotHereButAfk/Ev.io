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

import { createState, step, makeInput, isSprinting, DT } from '../sim/MoveSim.js';

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
    this.sprinting = false;                 // exact predicted MoveSim presentation
    this.simWorld = null;
    this.remotes = new Map();               // id -> {name, buf:[{t,x,y,z,yaw,crouch}]}
    this.self = { health: 100, shield: 0, alive: true, mag: 30, reserve: 0,
                  reloading: false, reloadTicks: 0, reloadDuration: 0,
                  kills: 0, deaths: 0, score: 0,
                  blind: false, blindTicks: 0, abilities: { frag: 2, flash: 2, smoke: 2, impulse: 2 }, abilityCD: 0 };
    this.smokes = [];                       // active smoke volumes from the server
    this.abilitySeq = 0;
    this.events = [];                       // drained by the game each frame
    this.roster = [];
    this.arena = null;
    this.mapId = null;
    this.matchStart = null;
    this.matchDurationMs = null;
    this.onWelcome = null;
    this.onMapChange = null;
    this.postStep = null;
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
        this.roster = (m.players || []).map((pl) => ({
          id: pl.id, name: pl.name, isBot: !!pl.isBot,
          kills: pl.kills || 0, deaths: pl.deaths || 0, score: pl.score || 0,
        }));
        this.arena = m.arena;
        this.mapId = m.arena?.id || null;
        this.matchStart = m.matchStart ?? null;
        this.matchDurationMs = m.matchDurationMs ?? null;
        this.simWorld = {
          half: m.arena.half, killY: -25,
          noBaseFloor: !!m.arena.noBaseFloor,
          platforms: m.arena.platforms, boxes: m.arena.boxes,
          gravLifts: [], teleporters: [],
        };
        this.sim = createState(0, 0, 0);
        this.onWelcome?.(m.arena, {
          start: this.matchStart,
          durationMs: this.matchDurationMs,
        });
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
    const previousMapId = this.mapId;
    this.mapId = snap.mapId || this.mapId;
    this.matchStart = snap.matchStart ?? this.matchStart;
    this.matchDurationMs = snap.matchDurationMs ?? this.matchDurationMs;
    if (snap.arena) {
      this.arena = snap.arena;
      this.simWorld = {
        half: snap.arena.half,
        killY: -25,
        noBaseFloor: !!snap.arena.noBaseFloor,
        platforms: snap.arena.platforms,
        boxes: snap.arena.boxes,
        gravLifts: [],
        teleporters: [],
      };
    }
    if (previousMapId && this.mapId !== previousMapId) {
      this.onMapChange?.(this.mapId, {
        name: snap.mapName,
        start: this.matchStart,
        durationMs: this.matchDurationMs,
        arena: snap.arena || null,
      });
    }
    // authoritative self
    const y = snap.you;
    this.self = { health: y.health, shield: y.shield, alive: y.alive,
                  mag: y.mag, reserve: y.reserve ?? this.self.reserve,
                  reloading: !!y.reloading, reloadTicks: y.reloadTicks ?? 0,
                  reloadDuration: y.reloadDuration ?? 0,
                  spawnProtected: !!y.spawnProtected,
                  kills: y.kills, deaths: y.deaths, score: y.score,
                  blind: !!y.blind, blindTicks: y.blindTicks ?? 0,
                  abilities: y.abilities ?? this.self.abilities, abilityCD: y.abilityCD ?? 0 };
    this.smokes = snap.smokes ?? [];
    this.roster = snap.players.map((pl) => ({
      id: pl.id, name: pl.name, isBot: !!pl.isBot,
      kills: pl.kills || 0, deaths: pl.deaths || 0, score: pl.score || 0,
    }));
    // snap predicted state to server truth
    this.sim = { ...this.sim,
      px: y.x, py: y.y, pz: y.z, vx: y.vx, vy: y.vy, vz: y.vz,
      eye: y.eye ?? this.sim.eye,
      onGround: y.onGround ?? this.sim.onGround,
      crouch: y.crouch ?? this.sim.crouch,
      slide: y.slide ?? this.sim.slide,
      slideT: y.slideT ?? this.sim.slideT,
      slideDx: y.slideDx ?? this.sim.slideDx,
      slideDz: y.slideDz ?? this.sim.slideDz,
      stamina: y.stamina ?? this.sim.stamina,
      stamDelay: y.stamDelay ?? this.sim.stamDelay,
      coyote: y.coyote ?? this.sim.coyote,
      teleCD: y.teleCD ?? this.sim.teleCD,
      padCD: y.padCD ?? this.sim.padCD,
      nX: y.nX ?? this.sim.nX,
      nY: y.nY ?? this.sim.nY,
      nZ: y.nZ ?? this.sim.nZ,
      safeX: y.safeX ?? this.sim.safeX,
      safeY: y.safeY ?? this.sim.safeY,
      safeZ: y.safeZ ?? this.sim.safeZ };
    this.sprinting = !!y.sprint;
    // drop acked inputs, replay the rest
    this.pending = this.pending.filter((c) => c.seq > snap.ack);
    for (const c of this.pending) this._predict(c.inp);

    // remote interpolation buffers
    const t = performance.now();
    for (const pl of snap.players) {
      if (pl.id === this.you) continue;
      let r = this.remotes.get(pl.id);
      if (!r) { r = { name: pl.name, buf: [] }; this.remotes.set(pl.id, r); }
      r.name = pl.name;
      r.buf.push({ t, x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw, pitch: pl.pitch || 0,
                   vx: pl.vx || 0, vy: pl.vy || 0, vz: pl.vz || 0,
                   grounded: pl.onGround !== false, crouch: pl.crouch, slide: !!pl.slide,
                   sprint: !!pl.sprint, wid: pl.wid || 'm4', aiming: !!pl.aiming,
                   firing: !!pl.firing,
                   reload: pl.reload || 0, swing: pl.swing == null ? 1 : pl.swing,
                   alive: pl.alive, health: pl.health,
                   kills: pl.kills || 0, deaths: pl.deaths || 0, score: pl.score || 0 });
      if (r.buf.length > 20) r.buf.shift();
    }
    // reap gone players
    const present = new Set(snap.players.map((p) => p.id));
    for (const id of [...this.remotes.keys()]) if (!present.has(id)) this.remotes.delete(id);

    if (snap.events?.length) this.events.push(...snap.events);
  }

  _predict(inp) {
    const before = this.sim;
    const active = isSprinting(before, inp);
    const next = step(before, inp, this.simWorld);
    const distance = Math.hypot(next.px - before.px, next.pz - before.pz);
    this.sprinting = active && !inp.teleJust && distance / DT > 6.5 && distance < 2;
    this.sim = this.postStep ? this.postStep(next, before) : next;
  }

  // Feed one client input; predicts locally + ships to the server.
  sendInput(raw) {
    if (!this.connected || !this.sim) return;
    const inp = makeInput(raw);
    this.seq++;
    this.pending.push({ seq: this.seq, inp });
    this._predict(inp);                                 // immediate prediction
    this.ws.send(JSON.stringify({
      t: 'input', seq: this.seq, tick: this.sim.tick,
      mx: raw.mx | 0, mz: raw.mz | 0,
      yaw: raw.yaw ?? 0, pitch: raw.pitch ?? 0,
      sprint: raw.sprint ? 1 : 0, crouch: raw.crouch ? 1 : 0,
      jump: raw.jumpJust ? 1 : 0, crouchDown: raw.crouchJust ? 1 : 0, tele: raw.teleJust ? 1 : 0,
      wid: raw.wid, aiming: raw.aiming ? 1 : 0,
    }));
  }

  sendFire(wid, yaw, pitch) {
    if (!this.connected) return;
    this.fireSeq++;
    this.ws.send(JSON.stringify({ t: 'fire', seq: this.fireSeq, wid, yaw, pitch }));
  }

  sendReload(wid) {
    if (!this.connected) return;
    this.ws.send(JSON.stringify({ t: 'reload', wid }));
  }

  // Request a throwable ability (frag / flash / smoke / impulse). The server owns
  // charges, cooldown, and the effect — this is only a request.
  sendAbility(kind, yaw, pitch) {
    if (!this.connected) return;
    this.abilitySeq++;
    this.ws.send(JSON.stringify({ t: 'ability', seq: this.abilitySeq, kind, yaw, pitch }));
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
        // Shortest-way-round on yaw, or an avatar spins the long way through
        // the whole circle every time someone crosses ±π.
        yaw: a.yaw + (((b.yaw - a.yaw + Math.PI) % (Math.PI * 2)) - Math.PI) * f,
        pitch: (a.pitch || 0) + ((b.pitch || 0) - (a.pitch || 0)) * f,
        vx: a.vx + (b.vx - a.vx) * f,
        vy: a.vy + (b.vy - a.vy) * f,
        vz: a.vz + (b.vz - a.vz) * f,
        grounded: b.grounded, crouch: b.crouch, sliding: b.slide,
        sprint: b.sprint, wid: b.wid, aiming: b.aiming, firing: !!b.firing,
        reload: (a.reload || 0) + ((b.reload || 0) - (a.reload || 0)) * f,
        swing: (a.swing == null ? 1 : a.swing)
          + ((b.swing == null ? 1 : b.swing) - (a.swing == null ? 1 : a.swing)) * f,
      });
    }
    return out;
  }

  drainEvents() { const e = this.events; this.events = []; return e; }
  disconnect() { try { this.ws?.close(); } catch {} }
}
