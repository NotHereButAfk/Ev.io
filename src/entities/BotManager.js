import { Bot } from './Bot.js';

const BOT_COUNT = 7;

export class BotManager {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.bots = [];
  }

  spawnAll() {
    for (const bot of this.bots) this.scene.remove(bot.mesh);
    this.bots = [];
    for (let i = 0; i < BOT_COUNT; i++) {
      const point = this.world.spawnPoints[i % this.world.spawnPoints.length].clone();
      const bot = new Bot(this.world, point);
      this.scene.add(bot.mesh);
      this.bots.push(bot);
    }
  }

  update(dt, player, camera, onPlayerDamaged) {
    for (const bot of this.bots) {
      bot.update(dt, player, camera, onPlayerDamaged);
    }
  }

  getRaycastTargets() {
    const meshes = [];
    for (const bot of this.bots) {
      if (bot.alive) meshes.push(bot.mesh);
    }
    return meshes;
  }

  clear() {
    for (const bot of this.bots) this.scene.remove(bot.mesh);
    this.bots = [];
  }
}
