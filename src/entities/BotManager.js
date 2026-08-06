import { Bot } from './Bot.js';
import { ContactShadow } from '../player/ArenaLook.js';

// Gamertag pool for simulated remote players and named bots, so the kill feed
// and server roster read like a live lobby instead of "Bot-7".
const TAGS = [
  'Vortex', 'NovaStrike', 'Reaper', 'Glitch', 'Zephyr', 'Onyx', 'Pulse', 'Wraith',
  'Cipher', 'Havoc', 'Specter', 'Riot', 'Surge', 'Talon', 'Echo', 'Frost',
  'Blaze', 'Venom', 'Phantom', 'Ranger', 'Drift', 'Saint', 'Karma', 'Volt',
];

function randomTag(used) {
  for (let i = 0; i < 30; i++) {
    const t = TAGS[Math.floor(Math.random() * TAGS.length)];
    const tag = Math.random() < 0.5 ? t : `${t}${Math.floor(Math.random() * 99)}`;
    if (!used.has(tag)) { used.add(tag); return tag; }
  }
  return `Player${Math.floor(Math.random() * 9999)}`;
}

export class BotManager {
  constructor(world, scene, audio = null) {
    this.world = world;
    this.scene = scene;
    this.audio = audio;   // bots emit positional gunfire / footsteps / death
    this.bots  = [];
    this._usedTags = new Set();
  }

  // Spawn a fresh set of bots. noRespawn prevents auto-respawn (wave/elimination modes).
  // healthMult scales max HP (used by wave survival to ramp up difficulty).
  spawnAll(count = 7, noRespawn = false, healthMult = 1) {
    for (const bot of this.bots) { this.scene.remove(bot.mesh); bot.shadow?.dispose(); }
    this.bots = [];
    this._usedTags.clear();
    for (let i = 0; i < count; i++) {
      this._spawnOne(noRespawn, healthMult, false);
    }
  }

  _spawnOne(noRespawn, healthMult, isHumanSlot) {
    const idx   = this.bots.length;
    const point = this.world.spawnPoints[idx % this.world.spawnPoints.length].clone();
    const bot   = new Bot(this.world, point);
    bot.audio       = this.audio;
    bot.noRespawn   = noRespawn;
    bot.maxHealth   = Math.round(100 * healthMult);
    bot.health      = bot.maxHealth;
    bot.isHumanSlot = isHumanSlot;
    bot.isBot       = true;   // every combatant here is a bot — labelled as one
    bot.displayName = randomTag(this._usedTags);
    this.scene.add(bot.mesh);
    // Grounds the bot on whatever it is standing over. The scene is known here
    // and not inside Bot, so the shadow is created alongside the mesh and torn
    // down on every path that removes it.
    bot.shadow = new ContactShadow(this.scene, 0.58);
    this.bots.push(bot);
    return bot;
  }

  // Add a single combatant to fill a server slot. `isHumanSlot` flags it as a
  // simulated remote player rather than a bot.
  addBot(noRespawn = false, healthMult = 1, isHumanSlot = false) {
    return this._spawnOne(noRespawn, healthMult, isHumanSlot);
  }

  // Remove a single combatant. Prefers a slot matching `preferHuman` so the
  // server sim can swap a bot out for a joining player (or vice-versa).
  removeOne(preferHuman = false) {
    if (!this.bots.length) return null;
    let idx = this.bots.findIndex((b) => b.isHumanSlot === preferHuman);
    if (idx === -1) idx = this.bots.length - 1;
    const [bot] = this.bots.splice(idx, 1);
    this.scene.remove(bot.mesh);
    bot.shadow?.dispose();
    bot.shadow = null;
    if (bot.displayName) this._usedTags.delete(bot.displayName);
    return bot;
  }

  get count() { return this.bots.length; }

  // True when every bot in the current set is dead (useful for wave / elimination checks).
  allDead() {
    return this.bots.length > 0 && this.bots.every((b) => !b.alive);
  }

  update(dt, player, camera, onPlayerDamaged, world, allowBotCombat = true) {
    for (const bot of this.bots) {
      let target = player;

      if (allowBotCombat && bot.alive) {
        bot._targetScanT = Math.max(0, (bot._targetScanT || 0) - dt);
        const current = bot._targetEntity;
        const currentValid = current && current !== bot && !current.isDead &&
          current.alive !== false && current.position &&
          current.position.distanceTo(bot.position) < 46;

        if (!currentValid || bot._targetScanT <= 0) {
          const candidates = [player, ...this.bots].filter((candidate) =>
            candidate && candidate !== bot && candidate.position &&
            !candidate.isDead && candidate.alive !== false
          );
          let best = null;
          let bestScore = Infinity;
          for (const candidate of candidates) {
            // A small stickiness bonus prevents target-flipping every scan when
            // two opponents cross at nearly the same distance.
            const sticky = candidate === current ? -9 : 0;
            const score = candidate.position.distanceTo(bot.position) + sticky;
            if (score < bestScore) {
              best = candidate;
              bestScore = score;
            }
          }
          bot._targetEntity = best;
          bot._targetScanT = 0.85 + Math.random() * 0.45;
        }
        target = bot._targetEntity || player;
      }

      const onTargetDamaged = target === player
        ? (damage, from) => {
            const wasDead = player.isDead;
            onPlayerDamaged(damage, from);
            if (!wasDead && player.isDead) {
              bot._botKills = (bot._botKills || 0) + 1;
              bot._targetEntity = null;
              bot._targetScanT = 0;
            }
          }
        : (damage) => {
            if (!target?.alive) return;
            const killed = target.takeDamage(damage);
            target._targetEntity = bot;
            target._targetScanT = 0.9;
            if (killed) {
              bot._botKills = (bot._botKills || 0) + 1;
              bot._targetEntity = null;
              bot._targetScanT = 0;
            }
          };

      bot.update(dt, target, camera, onTargetDamaged, world);
    }
  }

  getRaycastTargets() {
    return this.bots.filter((b) => b.alive).map((b) => b.mesh);
  }

  clear() {
    for (const bot of this.bots) { this.scene.remove(bot.mesh); bot.shadow?.dispose(); }
    this.bots = [];
    this._usedTags.clear();
  }
}
