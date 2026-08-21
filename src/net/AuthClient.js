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

const INTERP_DELAY = 3 * DT * 1000;         // absorb ordinary 20Hz packet jitter
const MAX_EXTRAPOLATION = 75;                // never predict a remote far into the future
const TELEPORT_DISTANCE_SQ = 16;             // do not tween respawns/teleports through walls

const lerp = (a, b, f) => a + (b - a) * f;
const lerpYaw = (a, b, f) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * f;

// Pure presentation helper so irregular packet delivery can be regression tested.
// Samples are stamped in authoritative server time, not browser arrival time.
export function interpolateRemoteSample(buf, renderT) {
  if (!buf?.length) return null;
  let a = buf[0], b = buf[buf.length - 1], f = 1;
  if (renderT <= buf[0].t) {
    a = b = buf[0];
  } else if (renderT >= b.t) {
    const ahead = Math.min(MAX_EXTRAPOLATION, renderT - b.t) / 1000;
    return { ...b, x: b.x + b.vx * ahead, y: b.y + b.vy * ahead, z: b.z + b.vz * ahead };
  } else {
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i].t <= renderT && buf[i + 1].t >= renderT) {
        a = buf[i]; b = buf[i + 1];
        f = (renderT - a.t) / Math.max(1, b.t - a.t);
        break;
      }
    }
  }
  return {
    ...b,
    x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f),
    yaw: lerpYaw(a.yaw, b.yaw, f),
    aimYaw: lerpYaw(a.aimYaw ?? a.yaw, b.aimYaw ?? b.yaw, f),
    pitch: lerp(a.pitch || 0, b.pitch || 0, f),
    vx: lerp(a.vx || 0, b.vx || 0, f),
    vy: lerp(a.vy || 0, b.vy || 0, f),
    vz: lerp(a.vz || 0, b.vz || 0, f),
    reload: lerp(a.reload || 0, b.reload || 0, f),
    swing: lerp(a.swing == null ? 1 : a.swing, b.swing == null ? 1 : b.swing, f),
  };
}

export class AuthClient {
  constructor(url, { name = 'Recruit' } = {}) {
    this.url = url;
    this.name = name;
    this.you = null;                        // server-assigned id
    this.connected = false;
    this.seq = 0;
    this.fireSeq = 0;
    // Last authoritative world tick actually rendered by this client. Fire
    // requests carry it so the server rewinds moving targets to what the
    // shooter saw, rather than confusing an input sequence with a world tick.
    this.lastServerTick = 0;
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
    this.onSnapshot = null;
    this.postStep = null;
    this._serverClockOffset = null;
    this._acc = 0;
    // Reconciliation corrects the deterministic simulation immediately, but
    // presentation absorbs small packet corrections over a few frames. This
    // prevents the camera from visibly stepping at the server's 20 Hz rate.
    this._visualOffset = { x: 0, y: 0, z: 0 };
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
          half: m.arena.half, killY: m.arena.killY ?? -25,
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
    const before = { x: this.sim.px, y: this.sim.py, z: this.sim.pz };
    if (Number.isFinite(snap.tick)) this.lastServerTick = snap.tick;
    const previousMapId = this.mapId;
    // A map id without its matching collision payload is not actionable. Keep
    // simulating the current map until a repeated rotation payload arrives.
    const requestedMapId = snap.mapId || this.mapId;
    const canAdoptMap = requestedMapId === this.mapId || !!snap.arena;
    if (canAdoptMap) this.mapId = requestedMapId;
    this.matchStart = snap.matchStart ?? this.matchStart;
    this.matchDurationMs = snap.matchDurationMs ?? this.matchDurationMs;
    // Do not apply a spawn from an unknown map to the current map. The room
    // repeats arena metadata, so the next complete snapshot safely catches up.
    if (!canAdoptMap) return;
    if (snap.arena) {
      this.arena = snap.arena;
      this.simWorld = {
        half: snap.arena.half,
        killY: snap.arena.killY ?? -25,
        noBaseFloor: !!snap.arena.noBaseFloor,
        platforms: snap.arena.platforms,
        boxes: snap.arena.boxes,
        gravLifts: [],
        teleporters: [],
      };
    }
    const mapChanged = Boolean(previousMapId && this.mapId !== previousMapId);
    if (mapChanged) {
      // Inputs were predicted against the previous arena's collision. Replaying
      // them from the new authoritative spawn can carry the player straight
      // past a ledge before the new map is even presented. A rotation is a hard
      // simulation boundary: accept the server spawn and begin a fresh queue.
      this.pending.length = 0;
      this._acc = 0;
      this.sprinting = false;
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
    this.pending = mapChanged ? [] : this.pending.filter((c) => c.seq > snap.ack);
    for (const c of this.pending) this._predict(c.inp);

    const correctionX = before.x - this.sim.px;
    const correctionY = before.y - this.sim.py;
    const correctionZ = before.z - this.sim.pz;
    const correctionSq = correctionX ** 2 + correctionY ** 2 + correctionZ ** 2;
    if (mapChanged || correctionSq > TELEPORT_DISTANCE_SQ) {
      this._visualOffset.x = this._visualOffset.y = this._visualOffset.z = 0;
    } else {
      this._visualOffset.x += correctionX;
      this._visualOffset.y += correctionY;
      this._visualOffset.z += correctionZ;
      const length = Math.hypot(this._visualOffset.x, this._visualOffset.y, this._visualOffset.z);
      if (length > 1.5) {
        const scale = 1.5 / length;
        this._visualOffset.x *= scale;
        this._visualOffset.y *= scale;
        this._visualOffset.z *= scale;
      }
    }

    // remote interpolation buffers
    const arrivalT = performance.now();
    const serverT = (snap.tick || 0) * DT * 1000;
    const clockCandidate = arrivalT - serverT;
    if (this._serverClockOffset == null) this._serverClockOffset = clockCandidate;
    else if (clockCandidate < this._serverClockOffset) {
      this._serverClockOffset = lerp(this._serverClockOffset, clockCandidate, 0.12);
    } else {
      this._serverClockOffset = lerp(this._serverClockOffset, clockCandidate, 0.005);
    }
    for (const pl of snap.players) {
      if (pl.id === this.you) continue;
      let r = this.remotes.get(pl.id);
      if (!r) { r = { name: pl.name, isBot: !!pl.isBot, buf: [] }; this.remotes.set(pl.id, r); }
      r.name = pl.name;
      r.isBot = !!pl.isBot;
      const previous = r.buf[r.buf.length - 1];
      const jumped = previous && (
        previous.alive !== pl.alive
        || ((previous.x - pl.x) ** 2 + (previous.y - pl.y) ** 2 + (previous.z - pl.z) ** 2) > TELEPORT_DISTANCE_SQ
      );
      if (jumped) r.buf.length = 0;
      r.buf.push({ t: serverT, x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw, pitch: pl.pitch || 0,
                   aimYaw: pl.aimYaw ?? pl.yaw,
                   vx: pl.vx || 0, vy: pl.vy || 0, vz: pl.vz || 0,
                   grounded: pl.onGround !== false, crouch: pl.crouch, slide: !!pl.slide,
                   sprint: !!pl.sprint, wid: pl.wid || 'm4', aiming: !!pl.aiming,
                   firing: !!pl.firing,
                   reload: pl.reload || 0, swing: pl.swing == null ? 1 : pl.swing,
                   alive: pl.alive, health: pl.health,
                   kills: pl.kills || 0, deaths: pl.deaths || 0, score: pl.score || 0 });
      if (r.buf.length > 30) r.buf.shift();
    }
    // reap gone players
    const present = new Set(snap.players.map((p) => p.id));
    for (const id of [...this.remotes.keys()]) if (!present.has(id)) this.remotes.delete(id);

    if (snap.events?.length) this.events.push(...snap.events);
    this.onSnapshot?.(snap);
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
    this.ws.send(JSON.stringify({
      t: 'fire', seq: this.fireSeq, wid, yaw, pitch,
      viewTick: this.lastServerTick,
    }));
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
  advancePresentation(dt) {
    // Frame-rate independent decay: roughly 95% of an ordinary correction is
    // gone in 120 ms, with no dependence on the server snapshot cadence.
    const decay = Math.exp(-Math.max(0, dt) * 25);
    this._visualOffset.x *= decay;
    this._visualOffset.y *= decay;
    this._visualOffset.z *= decay;
  }

  resetPresentation() {
    this._visualOffset.x = this._visualOffset.y = this._visualOffset.z = 0;
  }

  localPos() {
    return this.sim ? {
      x: this.sim.px + this._visualOffset.x,
      y: this.sim.py + this._visualOffset.y,
      z: this.sim.pz + this._visualOffset.z,
    } : null;
  }

  // Interpolated remote players at render time.
  remoteStates() {
    const renderT = performance.now() - (this._serverClockOffset || 0) - INTERP_DELAY;
    const out = [];
    for (const [id, r] of this.remotes) {
      const buf = r.buf;
      if (buf.length === 0) continue;
      const state = interpolateRemoteSample(buf, renderT);
      if (!state) continue;
      out.push({
        id, name: r.name, isBot: r.isBot, alive: state.alive, health: state.health,
        x: state.x, y: state.y, z: state.z,
        // Shortest-way-round on yaw, or an avatar spins the long way through
        // the whole circle every time someone crosses ±π.
        yaw: state.yaw,
        aimYaw: state.aimYaw ?? state.yaw,
        pitch: state.pitch,
        vx: state.vx, vy: state.vy, vz: state.vz,
        grounded: state.grounded, crouch: state.crouch, sliding: state.slide,
        sprint: state.sprint, wid: state.wid, aiming: state.aiming, firing: !!state.firing,
        reload: state.reload, swing: state.swing,
      });
    }
    return out;
  }

  drainEvents() { const e = this.events; this.events = []; return e; }
  disconnect() { try { this.ws?.close(); } catch {} }
}
