import * as THREE from 'three';
import { buildPreviewCharacter } from '../player/PreviewCharacter.js';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { getWeapon } from '../weapons/weaponDefs.js';

// AR-type ranged stats — sword bots skip shooting entirely
const AR_GUN = { damage: 22, fireRate: 0.13, range: 18, spread: 0.07 };

const DETECT_RADIUS = 15;
const ATTACK_RADIUS = 1.9;
const ATTACK_DAMAGE = 9;
const ATTACK_COOLDOWN = 1.1;
const RESPAWN_DELAY = 4;
const RADIUS = 0.5;

let nextId = 1;

const ARMOR_TYPES = ['assault', 'recon', 'heavy', 'stealth'];
let _armorIdx = 0;

// Each bot picks the next skin in sequence so the lobby always looks varied
const BOT_SKINS = [
  { primary: 0x2a0a0a, secondary: 0x0f0303 }, // Crimson
  { primary: 0x0a0e1e, secondary: 0x030610 }, // Cobalt
  { primary: 0x160a20, secondary: 0x07030f }, // Violet
  { primary: 0x061a0a, secondary: 0x020a03 }, // Emerald
  { primary: 0x1a1c22, secondary: 0x0a0c12 }, // Arctic
  { primary: 0x1e1004, secondary: 0x0c0602 }, // Amber
];
let _skinIdx = 0;

function buildHealthBar() {
  const group = new THREE.Group();
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x14161a, depthTest: false })
  );
  const fg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.06),
    new THREE.MeshBasicMaterial({ color: 0xff4d4d, depthTest: false })
  );
  bg.renderOrder = 10;
  fg.renderOrder = 11;
  bg.userData.noHit = true;
  fg.userData.noHit = true;
  group.add(bg);
  group.add(fg);
  group.position.y = 2.7; // above the tallest armor type (heavy ~2.5)
  return { group, fg };
}

export class Bot {
  constructor(world, spawnPoint) {
    this.id = nextId++;
    this.world = world;
    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.alive = true;
    // Server-roster metadata: every combatant fills one of the 8 server slots.
    // A "human slot" is a simulated remote player; otherwise it's a bot.
    this.displayName = `Bot-${this.id}`;
    this.isHumanSlot = false;
    this.respawnTimer = 0;
    this.attackCooldown = 0;
    this.flashTimer = 0;
    this.wanderTarget = spawnPoint.clone();
    this.wanderCooldown = 0;
    this.speed = 2.6 + Math.random() * 1.2;
    this.lungeTimer = 0;
    // 40% of bots carry swords (melee only); 60% carry ARs (ranged)
    this._isSwordBot  = Math.random() < 0.40;
    this._botGun      = this._isSwordBot ? null : AR_GUN;
    this._gunTimer    = Math.random() * 0.8;
    this._accuracy    = 0.55 + Math.random() * 0.35;

    this.position = spawnPoint.clone();

    const armorTypeId = ARMOR_TYPES[_armorIdx++ % ARMOR_TYPES.length];
    const skin = BOT_SKINS[_skinIdx++ % BOT_SKINS.length];
    this.mesh = buildPreviewCharacter(skin, armorTypeId);
    this.bodyMat = this.mesh.userData.primaryMat;

    this.mesh.userData.bot = this;
    this.mesh.traverse((obj) => {
      obj.userData.bot = this;
      // Tag head-zone parts for headshot detection (y >= 1.90 = neck and above)
      if (obj.isMesh && obj.position.y >= 1.90) obj.userData.isHead = true;
    });

    const { group: hpGroup, fg } = buildHealthBar();
    this.healthBarFg = fg;
    this.mesh.add(hpGroup);
    this.healthBarGroup = hpGroup;

    this.mesh.position.copy(this.position);

    // Attach visible weapon to the right hand.
    // The inner armor clone has rotation.y = π, so the character's right side
    // is at -X in the group's local space. Bot +Z faces its look-at target.
    // Weapon models have their muzzle/tip at -Z, so rotating Y by π aims them forward.
    const weaponId  = this._isSwordBot ? 'sword' : 'm4';
    const weaponDef = getWeapon(weaponId);
    if (weaponDef) {
      const { group: wm } = buildWeaponModel(weaponDef);
      wm.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = true; } });
      if (this._isSwordBot) {
        // Sword: raised at shoulder, angled diagonally forward-up
        wm.position.set(-0.42, 1.05, 0.05);
        wm.rotation.set(-0.55, Math.PI, 0.25);
      } else {
        // AR: held forward at hip/chest level, parallel to ground
        wm.position.set(-0.40, 0.88, 0.05);
        wm.rotation.set(-0.12, Math.PI, 0.18);
      }
      this.mesh.add(wm);
    }
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    this.health = Math.max(0, this.health - amount);
    this.flashTimer = 0.12;
    this.healthBarFg.scale.x = Math.max(0.001, this.health / this.maxHealth);
    this.healthBarFg.position.x = -((1 - this.healthBarFg.scale.x) * 0.33);
    if (this.health <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    this.alive = false;
    this._dying      = true;
    this._deathT     = 0;
    this._deathSide  = Math.random() < 0.5 ? 1 : -1;
    this._deathBaseY = this.mesh.position.y;
    this.healthBarGroup.visible = false;
  }

  respawnAt(point) {
    this.position.copy(point);
    this.mesh.position.set(point.x, point.y, point.z);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.scale.setScalar(1);
    this.health = this.maxHealth;
    this.healthBarFg.scale.x = 1;
    this.healthBarFg.position.x = 0;
    this.healthBarGroup.visible = true;
    this._dying = false;
    this.alive = true;
    this.mesh.visible = true;
  }

  _shootAt(player, onAttack, world) {
    const from = new THREE.Vector3(this.position.x, this.position.y + 1.5, this.position.z);
    const target = new THREE.Vector3(player.position.x, player.position.y + 1.0, player.position.z);
    const dist = from.distanceTo(target);
    if (dist < 0.5) return;
    const dir = target.clone().sub(from).normalize();

    // Line-of-sight check against world geometry
    if (world?.colliders?.length) {
      const ray = new THREE.Raycaster(from, dir, 0.2, dist - 0.5);
      const wMeshes = world.colliders.map(c => c.mesh).filter(Boolean);
      if (ray.intersectObjects(wMeshes, true).length) return; // blocked by wall
    }

    // Hit probability falls off with distance
    const hitP = this._accuracy * Math.max(0.1, 1 - dist / (this._botGun.range * 1.5));
    if (Math.random() < hitP) onAttack(this._botGun.damage);
  }

  update(dt, player, camera, onAttack, world) {
    // ── death animation ──────────────────────────────────────────────────────
    if (this._dying) {
      this._deathT += dt;
      const p = Math.min(1, this._deathT / 0.65);
      const eased = p * p;
      this.mesh.rotation.z = eased * (Math.PI / 2) * this._deathSide;
      this.mesh.rotation.x = eased * 0.25;
      this.mesh.position.y = this._deathBaseY - eased * 0.55;
      if (p > 0.55) {
        const fade = 1 - (p - 0.55) / 0.45;
        this.mesh.traverse(o => { if (o.isMesh && o.material) {
          o.material.transparent = true;
          o.material.opacity = fade;
        }});
      }
      if (p >= 1) {
        this._dying = false;
        this.mesh.visible = false;
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.position.y = this._deathBaseY;
        this.mesh.traverse(o => { if (o.isMesh && o.material) {
          o.material.transparent = false; o.material.opacity = 1;
        }});
        if (!this.noRespawn) this.respawnTimer = RESPAWN_DELAY;
      }
      return;
    }

    if (!this.alive) {
      if (!this.noRespawn) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.respawnAt(this.world.randomSpawnPoint());
      }
      return;
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.bodyMat) {
        this.bodyMat.emissive.setRGB(1, 1, 1);
        this.bodyMat.emissiveIntensity = Math.max(0, this.flashTimer / 0.12) * 0.8;
      }
    } else if (this.bodyMat) {
      this.bodyMat.emissiveIntensity = 0;
    }

    if (this.lungeTimer > 0) {
      this.lungeTimer -= dt;
      const s = 1 + Math.sin((this.lungeTimer / 0.2) * Math.PI) * 0.12;
      this.mesh.scale.setScalar(s);
    } else {
      this.mesh.scale.setScalar(1);
    }

    const toPlayer = new THREE.Vector3(player.position.x - this.position.x, 0, player.position.z - this.position.z);
    const distToPlayer = toPlayer.length();

    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    let moveTarget = null;
    if (!player.isDead && distToPlayer < DETECT_RADIUS) {
      this.mesh.lookAt(player.position.x, this.position.y + 1.08, player.position.z);
      if (distToPlayer > ATTACK_RADIUS * 0.85) {
        moveTarget = toPlayer.normalize();
        // AR bots shoot while closing in; sword bots only melee
        if (this._botGun && distToPlayer < this._botGun.range) {
          this._gunTimer -= dt;
          if (this._gunTimer <= 0) {
            this._gunTimer = this._botGun.fireRate * (0.7 + Math.random() * 0.6);
            this._shootAt(player, onAttack, world);
          }
        }
      } else if (this.attackCooldown <= 0) {
        this.attackCooldown = ATTACK_COOLDOWN;
        this.lungeTimer = 0.2;
        onAttack(ATTACK_DAMAGE);
      }
    } else {
      this.wanderCooldown -= dt;
      if (this.wanderCooldown <= 0 || this.position.distanceTo(this.wanderTarget) < 1.5) {
        const r = this.world.arenaHalf - 4;
        this.wanderTarget.set((Math.random() * 2 - 1) * r, 0, (Math.random() * 2 - 1) * r);
        this.wanderCooldown = 3 + Math.random() * 3;
      }
      const dir = new THREE.Vector3().subVectors(this.wanderTarget, this.position);
      if (dir.lengthSq() > 0.04) {
        moveTarget = dir.normalize();
        this.mesh.lookAt(this.wanderTarget.x, this.position.y + 1.08, this.wanderTarget.z);
      }
    }

    if (moveTarget) {
      this.position.addScaledVector(moveTarget, this.speed * dt);
      this.world.resolveCollisions(this.position, RADIUS);
    }

    this.mesh.position.set(this.position.x, this.position.y, this.position.z);

    if (this.healthBarGroup) {
      const localQuat = this.mesh.quaternion.clone().invert().multiply(camera.quaternion);
      this.healthBarGroup.quaternion.copy(localQuat);
    }
  }
}
