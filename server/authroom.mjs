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

import { createState, step, makeInput, isSprinting } from '../src/sim/MoveSim.js';
import { combatTargetScore } from '../src/entities/BotCombat.js';
import { IMPORTED_ARENAS } from './rookarena.mjs';

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;

const RESPAWN_TICKS = TICK_HZ * 3;          // 3s
const MAX_INPUT_QUEUE = 8;                  // drop floods; catch-up caps here
const INPUT_LEAD_TICKS = 6;                 // how far ahead of server tick we allow
const HISTORY_TICKS = 20;                   // 1s of position history for lag-comp
const START_HEALTH = 100, START_SHIELD = 0;

// Minimal server-side weapon table (authority only needs combat numbers).
const WEAPONS = {
  m4:          { dmg: 10, rate: 0.12, spreadMin: 0, spreadMax: 0.02,
                 bloomShot: 0.0025, bloomRecovery: 0.008, zoomSpreadMod: 0,
                 pellets: 1, range: 150, hs: 1, reload: 1.8, mag: 50 },
  magnum:      { dmg: 38, rate: 0.28, spread: 0.003, pellets: 1, range: 120, hs: 2.2, reload: 1.2, mag: 8  },
  battlerifle: { dmg: 22, rate: 0.45, spread: 0.008, pellets: 3, range: 170, hs: 1.8, reload: 2.0, mag: 36 },
  energyshotgun:{dmg: 12, rate: 0.65, spread: 0.095, pellets: 10,range: 28,  hs: 1,   reload: 1.8, mag: 8  },
  plasmarifle: { dmg: 13, rate: 0.08, spread: 0.015, pellets: 1, range: 90,  hs: 1,   reload: 1.6, mag: 40 },
};
// The authoritative combat subset above is intentionally small, but remote
// presentation still needs to show every shipped held model (including melee).
// Input may choose only one of these known IDs; arbitrary asset names never
// reach snapshots or model lookup.
const PRESENTATION_WEAPONS = new Set([
  'sidearm', 'uzi', 'levershotgun', 'm4', 'm16', 'rifle', 'lmg', 'rpg',
  'boltsniper', 'knife', 'sword', 'magnum', 'battlerifle', 'needler',
  'plasmarifle', 'dmr', 'fuelrod', 'concussion', 'energyshotgun', 'ghammer',
]);
const HEAD_Y = 1.55, BODY_R = 0.5, HEAD_R = 0.28;

// Server-authoritative throwable abilities (Phase 10). The server owns charges,
// cooldown, the detonation point, and every effect — the client only requests.
//   flash:   LOS-gated blind on players inside the radius
//   smoke:   a vision volume that blocks hitscan for its lifetime
//   impulse: radial knockback velocity (clamped so it can't launch to infinity)
const ABILITIES = {
  frag:    { cd: 1.5, charges: 2, throwRange: 24, radius: 5, damage: 80, fuseSec: 2.5 },
  flash:   { cd: 1.5, charges: 2, throwRange: 24, radius: 8,  blindSec: 2.2 },
  smoke:   { cd: 1.5, charges: 2, throwRange: 22, radius: 5,  lifeSec: 8 },
  impulse: { cd: 2.0, charges: 2, throwRange: 18, radius: 6,  power: 11 },
};
const IMPULSE_MAX = 18;   // hard clamp on any single knockback component
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// AABB slab raycast (nearest hit t in [0.1, maxT], else maxT) — used to find
// an ability's detonation point against the arena geometry.
function rayVsBoxes(world, ox, oy, oz, dx, dy, dz, maxT) {
  if (world.raycast) return world.raycast(ox, oy, oz, dx, dy, dz, maxT);
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
  constructor(arena = IMPORTED_ARENAS, { targetPopulation = 0 } = {}) {
    this.arenas = Array.isArray(arena) ? arena : [arena];
    if (!this.arenas.length) throw new Error('AuthRoom requires at least one imported arena');
    this._arenaIndex = 0;
    this.arena = this.arenas[0];
    this._setSimArena(this.arena);
    this.tick = 0;
    this.players = new Map();   // id -> player
    this.events = [];           // per-tick outgoing events (kills, hits, spawns)
    this.smokes = [];           // active smoke volumes {x,y,z,r,until}
    this.frags = [];            // pending authoritative detonations
    this.matchStart = Date.now();
    this.matchDurationMs = 8 * 60 * 1000;
    const requestedPopulation = Number.isFinite(targetPopulation) ? targetPopulation | 0 : 0;
    this.targetPopulation = clamp(requestedPopulation, 0, 8);
    this._botSerial = 0;
    this._fillBotSlots();
  }

  _setSimArena(arena) {
    this.arena = arena;
    this.simWorld = {
      half: arena.half, killY: arena.killY,
      noBaseFloor: !!arena.noBaseFloor,
      platforms: arena.platforms, boxes: arena.boxes,
      gravLifts: arena.gravLifts, teleporters: arena.teleporters,
      raycast: arena.raycast,
    };
  }

  _arenaPayload() {
    return {
      id: this.arena.id,
      name: this.arena.name,
      region: this.arena.region,
      half: this.arena.half,
      noBaseFloor: !!this.arena.noBaseFloor,
      platforms: this.arena.platforms,
      boxes: this.arena.boxes,
      spawns: this.arena.spawns,
    };
  }

  _rotateMatch(now = Date.now()) {
    if (now - this.matchStart < this.matchDurationMs) return false;
    this.matchStart = now;
    this._arenaIndex = (this._arenaIndex + 1) % this.arenas.length;
    this._setSimArena(this.arenas[this._arenaIndex]);
    this.smokes.length = 0;
    this.frags.length = 0;

    let spawnIndex = 0;
    for (const player of this.players.values()) {
      const spawn = this._spawn(spawnIndex++);
      player.state = createState(spawn[0], spawn[1], spawn[2]);
      player.queue.length = 0;
      player.history.length = 0;
      player.health = START_HEALTH;
      player.shield = player.maxShield;
      player.alive = true;
      player.deadUntil = 0;
      player.kills = 0;
      player.deaths = 0;
      player.score = 0;
      player.mag = (WEAPONS[player.wid] || WEAPONS.m4).mag;
      player.fireCooldown = 0;
      player.gunBloom = 0;
      player._animVX = player._animVZ = 0;
      player._lastSprint = false;
      player._lastAim = false;
      player._firingTicks = 0;
      player.blindUntil = 0;
      player.abilities = {
        frag: ABILITIES.frag.charges, flash: ABILITIES.flash.charges,
        smoke: ABILITIES.smoke.charges,
        impulse: ABILITIES.impulse.charges,
      };
      player.abilityCD = 0;
    }
    this.events.push({ e: 'map', id: this.arena.id, name: this.arena.name });
    return true;
  }

  // Add a HUMAN-controlled player (a real socket).
  add(send, name) {
    // A real player always gets a seat. Remove one server bot first when the
    // target-sized room is full, then backfill only after that human leaves.
    if (this.targetPopulation && this.players.size >= this.targetPopulation) {
      const bot = Array.from(this.players.values()).find((p) => p.isBot);
      if (bot) this._remove(bot.id, false);
      else { send({ t: 'kick', reason: 'match full' }); return null; }
    }
    return this._add(send, name, false);
  }

  // Add a clearly-labelled BOT for gameplay/load/stability testing. isBot
  // rides the roster + every snapshot so no client can ever be shown a bot as
  // a human (Phase 11: no fake-human surfaces).
  addBot(name) { return this._add(() => {}, name, true); }

  _fillBotSlots() {
    while (this.players.size < this.targetPopulation) {
      this._botSerial++;
      this.addBot(`BOT ${String(this._botSerial).padStart(2, '0')}`);
    }
  }

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
      wid: 'm4', mag: WEAPONS.m4.mag, fireCooldown: 0, gunBloom: 0,
      _lastSprint: false, _lastAim: false, _animVX: 0, _animVZ: 0,
      _botReloadUntil: 0,
      history: [],               // [{tick, x,y,z}]
      lastFireSeq: 0, lastFireRequestTick: -Infinity,
      abilities: { frag: ABILITIES.frag.charges, flash: ABILITIES.flash.charges, smoke: ABILITIES.smoke.charges,
                   impulse: ABILITIES.impulse.charges },
      abilityCD: 0, blindUntil: 0, lastAbilitySeq: 0, abilityReq: null,
    };
    this.players.set(id, p);
    this.events.push({ e: 'spawn', id, name, x: spawn[0], y: spawn[1], z: spawn[2] });
    p.send({
      t: 'welcome', you: id, tick: this.tick,
      arena: this._arenaPayload(),
      matchStart: this.matchStart,
      matchDurationMs: this.matchDurationMs,
      players: this._roster(),
    });
    return id;
  }

  remove(id) { this._remove(id, true); }

  _remove(id, refill) {
    if (this.players.delete(id)) this.events.push({ e: 'leave', id });
    if (refill) this._fillBotSlots();
  }

  _driveBot(p) {
    let target = null;
    let bestScore = Infinity;
    for (const other of this.players.values()) {
      if (other === p || !other.alive) continue;
      const dx = other.state.px - p.state.px;
      const dz = other.state.pz - p.state.pz;
      const d2 = dx * dx + dz * dz;
      const score = combatTargetScore({
        distance: Math.sqrt(d2), isHuman: !other.isBot, botId: p.id,
      });
      if (score < bestScore) { bestScore = score; target = other; }
    }

    const seq = ++p.lastInputSeq;
    if (!target) return { seq, inp: makeInput({ yaw: p._lastYaw ?? 0 }), wid: p.wid, aiming: false };

    const dx = target.state.px - p.state.px;
    const dz = target.state.pz - p.state.pz;
    const distance = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(
      (target.state.py + HEAD_Y) - (p.state.py + HEAD_Y),
      Math.max(0.001, distance),
    );
    const phase = ((this.tick + p.id * 17) % 160) / 160;
    const strafe = phase < 0.5 ? 1 : -1;
    const inp = makeInput({
      mx: distance < 32 ? strafe : 0,
      mz: distance > 13 ? 1 : distance < 7 ? -1 : 0,
      yaw, pitch,
      sprint: distance > 22,
      jumpJust: (this.tick + p.id * 29) % 173 === 0,
    });

    if (p.mag <= 0) {
      if (!p._botReloadUntil) p._botReloadUntil = this.tick + Math.ceil(WEAPONS.m4.reload * TICK_HZ);
      if (this.tick >= p._botReloadUntil) {
        p.mag = (WEAPONS[p.wid] || WEAPONS.m4).mag;
        p._botReloadUntil = 0;
      }
    }

    // Bots use the exact same authoritative fire request and hitscan path as a
    // socket player. Geometry LOS is checked before they pull the trigger.
    if (distance < 105 && p.fireCooldown <= 0 && p.mag > 0) {
      const cp = Math.cos(pitch);
      const rayDistance = rayVsBoxes(
        this.simWorld,
        p.state.px, p.state.py + HEAD_Y, p.state.pz,
        -Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp,
        distance,
      );
      if (rayDistance >= distance - 0.6) {
        this.onFire(p.id, { seq: p.lastFireSeq + 1, wid: p.wid, yaw, pitch });
        // Movement is integrated before fire requests resolve. Remember the
        // chosen target so the authoritative shot can refresh its ray from the
        // bot's post-movement position instead of firing along a stale angle.
        if (p.fireReq) p.fireReq.botTargetId = target.id;
      }
    }
    return { seq, inp, wid: p.wid, aiming: distance < 55 };
  }

  _spawn(index = _pid) {
    const s = this.arena.spawns[index % this.arena.spawns.length];
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
    const wid = PRESENTATION_WEAPONS.has(msg.wid) ? msg.wid : p.wid;
    p.queue.push({ seq: msg.seq, inp, wid, aiming: !!msg.aiming });
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
    const requestedWid = WEAPONS[msg.wid] ? msg.wid : 'm4';
    const requestedWeapon = WEAPONS[requestedWid];
    // Carry fractional tick debt only inside one continuous burst. Otherwise a
    // long idle period could bank negative cooldown and double-tap the first
    // two rounds faster than the weapon's real cadence.
    const burstGap = Math.ceil(requestedWeapon.rate * TICK_HZ) + 1;
    if (this.tick - p.lastFireRequestTick > burstGap) p.fireCooldown = 0;
    p.lastFireRequestTick = this.tick;
    // Hold a "firing" flag for ~0.4s so other clients can shoulder this
    // player's rifle and show the recoil, not just hear about the hit.
    p._firingTicks = 8;
    p.fireReq = { wid: requestedWid,
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

  _hitscan(shooter, w, yaw, pitch, aiming = false) {
    // Rewind targets to the shooter's acked tick (lag compensation).
    const rewind = shooter.ackTick;
    const ox = shooter.state.px, oy = shooter.state.py + HEAD_Y, oz = shooter.state.pz;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dx = -Math.sin(yaw) * cp, dy = sp, dz = -Math.cos(yaw) * cp;

    for (let pellet = 0; pellet < w.pellets; pellet++) {
      // deterministic-ish spread from tick+pellet (server-authoritative)
      const baseSpread = w.spread ?? Math.max(w.spreadMin || 0, shooter.gunBloom || 0);
      const spread = baseSpread * (aiming ? (w.zoomSpreadMod ?? 0.45) : 1);
      const a = (this._rand(shooter.id * 131 + this.tick * 7 + pellet) - 0.5) * spread;
      const b = (this._rand(shooter.id * 977 + this.tick * 13 + pellet) - 0.5) * spread;
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
      if (best && rayVsBoxes(this.simWorld, ox, oy, oz, rx, ry, rz, best.t2) < best.t2 - 0.05) continue;
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
      target._lastSprint = false;
      target._lastAim = false;
      target._animVX = target._animVZ = 0;
      target._firingTicks = 0;
      target.deadUntil = this.tick + RESPAWN_TICKS;
      target.deaths++;
      if (target !== shooter) {
        shooter.kills++;
        shooter.score += head ? 150 : 100;
      }
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

    if (kind === 'frag') {
      this.frags.push({ by: p.id, x: bx, y: by, z: bz,
                        until: this.tick + Math.round(A.fuseSec * TICK_HZ) });
    } else if (kind === 'smoke') {
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

  _explodeFrag(frag) {
    const shooter = this.players.get(frag.by);
    if (!shooter) return;
    const A = ABILITIES.frag;
    for (const target of this.players.values()) {
      if (!target.alive) continue;
      const tx = target.state.px - frag.x;
      const ty = (target.state.py + 0.9) - frag.y;
      const tz = target.state.pz - frag.z;
      const distance = Math.hypot(tx, ty, tz);
      if (distance > A.radius) continue;
      const length = distance || 1e-6;
      const blocked = rayVsBoxes(
        this.simWorld, frag.x, frag.y, frag.z,
        tx / length, ty / length, tz / length, length,
      ) < length - 0.1;
      if (blocked) continue;
      const falloff = 1 - 0.9 * clamp(distance / A.radius, 0, 1);
      this._damage(target, shooter, A.damage * falloff, false);
    }
    this.events.push({ e: 'explosion', kind: 'frag', by: shooter.id,
                       x: frag.x, y: frag.y, z: frag.z, r: A.radius });
  }

  // advance one authoritative tick
  update() {
    this.tick++;
    this.events.length = 0;
    const rotated = this._rotateMatch();

    // expire finished smoke volumes
    if (this.smokes.length) this.smokes = this.smokes.filter((s) => this.tick < s.until);
    if (this.frags.length) {
      const due = this.frags.filter((frag) => this.tick >= frag.until);
      this.frags = this.frags.filter((frag) => this.tick < frag.until);
      for (const frag of due) this._explodeFrag(frag);
    }

    for (const p of this.players.values()) {
      const equipped = WEAPONS[p.wid] || WEAPONS.m4;
      p.fireCooldown = Math.max(
        -(equipped.rate || 0.12),
        p.fireCooldown - 1 / TICK_HZ,
      );
      p.gunBloom = Math.max(
        equipped.spreadMin || 0,
        (p.gunBloom || 0) - (equipped.bloomRecovery || 0) / TICK_HZ,
      );
      p.abilityCD = Math.max(0, p.abilityCD - 1 / TICK_HZ);

      if (!p.alive) {
        if (this.tick >= p.deadUntil) {
          const s = this._spawn();
          p.state = createState(s[0], s[1], s[2]);
          p.health = START_HEALTH; p.shield = p.maxShield;
          p.mag = (WEAPONS[p.wid] || WEAPONS.m4).mag;
          p.alive = true; p.queue.length = 0;
          p._lastSprint = false;
          p._animVX = p._animVZ = 0;
          p._lastAim = false;
          p._firingTicks = 0;
          p._botReloadUntil = 0;
          p.gunBloom = 0;
          p.blindUntil = 0;
          p.abilities = { frag: ABILITIES.frag.charges, flash: ABILITIES.flash.charges, smoke: ABILITIES.smoke.charges,
                          impulse: ABILITIES.impulse.charges };
          this.events.push({ e: 'respawn', id: p.id, x: s[0], y: s[1], z: s[2] });
        }
        this._record(p);
        continue;
      }

      // consume the next queued input (or coast with zero-move if starved)
      let cmd = p.isBot ? this._driveBot(p) : p.queue.shift();
      if (!cmd) {
        cmd = { seq: p.lastInputSeq, inp: makeInput({ yaw: p._lastYaw ?? 0 }) };
      }
      // reject inputs that claim to be too far in the future (schema guard)
      const previousState = p.state;
      const sprinting = isSprinting(previousState, cmd.inp);
      p.state = step(previousState, cmd.inp, this.simWorld);
      if (this.arena.resolveState) p.state = this.arena.resolveState(previousState, p.state);
      p.ackTick = cmd.seq;
      p._lastYaw = cmd.inp.yaw;
      p.wid = cmd.wid || p.wid;
      p._lastAim = !!cmd.aiming;
      // Public animation velocity is resolved displacement, not requested
      // velocity, so a player pinned against a wall does not run in place.
      const dx = p.state.px - previousState.px;
      const dz = p.state.pz - previousState.pz;
      const distance = Math.hypot(dx, dz);
      const padJump = p.state.padCD > previousState.padCD + 0.5;
      const regularStep = distance < 2 && !cmd.inp.teleJust && !padJump;
      const resolvedSpeed = distance * TICK_HZ;
      p._animVX = regularStep ? dx * TICK_HZ : 0;
      p._animVZ = regularStep ? dz * TICK_HZ : 0;
      p._lastSprint = sprinting && regularStep && resolvedSpeed > 6.5;
      // Pitch is client-owned look state — the sim doesn't use it, but remote
      // avatars need it or everyone renders as aiming flat at the horizon.
      if (Number.isFinite(cmd.inp.pitch)) p._lastPitch = cmd.inp.pitch;
      if (p._firingTicks > 0) p._firingTicks--;
      this._record(p);
    }

    // resolve fire requests AFTER movement + history record, so hitscan sees
    // this tick's positions and events land in this tick's snapshot.
    for (const p of this.players.values()) {
      if (!p.fireReq || !p.alive) { p.fireReq = null; continue; }
      const req = p.fireReq; p.fireReq = null;
      if (p.fireCooldown > 0 || p.mag <= 0) continue;   // authority: rate + ammo
      const w = WEAPONS[req.wid] || WEAPONS.m4;
      if (p.isBot && req.botTargetId != null) {
        const target = this.players.get(req.botTargetId);
        if (target?.alive) {
          const tx = target.state.px - p.state.px;
          const tz = target.state.pz - p.state.pz;
          req.yaw = Math.atan2(-tx, -tz);
          req.pitch = Math.atan2(
            (target.state.py + HEAD_Y) - (p.state.py + HEAD_Y),
            Math.max(0.001, Math.hypot(tx, tz)),
          );
        }
      }
      p.wid = req.wid;
      p.fireCooldown = Math.max(-w.rate, p.fireCooldown) + w.rate;
      p.mag--;
      this._hitscan(p, w, req.yaw, req.pitch, p._lastAim);
      if (w.spreadMax != null) {
        p.gunBloom = Math.min(w.spreadMax, (p.gunBloom || 0) + (w.bloomShot || 0));
      }
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
        yaw: p._lastYaw ?? 0, pitch: p._lastPitch ?? 0,
        vx: p._animVX, vy: p.state.vy, vz: p._animVZ,
        onGround: p.state.onGround, crouch: p.state.crouch,
        slide: p.state.slide, sprint: !!p._lastSprint, wid: p.wid,
        aiming: !!p._lastAim,
        firing: (p._firingTicks ?? 0) > 0, alive: p.alive,
        health: p.health, shield: p.shield,
        kills: p.kills, deaths: p.deaths, score: p.score,
      });
    }
    const smokeList = this.smokes.map((s) => ({ x: s.x, y: s.y, z: s.z, r: s.r }));
    for (const p of this.players.values()) {
      p.send({
        t: 'snapshot', tick: now, ack: p.ackTick,
        mapId: this.arena.id,
        mapName: this.arena.name,
        matchStart: this.matchStart,
        matchDurationMs: this.matchDurationMs,
        arena: rotated ? this._arenaPayload() : undefined,
        you: { x: p.state.px, y: p.state.py, z: p.state.pz,
               vx: p.state.vx, vy: p.state.vy, vz: p.state.vz,
               eye: p.state.eye,
               onGround: p.state.onGround, crouch: p.state.crouch,
               slide: p.state.slide, slideT: p.state.slideT,
               slideDx: p.state.slideDx, slideDz: p.state.slideDz,
               stamina: p.state.stamina, stamDelay: p.state.stamDelay,
               coyote: p.state.coyote, teleCD: p.state.teleCD, padCD: p.state.padCD,
               nX: p.state.nX, nY: p.state.nY, nZ: p.state.nZ,
               safeX: p.state.safeX, safeY: p.state.safeY, safeZ: p.state.safeZ,
               sprint: !!p._lastSprint,
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
