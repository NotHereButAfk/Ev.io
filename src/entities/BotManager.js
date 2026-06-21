import { Bot } from './Bot.js';

export class BotManager {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.bots  = [];
  }

  // Spawn a fresh set of bots. noRespawn prevents auto-respawn (wave/elimination modes).
  // healthMult scales max HP (used by wave survival to ramp up difficulty).
  spawnAll(count = 7, noRespawn = false, healthMult = 1) {
    for (const bot of this.bots) this.scene.remove(bot.mesh);
    this.bots = [];
    for (let i = 0; i < count; i++) {
      const point = this.world.spawnPoints[i % this.world.spawnPoints.length].clone();
      const bot   = new Bot(this.world, point);
      bot.noRespawn = noRespawn;
      bot.maxHealth = Math.round(100 * healthMult);
      bot.health    = bot.maxHealth;
      this.scene.add(bot.mesh);
      this.bots.push(bot);
    }
  }

  // True when every bot in the current set is dead (useful for wave / elimination checks).
  allDead() {
    return this.bots.length > 0 && this.bots.every((b) => !b.alive);
  }

  update(dt, player, camera, onPlayerDamaged) {
    for (const bot of this.bots) {
      bot.update(dt, player, camera, onPlayerDamaged);
    }
  }

  getRaycastTargets() {
    return this.bots.filter((b) => b.alive).map((b) => b.mesh);
  }

  clear() {
    for (const bot of this.bots) this.scene.remove(bot.mesh);
    this.bots = [];
  }
}
