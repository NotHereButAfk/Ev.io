import * as THREE from 'three';
import { buildPreviewCharacter, rigCharacterLimbs } from '../player/PreviewCharacter.js';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { getWeapon } from '../weapons/weaponDefs.js';

// AR-type ranged stats — sword bots skip shooting entirely.
// Slower fire + short range: bots are not meant to be a real threat.
const AR_GUN = { damage: 14, fireRate: 0.30, range: 14, spread: 0.07 };

const DETECT_RADIUS = 15;
const ATTACK_RADIUS = 1.9;
const ATTACK_DAMAGE = 7;
const ATTACK_COOLDOWN = 1.5;
const RESPAWN_DELAY = 4;
const RADIUS = 0.5;
// Bots are passive: they ignore the player until shot, then retaliate for a
// short window (and even then they aim badly).
const PROVOKE_DURATION = 7;

let nextId = 1;

const ARMOR_TYPES = ['assault', 'recon', 'heavy', 'stealth'];
let _armorIdx = 0;

// Each bot picks the next skin in sequence so the lobby always looks varied.
// Bright, distinct hues so enemy soldiers read clearly at a distance.
const BOT_SKINS = [
  { primary: 0xd1372b, secondary: 0x2b1414 }, // Crimson
  { primary: 0x2b6fd1, secondary: 0x14223a }, // Cobalt
  { primary: 0x9050d1, secondary: 0x241433 }, // Violet
  { primary: 0x2fae5a, secondary: 0x0c2a16 }, // Emerald
  { primary: 0xc9d2d8, secondary: 0x2a3238 }, // Arctic
  { primary: 0xe0902c, secondary: 0x33240c }, // Amber
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
    // Deliberately poor aim — bots rarely actually land a shot.
    this._accuracy    = 0.10 + Math.random() * 0.14;
    this._weaponT     = Math.random() * Math.PI * 2; // phase offset for variety
    this._alertBlend  = 0;   // 0 = low-ready, 1 = high-ready/aiming
    this._weaponMesh  = null;
    this._rig         = null;
    this._walkT       = Math.random() * Math.PI * 2; // random phase so bots aren't in sync
    // Passive AI: only fights back after being attacked.
    this._provoked     = false;
    this._provokeTimer = 0;

    // Pre-allocated scratch vectors — avoids per-frame GC pressure
    this._toPlayer    = new THREE.Vector3();
    this._wanderDir   = new THREE.Vector3();
    this._shootFrom   = new THREE.Vector3();
    this._shootTarget = new THREE.Vector3();
    this._shootDir    = new THREE.Vector3();
    this._raycaster   = new THREE.Raycaster();

    this.position = spawnPoint.clone();

    const armorTypeId = ARMOR_TYPES[_armorIdx++ % ARMOR_TYPES.length];
    const skin = BOT_SKINS[_skinIdx++ % BOT_SKINS.length];
    // Bots use the SAME rigged human model as the player (falls back to the
    // procedural body only if the GLB hasn't loaded yet).
    this.mesh = buildPreviewCharacter(skin, armorTypeId, null, { allowHuman: true });
    this._isHuman = !!this.mesh.userData?.isHuman;
    this.bodyMat = this.mesh.userData.primaryMat;

    this.mesh.userData.bot = this;
    this.mesh.traverse((obj) => {
      obj.userData.bot = this;
      // Procedural model: tag head-zone parts for headshots (human headshots are
      // resolved by hit-point height in WeaponSystem instead).
      if (!this._isHuman && obj.isMesh && obj.position.y >= 1.90) obj.userData.isHead = true;
    });

    const { group: hpGroup, fg } = buildHealthBar();
    this.healthBarFg = fg;
    this.mesh.add(hpGroup);
    this.healthBarGroup = hpGroup;

    this.mesh.position.copy(this.position);

    // Rig limb pivots for the walk cycle (procedural model only; the human model
    // animates via its own skeletal mixer).
    this._rig = this._isHuman ? null : rigCharacterLimbs(this.mesh);

    // The human model matches the third-person player, which carries no visible
    // weapon mesh — so human bots skip the weapon attachment entirely.
    const weaponId  = this._isSwordBot ? 'sword' : 'm4';
    const weaponDef = !this._isHuman && getWeapon(weaponId);
    if (weaponDef) {
      const { group: wm } = buildWeaponModel(weaponDef);
      wm.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = true; } });
      if (this._isSwordBot) {
        // Sword low guard: right hand at mid-chest, blade angled ~40° forward-up
        wm.position.set(-0.38, 1.00, 0.02);
        wm.rotation.set(-0.70, Math.PI, 0.22);
      } else {
        // AR low-ready: two-handed chest carry, barrel angled ~20° down
        wm.position.set(-0.40, 0.92, 0.02);
        wm.rotation.set(-0.35, Math.PI, 0.14);
      }
      this.mesh.add(wm);
      this._weaponMesh = wm;
    }
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    // Being hit is the only thing that makes a bot fight back.
    this._provoked = true;
    this._provokeTimer = PROVOKE_DURATION;
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
    this._shootFrom.set(this.position.x, this.position.y + 1.5, this.position.z);
    this._shootTarget.set(player.position.x, player.position.y + 1.0, player.position.z);
    const dist = this._shootFrom.distanceTo(this._shootTarget);
    if (dist < 0.5) return;
    this._shootDir.subVectors(this._shootTarget, this._shootFrom).normalize();

    // Line-of-sight check against world geometry
    if (world?.colliders?.length) {
      this._raycaster.near = 0.2;
      this._raycaster.far  = dist - 0.5;
      this._raycaster.set(this._shootFrom, this._shootDir);
      const wMeshes = world.colliders.map(c => c.mesh).filter(Boolean);
      if (this._raycaster.intersectObjects(wMeshes, true).length) return; // blocked by wall
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

    this._toPlayer.set(player.position.x - this.position.x, 0, player.position.z - this.position.z);
    const toPlayer = this._toPlayer;
    const distToPlayer = toPlayer.length();

    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    // Passive AI: a bot only engages while provoked (recently shot). Otherwise it
    // wanders and ignores the player entirely.
    if (this._provokeTimer > 0) {
      this._provokeTimer -= dt;
      if (this._provokeTimer <= 0) this._provoked = false;
    }
    const engaged = this._provoked && !player.isDead && distToPlayer < DETECT_RADIUS;

    let moveTarget = null;
    if (engaged) {
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
      this._wanderDir.subVectors(this.wanderTarget, this.position);
      if (this._wanderDir.lengthSq() > 0.04) {
        moveTarget = this._wanderDir.normalize();
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

    // ── Human soldier: drive its skeletal idle/walk/run animation ──────────────
    if (this._isHuman) {
      const ud = this.mesh.userData;
      const moving = !!moveTarget;
      ud.setMotion(moving ? (this.speed > 3.4 ? 'run' : 'walk') : 'idle');
      ud.mixer.update(dt);
      ud.armorTick?.(dt);
    }

    // ── Weapon animation (procedural model only) ───────────────────────────────
    if (this._weaponMesh) {
      const isAlert   = engaged;
      const isMoving  = !!moveTarget;
      const isLunging = this.lungeTimer > 0;

      // Blend alert level: raise weapon when bot spots player
      this._alertBlend += ((isAlert ? 1 : 0) - this._alertBlend) * Math.min(1, dt * 5);

      // Advance animation timer — faster tick while walking
      this._weaponT += dt * (isMoving ? 7 : 2.2);

      const breathe = Math.sin(this._weaponT * (isMoving ? 1.0 : 0.28)) * 0.018;
      const sway    = Math.cos(this._weaponT * (isMoving ? 0.5 : 0.14)) * 0.010;
      const bob     = isMoving ? Math.abs(Math.sin(this._weaponT * 0.5)) * 0.022 : 0;

      const wm = this._weaponMesh;

      if (!this._isSwordBot) {
        // AR rifle animation
        // Low-ready base:  pos(-0.40, 0.92, 0.02)  rot(-0.35, π, 0.14)
        // High-ready alert: raise +0.10 Y, pitch up by 0.28 (barrel levels to horizon)
        const alertY   = this._alertBlend * 0.10;
        const alertPX  = this._alertBlend * -0.28; // negative = barrel pitches up
        const lungeZ   = isLunging ? 0.06 : 0;    // thrust forward on melee lunge

        wm.position.set(
          -0.40 + sway * 0.4,
          0.92  + breathe + alertY - bob,
          0.02  + lungeZ
        );
        wm.rotation.set(
          -0.35 + alertPX,
          Math.PI,
          0.14 + sway
        );
      } else {
        // Sword animation
        // Low guard base:  pos(-0.38, 1.00, 0.02)  rot(-0.70, π, 0.22)
        // High guard alert: raise +0.08 Y, rotate wrist to bring blade more forward (−0.20 X)
        const alertY   = this._alertBlend * 0.08;
        const alertPX  = this._alertBlend * -0.20;
        // Lunge: extend arm forward and lower tip toward target
        const lungeZ   = isLunging ? 0.14 : 0;
        const lungePX  = isLunging ? 0.30 : 0; // tip dips on thrust

        wm.position.set(
          -0.38 + sway * 0.3,
          1.00  + breathe * 1.3 + alertY - bob * 0.8,
          0.02  + lungeZ
        );
        wm.rotation.set(
          -0.70 + alertPX + lungePX,
          Math.PI,
          0.22 + sway * 0.5
        );
      }
    }

    // ── Limb rig walk cycle ───────────────────────────────────────────────────
    if (this._rig) {
      const { armL, armR, legL, legR } = this._rig;
      const isMoving = !!moveTarget;

      // Advance walk timer proportional to movement speed (mirrors player bobTime)
      this._walkT += dt * (isMoving ? this.speed * 1.8 : 1.2);

      const swing   = isMoving ? Math.sin(this._walkT) * 0.55 : 0;
      const breathe = Math.sin(this._walkT * (isMoving ? 0.22 : 0.28)) * 0.04;

      if (isMoving) {
        // Natural gait: legs stride opposite each other; arms counter-swing
        legL.rotation.x += ( swing - legL.rotation.x) * Math.min(1, dt * 14);
        legR.rotation.x += (-swing - legR.rotation.x) * Math.min(1, dt * 14);
        // AR bots grip the rifle so the weapon arm (armL = anatomical right)
        // swings less; sword bots swing both arms freely
        const swL = this._isSwordBot ? -swing * 0.65 : -swing * 0.30;
        const swR = this._isSwordBot ?  swing * 0.65 :  swing * 0.62;
        armL.rotation.x += (swL - armL.rotation.x) * Math.min(1, dt * 12);
        armR.rotation.x += (swR - armR.rotation.x) * Math.min(1, dt * 12);
      } else {
        // Idle: gentle breathing sway on arms, legs settle back to neutral
        armL.rotation.x += (breathe - armL.rotation.x) * Math.min(1, dt * 4);
        armR.rotation.x += (breathe - armR.rotation.x) * Math.min(1, dt * 4);
        legL.rotation.x += (0       - legL.rotation.x) * Math.min(1, dt * 6);
        legR.rotation.x += (0       - legR.rotation.x) * Math.min(1, dt * 6);
      }
    }
  }
}
