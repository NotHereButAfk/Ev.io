import { Zombie } from './Zombie.js';

export class ZombieManager {
  constructor(world, scene) {
    this.world   = world;
    this.scene   = scene;
    this.zombies = [];
  }

  // Compatibility getter so WeaponSystem/grenade callbacks can use .bots
  get bots() { return this.zombies; }

  spawnWave(count, hpMult, speedMult, wave) {
    this.clear();
    for (let i = 0; i < count; i++) {
      const base = this.world.spawnPoints[i % this.world.spawnPoints.length].clone();
      base.x += (Math.random() - 0.5) * 8;
      base.z += (Math.random() - 0.5) * 8;
      const z = new Zombie(this.world, base, hpMult, speedMult, wave);
      this.scene.add(z.mesh);
      this.zombies.push(z);
    }
  }

  allDead() {
    return this.zombies.length > 0 && this.zombies.every(z => !z.alive);
  }

  getRaycastTargets() {
    return this.zombies.filter(z => z.alive).map(z => z.mesh);
  }

  update(dt, player, camera, onPlayerDamaged) {
    for (const z of this.zombies) z.update(dt, player, camera, onPlayerDamaged);
  }

  clear() {
    for (const z of this.zombies) this.scene.remove(z.mesh);
    this.zombies = [];
  }
}
