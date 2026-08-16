import * as THREE from 'three';
import { buildPreviewCharacter, rigCharacterLimbs } from '../player/PreviewCharacter.js';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { getWeapon } from '../weapons/weaponDefs.js';
import { applyRifleCarry, restRifleTransform } from '../player/RifleCarry.js';
import { applyWalkCycle } from '../player/Locomotion.js';
import { applyMeleeCarry } from '../player/Actions.js';
import { directionToBodyYaw } from '../player/Facing.js';
import { BOT_TACTICS, advanceBotMagazine, advanceBurst, botAimErrorMeters, botLoadoutForId, chooseCombatSteering } from './BotCombat.js';
import { DEATH_FALL_DURATION, deathFallProgress } from '../player/DeathAnimation.js';
import { PLAYABLE_ARMOR_IDS } from '../player/ArmorTypes.js';

const _STILL = { bob: 0, lean: 0, swing: 0 };
const _tmpA = new THREE.Vector3();   // scratch: bullet-cone basis
const _tmpB = new THREE.Vector3();

const DETECT_RADIUS = BOT_TACTICS.detectRadius;
const ATTACK_RADIUS = BOT_TACTICS.meleeAttackDistance;
const ATTACK_DAMAGE = 12;
const ATTACK_COOLDOWN = 0.95;
const LUNGE_TIME = 0.2;      // how long a sword bot's strike takes to play
const RESPAWN_DELAY = 4;
const RADIUS = 0.5;
const BOT_GRAVITY = -20;
const BOT_JUMP_SPEED = 9.6;
// Aggro persists this long after losing sight of you, so breaking line of
// sight buys you a few seconds rather than instantly erasing you.
const PROVOKE_DURATION = BOT_TACTICS.memoryDuration;

// ── Combat tuning ────────────────────────────────────────────────────────────
// Aim error in METRES AT THE TARGET rather than as an angle — a bot "misses by
// about a metre, more the further out you are". Expressed this way it also
// can't turn into a perfect marksman at point-blank, which a fixed angular cone
// does (a 3° cone at 5m physically cannot miss a torso).
// Cover and player strafing still matter because these remain real ray shots.
const AIM_SKILL_MIN = 0.80;    // per-bot multiplier — lower is a better shot
const AIM_SKILL_MAX = 1.15;
const REACTION_MIN  = 0.18;    // seconds between acquiring a target and firing
const REACTION_MAX  = 0.52;
// Player hitboxes, relative to their feet: a torso sphere and a head.
const PLAYER_BODY_Y = 1.05, PLAYER_BODY_R = 0.42;
const PLAYER_HEAD_Y = 1.60, PLAYER_HEAD_R = 0.24;

let nextId = 1;

// Bots spawn as the cyborg-terminator models — the same low-poly cel-shaded
// endoskeletons the player uses. Cycling the three chassis keeps the mob varied.
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
    this.lungeTimer = 0;
    // The arena reads primarily as a firefight; a smaller sword cohort supplies
    // close-range disruption instead of turning every encounter into a mob.
    this._botGun      = botLoadoutForId(this.id);
    this._isSwordBot  = !this._botGun;
    this.speed = (this._isSwordBot ? 5.15 : 4.55) + Math.random() * 1.15;
    this._gunTimer    = Math.random() * 0.8;
    this._magAmmo     = this._botGun?.magSize || 0;
    this._reloadTimer = 0;
    this._burstShots  = 2 + Math.floor(Math.random() * 3);
    // Per-bot marksmanship multiplier on the aim error. Rolling this per bot is
    // what makes some of them feel dangerous and others sloppy.
    this._aimSkill    = AIM_SKILL_MIN + Math.random() * (AIM_SKILL_MAX - AIM_SKILL_MIN);
    this._reactT      = 0;       // reaction delay before a fresh target is engaged
    this._footPhase   = 0;       // last walk-cycle phase a footstep played on
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
    this._provoked     = false;
    this._provokedByPlayer = false;
    this._provokeTimer = 0;
    this._losT         = Math.random() * 0.12;
    this._losCache     = false;
    this._decisionT    = 0;
    this._strafeSign   = Math.random() < 0.5 ? -1 : 1;
    this._wantsJump    = false;
    this._jumpCooldown = Math.random() * 0.8;
    this._velY         = 0;
    this._onGround     = true;
    this._animSpeed    = 0;
    this._stuckT       = 0;
    this._padTeleCD    = 0;
    this._targetEntity = null;
    this._targetScanT  = Math.random() * 0.35;
    this._botKills     = 0;
    this._botDeaths    = 0;

    // Pre-allocated scratch vectors — avoids per-frame GC pressure
    this._toPlayer    = new THREE.Vector3();
    this._toTarget    = new THREE.Vector3();
    this._wanderDir   = new THREE.Vector3();
    this._combatDir   = new THREE.Vector3();
    this._strafeDir   = new THREE.Vector3();
    this._lastSeenPos = spawnPoint.clone();
    this._lastSeenValid = false;
    this._shootFrom   = new THREE.Vector3();
    this._shootTarget = new THREE.Vector3();
    this._shootDir    = new THREE.Vector3();
    this._raycaster   = new THREE.Raycaster();
    this._bulletRay   = new THREE.Ray();
    this._sphere      = new THREE.Sphere();
    this._hitPt       = new THREE.Vector3();
    this._healthQuat  = new THREE.Quaternion();

    this.position = spawnPoint.clone();

    const armorTypeId = PLAYABLE_ARMOR_IDS[_armorIdx++ % PLAYABLE_ARMOR_IDS.length];
    const skin = BOT_SKINS[_skinIdx++ % BOT_SKINS.length];
    // Bots use the same connected arena-exosuit family as the player. Keep the
    // retired layered Soldier path explicitly disabled so an asset-load race
    // cannot put a gun back inside the older bulky vest/glove silhouette.
    this.mesh = buildPreviewCharacter(skin, armorTypeId, null, { allowHuman: false });
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
    // Yaw-first euler order, so the run lean (rotation.x) and the death topple
    // (rotation.z) tilt about the BODY's axes rather than the world's.
    this.mesh.rotation.order = 'YXZ';

    // Rig limb pivots for the connected exosuit walk cycle. The guarded human
    // branch remains only for direct development tooling.
    this._rig = this._isHuman ? null : rigCharacterLimbs(this.mesh);

    const weaponId = this._isSwordBot ? 'sword' : this._botGun.id;

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
        // AR in the high combat-ready carry — stock tight to the right shoulder,
        // receiver at the upper chest, muzzle only slightly lowered.
        // applyRifleCarry() completes the small lift when the bot engages.
        restRifleTransform(wm);
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

  get isDead() { return !this.alive; }

  takeDamage(amount, attacker = null) {
    if (!this.alive) return false;
    // Damage immediately refreshes combat memory even if the attacker fired
    // from outside the normal vision cone/range.
    if (!this._provoked) this._reactT = REACTION_MIN + Math.random() * (REACTION_MAX - REACTION_MIN);
    this._provoked = true;
    // A missing attacker is the local player weapon/grenade path. Bot-v-bot
    // damage passes the attacking bot explicitly and must not make this bot
    // hostile toward the human later.
    if (!attacker) this._provokedByPlayer = true;
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
    if (this.audio) this.audio.playAt(this.position, () => { this.audio.playHurt(); this.audio.playLand(true); });
    this._botDeaths = (this._botDeaths || 0) + 1;
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
      for (const k of ['legL', 'legR', 'kneeL', 'kneeR', 'ankleL', 'ankleR',
                       'armL', 'armR', 'elbowL', 'elbowR']) {
        this._rig[k]?.rotation.set(0, 0, 0);
      }
    }
    this._gunKick   = 0;
    this._alertBlend = 0;
    this._velY = 0;
    this._onGround = true;
    this._animSpeed = 0;
    this._jumpCooldown = 0.4 + Math.random() * 0.8;
    this._wantsJump = false;
    this._stuckT = 0;
    this._lastSeenValid = false;
    this._provoked = false;
    this._provokedByPlayer = false;
    this._provokeTimer = 0;
    this._losCache = false;
    this._decisionT = 0;
    this._burstShots = 2 + Math.floor(Math.random() * 3);
    this._magAmmo = this._botGun?.magSize || 0;
    this._reloadTimer = 0;
    this._targetEntity = null;
    this._targetScanT = 0;
    if (this._isSwordBot) {
      if (this._weaponMesh) { this._weaponMesh.position.z = this._weaponBaseZ; this._weaponMesh.rotation.x = -0.70; }
    } else {
      // Snap (dt=1 ⇒ ease factor 1) straight into the patrol carry so the fresh
      // body doesn't spend its first frames unfolding out of a T-pose.
      applyRifleCarry(this._rig, this._weaponMesh, 0, 1);
    }
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

  /** Clear line of sight from the bot's eye to the player's chest? */
  hasLineOfSight(player, world) {
    this._shootFrom.set(this.position.x, this.position.y + 1.5, this.position.z);
    this._shootTarget.set(player.position.x, player.position.y + PLAYER_BODY_Y, player.position.z);
    const dist = this._shootFrom.distanceTo(this._shootTarget);
    if (dist < 0.5) return true;
    this._shootDir.subVectors(this._shootTarget, this._shootFrom).normalize();
    if (!world?.colliders?.length) return true;
    // Collider VISUALS get a mesh raycast; the map's bare box colliders (trees,
    // kiosks, benches, escalators — most of the mall's cover) need their own
    // ray/AABB test, or bots see straight through everything you hide behind.
    this._raycaster.near = 0.2;
    this._raycaster.far  = dist - 0.5;
    this._raycaster.set(this._shootFrom, this._shootDir);
    if (this._raycaster.intersectObjects(world.raycastMeshes, true).length) return false;
    if (world.raycastBoxHit(this._raycaster.ray, this._raycaster.far)) return false;
    return true;
  }

  _shootAt(player, onAttack, world) {
    this._shootFrom.set(this.position.x, this.position.y + 1.5, this.position.z);
    this._shootTarget.set(player.position.x, player.position.y + PLAYER_BODY_Y, player.position.z);
    const dist = this._shootFrom.distanceTo(this._shootTarget);
    if (dist < 0.5) return;
    this._shootDir.subVectors(this._shootTarget, this._shootFrom).normalize();

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
    if (this.audio) this.audio.playAt(this._shootFrom, () => this.audio.playShot(this._botGun.sound));

    // ── The bullet is a real ray ───────────────────────────────────────────────
    // Scatter it inside the bot's aim cone, then see what it actually hits. This
    // is the whole point: cover blocks it, distance widens the cone's footprint,
    // and strafing makes it miss — none of which a probability roll can express.
    // Scatter radius in metres at the target, converted to an angle.
    const spread = botAimErrorMeters(dist, this._aimSkill) / Math.max(1, dist);
    _tmpA.set(-this._shootDir.z, 0, this._shootDir.x);              // horizontal ⊥
    if (_tmpA.lengthSq() < 1e-6) _tmpA.set(1, 0, 0);
    _tmpA.normalize();
    _tmpB.crossVectors(this._shootDir, _tmpA).normalize();          // vertical ⊥
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * spread;                  // uniform in the disc
    this._shootDir
      .addScaledVector(_tmpA, Math.cos(ang) * rad)
      .addScaledVector(_tmpB, Math.sin(ang) * rad)
      .normalize();

    this._bulletRay.set(this._shootFrom, this._shootDir);
    const range = this._botGun.range;

    // Nearest world obstruction along the bullet's actual path.
    let blockAt = Infinity;
    if (world?.colliders?.length) {
      this._raycaster.near = 0.2;
      this._raycaster.far  = range;
      this._raycaster.set(this._shootFrom, this._shootDir);
      const wh = this._raycaster.intersectObjects(world.raycastMeshes, true);
      if (wh.length) blockAt = wh[0].distance;
      const bh = world.raycastBoxHit(this._bulletRay, range);
      if (bh && bh.distance < blockAt) blockAt = bh.distance;
    }

    // Does it reach the player before that?
    const hitDist = this._rayHitsPlayer(player, range);
    if (hitDist !== null && hitDist < blockAt) onAttack(this._botGun.damage, this.position);
  }

  /** Distance along _bulletRay at which it strikes the player, or null. */
  _rayHitsPlayer(player, range) {
    let best = null;
    for (const [dy, r] of [[PLAYER_BODY_Y, PLAYER_BODY_R], [PLAYER_HEAD_Y, PLAYER_HEAD_R]]) {
      this._sphere.center.set(player.position.x, player.position.y + dy, player.position.z);
      this._sphere.radius = r;
      if (!this._bulletRay.intersectSphere(this._sphere, this._hitPt)) continue;
      const d = this._bulletRay.origin.distanceTo(this._hitPt);
      if (d <= range && (best === null || d < best)) best = d;
    }
    return best;
  }

  update(dt, player, camera, onAttack, world) {
    // ── death animation ──────────────────────────────────────────────────────
    if (this._dying) {
      this._deathT += dt;
      const p = Math.min(1, this._deathT / DEATH_FALL_DURATION);
      const eased = deathFallProgress(this._deathT);
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

    // Bot weapons use finite magazines. The pause is both a fair combat window
    // and a visible action because its progress feeds the shared carry rig.
    if (this._reloadTimer > 0 && this._botGun) {
      const magazine = advanceBotMagazine(this._magAmmo, this._reloadTimer, dt, this._botGun);
      this._magAmmo = magazine.ammo;
      this._reloadTimer = magazine.reloadRemaining;
    }

    // Melee lunge timer — the swing is conveyed by the weapon thrust (weapon
    // animation block) rather than a whole-body scale "puff", which also freed
    // mesh.scale for the respawn materialize.
    if (this.lungeTimer > 0) this.lungeTimer -= dt;

    this._toPlayer.set(player.position.x - this.position.x, 0, player.position.z - this.position.z);
    const toPlayer = this._toPlayer;
    const distToPlayer = toPlayer.length();

    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    // ── Awareness ──────────────────────────────────────────────────────────────
    // A bot only retaliates after takeDamage() provokes it. Visibility refreshes
    // combat memory after that point, but merely walking into view is neutral.
    const inRange = !player.isDead && distToPlayer < DETECT_RADIUS;
    this._losT -= dt;
    if (inRange) {
      if (this._losT <= 0) {
        this._losT = 0.12 + Math.random() * 0.1;
        this._losCache = this.hasLineOfSight(player, world);
      }
    } else {
      this._losCache = false;
    }
    const hasVisual = inRange && this._losCache;
    const canEngageTarget = !!player?.isBot || this._provokedByPlayer;
    if (player.isDead) {
      this._provoked = false;
      this._provokedByPlayer = false;
      this._provokeTimer = 0;
      this._lastSeenValid = false;
    } else if (hasVisual && canEngageTarget) {
      if (!this._provoked) this._reactT = REACTION_MIN + Math.random() * (REACTION_MAX - REACTION_MIN);
      this._provoked = true;
      this._provokeTimer = PROVOKE_DURATION;
      this._lastSeenPos.copy(player.position);
      this._lastSeenValid = true;
    } else if (this._provokeTimer > 0) {
      this._provokeTimer -= dt;
      if (this._provokeTimer <= 0) {
        this._provoked = false;
        this._provokedByPlayer = false;
        this._lastSeenValid = false;
      }
    }
    if (this._reactT > 0) this._reactT -= dt;
    const engaged = canEngageTarget && this._provoked && !player.isDead && (hasVisual || this._lastSeenValid);

    let moveTarget = null;
    let gaitDirF = 0;
    let gaitDirR = 0;
    if (engaged) {
      const target = hasVisual ? player.position : this._lastSeenPos;
      this._toTarget.set(target.x - this.position.x, 0, target.z - this.position.z);
      const targetDistance = this._toTarget.length();
      const targetDir = this._combatDir.copy(this._toTarget);
      if (targetDir.lengthSq() > 1e-5) targetDir.normalize();

      // Change direction in readable beats rather than vibrating every frame.
      this._decisionT -= dt;
      if (this._decisionT <= 0) {
        this._decisionT = 0.95 + Math.random() * 0.80;
        if (Math.random() < 0.35) this._strafeSign *= -1;
        const targetIsHigher = player.position.y > this.position.y + 1.15;
        this._wantsJump = this._onGround && this._jumpCooldown <= 0 &&
          (targetIsHigher || (hasVisual && targetDistance > 6 && targetDistance < 18
            && Math.random() < 0.10));
      }

      const steering = chooseCombatSteering({
        distance: targetDistance,
        hasLineOfSight: hasVisual,
        strafeSign: this._strafeSign,
        melee: this._isSwordBot,
      });
      this._strafeDir.set(targetDir.z, 0, -targetDir.x);
      this._combatDir
        .copy(targetDir)
        .multiplyScalar(steering.forward)
        .addScaledVector(this._strafeDir, steering.strafe);
      const steerLen = Math.hypot(steering.forward, steering.strafe);
      if (this._combatDir.lengthSq() > 1e-5) {
        moveTarget = this._combatDir.normalize();
        gaitDirF = steering.forward / Math.max(1, steerLen);
        gaitDirR = steering.strafe / Math.max(1, steerLen);
      }

      // Face the live target while circling/retreating. With no visual, face
      // the last-seen point until it is searched.
      this._targetYaw = directionToBodyYaw(
        target.x - this.position.x,
        target.z - this.position.z
      );

      // Ranged bots use short bursts only with a verified firing lane.
      if (this._botGun && this._reloadTimer <= 0 && hasVisual && this._reactT <= 0 && distToPlayer < this._botGun.range) {
        this._gunTimer -= dt;
        if (this._gunTimer <= 0) {
          this._shootAt(player, onAttack, world);
          const magazine = advanceBotMagazine(this._magAmmo, this._reloadTimer, 0, this._botGun, true);
          this._magAmmo = magazine.ammo;
          this._reloadTimer = magazine.reloadRemaining;
          const burst = advanceBurst(this._burstShots);
          this._burstShots = burst.shotsRemaining;
          this._gunTimer = this._botGun.fireRate * burst.delayScale;
        }
      }

      if (this._isSwordBot && hasVisual && distToPlayer <= ATTACK_RADIUS &&
          this.attackCooldown <= 0) {
        this.attackCooldown = ATTACK_COOLDOWN;
        this.lungeTimer = LUNGE_TIME;
        onAttack(ATTACK_DAMAGE, this.position);
      }

      // Reaching the remembered point without reacquiring the player starts a
      // brief search, then releases the target instead of tracking through walls.
      if (!hasVisual && targetDistance < 1.2) {
        this._lastSeenValid = false;
        this._provokeTimer = Math.min(this._provokeTimer, 0.65);
      }
    } else {
      this.wanderCooldown -= dt;
      if (this.wanderCooldown <= 0 || this.position.distanceTo(this.wanderTarget) < 1.5) {
        // Authored spawns are known-clear locations and make much safer patrol
        // anchors than arbitrary world coordinates inside Rook's solid geometry.
        const points = this.world.spawnPoints || [];
        let picked = null;
        for (let i = 0; i < Math.min(8, points.length); i++) {
          const p = points[Math.floor(Math.random() * points.length)];
          if (!picked || Math.abs(p.y - this.position.y) < Math.abs(picked.y - this.position.y)) picked = p;
          if (Math.abs(p.y - this.position.y) < 2.5) break;
        }
        if (picked) {
          this.wanderTarget.set(picked.x, this.position.y, picked.z);
        } else {
          const roam = 18;
          const half = Math.max(4, this.world.arenaHalf - 2);
          this.wanderTarget.set(
            THREE.MathUtils.clamp(this.position.x + (Math.random() * 2 - 1) * roam, -half, half),
            this.position.y,
            THREE.MathUtils.clamp(this.position.z + (Math.random() * 2 - 1) * roam, -half, half)
          );
        }
        this.wanderCooldown = 2.4 + Math.random() * 2.8;
      }
      this._wanderDir.subVectors(this.wanderTarget, this.position);
      this._wanderDir.y = 0;
      if (this._wanderDir.lengthSq() > 0.04) {
        moveTarget = this._wanderDir.normalize();
        gaitDirF = 1;
        this._targetYaw = directionToBodyYaw(
          this.wanderTarget.x - this.position.x,
          this.wanderTarget.z - this.position.z
        );
      }
    }

    const beforeX = this.position.x;
    const beforeZ = this.position.z;
    if (moveTarget) {
      this.position.addScaledVector(moveTarget, this.speed * dt);
    }

    // Arena movement: bots can hop during a duel, recover from low cover, use
    // grav lifts and fall between different authored elevations.
    this._jumpCooldown = Math.max(0, this._jumpCooldown - dt);
    if (this._wantsJump && this._onGround && this._jumpCooldown <= 0) {
      this._velY = BOT_JUMP_SPEED;
      this._onGround = false;
      this._jumpCooldown = 2.2 + Math.random() * 1.4;
      this.audio?.playAt(this.position, () => this.audio.playJump());
    }
    this._wantsJump = false;

    const lift = world?.queryGravLift?.(this.position.x, this.position.z, this.position.y) || 0;
    if (lift > 0) {
      this._velY = Math.max(this._velY, lift);
      this._onGround = false;
    }

    const prevY = this.position.y;
    this._velY += BOT_GRAVITY * dt;
    this.position.y += this._velY * dt;
    const groundY = world?.groundHeightAt
      ? world.groundHeightAt(this.position.x, this.position.z, prevY, this.position.y)
      : 0;
    if (this.position.y <= groundY + 0.05 && this._velY <= 0.001) {
      this.position.y = groundY;
      this._velY = 0;
      this._onGround = true;
    } else {
      this._onGround = false;
    }
    this.world.resolveCollisions(this.position, RADIUS);

    const actualDX = this.position.x - beforeX;
    const actualDZ = this.position.z - beforeZ;
    const actualMoved = Math.hypot(actualDX, actualDZ);
    const actualSpeed = dt > 1e-4 ? actualMoved / dt : 0;
    this._animSpeed += (actualSpeed - this._animSpeed)
      * (1 - Math.exp(-(actualSpeed < this._animSpeed ? 18 : 10) * dt));

    if (moveTarget) {
      if (actualMoved < this.speed * dt * 0.18) this._stuckT += dt;
      else this._stuckT = Math.max(0, this._stuckT - dt * 2);
      if (this._stuckT > 0.38 && this._onGround) {
        this._stuckT = 0;
        this._strafeSign *= -1;
        this._wantsJump = true;
        this.wanderCooldown = 0;
      }
    } else {
      this._stuckT = 0;
    }

    this._padTeleCD = Math.max(0, this._padTeleCD - dt);
    if (this._padTeleCD <= 0 && world?.queryTeleport) {
      const dest = world.queryTeleport(this.position.x, this.position.z);
      if (dest) {
        this.position.copy(dest);
        this._velY = 0;
        this._onGround = true;
        this._padTeleCD = 1;
        this._animSpeed = 0;
        this.mesh?.userData?.triggerTeleport?.();
      }
    }

    if (this.position.y < -35) {
      this.respawnAt(this.world.safeSpawnPoint?.([player]) || this.world.randomSpawnPoint());
      return;
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

    if (this.healthBarGroup?.visible) {
      this._healthQuat.copy(this.mesh.quaternion).invert().multiply(camera.quaternion);
      this.healthBarGroup.quaternion.copy(this._healthQuat);
    }

    const resolvedMoving = this._animSpeed > 0.25 && actualMoved > 1e-5;
    const bodySn = Math.sin(this.mesh.rotation.y);
    const bodyCs = Math.cos(this.mesh.rotation.y);
    const resolvedDirF = resolvedMoving
      ? (actualDX * -bodySn + actualDZ * -bodyCs) / actualMoved : 1;
    const resolvedDirR = resolvedMoving
      ? (actualDX * bodyCs + actualDZ * -bodySn) / actualMoved : 0;

    // ── Human soldier: drive its skeletal idle/walk/run animation ──────────────
    if (this._isHuman) {
      const ud = this.mesh.userData;
      const spd = this._animSpeed;
      const moving = resolvedMoving;
      // The tactical steering already expresses travel in the aim-relative
      // frame, so strafing remains correct while the torso tracks the player.
      const strafe = -resolvedDirR;
      if (ud.setLocomotion) {
        ud.setLocomotion(spd, this._onGround, spd > 3.4, strafe, resolvedDirF, resolvedDirR);
      }
      else ud.setMotion(moving ? (this.speed > 3.4 ? 'run' : 'walk') : 'idle');

      // Aim: when engaged with the player, spine + head track them; otherwise
      // gently return to zero via the smoother inside armorTick.
      if (ud.setAim && player) {
        if (this._provoked || engaged) {
          const dx = player.position.x - this.position.x;
          const dz = player.position.z - this.position.z;
          const dy = (player.position.y + 1.0) - (this.position.y + 1.5);
          const worldAim = directionToBodyYaw(dx, dz);
          const dyaw = worldAim - this.mesh.rotation.y;
          // Wrap to [-π, π] so the twist takes the short way round.
          const wrapped = ((dyaw + Math.PI) % (Math.PI * 2)) - Math.PI;
          const flat = Math.hypot(dx, dz);
          const pitch = Math.atan2(dy, flat);
          ud.setAim(pitch, wrapped);
        } else {
          ud.setAim(0, 0);
        }
      }
      const swing = this._isSwordBot && this.lungeTimer > 0
        ? 1 - this.lungeTimer / LUNGE_TIME : 1;
      ud.setActionState?.({
        swing,
        vy: this._velY,
        crouch: 0,
        slide: 0,
        reload: this._reloadTimer > 0 && this._botGun
          ? 1 - this._reloadTimer / this._botGun.reloadTime : 0,
        aim: !this._isSwordBot && (this._provoked || engaged) ? 1 : 0,
        move: moving ? 1 : 0,
        run: THREE.MathUtils.clamp((this._animSpeed - 3.0) / 3.0, 0, 1),
        firing: this._gunKick > 0 ? 1 : 0,
        scoped: 0,
      });
      ud.mixer.update(dt);
      ud.armorTick?.(dt);
    }

    // ── Limb rig walk cycle ────────────────────────────────────────────────────
    // Runs BEFORE the weapon block so the rifle can ride this frame's stride
    // phase rather than last frame's.
    let gait = _STILL;
    // Bots move at 2.6-3.8 m/s — a walk to a jog, nowhere near the player's
    // 9.6 m/s sprint. Mapping that narrow band onto the full walk→sprint blend
    // had every bot leaning into a full sprint while ambling. Hoisted out of
    // the rig block because the melee carry below needs it too.
    const run = THREE.MathUtils.clamp((this._animSpeed - 3.0) / 3.0, 0, 1);
    if (this._rig) {
      const isMoving = resolvedMoving;
      // applyWalkCycle owns the stride phase and locks it to ground speed.
      // Bots now orbit and retreat while aiming, so direction and air state are
      // explicit—the forward-only default would moonwalk during those moves.
      gait = applyWalkCycle(this._rig, {
        speed: isMoving ? this._animSpeed : 0,
        moving: isMoving,
        run,
        dirF: resolvedDirF,
        dirR: resolvedDirR,
        grounded: this._onGround,
        vy: this._velY,
        dt,
      });
      this._walkT = gait.phase;
      // Footsteps, one per heel strike (twice a stride), placed in the world so
      // you can hear someone coming up behind you.
      if (isMoving && this.audio) {
        const step = Math.floor(this._walkT / Math.PI);
        if (step !== this._footPhase) {
          this._footPhase = step;
          this.audio.playAt(this.position, () => this.audio.playFootstep(run > 0.6));
        }
      }
      // The pelvis drops at full stride and the body leans into the run. Local
      // pitch (the mesh is YXZ-ordered) so the lean follows the facing.
      this.mesh.position.y = this.position.y + gait.bob;
      this.mesh.rotation.x = gait.lean;        // already eased, and bob assumes it

      // AR bots' arms belong to the rifle (applyRifleCarry, below, poses both
      // onto the grip and handguard). Sword bots go through the shared melee
      // carry, which also owns the blade — so it runs down with the weapon
      // block rather than here.
    }

    // ── Weapon animation (procedural model only) ───────────────────────────────
    if (this._weaponMesh) {
      const isAlert   = engaged;
      const isMoving  = resolvedMoving;
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
        // Rifle + both arms are driven together so the hands stay ON the gun:
        // relaxed = the across-the-body patrol carry, engaged = shouldered and
        // levelled down the body's forward axis. `swing` breathes/rides the
        // stride, _gunKick shoves it back and climbs the muzzle.
        applyRifleCarry(this._rig, wm, this._alertBlend, dt, {
          swing: gait.swing, kick: this._gunKick,
          move: isMoving ? 1 : 0, run,
          firing: this._gunKick > 0 ? 1 : 0, scoped: 0,
          reload: this._reloadTimer > 0
            ? 1 - this._reloadTimer / this._botGun.reloadTime : 0,
          smooth: true,
        });
      } else {
        // A lunge used to thrust the blade forward on its own while the arms
        // carried on swinging with the stride — the sword moved and the bot
        // holding it did not. Route it through the shared melee carry, which
        // owns both, so a bot's attack reads the same as a player's.
        const swing = isLunging
          ? 1 - this.lungeTimer / LUNGE_TIME       // 0 → 1 across the strike
          : 1;                                     // 1 = at rest
        applyMeleeCarry(this._rig, wm, {
          swing, moving: isMoving, phase: this._walkT, run, dt,
        });
        // Guard rises a little once it has seen you.
        wm.position.y += this._alertBlend * 0.06 + breathe * 1.3 - bob * 0.8;
        wm.position.x += sway * 0.3;
        wm.rotation.z += sway * 0.5;
      }
    }

  }
}
