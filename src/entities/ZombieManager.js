import { Zombie } from './Zombie.js';

// Which armed type to use for a given wave (called only when a zombie rolls as armed)
function armedTypeForWave(wave) {
  if (wave >= 15) {
    const r = Math.random();
    if (r < 0.30) return 'shotgun';
    if (r < 0.70) return 'rifle';
    return 'pistol';
  }
  if (wave >= 10) return Math.random() < 0.65 ? 'rifle' : 'pistol';
  return 'pistol';
}

export class ZombieManager {
  constructor(world, scene, audio = null) {
    this.world   = world;
    this.scene   = scene;
    this.zombies = [];
    this.audio   = audio;
  }

  // Compatibility getter so WeaponSystem/grenade callbacks can use .bots
  get bots() { return this.zombies; }

  /**
   * @param {number} count
   * @param {number} hpMult
   * @param {number} speedMult
   * @param {number} wave
   * @param {number} armedRatio  0..1 — fraction of zombies that carry guns
   */
  spawnWave(count, hpMult, speedMult, wave, armedRatio = 0, dmgMult = 1) {
    this.clear();
    // Wave composition: runners join from wave 2, brutes from wave 4 and scale
    // up. Roughly ~20% of the wave is brute-eligible by wave 10. Armed zombies
    // keep the base shambler look.
    const bruteCap = wave >= 4 ? Math.min(Math.ceil(count * 0.20), 1 + Math.floor((wave - 4) / 2)) : 0;
    let brutes = 0;
    for (let i = 0; i < count; i++) {
      const base = this.world.spawnPoints[i % this.world.spawnPoints.length].clone();
      base.x += (Math.random() - 0.5) * 8;
      base.z += (Math.random() - 0.5) * 8;

      const isArmed  = armedRatio > 0 && Math.random() < armedRatio;
      const armedType = isArmed ? armedTypeForWave(wave) : null;

      let variant = 'shambler';
      if (!isArmed) {
        const r = Math.random();
        if (brutes < bruteCap && r < 0.18) { variant = 'brute'; brutes++; }
        else if (wave >= 2 && r < 0.55) variant = 'runner';
      }

      const z = new Zombie(this.world, base, hpMult, speedMult, wave, armedType, variant, dmgMult);
      z.audio = this.audio;
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
