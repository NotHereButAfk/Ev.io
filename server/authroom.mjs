// Authoritative room (Phase 4 + 5) — fixed-20Hz server-owned simulation.
//
// Runs the SAME deterministic MoveSim the client predicts with, so server and
// client agree tick-for-tick. Owns every gameplay truth: position (validated
// against the sim, never trusted from the client), health/shield, damage,
// death, respawn, match timer, score, and the kill feed. Hitscan is
// lag-compensated by rewinding target positions to the snapshot the shooter saw.
//
// Wire protocol (JSON messages):
//   client → server:
//     {t:'hello', name}                         join
//     {t:'input', seq, tick, mx,mz,yaw,pitch,   one command per client tick
//                 sprint,crouch,jump,crouchDown,tele}
//     {t:'fire', seq, wid, yaw, pitch, viewTick} fire request (server hitscans)
//     {t:'reload', wid}                         reload request (server owns ammo)
//     {t:'ability', seq, kind, yaw, pitch}      throwable request
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
import { STAMINA_MAX } from '../src/sim/MovementConfig.js';
import { HEALTH_REGEN_DELAY, HEALTH_REGEN_RATE } from '../src/core/CombatConfig.js';
import {
  BOT_DASH,
  BOT_RETALIATION_AIM_SCALE,
  BOT_STATES,
  botAimErrorMeters,
  botDashBonusSpeed,
  botSeparationVector,
  chooseReachableRoamPoint,
  getBotDifficulty,
  isBotDashLaneSafe,
  isInsideBotFov,
  smoothBotAim,
} from '../src/entities/BotCombat.js';
import { randomBotName } from '../src/entities/BotNames.js';
import {
  MAIN_WEAPON_IDS,
  WEAPONS as CLIENT_WEAPONS,
  isMatchPickupWeaponId,
} from '../src/weapons/weaponDefs.js';
import { AUTHORED_WEAPON_BY_KIND } from '../src/world/PickupLayout.js';
import { IMPORTED_ARENAS } from './rookarena.mjs';

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;

export function botPresentationYaw(aimYaw, vx, vz) {
  const speed = Math.hypot(vx, vz);
  if (speed < 0.2) return aimYaw;

  // The weapon/upper body receives `aimYaw` separately. Let the visible body
  // follow resolved lateral travel so the pelvis is not twisted 90 degrees
  // underneath a forward-facing torso while a bot changes cover or circles at
  // close range. Keep facing the opponent only during a genuine retreat: that
  // produces an ordinary backpedal instead of making the soldier turn its back
  // on the fight.
  const nx = vx / speed, nz = vz / speed;
  const aimForwardX = -Math.sin(aimYaw);
  const aimForwardZ = -Math.cos(aimYaw);
  const forwardDot = nx * aimForwardX + nz * aimForwardZ;
  if (forwardDot < -0.35) return aimYaw;
  return Math.atan2(-nx, -nz);
}

const RESPAWN_TICKS = TICK_HZ * 3;          // 3s
const SPAWN_PROTECTION_TICKS = Math.ceil(TICK_HZ * 1.5);
const MAX_INPUT_QUEUE = 8;                  // drop floods; catch-up caps here
const INPUT_LEAD_TICKS = 6;                 // how far ahead of server tick we allow
const HISTORY_TICKS = 20;                   // 1s of position history for lag-comp
const START_HEALTH = 100, START_SHIELD = 0;

// Derive authority from the same catalog used by the client. The old
// five-entry table silently converted every other shipped weapon into an M4.
const WEAPONS = Object.fromEntries(CLIENT_WEAPONS.map((weapon) => [weapon.id, {
  kind: weapon.kind,
  dmg: weapon.damage,
  rate: weapon.fireRate,
  spread: weapon.spread,
  spreadMin: weapon.spreadMin,
  spreadMax: weapon.spreadMax,
  bloomShot: weapon.spreadBloomPerShot,
  bloomRecovery: weapon.spreadRecovery,
  zoomSpreadMod: weapon.zoomSpreadMod,
  pellets: weapon.pellets || 1,
  range: weapon.range,
  hs: weapon.headshotMultiplier || 1,
  splashRadius: weapon.splashRadius || 0,
  splashMin: weapon.splashMin ?? 0.25,
  rocketSpeed: weapon.rocketSpeed || 0,
  reload: weapon.reloadTime || 0,
  mag: weapon.magSize || 0,
  reserve: weapon.reserveMax || 0,
  arc: weapon.arc || 0,
}]));
const BASE_WEAPONS = new Set([...MAIN_WEAPON_IDS, 'sword']);
const WEAPON_COLLECT_RADIUS = 2.0;
const WEAPON_COLLECT_HEIGHT = 2.2;
const HEAD_Y = 1.55, BODY_R = 0.5, HEAD_R = 0.28;

// Server-authoritative throwable abilities (Phase 10). The server owns charges,
// cooldown, the detonation point, and every effect — the client only requests.
//   flash:   LOS-gated blind on players inside the radius
//   smoke:   a vision volume that blocks hitscan for its lifetime
//   impulse: radial knockback velocity (clamped so it can't launch to infinity)
const ABILITIES = {
  frag:    { cd: 1.5, charges: 2, throwRange: 24, radius: 6.5, damage: 80, fuseSec: 2.5 },
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

// Select from the safest authored tier relative to every living combatant.
// Vertical separation is deliberately discounted: a bot one floor above is
// still a dangerous spawn neighbour in an arena shooter.
export function chooseSafeSpawn(spawns, occupants = [], seed = 0) {
  if (!spawns?.length) return [0, 0, 0];
  if (!occupants.length) return [...spawns[Math.abs(seed) % spawns.length]];
  const scored = spawns.map((spawn, index) => {
    let nearest = Infinity;
    for (const occupant of occupants) {
      const dx = spawn[0] - occupant[0];
      const dy = spawn[1] - occupant[1];
      const dz = spawn[2] - occupant[2];
      nearest = Math.min(nearest, dx * dx + dz * dz + dy * dy * 0.2);
    }
    return { spawn, index, nearest };
  }).sort((a, b) => b.nearest - a.nearest || a.index - b.index);
  const best = scored[0]?.nearest ?? 0;
  const threshold = Math.max(12 * 12, best * 0.72);
  let tier = scored.filter((entry) => entry.nearest >= threshold);
  if (!tier.length) tier = scored.slice(0, 1);
  tier = tier.slice(0, Math.max(1, Math.ceil(scored.length / 3)));
  return [...tier[Math.abs(seed) % tier.length].spawn];
}

export class AuthRoom {
  constructor(arena = IMPORTED_ARENAS, {
    targetPopulation = 0,
    botDifficulty = 'normal',
    botDifficultyOverrides = null,
  } = {}) {
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
    this._arenaBroadcastUntilTick = -1;
    const requestedPopulation = Number.isFinite(targetPopulation) ? targetPopulation | 0 : 0;
    this.targetPopulation = clamp(requestedPopulation, 0, 8);
    this.botDifficultyName = botDifficulty;
    this.botDifficulty = getBotDifficulty(botDifficulty, botDifficultyOverrides);
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
      killY: this.arena.killY,
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
    // Repeat the collision/map payload for five seconds. A congested client
    // may skip an individual snapshot; map identity must never advance without
    // the matching simulation geometry.
    this._arenaBroadcastUntilTick = this.tick + TICK_HZ * 5;
    this.smokes.length = 0;
    this.frags.length = 0;

    // A fresh round gets a fresh set of readable bot identities while human
    // names stay untouched. The same names then flow through snapshots and the
    // final leaderboard for the whole round.
    const usedNames = new Set(
      Array.from(this.players.values()).filter((player) => !player.isBot).map((player) => player.name),
    );
    for (const player of this.players.values()) {
      if (player.isBot) player.name = randomBotName(usedNames);
    }

    let spawnIndex = 0;
    for (const player of this.players.values()) {
      const spawn = this._spawn(spawnIndex++, null, false);
      player.state = createState(spawn[0], spawn[1], spawn[2]);
      player.queue.length = 0;
      player.history.length = 0;
      player.health = START_HEALTH;
      player.healthRegenDelay = 0;
      player.shield = player.maxShield;
      player.alive = true;
      player.deadUntil = 0;
      player.kills = 0;
      player.deaths = 0;
      player.score = 0;
      player.wid = 'm4';
      player.matchWeapons.clear();
      player.mag = WEAPONS.m4.mag;
      player.ammo = { m4: { mag: WEAPONS.m4.mag, reserve: WEAPONS.m4.reserve } };
      player.reloadUntil = 0;
      player.reloadWid = null;
      player.invulnerableUntil = this.tick + SPAWN_PROTECTION_TICKS;
      player._swingStart = player._swingUntil = 0;
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
      if (player.isBot) this._resetBotAI(player);
    }
    this.events.push({ e: 'map', id: this.arena.id, name: this.arena.name });
    return true;
  }

  // Add a HUMAN-controlled player (a real socket).
  add(send, name) {
    // A real player always gets a seat. Remove one server bot first when the
    // advertised room is full. Guests are real socket players and replace bots
    // exactly like signed-in players.
    if (this.targetPopulation && this.players.size >= this.targetPopulation) {
      const bot = Array.from(this.players.values()).find((p) => p.isBot);
      if (bot) this._remove(bot.id, false);
      else { send({ t: 'kick', reason: 'match full' }); return null; }
    }
    const id = this._add(send, name, false);
    this._rebalanceBots();
    return id;
  }

  // Add a clearly-labelled BOT for gameplay/load/stability testing. isBot
  // rides the roster + every snapshot so no client can ever be shown a bot as
  // a human (Phase 11: no fake-human surfaces).
  addBot(name) { return this._add(() => {}, name, true); }

  _fillBotSlots() {
    this._rebalanceBots();
  }

  _rebalanceBots() {
    if (!this.targetPopulation) return;
    const humans = Array.from(this.players.values()).filter((player) => !player.isBot).length;
    const desiredBots = Math.max(0, this.targetPopulation - humans);
    const bots = Array.from(this.players.values()).filter((player) => player.isBot);
    while (bots.length > desiredBots) {
      const bot = bots.pop();
      this._remove(bot.id, false);
    }
    while (bots.length < desiredBots) {
      this._botSerial++;
      const usedNames = new Set(Array.from(this.players.values()).map((player) => player.name));
      const id = this.addBot(randomBotName(usedNames));
      bots.push(this.players.get(id));
    }
  }

  _add(send, name, isBot) {
    const id = _pid++;
    const spawn = this._spawn(id, id, true);
    const p = {
      id, send, name, isBot: !!isBot,
      state: createState(spawn[0], spawn[1], spawn[2]),
      lastInputSeq: 0, ackTick: 0,
      queue: [],
      health: START_HEALTH, shield: START_SHIELD, maxShield: START_SHIELD,
      healthRegenDelay: 0,
      alive: true, deadUntil: 0, kills: 0, deaths: 0, score: 0,
      wid: 'm4', mag: WEAPONS.m4.mag, fireCooldown: 0, gunBloom: 0,
      ammo: { m4: { mag: WEAPONS.m4.mag, reserve: WEAPONS.m4.reserve } },
      matchWeapons: new Set(),
      reloadUntil: 0, reloadWid: null,
      invulnerableUntil: this.tick + SPAWN_PROTECTION_TICKS,
      _swingStart: 0, _swingUntil: 0,
      _lastSprint: false, _lastAim: false, _animVX: 0, _animVZ: 0,
      _botReloadUntil: 0,
      history: [],               // [{tick, x,y,z,eye,crouch,slide}]
      lastFireSeq: 0, lastFireRequestTick: -Infinity,
      abilities: { frag: ABILITIES.frag.charges, flash: ABILITIES.flash.charges, smoke: ABILITIES.smoke.charges,
                   impulse: ABILITIES.impulse.charges },
      abilityCD: 0, blindUntil: 0, lastAbilitySeq: 0, abilityReq: null,
    };
    this.players.set(id, p);
    if (p.isBot) this._resetBotAI(p);
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

  _resetBotAI(p) {
    p._botState = p.alive ? BOT_STATES.ROAM : BOT_STATES.DEAD;
    p._botHostility = new Map();
    p._botIgnoredUntil = new Map();
    p._botTargetId = null;
    p._botTargetSince = 0;
    p._botLastSeenTick = -Infinity;
    p._botLastSeen = null;
    p._botReactionUntil = 0;
    p._botNextScanTick = this.tick + (p.id % 5);
    p._botNextDecisionTick = this.tick;
    p._botNextLosTick = this.tick;
    p._botLosTargetId = null;
    p._botLosCache = false;
    p._botStrafe = this._rand(p.id * 71 + this.tick) < 0.5 ? -1 : 1;
    p._botRoamTarget = null;
    p._botRoamUntil = 0;
    p._botStuckTicks = 0;
    p._botLastX = p.state.px;
    p._botLastZ = p.state.pz;
    p._botAimYaw = p._lastYaw ?? 0;
    p._botAimPitch = p._lastPitch ?? 0;
    p._botNextShotTick = this.tick;
    p._botBurstRemaining = 2 + Math.floor(this._rand(p.id * 193 + this.tick) * 3);
    p._botDashTicks = 0;
    p._botDashX = 0;
    p._botDashZ = 0;
    p._botDashStarts = 0;
    p._botHoldGroundTargetId = null;
    p._botNextDashTick = this.tick + Math.ceil(
      (0.65 + this._rand(p.id * 239 + this.tick) * 0.75) * TICK_HZ,
    );
  }

  _provokeBot(bot, attacker, forceSwitch = true) {
    if (!bot?.isBot || !bot.alive || !attacker || attacker === bot || !attacker.alive) return;
    const cfg = this.botDifficulty;
    const memoryTicks = Math.ceil((cfg.focusDuration + cfg.searchDuration) * TICK_HZ);
    bot._botHostility ||= new Map();
    bot._botHostility.set(attacker.id, this.tick + memoryTicks);
    bot._botLastSeen = { x: attacker.state.px, y: attacker.state.py, z: attacker.state.pz };
    bot._botLastSeenTick = this.tick;
    bot._botHoldGroundTargetId = attacker.id;
    bot._botDashTicks = 0;
    bot._botDashX = 0;
    bot._botDashZ = 0;

    const current = this.players.get(bot._botTargetId);
    const currentDistance = current
      ? Math.hypot(current.state.px - bot.state.px, current.state.pz - bot.state.pz) : Infinity;
    const attackerDistance = Math.hypot(attacker.state.px - bot.state.px, attacker.state.pz - bot.state.pz);
    if (!current || forceSwitch || attackerDistance < currentDistance * cfg.targetSwitchRatio) {
      bot._botTargetId = attacker.id;
      bot._botTargetSince = this.tick;
      bot._botReactionUntil = this.tick + this._botReactionTicks(bot);
      bot._botState = BOT_STATES.REACT;
      bot._botNextLosTick = this.tick;
    }
  }

  _botReactionTicks(p) {
    const cfg = this.botDifficulty;
    const r = this._rand(p.id * 421 + this.tick * 13);
    return Math.ceil((cfg.reactionMin + (cfg.reactionMax - cfg.reactionMin) * r) * TICK_HZ);
  }

  _botCanSee(p, target, ignoreFov = false) {
    if (!target?.alive || this.tick < (target.invulnerableUntil || 0)) return false;
    const cfg = this.botDifficulty;
    const dx = target.state.px - p.state.px;
    const dz = target.state.pz - p.state.pz;
    const distance = Math.hypot(dx, dz);
    if (distance > cfg.detectionDistance) return false;
    if (!ignoreFov && !isInsideBotFov(p._botAimYaw ?? p._lastYaw ?? 0, dx, dz, cfg.fovDegrees)) return false;
    const dy = (target.state.py + HEAD_Y) - (p.state.py + HEAD_Y);
    const length = Math.hypot(dx, dy, dz) || 1e-6;
    return rayVsBoxes(
      this.simWorld, p.state.px, p.state.py + HEAD_Y, p.state.pz,
      dx / length, dy / length, dz / length, length,
    ) >= length - 0.6;
  }

  _pickBotRoamTarget(p) {
    let sample = 0;
    return chooseReachableRoamPoint({
      x: p.state.px, y: p.state.py, z: p.state.pz,
      half: this.arena.half, killY: this.arena.killY,
      random: () => this._rand(p.id * 997 + this.tick * 31 + sample++ * 101),
      groundHeightAt: this.arena.groundHeightAt,
      raycast: this.arena.raycast,
    }) || [p.state.px, p.state.py, p.state.pz];
  }

  _separateBotMove(p, moveX, moveZ, yaw) {
    const separation = botSeparationVector({
      x: p.state.px,
      z: p.state.pz,
      id: p.id,
      neighbors: this.players.values(),
      botsOnly: true,
    });
    if (separation.strength <= 0.01) return [moveX, moveZ];

    const length = Math.hypot(moveX, moveZ) || 1;
    let worldX = Math.sin(yaw) * -(moveZ / length)
      + Math.sin(yaw + Math.PI / 2) * (moveX / length);
    let worldZ = Math.cos(yaw) * -(moveZ / length)
      + Math.cos(yaw + Math.PI / 2) * (moveX / length);
    const influence = 0.72 + separation.strength * 0.92;
    worldX += separation.x * influence;
    worldZ += separation.z * influence;
    const worldLength = Math.hypot(worldX, worldZ) || 1;
    worldX /= worldLength;
    worldZ /= worldLength;

    return [
      Math.cos(yaw) * worldX - Math.sin(yaw) * worldZ,
      -Math.sin(yaw) * worldX - Math.cos(yaw) * worldZ,
    ];
  }

  _driveBot(p) {
    const cfg = this.botDifficulty;
    const seq = ++p.lastInputSeq;
    const secondsToTicks = (seconds) => Math.max(1, Math.ceil(seconds * TICK_HZ));

    // Expire grudges and focus cooldowns on the low-frequency scan cadence.
    if (this.tick >= p._botNextScanTick) {
      p._botNextScanTick = this.tick + secondsToTicks(cfg.scanInterval);
      for (const [id, until] of p._botHostility) if (until <= this.tick) p._botHostility.delete(id);
      for (const [id, until] of p._botIgnoredUntil) if (until <= this.tick) p._botIgnoredUntil.delete(id);

      const focusExpired = p._botTargetId != null
        && this.tick - p._botTargetSince >= secondsToTicks(cfg.focusDuration);
      if (focusExpired) {
        if (p._botHoldGroundTargetId === p._botTargetId) p._botHoldGroundTargetId = null;
        p._botIgnoredUntil.set(p._botTargetId, this.tick + secondsToTicks(2));
        p._botTargetId = null;
      }

      const current = this.players.get(p._botTargetId);
      const currentDistance = current?.alive
        ? Math.hypot(current.state.px - p.state.px, current.state.pz - p.state.pz) : Infinity;
      let best = null;
      let bestDistance = Infinity;
      for (const candidate of this.players.values()) {
        const id = candidate.id;
        const isArenaOpponent = candidate.isBot;
        if (!isArenaOpponent && !p._botHostility.has(id)) continue;
        if (p._botIgnoredUntil.has(id)) continue;
        if (!candidate?.alive || candidate === p) continue;
        const dx = candidate.state.px - p.state.px;
        const dz = candidate.state.pz - p.state.pz;
        const distance = Math.hypot(dx, dz);
        if (distance >= bestDistance || distance > cfg.detectionDistance) continue;
        if (!this._botCanSee(p, candidate, candidate.id === p._botTargetId)) continue;
        best = candidate;
        bestDistance = distance;
      }
      const shouldSwitch = best && (!current || best.id === current.id
        || bestDistance < currentDistance * cfg.targetSwitchRatio);
      if (shouldSwitch && best.id !== p._botTargetId) {
        if (best.isBot) p._botHostility.set(best.id,
          this.tick + secondsToTicks(cfg.focusDuration + cfg.searchDuration));
        p._botTargetId = best.id;
        p._botHoldGroundTargetId = null;
        p._botTargetSince = this.tick;
        p._botReactionUntil = this.tick + this._botReactionTicks(p);
        p._botState = BOT_STATES.REACT;
      }
    }

    let target = this.players.get(p._botTargetId);
    if (!target?.alive || !p._botHostility.has(target.id)) {
      if (p._botHoldGroundTargetId === p._botTargetId) p._botHoldGroundTargetId = null;
      p._botTargetId = null;
      target = null;
    }

    let hasVisual = false;
    if (target && this.tick >= p._botNextLosTick) {
      p._botNextLosTick = this.tick + secondsToTicks(cfg.losInterval);
      p._botLosTargetId = target.id;
      p._botLosCache = this._botCanSee(p, target, true);
      if (p._botLosCache) {
        p._botLastSeen = { x: target.state.px, y: target.state.py, z: target.state.pz };
        p._botLastSeenTick = this.tick;
        p._botHostility.set(target.id, this.tick + secondsToTicks(cfg.focusDuration + cfg.searchDuration));
      }
    }
    hasVisual = !!target && p._botLosTargetId === target.id && p._botLosCache;

    if (target && !hasVisual
      && this.tick - p._botLastSeenTick > secondsToTicks(cfg.searchDuration)) {
      p._botIgnoredUntil.set(target.id, this.tick + secondsToTicks(1.5));
      p._botTargetId = null;
      target = null;
      p._botState = BOT_STATES.ROAM;
    }

    if (!target) {
      p._botHoldGroundTargetId = null;
      p._botState = BOT_STATES.ROAM;
      if (!p._botRoamTarget || this.tick >= p._botRoamUntil
        || Math.hypot(p._botRoamTarget[0] - p.state.px, p._botRoamTarget[2] - p.state.pz) < 1.5) {
        p._botRoamTarget = this._pickBotRoamTarget(p);
        p._botRoamUntil = this.tick + secondsToTicks(7 + this._rand(p.id * 59 + this.tick) * 5);
      }
      const dx = p._botRoamTarget[0] - p.state.px;
      const dz = p._botRoamTarget[2] - p.state.pz;
      let yaw = Math.atan2(-dx, -dz);
      const blocked = rayVsBoxes(
        this.simWorld, p.state.px, p.state.py + 0.8, p.state.pz,
        -Math.sin(yaw), 0, -Math.cos(yaw), 2.2,
      ) < 2.0;
      let moveX = blocked ? p._botStrafe : 0;
      let moveZ = blocked ? 0.35 : 1;
      [moveX, moveZ] = this._separateBotMove(p, moveX, moveZ, yaw);
      if (!this._botGroundSafe(p, moveX, moveZ, yaw)) {
        const alternatives = [[-p._botStrafe, 0], [p._botStrafe, 0], [0, -1]];
        const safe = alternatives.find(([mx, mz]) => this._botGroundSafe(p, mx, mz, yaw));
        [moveX, moveZ] = safe || [0, 0];
      }
      if (this.tick >= p._botNextDecisionTick) {
        p._botNextDecisionTick = this.tick + secondsToTicks(cfg.decisionInterval);
        if (this._rand(p.id * 83 + this.tick) < 0.28) p._botStrafe *= -1;
        const moved = Math.hypot(p.state.px - p._botLastX, p.state.pz - p._botLastZ);
        p._botStuckTicks = moved < 0.2 ? p._botStuckTicks + 1 : 0;
        p._botLastX = p.state.px; p._botLastZ = p.state.pz;
        if (p._botStuckTicks >= 2) {
          p._botRoamTarget = null;
          p._botStuckTicks = 0;
          moveX = p._botStrafe;
        }
      }
      p._botAimYaw = smoothBotAim(p._botAimYaw, yaw, cfg.aimTurnSpeed * 0.75, 1 / TICK_HZ);
      // Bots use sprint whenever a verified patrol lane points forward. Their
      // difficulty still controls decisions and aim, not whether they cross
      // the map at an active running pace.
      const sprintWindow = moveZ > 0;
      // Roaming jumps are rare flourishes. Obstacles and stuck states are
      // solved by selecting a new verified lane instead of bunny-hopping.
      const jump = p.state.onGround && !blocked
        && this._rand(p.id * 733 + this.tick) < (cfg.jumpChance * 0.12) / TICK_HZ;
      const dashing = this._botDashCommand(p, moveX, moveZ, p._botAimYaw);
      return { seq, inp: makeInput({ mx: moveX, mz: moveZ, yaw: p._botAimYaw, sprint: sprintWindow, jumpJust: jump }), wid: p.wid, aiming: false, botDash: dashing };
    }

    const aimPoint = hasVisual ? target.state : p._botLastSeen;
    const targetX = aimPoint.px ?? aimPoint.x;
    const targetY = aimPoint.py ?? aimPoint.y;
    const targetZ = aimPoint.pz ?? aimPoint.z;
    const realDx = targetX - p.state.px;
    const realDz = targetZ - p.state.pz;
    const distance = Math.hypot(realDx, realDz);
    const desiredYaw = Math.atan2(-realDx, -realDz);
    const desiredPitch = Math.atan2((targetY + HEAD_Y) - (p.state.py + HEAD_Y), Math.max(0.001, distance));
    p._botAimYaw = smoothBotAim(p._botAimYaw, desiredYaw, cfg.aimTurnSpeed, 1 / TICK_HZ);
    p._botAimPitch += (desiredPitch - p._botAimPitch) * (1 - Math.exp(-cfg.aimTurnSpeed / TICK_HZ));

    if (this.tick < p._botReactionUntil) p._botState = BOT_STATES.REACT;
    else p._botState = hasVisual ? BOT_STATES.ENGAGE : BOT_STATES.SEARCH;

    const holdGround = p._botHoldGroundTargetId === target.id;

    if (this.tick >= p._botNextDecisionTick) {
      p._botNextDecisionTick = this.tick + secondsToTicks(cfg.decisionInterval);
      if (this._rand(p.id * 137 + this.tick) < cfg.strafeChance) p._botStrafe *= -1;
    }
    let moveX = holdGround ? 0 : (hasVisual ? p._botStrafe : p._botStrafe * 0.18);
    let moveZ = holdGround ? 0 : (!hasVisual ? 1 : distance > 13 ? 1 : distance < 5 ? -1 : 0.15);
    if (!holdGround) [moveX, moveZ] = this._separateBotMove(p, moveX, moveZ, p._botAimYaw);
    if (!holdGround && !this._botGroundSafe(p, moveX, moveZ, p._botAimYaw)) {
      const alternatives = [[-p._botStrafe, 0], [0, -1], [0, 0]];
      const safe = alternatives.find(([mx, mz]) => this._botGroundSafe(p, mx, mz, p._botAimYaw));
      [moveX, moveZ] = safe || [0, 0];
    }

    if (p.mag <= 0) this._startReload(p, p.wid);
    const aimDelta = Math.abs(((desiredYaw - p._botAimYaw + Math.PI) % (Math.PI * 2)) - Math.PI);
    const canFire = hasVisual && this.tick >= p._botReactionUntil && aimDelta < 0.28
      && distance < cfg.detectionDistance && p.fireCooldown <= 0
      && p.reloadUntil <= this.tick && p.mag > 0 && this.tick >= p._botNextShotTick;
    if (canFire) {
      this.onFire(p.id, { seq: p.lastFireSeq + 1, wid: p.wid, yaw: p._botAimYaw, pitch: p._botAimPitch });
      if (p.fireReq) {
        p.fireReq.botTargetId = target.id;
        p.fireReq.botRetaliating = holdGround;
      }
      p._botBurstRemaining--;
      const weaponTicks = Math.max(1, Math.ceil((WEAPONS[p.wid]?.rate || 0.2) * TICK_HZ));
      if (p._botBurstRemaining <= 0) {
        p._botBurstRemaining = 2 + Math.floor(this._rand(p.id * 509 + this.tick) * 3);
        p._botNextShotTick = this.tick + weaponTicks * (3 + Math.floor(this._rand(p.id * 557 + this.tick) * 3));
      } else p._botNextShotTick = this.tick + weaponTicks;
    }
    const jump = !holdGround && p.state.onGround && hasVisual
      && this._rand(p.id * 877 + this.tick) < cfg.jumpChance / TICK_HZ;
    const dashing = holdGround ? false : this._botDashCommand(p, moveX, moveZ, p._botAimYaw);
    return {
      seq,
      inp: makeInput({ mx: moveX, mz: moveZ, yaw: p._botAimYaw, pitch: p._botAimPitch,
        sprint: !holdGround && distance > cfg.combatSprintDistance / cfg.movementSpeed, jumpJust: jump }),
      wid: p.wid,
      aiming: hasVisual && distance < cfg.detectionDistance * 0.8,
      botDash: dashing,
    };
  }

  _botDashCommand(p, mx, mz, yaw) {
    if (p._botDashTicks > 0) return true;
    if (!p.state.onGround || this.tick < p._botNextDashTick || Math.hypot(mx, mz) < 0.25) return false;

    const length = Math.hypot(mx, mz) || 1;
    const inputX = mx / length;
    const inputZ = mz / length;
    const worldX = Math.sin(yaw) * -inputZ + Math.sin(yaw + Math.PI / 2) * inputX;
    const worldZ = Math.cos(yaw) * -inputZ + Math.cos(yaw + Math.PI / 2) * inputX;
    const safe = isBotDashLaneSafe({
      x: p.state.px,
      y: p.state.py,
      z: p.state.pz,
      dx: worldX,
      dz: worldZ,
      killY: this.arena.killY,
      groundHeightAt: this.arena.groundHeightAt,
      raycast: this.arena.raycast
        || ((ox, oy, oz, dx, dy, dz, far) => rayVsBoxes(
          this.simWorld, ox, oy, oz, dx, dy, dz, far,
        )),
    });
    if (!safe) {
      p._botNextDashTick = this.tick + Math.ceil(0.45 * TICK_HZ);
      return false;
    }

    p._botDashX = worldX;
    p._botDashZ = worldZ;
    p._botDashTicks = Math.max(1, Math.ceil(BOT_DASH.duration * TICK_HZ));
    p._botDashStarts++;
    return true;
  }

  _advanceBotDash(p, state) {
    if (p._botDashTicks <= 0 || !state.onGround) {
      p._botDashTicks = 0;
      return state;
    }
    const remaining = p._botDashTicks / TICK_HZ;
    const bonusSpeed = botDashBonusSpeed(remaining);
    state.px = Math.round((state.px + p._botDashX * bonusSpeed / TICK_HZ) * 1e6) / 1e6;
    state.pz = Math.round((state.pz + p._botDashZ * bonusSpeed / TICK_HZ) * 1e6) / 1e6;
    state.vx = Math.round((state.vx + p._botDashX * bonusSpeed) * 1e6) / 1e6;
    state.vz = Math.round((state.vz + p._botDashZ * bonusSpeed) * 1e6) / 1e6;
    p._botDashTicks--;
    if (p._botDashTicks <= 0) {
      const r = this._rand(p.id * 281 + this.tick * 17);
      p._botNextDashTick = this.tick + Math.ceil(
        (BOT_DASH.cooldownMin + (BOT_DASH.cooldownMax - BOT_DASH.cooldownMin) * r) * TICK_HZ,
      );
    }
    return state;
  }

  _botGroundSafe(p, mx, mz, yaw) {
    if ((!mx && !mz) || !this.arena.groundHeightAt) return true;
    const length = Math.hypot(mx, mz) || 1;
    const inputX = mx / length, inputZ = mz / length;
    const worldX = Math.sin(yaw) * -inputZ + Math.sin(yaw + Math.PI / 2) * inputX;
    const worldZ = Math.cos(yaw) * -inputZ + Math.cos(yaw + Math.PI / 2) * inputX;
    // Look farther than one 20 Hz sprint step so a bot has time to brake before
    // its capsule crosses an unsupported edge.
    const probeDistance = 1.35;
    const ground = this.arena.groundHeightAt(
      p.state.px + worldX * probeDistance,
      p.state.pz + worldZ * probeDistance,
      p.state.py,
      p.state.py,
    );
    return Number.isFinite(ground) && ground > this.arena.killY
      && p.state.py - ground < 1.05;
  }

  _spawn(index = _pid, excludeId = null, safe = true) {
    if (!safe) {
      const s = this.arena.spawns[Math.abs(index) % this.arena.spawns.length];
      return [s[0], s[1], s[2]];
    }
    const occupants = [];
    for (const player of this.players.values()) {
      if (!player.alive || player.id === excludeId) continue;
      occupants.push([player.state.px, player.state.py, player.state.pz]);
    }
    return chooseSafeSpawn(this.arena.spawns, occupants, index);
  }

  // Main guns and the standard blade are always legal. A special becomes legal
  // only after the authoritative position reaches its authored map pad; that
  // grant lasts until death or the round rotates.
  _canEquipWeapon(p, wid) {
    if (!WEAPONS[wid]) return false;
    if (BASE_WEAPONS.has(wid) || p.matchWeapons?.has(wid)) return true;
    if (!isMatchPickupWeaponId(wid)) return false;
    for (const pickup of this.arena.pickups || []) {
      const spec = AUTHORED_WEAPON_BY_KIND.get(pickup.markerKind);
      if (spec?.id !== wid) continue;
      const dx = p.state.px - pickup.x;
      const dy = p.state.py - pickup.y;
      const dz = p.state.pz - pickup.z;
      if (Math.hypot(dx, dz) < WEAPON_COLLECT_RADIUS && Math.abs(dy) < WEAPON_COLLECT_HEIGHT) {
        p.matchWeapons.add(wid);
        return true;
      }
    }
    return false;
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
    const wid = this._canEquipWeapon(p, msg.wid) ? msg.wid : p.wid;
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
    const requestedWid = this._canEquipWeapon(p, msg.wid) ? msg.wid : null;
    if (!requestedWid) return;
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
    const oldestTick = Math.max(0, this.tick - HISTORY_TICKS + 1);
    const proposedViewTick = Number.isFinite(msg.viewTick) ? Math.trunc(msg.viewTick) : this.tick;
    p.fireReq = { wid: requestedWid,
                  yaw: Number.isFinite(msg.yaw) ? msg.yaw : 0,
                  pitch: Number.isFinite(msg.pitch) ? msg.pitch : 0,
                  viewTick: Math.max(oldestTick, Math.min(this.tick, proposedViewTick)) };
  }

  onReload(id, msg) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    const wid = WEAPONS[msg.wid] ? msg.wid : p.wid;
    if (wid !== p.wid) return;
    this._startReload(p, wid);
  }

  _weaponState(p, wid = p.wid) {
    const weapon = WEAPONS[wid] || WEAPONS.m4;
    p.ammo ||= {};
    p.ammo[wid] ||= { mag: weapon.mag, reserve: weapon.reserve };
    return p.ammo[wid];
  }

  _startReload(p, wid = p.wid) {
    const weapon = WEAPONS[wid];
    if (!weapon || weapon.kind === 'melee' || weapon.mag <= 0) return false;
    const ammo = this._weaponState(p, wid);
    if (p.reloadUntil > this.tick || ammo.mag >= weapon.mag || ammo.reserve <= 0) return false;
    p.reloadWid = wid;
    p.reloadUntil = this.tick + Math.max(1, Math.ceil(weapon.reload * TICK_HZ));
    return true;
  }

  _finishReload(p) {
    if (!p.reloadWid || p.reloadUntil > this.tick) return;
    const wid = p.reloadWid;
    const weapon = WEAPONS[wid];
    const ammo = this._weaponState(p, wid);
    const amount = Math.min(weapon.mag - ammo.mag, ammo.reserve);
    ammo.mag += amount;
    ammo.reserve -= amount;
    p.reloadWid = null;
    p.reloadUntil = 0;
    if (p.wid === wid) p.mag = ammo.mag;
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

  _hitscan(shooter, w, yaw, pitch, aiming = false, rewindTick = this.tick) {
    // Rewind targets to the authoritative snapshot the shooter last saw.
    // `ackTick` is deliberately not used here: it acknowledges input sequence
    // numbers and has a different clock from world snapshots.
    const rewind = Math.max(0, Math.min(this.tick, Math.trunc(rewindTick)));
    const ox = shooter.state.px, oy = shooter.state.py + HEAD_Y, oz = shooter.state.pz;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dx = -Math.sin(yaw) * cp, dy = sp, dz = -Math.cos(yaw) * cp;

    for (let pellet = 0; pellet < w.pellets; pellet++) {
      // deterministic-ish spread from tick+pellet (server-authoritative)
      const baseSpread = w.spread ?? Math.max(w.spreadMin || 0, shooter.gunBloom || 0);
      const spread = baseSpread * (aiming ? (w.zoomSpreadMod ?? 0.45) : 1);
      const a = (this._rand(shooter.id * 131 + this.tick * 7 + pellet) - 0.5) * spread;
      const b = (this._rand(shooter.id * 977 + this.tick * 13 + pellet) - 0.5) * spread;
      const spreadLength = Math.max(1e-6, Math.hypot(dx + a, dy + b, dz));
      const rx = (dx + a) / spreadLength, ry = (dy + b) / spreadLength, rz = dz / spreadLength;
      let best = null, bestT = w.range;
      for (const t of this.players.values()) {
        if (t === shooter || !t.alive) continue;
        const pos = this._rewound(t, rewind);
        const headY = Math.max(0.8, (pos.eye || 1.7) - 0.15);
        const hit = this._raySphere(ox, oy, oz, rx, ry, rz, pos.x, pos.y + headY, pos.z, HEAD_R, bestT);
        if (hit && hit.t < bestT) { best = { t, head: true, t2: hit.t }; bestT = hit.t; continue; }
        const lowered = !!(pos.crouch || pos.slide);
        const bodyY = lowered ? 0.58 : 0.9;
        const bodyR = lowered ? 0.42 : BODY_R;
        const body = this._raySphere(ox, oy, oz, rx, ry, rz, pos.x, pos.y + bodyY, pos.z, bodyR, bestT);
        if (body && body.t < bestT) { best = { t, head: false, t2: body.t }; bestT = body.t; }
      }
      const wallT = rayVsBoxes(this.simWorld, ox, oy, oz, rx, ry, rz, w.range);
      let impactT = Math.min(bestT, wallT);
      // smoke occlusion: if the ray to the hit passes through an active smoke
      // volume, the shot is blocked (server-authoritative vision denial).
      if (best && this._raySmoked(ox, oy, oz, rx, ry, rz, best.t2)) best = null;
      if (best && wallT < best.t2 - 0.05) best = null;
      if (best) this._damage(best.t, shooter, w.dmg * (best.head ? w.hs : 1), best.head);
      if (w.kind !== 'melee' && w.kind !== 'rocket') {
        // Replicate the presentation segment to every client. Damage remains
        // instantaneous and authoritative; clients animate a bright tracer
        // along this exact unobstructed path.
        this.events.push({
          e: 'shot', by: shooter.id, wid: shooter.wid,
          x: ox, y: oy, z: oz,
          tx: ox + rx * impactT, ty: oy + ry * impactT, tz: oz + rz * impactT,
        });
      }
    }
  }

  _resolveRocket(shooter, w, yaw, pitch) {
    const ox = shooter.state.px, oy = shooter.state.py + HEAD_Y, oz = shooter.state.pz;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dx = -Math.sin(yaw) * cp, dy = sp, dz = -Math.cos(yaw) * cp;
    let impactT = rayVsBoxes(this.simWorld, ox, oy, oz, dx, dy, dz, w.range);
    for (const target of this.players.values()) {
      if (target === shooter || !target.alive) continue;
      const head = this._raySphere(
        ox, oy, oz, dx, dy, dz,
        target.state.px, target.state.py + HEAD_Y, target.state.pz,
        HEAD_R, impactT,
      );
      const body = this._raySphere(
        ox, oy, oz, dx, dy, dz,
        target.state.px, target.state.py + 0.9, target.state.pz,
        BODY_R, impactT,
      );
      const hitT = Math.min(head?.t ?? impactT, body?.t ?? impactT);
      if (hitT < impactT) impactT = hitT;
    }

    const bx = ox + dx * impactT;
    const by = oy + dy * impactT;
    const bz = oz + dz * impactT;
    const radius = w.splashRadius || 5;
    for (const target of this.players.values()) {
      if (!target.alive) continue;
      const tx = target.state.px - bx;
      const ty = target.state.py + 0.9 - by;
      const tz = target.state.pz - bz;
      const distance = Math.hypot(tx, ty, tz);
      if (distance > radius) continue;
      const length = distance || 1e-6;
      const blocked = rayVsBoxes(
        this.simWorld,
        bx - dx * 0.12, by - dy * 0.12, bz - dz * 0.12,
        tx / length, ty / length, tz / length, length,
      ) < length - 0.1;
      if (blocked) continue;
      const falloff = 1 - (1 - w.splashMin) * clamp(distance / radius, 0, 1);
      this._damage(target, shooter, w.dmg * falloff, false);
    }
    this.events.push({
      e: 'explosion', kind: 'rocket', by: shooter.id,
      x: bx, y: by, z: bz, r: radius,
    });
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
    if (!target.alive || this.tick < (target.invulnerableUntil || 0)) return;
    if (target.isBot && shooter && shooter !== target) this._provokeBot(target, shooter, true);
    const absorbed = Math.min(target.shield, dmg);
    target.shield -= absorbed;
    target.health -= (dmg - absorbed);
    target.healthRegenDelay = HEALTH_REGEN_DELAY;
    this.events.push({ e: 'hit', id: target.id, by: shooter.id, dmg: Math.round(dmg), head });
    if (target.health <= 0) this._kill(target, shooter, head);
  }

  _kill(target, shooter = null, head = false, wid = null) {
    if (!target.alive) return false;
    target.alive = false;
    target.health = 0;
    target._lastSprint = false;
    target._lastAim = false;
    target._animVX = target._animVZ = 0;
    target._firingTicks = 0;
    target.deadUntil = this.tick + RESPAWN_TICKS;
    if (target.isBot) target._botState = BOT_STATES.DEAD;
    target.deaths++;
    if (shooter && target !== shooter) {
      shooter.kills++;
      shooter.score += head ? 150 : 100;
    }
    this.events.push({
      e: 'kill', id: target.id, by: shooter?.id ?? null,
      byName: shooter?.name ?? 'THE VOID', victimName: target.name,
      head, wid: wid ?? shooter?.wid ?? 'void',
    });
    return true;
  }

  // A near miss aimed at a bot still counts as an attack. Only bots close to
  // the unobstructed shot ray react, so spraying a wall cannot alert enemies on
  // the other side of it.
  _provokeBotsAlongShot(shooter, weapon, yaw, pitch) {
    const cp = Math.cos(pitch);
    const dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
    const ox = shooter.state.px, oy = shooter.state.py + HEAD_Y, oz = shooter.state.pz;
    for (const bot of this.players.values()) {
      if (!bot.isBot || bot === shooter || !bot.alive) continue;
      const tx = bot.state.px - ox, ty = (bot.state.py + 1.05) - oy, tz = bot.state.pz - oz;
      const along = tx * dx + ty * dy + tz * dz;
      if (along <= 0 || along > weapon.range) continue;
      const miss = Math.hypot(tx - dx * along, ty - dy * along, tz - dz * along);
      if (miss > 1.35) continue;
      if (rayVsBoxes(this.simWorld, ox, oy, oz, dx, dy, dz, along) < along - 0.1) continue;
      this._provokeBot(bot, shooter, true);
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
      this._finishReload(p);
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
          const s = this._spawn(p.id, p.id, true);
          p.state = createState(s[0], s[1], s[2]);
          p.health = START_HEALTH; p.shield = p.maxShield;
          p.healthRegenDelay = 0;
          p.wid = 'm4';
          p.matchWeapons.clear();
          p.mag = WEAPONS.m4.mag;
          p.ammo = { m4: { mag: WEAPONS.m4.mag, reserve: WEAPONS.m4.reserve } };
          p.reloadUntil = 0; p.reloadWid = null;
          p.invulnerableUntil = this.tick + SPAWN_PROTECTION_TICKS;
          p.alive = true; p.queue.length = 0;
          p._lastSprint = false;
          p._animVX = p._animVZ = 0;
          p._lastAim = false;
          p._firingTicks = 0;
          p._swingStart = p._swingUntil = 0;
          p._botReloadUntil = 0;
          p.gunBloom = 0;
          p.blindUntil = 0;
          p.abilities = { frag: ABILITIES.frag.charges, flash: ABILITIES.flash.charges, smoke: ABILITIES.smoke.charges,
                          impulse: ABILITIES.impulse.charges };
          if (p.isBot) this._resetBotAI(p);
          this.events.push({ e: 'respawn', id: p.id, x: s[0], y: s[1], z: s[2] });
        }
        this._record(p);
        continue;
      }

      if (p.healthRegenDelay > 0) {
        p.healthRegenDelay = Math.max(0, p.healthRegenDelay - 1 / TICK_HZ);
        if (p.healthRegenDelay <= 1e-6 && p.health < START_HEALTH) {
          p.healthRegenDelay = 0;
          p.health = Math.min(START_HEALTH, p.health + HEALTH_REGEN_RATE / TICK_HZ);
        }
      } else if (p.health < START_HEALTH) {
        p.health = Math.min(START_HEALTH, p.health + HEALTH_REGEN_RATE / TICK_HZ);
      }

      // consume the next queued input (or coast with zero-move if starved)
      let cmd = p.isBot ? this._driveBot(p) : p.queue.shift();
      if (!cmd) {
        cmd = { seq: p.lastInputSeq, inp: makeInput({ yaw: p._lastYaw ?? 0 }) };
      }
      // reject inputs that claim to be too far in the future (schema guard)
      // Bot stamina is not a tactical limiter. Refresh it around the shared
      // movement step so bots can run for an entire match, while human players
      // continue using the normal authoritative stamina contract.
      if (p.isBot) { p.state.stamina = STAMINA_MAX; p.state.stamDelay = 0; }
      const previousState = p.state;
      const sprinting = isSprinting(previousState, cmd.inp);
      p.state = step(previousState, cmd.inp, this.simWorld);
      if (p.isBot) { p.state.stamina = STAMINA_MAX; p.state.stamDelay = 0; }
      if (p.isBot && cmd.botDash) p.state = this._advanceBotDash(p, p.state);
      if (this.arena.resolveState) p.state = this.arena.resolveState(previousState, p.state);
      p.ackTick = cmd.seq;
      p._lastYaw = cmd.inp.yaw;
      p.wid = cmd.wid || p.wid;
      p.mag = this._weaponState(p, p.wid).mag;
      p._lastAim = !!cmd.aiming;
      // MoveSim restores the last safe transform when it crosses the kill
      // plane. Treat that recovery marker as an environmental death instead of
      // silently teleporting the player and leaving the HUD in an unclear state.
      if (p.state.recovered) {
        this._kill(p, null, false, 'void');
        p.queue.length = 0;
        this._record(p);
        continue;
      }
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
      p._lastSprint = (sprinting || !!cmd.botDash) && regularStep && resolvedSpeed > 6.5;
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
      if (req.wid !== p.wid || p.fireCooldown > 0 || p.reloadUntil > this.tick) continue;
      const w = WEAPONS[req.wid] || WEAPONS.m4;
      const ammo = this._weaponState(p, req.wid);
      if (w.kind !== 'melee' && ammo.mag <= 0) { this._startReload(p, req.wid); continue; }
      if (p.isBot && req.botTargetId != null) {
        const target = this.players.get(req.botTargetId);
        if (target?.alive) {
          const tx = target.state.px - p.state.px;
          const tz = target.state.pz - p.state.pz;
          const distance = Math.max(0.001, Math.hypot(tx, tz));
          const personality = 0.9 + this._rand(p.id * 271) * 0.2;
          const retaliationScale = req.botRetaliating ? BOT_RETALIATION_AIM_SCALE : 1;
          const error = botAimErrorMeters(
            distance,
            this.botDifficulty.aimErrorScale * personality * retaliationScale,
          );
          const yawJitter = (this._rand(p.id * 811 + this.tick * 17) * 2 - 1) * error / distance;
          const pitchJitter = (this._rand(p.id * 619 + this.tick * 23) * 2 - 1) * error / distance;
          req.yaw = Math.atan2(-tx, -tz) + yawJitter;
          req.pitch = Math.atan2(
            (target.state.py + HEAD_Y) - (p.state.py + HEAD_Y),
            distance,
          ) + pitchJitter;
        }
      }
      p.wid = req.wid;
      p.fireCooldown = Math.max(-w.rate, p.fireCooldown) + w.rate;
      if (w.kind !== 'melee') ammo.mag--;
      else {
        p._swingStart = this.tick;
        p._swingUntil = this.tick + Math.max(1, Math.ceil(w.rate * TICK_HZ));
      }
      p.mag = ammo.mag;
      this._provokeBotsAlongShot(p, w, req.yaw, req.pitch);
      if (w.kind === 'rocket') this._resolveRocket(p, w, req.yaw, req.pitch);
      else this._hitscan(p, w, req.yaw, req.pitch, p._lastAim, req.viewTick);
      if (w.kind !== 'melee' && ammo.mag <= 0) this._startReload(p, req.wid);
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
      const reloadDuration = Math.max(1, Math.ceil((WEAPONS[p.wid]?.reload || 0) * TICK_HZ));
      const reloadTicks = p.reloadWid === p.wid ? Math.max(0, p.reloadUntil - now) : 0;
      const swingDuration = Math.max(1, p._swingUntil - p._swingStart);
      publicList.push({
        id: p.id, name: p.name, isBot: p.isBot,
        x: p.state.px, y: p.state.py, z: p.state.pz,
        yaw: p.isBot
          ? botPresentationYaw(p._lastYaw ?? 0, p._animVX, p._animVZ)
          : (p._lastYaw ?? 0),
        aimYaw: p._lastYaw ?? 0, pitch: p._lastPitch ?? 0,
        vx: p._animVX, vy: p.state.vy, vz: p._animVZ,
        onGround: p.state.onGround, crouch: p.state.crouch,
        slide: p.state.slide, sprint: !!p._lastSprint, wid: p.wid,
        aiming: !!p._lastAim,
        firing: (p._firingTicks ?? 0) > 0, alive: p.alive,
        reload: reloadTicks > 0 ? 1 - reloadTicks / reloadDuration : 0,
        swing: p._swingUntil > now ? clamp((now - p._swingStart) / swingDuration, 0, 1) : 1,
        health: p.health, shield: p.shield,
        kills: p.kills, deaths: p.deaths, score: p.score,
        botState: p.isBot ? p._botState : undefined,
      });
    }
    const smokeList = this.smokes.map((s) => ({ x: s.x, y: s.y, z: s.z, r: s.r }));
    for (const p of this.players.values()) {
      const ammo = this._weaponState(p, p.wid);
      p.mag = ammo.mag;
      p.send({
        t: 'snapshot', tick: now, ack: p.ackTick,
        mapId: this.arena.id,
        mapName: this.arena.name,
        matchStart: this.matchStart,
        matchDurationMs: this.matchDurationMs,
        arena: rotated || now <= this._arenaBroadcastUntilTick ? this._arenaPayload() : undefined,
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
               mag: p.mag, reserve: ammo.reserve,
               reloading: p.reloadWid === p.wid && p.reloadUntil > now,
               reloadTicks: p.reloadWid === p.wid ? Math.max(0, p.reloadUntil - now) : 0,
               reloadDuration: Math.ceil((WEAPONS[p.wid]?.reload || 0) * TICK_HZ),
               spawnProtected: now < (p.invulnerableUntil || 0),
               kills: p.kills, deaths: p.deaths, score: p.score,
               blind: p.blindUntil > now, blindTicks: Math.max(0, p.blindUntil - now),
               abilities: p.abilities, abilityCD: +p.abilityCD.toFixed(2) },
        players: publicList,
        smokes: smokeList,
        events: this.events,
      });
    }
  }

  _record(p) {
    p.history.push({
      tick: this.tick, x: p.state.px, y: p.state.py, z: p.state.pz,
      eye: p.state.eye, crouch: !!p.state.crouch, slide: !!p.state.slide,
    });
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
