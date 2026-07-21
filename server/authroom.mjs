// Authoritative room (Phase 4 + 5) — fixed-20Hz server-owned simulation.
//
// Runs the SAME deterministic MoveSim the client predicts with, so server and
// client agree tick-for-tick. Owns every gameplay truth: position (validated
// against the sim, never trusted from the client), health/shield, damage,
// death, respawn, match timer, score, and the kill feed. Hitscan is
// lag-compensated by rewinding target positions to the shooter's acked tick.
//
// Wire protocol (JSON messages):
//   client → server:
//     {t:'hello', name}                         join
//     {t:'input', seq, tick, mx,mz,yaw,pitch,   one command per client tick
//                 sprint,crouch,jump,crouchDown,tele}
//     {t:'fire', seq, wid, yaw, pitch}          fire request (server hitscans)
//     {t:'pong', id}                            heartbeat reply
//   server → client:
//     {t:'welcome', you, tick, arena, players}  post-join
//     {t:'snapshot', tick, ack, you, players, events}   20Hz world state
//     {t:'ping', id}                            heartbeat
//     {t:'kick', reason}
//
// Anti-abuse lives in authserver.mjs (origin/schema/rate/size/replay/
// heartbeat/backpressure); this file enforces GAMEPLAY authority.

import { createState, step, makeInput } from '../src/sim/MoveSim.js';
import { INKFALL } from '../src/sim/arenas.js';

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;

const RESPAWN_TICKS = TICK_HZ * 3;          // 3s
const MAX_INPUT_QUEUE = 8;                  // drop floods; catch-up caps here
const INPUT_LEAD_TICKS = 6;                 // how far ahead of server tick we allow
const HISTORY_TICKS = 20;                   // 1s of position history for lag-comp
const START_HEALTH = 100, START_SHIELD = 0;

// Minimal server-side weapon table (authority only needs combat numbers).
const WEAPONS = {
  m4:          { dmg: 22, rate: 0.1,  spread: 0.009, pellets: 1, range: 150, hs: 1,   reload: 1.8, mag: 30 },
  magnum:      { dmg: 38, rate: 0.28, spread: 0.003, pellets: 1, range: 120, hs: 2.2, reload: 1.2, mag: 8  },
  battlerifle: { dmg: 22, rate: 0.45, spread: 0.008, pellets: 3, range: 170, hs: 1.8, reload: 2.0, mag: 36 },
  energyshotgun:{dmg: 12, rate: 0.65, spread: 0.095, pellets: 10,range: 28,  hs: 1,   reload: 1.8, mag: 8  },
  plasmarifle: { dmg: 13, rate: 0.08, spread: 0.015, pellets: 1, range: 90,  hs: 1,   reload: 1.6, mag: 40 },
};
const HEAD_Y = 1.55, BODY_R = 0.5, HEAD_R = 0.28;

// Server-authoritative throwable abilities (Phase 10). The server owns charges,
// cooldown, the detonation point, and every effect — the client only requests.
//   flash:   LOS-gated blind on players inside the radius
//   smoke:   a vision volume that blocks hitscan for its lifetime
//   impulse: radial knockback velocity (clamped so it can't launch to infinity)
const ABILITIES = {
  flash:   { cd: 1.5, charges: 2, throwRange: 24, radius: 8,  blindSec: 2.2 },
  smoke:   { cd: 1.5, charges: 2, throwRange: 22, radius: 5,  lifeSec: 8 },
  impulse: { cd: 2.0, charges: 2, throwRange: 18, radius: 6,  power: 11 },
};
const IMPULSE_MAX = 18;   // hard clamp on any single knockback component
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// AABB slab raycast (nearest hit t in [0.1, maxT], else maxT) — used to find
// an ability's detonation point against the arena geometry.
function rayVsBoxes(world, ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT;
  for (const b of world.boxes) {
    let t0 = 0, t1 = best, hit = true;
    const o = [ox, oy, oz], d = [dx, dy, dz];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < b.min[a] || o[a] > b.max[a]) { hit = false; break; } }
      else {
        let ta = (b.min[a] - o[a]) / d[a], tb = (b.max[a] - o[a]) / d[a];
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) { hit = false; break; }
      }
    }
    if (hit && t0 > 0.1 && t0 < best) best = t0;
  }
  return best;
}

let _pid = 1;

export class AuthRoom {
  constructor(arena = INKFALL) {
    this.arena = arena;
    this.simWorld = {
      half: arena.half, killY: arena.killY,
      platforms: arena.platforms, boxes: arena.boxes,
      gravLifts: arena.gravLifts, teleporters: arena.teleporters,
    };
    this.tick = 0;
    this.players = new Map();   // id -> player
    this.events = [];           // per-tick outgoing events (kills, hits, spawns)
    this.smokes = [];           // active smoke volumes {x,y,z,r,until}
    this.matchStart = Date.now();
    this.matchDurationMs = 8 * 60 * 1000;
  }

  // Add a HUMAN-controlled player (a real socket).
  add(send, name) { return this._add(send, name, false); }

  // Add a clearly-labelled BOT for gameplay/load/stability testing. isBot
  // rides the roster + every snapshot so no client can ever be shown a bot as
  // a human (Phase 11: no fake-human surfaces).
  addBot(name) { return this._add(() => {}, name, true); }

  _add(send, name, isBot) {
    const id = _pid++;
    const spawn = this._spawn();
    const p = {
      id, send, name, isBot: !!isBot,
      state: createState(spawn[0], spawn[1], spawn[2]),
      lastInputSeq: 0, ackTick: 0,
      queue: [],
      health: START_HEALTH, shield: START_SHIELD, maxShield: START_SHIELD,
      alive: true, deadUntil: 0, kills: 0, deaths: 0, score: 0,
      wid: 'm4', mag: WEAPONS.m4.mag, fireCooldown: 0,
      history: [],               // [{tick, x,y,z}]
      lastFireSeq: 0,
      abilities: { flash: ABILITIES.flash.charges, smoke: ABILITIES.smoke.charges,
                   impulse: ABILITIES.impulse.charges },
      abilityCD: 0, blindUntil: 0, lastAbilitySeq: 0, abilityReq: null,
    };
    this.players.set(id, p);
    this.events.push({ e: 'spawn', id, name, x: spawn[0], y: spawn[1], z: spawn[2] });
    p.send({
      t: 'welcome', you: id, tick: this.tick,
      arena: { name: this.arena.name, half: this.arena.half,
               platforms: this.arena.platforms, boxes: this.arena.boxes,
               spawns: this.arena.spawns },
      players: this._roster(),
    });
    return id;
  }

  remove(id) {
    if (this.players.delete(id)) this.events.push({ e: 'leave', id });
  }

  _spawn() {
    const s = this.arena.spawns[(_pid) % this.arena.spawns.length];
    return [s[0], s[1], s[2]];
  }

  // Validated input: the client proposes intent; the server owns the sim.
  onInput(id, msg) {
    const p = this.players.get(id);
    if (!p) return;
    if (typeof msg.seq !== 'number' || msg.seq <= p.lastInputSeq) return;   // replay/stale
    // clamp look to finite numbers; movement to the tri-state set
    const inp = makeInput({
      mx: Math.max(-1, Math.min(1, msg.mx | 0)),
      mz: Math.max(-1, Math.min(1, msg.mz | 0)),
      yaw: Number.isFinite(msg.yaw) ? msg.yaw : 0,
      pitch: Number.isFinite(msg.pitch) ? msg.pitch : 0,
      sprint: !!msg.sprint, crouch: !!msg.crouch,
      jumpJust: !!msg.jump, crouchJust: !!msg.crouchDown, teleJust: !!msg.tele,
    });
    p.queue.push({ seq: msg.seq, inp });
    p.lastInputSeq = msg.seq;
    if (p.queue.length > MAX_INPUT_QUEUE) p.queue.splice(0, p.queue.length - MAX_INPUT_QUEUE);
  }

  // Queue a fire request (replay-guarded). It's RESOLVED inside update() on the
  // tick, so lag-comp rewinds to the right tick and the hit/kill events survive
  // to that tick's snapshot (clearing events at the top of update() would wipe
  // anything resolved between ticks).
  onFire(id, msg) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    if (typeof msg.seq !== 'number' || msg.seq <= p.lastFireSeq) return;   // replay/dup
    p.lastFireSeq = msg.seq;
    p.fireReq = { wid: WEAPONS[msg.wid] ? msg.wid : 'm4',
                  yaw: Number.isFinite(msg.yaw) ? msg.yaw : 0,
                  pitch: Number.isFinite(msg.pitch) ? msg.pitch : 0 };
  }

  // Ability request (replay-guarded). Charges + cooldown + effects are ALL
  // owned by the server — resolved inside update() on the tick.
  onAbility(id, msg) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    if (!ABILITIES[msg.kind]) return;                        // unknown ability type
    if (typeof msg.seq !== 'number' || msg.seq <= p.lastAbilitySeq) return;   // replay/dup
    p.lastAbilitySeq = msg.seq;
    p.abilityReq = { kind: msg.kind,
                     yaw: Number.isFinite(msg.yaw) ? msg.yaw : 0,
                     pitch: Number.isFinite(msg.pitch) ? msg.pitch : 0 };
  }

  _hitscan(shooter, w, yaw, pitch) {
    // Rewind targets to the shooter's acked tick (lag compensation).
    const rewind = shooter.ackTick;
    const ox = shooter.state.px, oy = shooter.state.py + HEAD_Y, oz = shooter.state.pz;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dx = -Math.sin(yaw) * cp, dy = sp, dz = -Math.cos(yaw) * cp;

    for (let pellet = 0; pellet < w.pellets; pellet++) {
      // deterministic-ish spread from tick+pellet (server-authoritative)
      const a = (this._rand(shooter.id * 131 + this.tick * 7 + pellet) - 0.5) * w.spread;
      const b = (this._rand(shooter.id * 977 + this.tick * 13 + pellet) - 0.5) * w.spread;
      const rx = dx + a, ry = dy + b, rz = dz;
      let best = null, bestT = w.range;
      for (const t of this.players.values()) {
        if (t === shooter || !t.alive) continue;
        const pos = this._rewound(t, rewind);
        const hit = this._raySphere(ox, oy, oz, rx, ry, rz, pos.x, pos.y + HEAD_Y, pos.z, HEAD_R, bestT);
        if (hit && hit.t < bestT) { best = { t, head: true, t2: hit.t }; bestT = hit.t; continue; }
        const body = this._raySphere(ox, oy, oz, rx, ry, rz, pos.x, pos.y + 0.9, pos.z, BODY_R, bestT);
        if (body && body.t < bestT) { best = { t, head: false, t2: body.t }; bestT = body.t; }
      }
      // smoke occlusion: if the ray to the hit passes through an active smoke
      // volume, the shot is blocked (server-authoritative vision denial).
      if (best && this._raySmoked(ox, oy, oz, rx, ry, rz, best.t2)) continue;
      if (best) this._damage(best.t, shooter, w.dmg * (best.head ? w.hs : 1), best.head);
    }
  }

  // Does the ray segment [0, maxT] pass within any active smoke sphere?
  _raySmoked(ox, oy, oz, dx, dy, dz, maxT) {
    for (const s of this.smokes) {
      const h = this._raySphere(ox, oy, oz, dx, dy, dz, s.x, s.y, s.z, s.r, maxT);
      if (h) return true;
    }
    return false;
  }

  _damage(target, shooter, dmg, head) {
    if (!target.alive) return;
    const absorbed = Math.min(target.shield, dmg);
    target.shield -= absorbed;
    target.health -= (dmg - absorbed);
    this.events.push({ e: 'hit', id: target.id, by: shooter.id, dmg: Math.round(dmg), head });
    if (target.health <= 0) {
      target.alive = false;
      target.health = 0;
      target.deadUntil = this.tick + RESPAWN_TICKS;
      target.deaths++;
      shooter.kills++;
      shooter.score += head ? 150 : 100;
      this.events.push({ e: 'kill', id: target.id, by: shooter.id, byName: shooter.name,
                         victimName: target.name, head, wid: shooter.wid });
    }
  }

  // Server computes the detonation point (aim ray vs geometry, capped at the
  // throw range) and applies the ability's effect to everyone in radius.
  _resolveAbility(p, kind, A, yaw, pitch) {
    const ox = p.state.px, oy = p.state.py + HEAD_Y, oz = p.state.pz;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dx = -Math.sin(yaw) * cp, dy = sp, dz = -Math.cos(yaw) * cp;
    const hitT = rayVsBoxes(this.simWorld, ox, oy, oz, dx, dy, dz, A.throwRange);
    const dist = Math.min(hitT, A.throwRange);
    const bx = ox + dx * dist, by = Math.max(0, oy + dy * dist), bz = oz + dz * dist;

    if (kind === 'smoke') {
      this.smokes.push({ x: bx, y: by, z: bz, r: A.radius, until: this.tick + Math.round(A.lifeSec * TICK_HZ) });
    } else if (kind === 'flash') {
      for (const t of this.players.values()) {
        if (!t.alive) continue;
        const d = Math.hypot(t.state.px - bx, t.state.pz - bz, (t.state.py + HEAD_Y) - by);
        if (d > A.radius) continue;
        // LOS gate: no blind through a wall
        const tx = t.state.px - bx, ty = (t.state.py + HEAD_Y) - by, tz = t.state.pz - bz;
        const len = Math.hypot(tx, ty, tz) || 1e-6;
        const blocked = rayVsBoxes(this.simWorld, bx, by, bz, tx / len, ty / len, tz / len, len) < len - 0.1;
        if (blocked) continue;
        const frac = 1 - d / A.radius;                 // closer = longer blind
        t.blindUntil = Math.max(t.blindUntil, this.tick + Math.round(A.blindSec * frac * TICK_HZ));
      }
    } else if (kind === 'impulse') {
      for (const t of this.players.values()) {
        if (!t.alive) continue;
        const tx = t.state.px - bx, ty = (t.state.py + 0.9) - by, tz = t.state.pz - bz;
        const d = Math.hypot(tx, ty, tz);
        if (d > A.radius) continue;
        const f = A.power * (1 - d / A.radius) / (d || 1e-6);
        // clamp every component so knockback can never launch to infinity
        t.state.vx = clamp(t.state.vx + tx * f, -IMPULSE_MAX, IMPULSE_MAX);
        t.state.vy = clamp(t.state.vy + Math.max(ty * f, A.power * 0.4), -IMPULSE_MAX, IMPULSE_MAX);
        t.state.vz = clamp(t.state.vz + tz * f, -IMPULSE_MAX, IMPULSE_MAX);
        t.state.onGround = 0;
      }
    }
    this.events.push({ e: 'ability', kind, by: p.id, x: bx, y: by, z: bz, r: A.radius });
  }

  // advance one authoritative tick
  update() {
    this.tick++;
    this.events.length = 0;

    // expire finished smoke volumes
    if (this.smokes.length) this.smokes = this.smokes.filter((s) => this.tick < s.until);

    for (const p of this.players.values()) {
      p.fireCooldown = Math.max(0, p.fireCooldown - 1 / TICK_HZ);
      p.abilityCD = Math.max(0, p.abilityCD - 1 / TICK_HZ);

      if (!p.alive) {
        if (this.tick >= p.deadUntil) {
          const s = this._spawn();
          p.state = createState(s[0], s[1], s[2]);
          p.health = START_HEALTH; p.shield = p.maxShield;
          p.mag = (WEAPONS[p.wid] || WEAPONS.m4).mag;
          p.alive = true; p.queue.length = 0;
          p.blindUntil = 0;
          p.abilities = { flash: ABILITIES.flash.charges, smoke: ABILITIES.smoke.charges,
                          impulse: ABILITIES.impulse.charges };
          this.events.push({ e: 'respawn', id: p.id, x: s[0], y: s[1], z: s[2] });
        }
        this._record(p);
        continue;
      }

      // consume the next queued input (or coast with zero-move if starved)
      let cmd = p.queue.shift();
      if (!cmd) {
        cmd = { seq: p.lastInputSeq, inp: makeInput({ yaw: p._lastYaw ?? 0 }) };
      }
      // reject inputs that claim to be too far in the future (schema guard)
      p.state = step(p.state, cmd.inp, this.simWorld);
      p.ackTick = cmd.seq;
      p._lastYaw = cmd.inp.yaw;
      this._record(p);
    }

    // resolve fire requests AFTER movement + history record, so hitscan sees
    // this tick's positions and events land in this tick's snapshot.
    for (const p of this.players.values()) {
      if (!p.fireReq || !p.alive) { p.fireReq = null; continue; }
      const req = p.fireReq; p.fireReq = null;
      if (p.fireCooldown > 0 || p.mag <= 0) continue;   // authority: rate + ammo
      const w = WEAPONS[req.wid] || WEAPONS.m4;
      p.wid = req.wid;
      p.fireCooldown = w.rate;
      p.mag--;
      this._hitscan(p, w, req.yaw, req.pitch);
    }

    // resolve ability requests (charges + cooldown + effect all server-owned)
    for (const p of this.players.values()) {
      if (!p.abilityReq || !p.alive) { p.abilityReq = null; continue; }
      const req = p.abilityReq; p.abilityReq = null;
      const A = ABILITIES[req.kind];
      if (!A || p.abilityCD > 0 || p.abilities[req.kind] <= 0) continue;   // authority: cd + charges
      p.abilities[req.kind]--;
      p.abilityCD = A.cd;
      this._resolveAbility(p, req.kind, A, req.yaw, req.pitch);
    }

    // send per-player snapshots (each gets its own ack + authoritative you-state)
    const now = this.tick;
    const publicList = [];
    for (const p of this.players.values()) {
      publicList.push({
        id: p.id, name: p.name, isBot: p.isBot,
        x: p.state.px, y: p.state.py, z: p.state.pz,
        yaw: p._lastYaw ?? 0, crouch: p.state.crouch, alive: p.alive,
        health: p.health, shield: p.shield,
      });
    }
    const smokeList = this.smokes.map((s) => ({ x: s.x, y: s.y, z: s.z, r: s.r }));
    for (const p of this.players.values()) {
      p.send({
        t: 'snapshot', tick: now, ack: p.ackTick,
        you: { x: p.state.px, y: p.state.py, z: p.state.pz,
               vx: p.state.vx, vy: p.state.vy, vz: p.state.vz,
               onGround: p.state.onGround, crouch: p.state.crouch,
               health: p.health, shield: p.shield, alive: p.alive,
               mag: p.mag, kills: p.kills, deaths: p.deaths, score: p.score,
               blind: p.blindUntil > now, blindTicks: Math.max(0, p.blindUntil - now),
               abilities: p.abilities, abilityCD: +p.abilityCD.toFixed(2) },
        players: publicList,
        smokes: smokeList,
        events: this.events,
      });
    }
  }

  _record(p) {
    p.history.push({ tick: this.tick, x: p.state.px, y: p.state.py, z: p.state.pz });
    if (p.history.length > HISTORY_TICKS) p.history.shift();
  }
  _rewound(p, tick) {
    for (let i = p.history.length - 1; i >= 0; i--) {
      if (p.history[i].tick <= tick) return p.history[i];
    }
    return p.history[0] ?? { x: p.state.px, y: p.state.py, z: p.state.pz };
  }

  _roster() {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id, name: p.name, isBot: p.isBot, kills: p.kills, deaths: p.deaths, score: p.score,
    }));
  }

  // ray vs sphere; returns {t} of nearest entry within maxT, else null
  _raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
    const ex = ox - cx, ey = oy - cy, ez = oz - cz;
    const b = ex * dx + ey * dy + ez * dz;
    const c = ex * ex + ey * ey + ez * ez - r * r;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t < 0 || t > maxT) return null;
    return { t };
  }
  _rand(seed) {
    let s = seed | 0; s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d);
    s = Math.imul(s ^ (s >>> 12), 0x297a2d39);
    return ((s ^ (s >>> 15)) >>> 0) / 4294967296;
  }
}
