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

// Bots spawn as the cyborg-terminator models — the same low-poly cel-shaded
// endoskeletons the player uses. Cycling the three chassis keeps the mob varied.
const ARMOR_TYPES = ['vanguard', 'striker', 'phantom'];
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
    this._targetYaw   = 0;      // desired facing — smoothed each frame (no snap turns)
    this._yawInit     = false;
    this._gunKick     = 0;      // recoil impulse, decays
    this._muzzleT     = 0;      // muzzle-flash visible timer
    this._muzzleFlash = null;
    this._weaponBaseZ = 0;
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

    const weaponId = this._isSwordBot ? 'sword' : 'm4';

    // Human bots hold their weapon in the rigged right hand — same attach +
    // hold-pose animation as the player's third-person body. noHit keeps the
    // weapon meshes out of hitscan raycasts (shooting the gun isn't a hit).
    if (this._isHuman && this.mesh.userData.attachWeapon) {
      const def = getWeapon(weaponId);
      if (def) {
        const { group: wm } = buildWeaponModel(def, { procedural: true });
        wm.traverse(o => { if (o.isMesh) o.userData.noHit = true; });
        this.mesh.userData.attachWeapon(wm, this._isSwordBot);
        this._weaponMesh = null; // hand-held; no procedural weapon animation
      }
    }

    const weaponDef = !this._isHuman && getWeapon(weaponId);
    if (weaponDef) {
      const { group: wm } = buildWeaponModel(weaponDef, { procedural: true });
      wm.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = true; } });
      if (this._isSwordBot) {
        // Sword low guard: right hand out front, blade angled forward-up
        wm.position.set(-0.22, 1.06, -0.24);
        wm.rotation.set(-0.70, 0, 0.22);
      } else {
        // AR in a soldier low-ready grip (the walk-cycle arm pose lays both
        // hands on it — trigger hand at the grip, support hand forward). rot.y=0
        // so the muzzle (−Z default) points out the body's front (which the +π
        // world-facing then turns toward travel).
        wm.position.set(0.12, 1.25, -0.04);
        wm.rotation.set(-0.07, 0.17, 0.05);
      }
      this.mesh.add(wm);
      this._weaponMesh = wm;
      this._weaponBaseZ = wm.position.z;
      if (!this._isSwordBot) {
        // Muzzle flash — a bright additive burst parented to the WEAPON at the
        // barrel tip, so it tracks the muzzle no matter how the gun is posed.
        const flash = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.11),
          new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.95,
                                        blending: THREE.AdditiveBlending, depthWrite: false })
        );
        flash.position.set(0, 0.03, -0.72);   // weapon-local barrel tip (−Z)
        flash.visible = false;
        flash.renderOrder = 6;
        flash.raycast = () => {};
        wm.add(flash);
        this._muzzleFlash = flash;
      }
    }
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    // Being hit is the only thing that makes a bot fight back.
    this._provoked = true;
    this._provokeTimer = PROVOKE_DURATION;
    this.health = Math.max(0, this.health - amount);
    this.flashTimer = 0.12;
    // Rigged humans flinch away from the hit direction; procedural bots skip.
    this.mesh?.userData?.triggerHit?.(0, 1);
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
    // Clear the death-crumple pose off the rig so the fresh body starts neutral.
    if (this._rig) {
      for (const k of ['legL', 'legR', 'kneeL', 'kneeR', 'armL', 'armR', 'elbowL', 'elbowR']) {
        this._rig[k]?.rotation.set(0, 0, 0);
      }
    }
    this._gunKick = 0;
    if (this._weaponMesh) { this._weaponMesh.position.z = this._weaponBaseZ; this._weaponMesh.rotation.x = this._isSwordBot ? -0.70 : -0.15; }
    // Phase in on respawn instead of popping into existence. Human bots play
    // the rigged teleport-arrival reform; cyborg/procedural bodies materialise
    // via a fade + settle (see the spawn-in tick in update()).
    if (this._isHuman) {
      this.mesh.userData.triggerTeleport?.();
    } else {
      this._spawnT = 0.45;
      this.mesh.scale.setScalar(1.12);
      this.mesh.traverse(o => {
        if (o.isMesh && o.material && 'opacity' in o.material) { o.material.transparent = true; o.material.opacity = 0; }
      });
    }
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

    // Fire feedback: rigged humans use their skeletal recoil; cyborg/procedural
    // bots get a weapon recoil kick + a muzzle flash (driven in update()).
    this.mesh?.userData?.triggerFire?.(1);
    this._gunKick = 1;
    this._muzzleT = 0.05;
    if (this._muzzleFlash) {
      this._muzzleFlash.visible = true;
      this._muzzleFlash.rotation.set(0, 0, Math.random() * Math.PI);
      this._muzzleFlash.scale.setScalar(0.75 + Math.random() * 0.6);
    }

    // Hit probability falls off with distance
    const hitP = this._accuracy * Math.max(0.1, 1 - dist / (this._botGun.range * 1.5));
    if (Math.random() < hitP) onAttack(this._botGun.damage);
  }

  update(dt, player, camera, onAttack, world) {
    // ── death animation ──────────────────────────────────────────────────────
    if (this._dying) {
      this._deathT += dt;
      const p = Math.min(1, this._deathT / 0.72);
      const eased = p * p;
      // Legs buckle first (knees give out) and the arms go limp, then the body
      // topples sideways and sinks — a crumple, not a rigid plank tipping over.
      if (this._rig) {
        const buckle = Math.min(1, p * 2.0);
        if (this._rig.kneeL)  this._rig.kneeL.rotation.x  = -1.2 * buckle;
        if (this._rig.kneeR)  this._rig.kneeR.rotation.x  = -1.2 * buckle;
        if (this._rig.legL)   this._rig.legL.rotation.x   =  0.35 * buckle;
        if (this._rig.legR)   this._rig.legR.rotation.x   =  0.35 * buckle;
        if (this._rig.armL)   this._rig.armL.rotation.x   = -0.25 * buckle;
        if (this._rig.armR)   this._rig.armR.rotation.x   = -0.25 * buckle;
      }
      this.mesh.rotation.z = eased * (Math.PI / 2) * this._deathSide;
      this.mesh.rotation.x = eased * 0.3;
      this.mesh.position.y = this._deathBaseY - eased * 0.5 - Math.min(0.16, p * 0.28);  // knees sink
      if (p > 0.58) {
        const fade = 1 - (p - 0.58) / 0.42;
        this.mesh.traverse(o => { if (o.isMesh && o.material && 'opacity' in o.material) {
          o.material.transparent = true;
          o.material.opacity = fade;
        }});
      }
      if (p >= 1) {
        this._dying = false;
        this.mesh.visible = false;
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.position.y = this._deathBaseY;
        this.mesh.traverse(o => { if (o.isMesh && o.material && 'opacity' in o.material) {
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

    // ── respawn materialize (cyborg phase-in): fade up + settle from a slight
    //    overshoot so a fresh body arrives instead of popping into place ──────
    if (this._spawnT > 0) {
      this._spawnT = Math.max(0, this._spawnT - dt);
      const p  = 1 - this._spawnT / 0.45;           // 0 → 1
      const e  = p * (2 - p);                        // ease-out
      const op = Math.min(1, e * 1.35);
      this.mesh.scale.setScalar(1.12 - 0.12 * e);    // 1.12 → 1.0
      this.mesh.traverse(o => {
        if (o.isMesh && o.material && 'opacity' in o.material) { o.material.transparent = op < 1; o.material.opacity = op; }
      });
      if (this._spawnT === 0) {                       // land exactly on full
        this.mesh.scale.setScalar(1);
        this.mesh.traverse(o => { if (o.isMesh && o.material && 'opacity' in o.material) { o.material.transparent = false; o.material.opacity = 1; } });
      }
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

    // Melee lunge timer — the swing is conveyed by the weapon thrust (weapon
    // animation block) rather than a whole-body scale "puff", which also freed
    // mesh.scale for the respawn materialize.
    if (this.lungeTimer > 0) this.lungeTimer -= dt;

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
      // Face the player. The rig's forward is +Z — the aim and strafe layers
      // both assume rotation.y == atan2(dx, dz). Object3D.lookAt aims the -Z
      // axis instead, which faced the model backwards and played the walk
      // cycle in reverse (moonwalk).
      // Procedural / cyborg bodies are built with their FRONT on −Z, but the
      // game's forward is +Z — so add π to face the model's front at the target
      // (otherwise it walks + aims backward). Human soldier front is already +Z.
      this._targetYaw = Math.atan2(player.position.x - this.position.x,
                                   player.position.z - this.position.z)
                        + (this._isHuman ? 0 : Math.PI);
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
        this._targetYaw = Math.atan2(this.wanderTarget.x - this.position.x,
                                     this.wanderTarget.z - this.position.z)
                          + (this._isHuman ? 0 : Math.PI);
      }
    }

    if (moveTarget) {
      this.position.addScaledVector(moveTarget, this.speed * dt);
      this.world.resolveCollisions(this.position, RADIUS);
    }

    this.mesh.position.set(this.position.x, this.position.y, this.position.z);

    // Smooth turn toward the desired facing — no more instant snap-arounds.
    if (this._yawInit) {
      let d = this._targetYaw - this.mesh.rotation.y;
      d = ((d + Math.PI) % (Math.PI * 2)) - Math.PI;   // shortest way round
      this.mesh.rotation.y += d * Math.min(1, dt * 9);
    } else { this.mesh.rotation.y = this._targetYaw; this._yawInit = true; }

    // Recoil impulse decays (the weapon-anim block below applies the kick to the
    // gun); the muzzle flash flares out and hides.
    if (this._gunKick > 0) this._gunKick = Math.max(0, this._gunKick - dt * 7);
    if (this._muzzleT > 0) {
      this._muzzleT -= dt;
      if (this._muzzleFlash) this._muzzleFlash.scale.multiplyScalar(1 + dt * 6);
      if (this._muzzleT <= 0 && this._muzzleFlash) this._muzzleFlash.visible = false;
    }

    if (this.healthBarGroup) {
      const localQuat = this.mesh.quaternion.clone().invert().multiply(camera.quaternion);
      this.healthBarGroup.quaternion.copy(localQuat);
    }

    // ── Human soldier: drive its skeletal idle/walk/run animation ──────────────
    if (this._isHuman) {
      const ud = this.mesh.userData;
      const moving = !!moveTarget;
      const spd = moving ? (this.speed || 3) : 0;
      // Strafe input: sign of lateral component of moveTarget in the bot's
      // local frame — feeds the strafe-lean layer.
      let strafe = 0;
      if (moveTarget) {
        const yaw = this.mesh.rotation.y;
        const cs = Math.cos(yaw), sn = Math.sin(yaw);
        strafe = -(moveTarget.x * cs - moveTarget.z * sn);   // local X
      }
      if (ud.setLocomotion) ud.setLocomotion(spd, true, this.speed > 3.4, strafe);
      else ud.setMotion(moving ? (this.speed > 3.4 ? 'run' : 'walk') : 'idle');

      // Aim: when engaged with the player, spine + head track them; otherwise
      // gently return to zero via the smoother inside armorTick.
      if (ud.setAim && player) {
        if (this._provoked || engaged) {
          const dx = player.position.x - this.position.x;
          const dz = player.position.z - this.position.z;
          const dy = (player.position.y + 1.0) - (this.position.y + 1.5);
          const worldAim = Math.atan2(dx, dz);
          const dyaw = worldAim - this.mesh.rotation.y;
          // Wrap to [-π, π] so the twist takes the short way round.
          const wrapped = ((dyaw + Math.PI) % (Math.PI * 2)) - Math.PI;
          const flat = Math.hypot(dx, dz);
          const pitch = -Math.atan2(dy, flat);
          ud.setAim(pitch, wrapped);
        } else {
          ud.setAim(0, 0);
        }
      }
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
        // AR seated in the two-handed grip in front of the chest (the arm grip
        // pose brings both hands onto it). Base pos(0, 1.15, −0.30) rot(−0.15, π).
        // Breathe / bob for life; recoil kicks it back + climbs the muzzle.
        const alertPX = this._alertBlend * -0.06; // level the barrel when alert
        wm.position.set(
          0.12         + sway * 0.3,
          1.25         + breathe - bob,
          this._weaponBaseZ + this._gunKick * 0.07     // recoil kick
        );
        wm.rotation.set(
          -0.07 + alertPX + this._gunKick * 0.22,       // recoil muzzle climb
          0.17,
          0.05 + sway * 0.3
        );
      } else {
        // Sword low guard. Base pos(−0.22, 1.06, −0.24) rot(−0.70, π, 0.22).
        // Lunge THRUSTS the blade forward (−Z is the front) and dips the tip.
        const alertY   = this._alertBlend * 0.06;
        const alertPX  = this._alertBlend * -0.18;
        const lungeZ   = isLunging ? -0.16 : 0;
        const lungePX  = isLunging ?  0.35 : 0;
        wm.position.set(
          -0.22 + sway * 0.3,
          1.06  + breathe * 1.3 + alertY - bob * 0.8,
          -0.24 + lungeZ
        );
        wm.rotation.set(
          -0.70 + alertPX + lungePX,
          0,
          0.22 + sway * 0.5
        );
      }
    }

    // ── Limb rig walk cycle ───────────────────────────────────────────────────
    if (this._rig) {
      const { armL, armR, legL, legR, kneeL, kneeR, elbowL, elbowR } = this._rig;
      const isMoving = !!moveTarget;

      // Advance walk timer proportional to movement speed (mirrors player bobTime)
      this._walkT += dt * (isMoving ? this.speed * 1.8 : 1.2);
      const t = this._walkT;

      const swing = isMoving ? Math.sin(t) * 0.55 : 0;
      // frame-rate-independent ease toward a target rotation (x / z channels)
      const L  = (j, tgt, k) => { if (j) j.rotation.x += (tgt - j.rotation.x) * Math.min(1, dt * k); };
      const Lz = (j, tgt, k) => { if (j) j.rotation.z += (tgt - j.rotation.z) * Math.min(1, dt * k); };

      // Legs: thighs stride opposite each other; KNEES flex through the swing
      // phase (cos>0 = leg passing forward under the body) so the foot lifts and
      // clears the ground instead of the leg swinging out stiff.
      if (isMoving) {
        L(legL, swing, 14);  L(legR, -swing, 14);
        L(kneeL, -1.0 * Math.max(0,  Math.cos(t)), 16);
        L(kneeR, -1.0 * Math.max(0, -Math.cos(t)), 16);
      } else {
        L(legL, 0, 6);  L(legR, 0, 6);
        L(kneeL, -0.06, 5); L(kneeR, -0.06, 5);
      }

      // Arms: AR bots hold the rifle in a two-handed grip (both hands come onto
      // the weapon seated in front of the chest), with a small breathing/stride
      // sway; sword bots free-swing the off-hand.
      if (!this._isSwordBot) {
        const sway = (isMoving ? Math.sin(t) * 0.05 : Math.sin(t * 0.4) * 0.025);
        // Soldier low-ready: trigger hand back on the pistol grip (tucked in),
        // support hand extended forward on the handguard.
        L(armR, 0.55 + sway, 9);  Lz(armR, -0.26, 9);  L(elbowR, -1.50, 9);
        L(armL, 1.22 - sway, 9);  Lz(armL,  0.46, 9);  L(elbowL, -0.98, 9);
      } else if (isMoving) {
        L(armL, -swing * 0.5, 12);  L(armR, swing * 0.5, 12);
        L(elbowL, -0.30, 8);  L(elbowR, -0.30, 8);
      } else {
        const breathe = Math.sin(t * 0.28) * 0.04;
        L(armL, breathe, 4);  L(armR, breathe, 4);
        L(elbowL, -0.14, 4);  L(elbowR, -0.14, 4);
      }
    }
  }
}
