import * as THREE from 'three';
import { buildPreviewCharacter, rigCharacterLimbs } from '../player/PreviewCharacter.js';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { getWeapon } from '../weapons/weaponDefs.js';
import { applyRifleCarry, restRifleTransform } from '../player/RifleCarry.js';
import { applyWalkCycle } from '../player/Locomotion.js';
import { applyMeleeCarry } from '../player/Actions.js';
import { directionToBodyYaw } from '../player/Facing.js';
import { BOT_TACTICS, advanceBurst, botAimErrorMeters, chooseCombatSteering } from './BotCombat.js';
import { DEATH_FALL_DURATION, deathFallProgress } from '../player/DeathAnimation.js';

const _STILL = { bob: 0, lean: 0, swing: 0 };
const _tmpA = new THREE.Vector3();   // scratch: bullet-cone basis
const _tmpB = new THREE.Vector3();

// AR-type ranged stats â€” sword bots skip shooting entirely. The bot remains a
// fair, imperfect shot; pressure comes from movement, pursuit and short bursts.
const AR_GUN = { damage: 10, fireRate: 0.24, range: 26 };

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

// â”€â”€ Combat tuning â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Aim error in METRES AT THE TARGET rather than as an angle â€” a bot "misses by
// about a metre, more the further out you are". Expressed this way it also
// can't turn into a perfect marksman at point-blank, which a fixed angular cone
// does (a 3Â° cone at 5m physically cannot miss a torso).
// Cover and player strafing still matter because these remain real ray shots.
const AIM_SKILL_MIN = 0.80;    // per-bot multiplier â€” lower is a better shot
const AIM_SKILL_MAX = 1.15;
const REACTION_MIN  = 0.18;    // seconds between acquiring a target and firing
const REACTION_MAX  = 0.52;
// Player hitboxes, relative to their feet: a torso sphere and a head.
const PLAYER_BODY_Y = 1.05, PLAYER_BODY_R = 0.42;
const PLAYER_HEAD_Y = 1.60, PLAYER_HEAD_R = 0.24;

let nextId = 1;

// Bots spawn as the cyborg-terminator models â€” the same low-poly cel-shaded
// endoskeletons the player uses. Cycling the three chassis keeps the mob varied.
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
    this.lungeTimer = 0;
    // The arena reads primarily as a firefight; a smaller sword cohort supplies
    // close-range disruption instead of turning every encounter into a mob.
    this._isSwordBot  = Math.random() < 0.20;
    this.speed = (this._isSwordBot ? 5.15 : 4.55) + Math.random() * 1.15;
    this._botGun      = this._isSwordBot ? null : AR_GUN;
    this._gunTimer    = Math.random() * 0.8;
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
    this._targetYaw   = 0;      // desired facing â€” smoothed each frame (no snap turns)
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

    // Pre-allocated scratch vectors â€” avoids per-frame GC pressure
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
    // Yaw-first euler order, so the run lean (rotation.x) and the death topple
    // (rotation.z) tilt about the BODY's axes rather than the world's.
    this.mesh.rotation.order = 'YXZ';

    // Rig limb pivots for the walk cycle (procedural model only; the human model
    // animates via its own skeletal mixer).
    this._rig = this._isHuman ? null : rigCharacterLimbs(this.mesh);

    const weaponId = this._isSwordBot ? 'sword' : 'm4';

    // Human bots hold their weapon in the rigged right hand â€” same attach +
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
        // AR in the soldier's across-the-body patrol carry â€” stock in the right
        // shoulder, muzzle angled down-left across the chest. applyRifleCarry()
        // drives it from here and blends up to a shouldered aim when engaged.
        restRifleTransform(wm);
      }
      this.mesh.add(wm);
      this._weaponMesh = wm;
      this._weaponBaseZ = wm.position.z;
      if (!this._isSwordBot) {
        // Muzzle flash â€” a bright additive burst parented to the WEAPON at the
        // barrel tip, so it tracks the muzzle no matter how the gun is posed.
        const flash = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.11),
          new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.95,
                                        blending: THREE.AdditiveBlending, depthWrite: false })
        );
        flash.position.set(0, 0.03, -0.72);   // weapon-local barrel tip (âˆ’Z)
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
    this._targetEntity = null;
    this._targetScanT = 0;
    if (this._isSwordBot) {
      if (this._weaponMesh) { this._weaponMesh.position.z = this._weaponBaseZ; this._weaponMesh.rotation.x = -0.70; }
    } else {
      // Snap (dt=1 â‡’ ease factor 1) straight into the patrol carry so the fresh
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

  /** Clear line of sight from the bot's eye to t×4âÚ$z{-®éÜj×6†÷VÆFW&VBæBÆWfVÃ¢7Fö6²–âF†R6†÷VÆFW"Â&'&VÂ7G&–v‡BF÷vàĞ¢òòF†R&öG’w2f÷'v&B†—2Â7W÷'B&ÒW‡FVæFVBÆöærF†R†æFwV&BàĞ¢òòv†B&÷B÷Æ–W"6æ2FòF†R–ç7FçB—BVævvW2àĞ¢òğĞ¢òò&÷F‚vW&R6öÇfVBv—F‚"Ö&öæR”²v–ç7BF†RÆ÷r×öÇ’&–r‡6†÷VÆFW"—f÷G2@Ğ¢òò“Óãsb+ã#rÂVÆ&÷w2B“Óã#‚Â†æG2B“Óãƒ“R’6òF†R&–v‡B†æBÆæG0Ğ¢òòW†7FÇ’öâF†R—7FöÂw&—æBF†RÆVgB†æBöâF†R†æFwV&B(	BF†R†æG26—@Ğ¢òòôâF†RvVöâ–â&÷F‚÷6W2–ç7FVBöbæV"—BàĞ¢òğĞ¢òò&öG’ÖÆö6Â76S¢g&öçBÒ(‰%¢ÂF†RÖöFVÂw2&–v‡BÒµ‚ÂWÒµ’âF†RvVöâw0Ğ¢òò×W§¦ÆR—2—G2÷vâÆö6Â(‰%¢àĞ¢òò)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y Ğ Ğ¢òòw&—ö–çG2–âvVöâÖÆö6Â76R‡W6VB'’F†R6öÇfW#²¶WB†W&R2F†PĞ¢òò6öçG&7BF†R÷6W2&VÆ÷rvW&Rf—GFVBFò’àĞ¦W‡÷'B6öç7Bu$•ôÄô4ÂÒæWrD…$TRåfV7F÷#2ƒÂÓã"Âã“°Ğ¦W‡÷'B6öç7B„äDuT$EôÄô4ÂÒæWrD…$TRåfV7F÷#2ƒÂÓã"ÂÓã#‚“°Ğ¢òòv†W&RF†R7W÷'B†æBvöW2GW&–ær&VÆöC¢VæFW"F†R&V6V—fW"ÂöâF†PĞ¢òòÖv¦–æRvVÆÂÂÆ—GFÆR&V†–æBF†R†æFwV&B—B§W7BÆVgBàĞ¦6öç7BÔuôÄô4ÂÒæWrD…$TRåfV7F÷#2ƒÂÓã#bÂÓã"“°Ğ Ğ¢òò&÷F‚vW&RFF—F–öæÆÇ’7vWBv–ç7BF†R&öG’w2÷vâ6öÆÆ—6–öâföÇVÖW26òF†PĞ¢òò&–fÆR&–FW26ÆV"öbF†R6†W7B–ç7FVBöb6–æ¶–ær–çFò—B(	B÷6RÖÆ"æ‡FÖÀĞ¢òò÷7vVW×G&öÇÆ–Ò&W÷'G2F†RFVWW7BVæWG&F–öâf÷"6æF–FFRÂæBF†W6PĞ¢òòGvòÖV7W&R¤U$òv–ç7BF†RF÷'6ò÷VÇf—2ö†VBàĞ¢òòF†RGvò6'&–W2vW&R†æB×6öÇfVBv–ç7BF†R&Wf–÷W2Â×V6‚Æ&vW"f–wW&PĞ¢òò‡6†÷VÆFW'2BãsbÂâãƒcVÒ&Ò’âF†V—"$õDD”ôå2&R66ÆRÖg&VRæB7FæC°Ğ¢òòF†V—"÷6—F–öç2&R6'&–VBöçFòF†RæWr&Ò'’66Æ–ær&÷WBF†R6†÷VÆFW Ğ¢òòÆ–æR(	BF†R6ÖRÆ6RF†R6''’w2÷vâ7v–ær—f÷G2&÷WB(	B6òF†R&–fÆR6—G0Ğ¢òòBF†R6ÖRö–çBöâF†R6†W7B&VÆF—fRFòF†R&Ò†öÆF–ær—BàĞ¢òğĞ¢òòF†RwVâ—G6VÆb—2äõB66ÆVBv—F‚F†R&öG’ÂæB6†÷VÆBæ÷B&S¢&–fÆR—0Ğ¢òò&÷WBã–Òv†öWfW"—2†öÆF–ær—BâöâF†RöÆB"ã&Òf–wW&R—B&VB2Ğ¢òò6&&–æS²B‡VÖâ66ÆR—B&VG22&–fÆRàĞ¦6öç7B$Õõ44ÄRÒ…Uô$Ò²dõ$T$Ò’òƒãC‚²ã3ƒR“°Ğ¦6öç7Böä&ÒÒ‡‚Â’Â¢’ÓâæWrD…$TRåfV7F÷#2€Ğ¢‚¢$Õõ44ÄRÂ4„õTÄDU%õ’²‡’Òãsb’¢$Õõ44ÄRÂ¢¢$Õõ44ÄR“°Ğ¦6öç7BE$ôÂÒ°Ğ¢w¢öä&ÒƒãS‚Âã3“ÂÓã332’ÀĞ¢w#¢æWrD…$TRäWVÆW"‚Óãcs’ÂãcCbÂãs"’ÀĞ§Ó°Ğ¦6öç7B”ÒÒ°Ğ¢w¢öä&Òƒã#CÂãS3‚ÂÓã#c"’ÀĞ¢w#¢æWrD…$TRäWVÆW"‚Óã#ÂÂ’ÀĞ§Ó°Ğ Ğ¢òò)H)Hv†W&RF†RwVâô”åE2)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H Ğ¢òòF†R”Ò÷6R6'&–W2ã#&Böb—G2÷vâ×W§¦ÆRG&ö÷â–Õ—F6†—2v—fVàĞ¢òòv–ç7BF†RG'VR†÷&—¦öâ(	BF†RævÆRF†R6†÷B7GVÆÇ’ÆVfW2B(	B6òF†@Ğ¢òòG&ö÷†2Fò&R6æ6VÆÆVB÷"WfW'’&öG’–âF†RvÖR–×2ã\+VæFW"—G2÷vàĞ¢òò'VÆÆWG2â6ÆÆW'272F†RÆöö²÷6†÷B—F6‚æBæ÷F†–ærVÇ6S¢F†R6öçfW'6–öàĞ¢òòÆ—fW2†W&R6òF†RÆö6Â&öG’ÂF†RæWGv÷&²fF'2æBF†R&÷G26ææ÷BG&–g@Ğ¢òò'BÂv†–6‚—2W†7FÇ’v†B†VæVBv†VâV6‚÷væVB—G2÷vâ6öç7FçB†&÷G0Ğ¢òò†VÆBF†R&–fÆRFVBÆWfVÂBWfW'’ævÆS²F†R÷F†W"Gvò6†÷vVBc"RöbF†PĞ¢òò&VÂ—F6‚æBvW&RWFò#L+÷WB’àĞ¦6öç7B”Õô$4Uõ•D4‚ÒÓã#°Ğ¢òò&÷VæBöâF†R÷6RÂÖF6†VBFòF†RÆ–W"w2÷vâÆöö²6Æ×…Æ–W"æ§27F÷0Ğ¢òòB’ó"ÒãR’6òæ÷F†–ær–ç6–FRF†R&V6†&ÆR&ævR—2WfW"7WB6†÷'Bâ—@Ğ¢òò6â6fVÇ’&RF†—2v–FS¢ÖV7W&VB7&÷72F†RgVÆÂ7vVWÂ&÷F‚†æG27F’öàĞ¢òòF†RwVâFòã6ÒæBF†R&–fÆRæWfW"7&÷76W2F†RF÷'6òÂ&V6W6RF†PĞ¢òò6†÷VÆFW&VB6''’Ç&VG’&–FW2÷WF&ö&Böb—BöâF†R&–v‡B6†÷VÆFW"âF†PĞ¢òòã“R&B6V–Æ–ærF†—2&WÆ6W2v2æ÷B&÷FV7F–ærv–ç7Bç—F†–æràĞ¦W‡÷'B6öç7B”Õõ•D4…ôÄ”Ô•BÒÖF‚å’ò"ÒãS²òòãƒrã+ÂÆ–W"æ§2w2÷vâ6Æ× Ğ Ğ¢òòVÆ&÷r7v—fVÂ&÷WBF†R6†÷VÆFW.(i&†æB†—3¢v†W&RF†RVÆ&÷r6—G2öâF†R6öæPĞ¢òòöbfÆ–B6öÇWF–öç2âGVæVBFòG&÷F†RG&–vvW"VÆ&÷rF÷vâö&6²v–ç7BF†PĞ¢òò&–'2æB7v–ærF†R7W÷'BVÆ&÷r÷WBVæFW"F†R†æFwV&BàĞ¦6öç7B5t•dTÅõ"ÒÓãbÂ5t•dTÅôÂÒã#°Ğ Ğ¦6öç7B÷G&öÂÒæWrD…$TRåVFW&æ–öâ‚’ç6WDg&öÔWVÆW"…E$ôÂçw"“°Ğ¦6öç7B÷–ÒÒæWrD…$TRåVFW&æ–öâ‚’ç6WDg&öÔWVÆW"„”Òçw"“°Ğ¦6öç7B÷ÒæWrD…$TRåVFW&æ–öâ‚“°Ğ¦6öç7B÷7v–ærÒæWrD…$TRåVFW&æ–öâ‚“°Ğ¦6öç7B÷&ÒÒæWrD…$TRåVFW&æ–öâ‚“°Ğ¦6öç7B÷7BÒæWrD…$TRåVFW&æ–öâ‚“°Ğ¦6öç7BöT7BÒæWrD…$TRäWVÆW"‚“°Ğ¦6öç7B÷÷2ÒæWrD…$TRåfV7F÷#2‚“°Ğ¦6öç7BõBÒæWrD…$TRåfV7F÷#2‚“°Ğ¦6öç7BöBÒæWrD…$TRåfV7F÷#2‚“°Ğ¦6öç7Bö‚ÒæWrD…$TRåfV7F÷#2‚“°Ğ¦6öç7Bô…õ‚ÒæWrD…$TRåfV7F÷#2ƒÂÂ“°Ğ Ğ¢òòGvòÖ&öæR”²öçFò†æBF&vWBâF†RVÆ&÷r—2†–ævRöâF†RÆ–Ö"w2Æö6Â‚ÀĞ¢òòF†R6†÷VÆFW"—2g&VR&÷FF–öâÂæB7v—fVÆ–6·2ö–çBöâF†R6öæRö`Ğ¢òò÷F†W'v—6RÖWV—fÆVçBVÆ&÷rÆ6VÖVçG2àĞ¦gVæ7F–öâ6öÇfT&Ò‡6†÷VÆFW"ÂVÆ&÷rÂ7‚ÂBÂ7v—fVÂ’°Ğ¢–b‚6†÷VÆFW"ÇÂVÆ&÷r’&WGW&ã°Ğ¢öBç6WB…Bç‚Ò7‚ÂBç’Ò4„õTÄDU%õ’ÂBç¢“°Ğ¢6öç7BBÒÖF‚æÖ–â…öBæÆVæwF‚‚’Â$T4‚“°Ğ¢–b„BÂRÓR’&WGW&ã°Ğ¢öBææ÷&ÖÆ—¦R‚“°Ğ¢6öç7B2ÒÖF‚æÖ‚‚ÓÂÖF‚æÖ–âƒÀĞ¢„B¢BÒUô$Ò¢Uô$ÒÒdõ$T$Ò¢dõ$T$Ò’òƒ"¢Uô$Ò¢dõ$T$Ò’’“°Ğ¢6öç7B&VæBÒÖF‚æ6÷2†2“²òò²föÆG2F†Rf÷&V&Òf÷'v&@Ğ¢òòv†W&RF†R†æB6—G2–â6†÷VÆFW"ÖÆö6Â76Rf÷"F†B&VæBÂ&Vf÷&RF†PĞ¢òò6†÷VÆFW"&÷FFW3¢7G&–v‡BF÷vâF†RÆ–Ö"†—2Â7wVærf÷'v&B'’F†RVÆ&÷ràĞ¢ö‚ç6WBƒÂÕUô$ÒÒdõ$T$Ò¢ÖF‚æ6÷2†&VæB’ÂÔdõ$T$Ò¢ÖF‚ç6–â†&VæB’’ææ÷&ÖÆ—¦R‚“°Ğ¢÷&Òç6WDg&öÕVæ—EfV7F÷'2…ö‚ÂöB“°Ğ¢–b‡7v—fVÂ’÷&Òç&V×VÇF—Ç’…÷7v–ærç6WDg&öÔ†—4ævÆR…öBÂ7v—fVÂ’“°Ğ¢6†÷VÆFW"çVFW&æ–öâæ6÷’…÷&Ò“°Ğ¢VÆ&÷rç&÷FF–öâç6WB†&VæBÂÂ“°Ğ§ĞĞ Ğ¢òòF†RwVç2&RäõB66ÆVBFòF†R&öG’ÂæB6†÷VÆBæ÷B&R(	B&–fÆR—2&÷W@Ğ¢òòã–Òv†öWfW"—2†öÆF–ær—Bâ'WBF†BÖVç2F†Rg&öçBöbÆöær†æFwV&B6àĞ¢òò6—B7B6†÷'FW"6†ö÷FW"w2&V6‚ÂæBâ&ÒF†B6ææ÷BvWBF†W&RÆVfW0Ğ¢òòF†R†æB†÷fW&–æröfbF†RVæBöbF†RvVöâàĞ¢òğĞ¢òò&VÂ6†ö÷FW"ç7vW'2F†—2'’w&—–æreU%D„U"$4²Â6òF†B—2v†B†Vç0Ğ¢òò†W&S¢F†R7W÷'BF&vWB6Æ–FW2ÆöærF†RvVöâw2÷vâ†—2ÂF÷v&BF†R7Fö6²ÀĞ¢òòVçF–Â—B—2–ç6–FRF†R&Òw2&V6‚âF†R†æB7F—2öâF†R†æFwV&B(	B§W7B@Ğ¢òòF†R'Böb—BF†R&Ò6â7GVÆÇ’†öÆBâWFöÖF–2ÂæB&–v‡Bf÷"WfW'’wVàĞ¢òò–âF†R'6VæÂ&F†W"F†âGVæVBf÷"öæRàĞ¦6öç7Bö†—2ÒæWrD…$TRåfV7F÷#2‚“°Ğ¦gVæ7F–öâ6Æ–FUFõ&V6‚…BÂ7‚’°Ğ¢öBç6WB…Bç‚Ò7‚ÂBç’Ò4„õTÄDU%õ’ÂBç¢“°Ğ¢6öç7BC"ÒöBæÆVæwF…7‚’Â"Ò$T4‚¢ã“s°Ğ¢–b„C"ÃÒ"¢"’&WGW&ã°Ğ¢ö†—2ç6WBƒÂÂ’æÇ•VFW&æ–öâ…÷“²òòvVöâw2÷vâµ¢ÂF÷v&BF†R7Fö6°Ğ¢6öç7B"ÒöBæF÷B…ö†—2“°Ğ¢6öç7BF—62Ò"¢"ÒC"²"¢#°Ğ¢–b†F—62Â’&WGW&ã²òòVç&V6†&ÆRBç’w&—ö–ç@Ğ¢òòäT$U5B–çFW'6V7F–öâÂæ÷BF†Rf"öæRâ&÷F‚&ö÷G2&R÷6—F—fR†W&R‡F†PĞ¢òò†—2ö–çG2v’g&öÒF†R6†÷VÆFW"’ÂæBF¶–ærF†RÆ&vW"6Æ–FW2F†R†æ@Ğ¢òò7G&–v‡B7BF†RvVöâæB÷WBF†R÷F†W"6–FR(	Bƒ†6ÒöfbF†RwVâàĞ¢6öç7B3ÒÖ"ÒÖF‚ç7'B†F—62“°Ğ¢BæFE66ÆVEfV7F÷"…ö†—2Â3âò3¢Ö"²ÖF‚ç7'B†F—62’“°Ğ§ĞĞ Ğ¢ò¢ Ğ¢¢Æ6RF†R&–fÆRÂF†Vâ6öÇfR&÷F‚&×2öçFò—BàĞ¢ Ğ¢¢F†RvVöâG&ç6f÷&Ò—2F†R6–ævÆR6÷W&6RöbG'WFƒ¢—B—2–çFW'öÆFV@Ğ¢¢&WGvVVâF†RGvò6'&–W2æBF†VâF†R†æG2&R”²vBöçFòF†Rw&—æBF†PĞ¢¢†æFwV&BWfW'’g&ÖRâF†BÖVç2F†R†æG2&RW†7FÇ’öâF†RwVâBçĞ¢¢&ÆVæBfÇVRÂç’7G&–FR†6RÂç’&V6ö–Â7FFR(	BF†W&R—2æò÷6R—"FğĞ¢¢G&–gB'BÂv†–6‚—2v†B†Vç2–b–÷R–çFW'öÆFR&×2æBvVöàĞ¢¢6W&FVÇ’ÆöærF†V—"÷vâF‡2àĞ¢ Ğ¢¢7v–æv—2F†RÆ–fR–âF†R÷6R(	B'&VF†–ærB&W7BÂF†R&–fÆR&–F–ærF†PĞ¢¢7G&–FRv†–ÆRÖ÷f–ærâ—B&÷FFW2F†R&–fÆR&÷WBF†R6†÷VÆFW"Æ–æRÂæBF†PĞ¢¢&×26–×Ç’föÆÆ÷r—BàĞ¢ Ğ¢¢&Ò¶ö&¦V7GÒ&–r²&ÔÂÂ&Õ"ÂVÆ&÷tÂÂVÆ&÷u"ÒÆ–Ö"—f÷G0Ğ¢¢&ÒµD…$TRäö&¦V7C4GÒvVöâF†RvVöâÖöFVÂ&VçFVBFòF†R&öG’†÷"çVÆÂĞ¢¢&Ò¶çVÖ&W'Ò–ÒÒG&öÂ6''’ÂÒ6†÷VÆFW&VBæB–Ö–æpĞ¢¢&Ò¶çVÖ&W'ÒGBg&ÖRFVÇF‡6V6öæG2’(	BVçW6VBÂ¶WBf÷"6ÆÆW'0Ğ¢¢&Ò¶ö&¦V7GÒ¶õÒ²–Õ—F6‚Â7v–ærÂ¶–6²Â&VÆöBÂ7vÂfÆ–æ6‚ÂF‡&÷uÂ6Öö÷F‚Ğ¢¢–Õ—F6†—2v†W&RF†—2&öG’—24„ôõD”ärÂ–â&F–ç2v–ç7BF†R†÷&—¦öàĞ¢¢‡÷6—F—fRW’(	B72F†RÆöö²—F6‚Â÷"f÷"&÷BF†RVÆWfF–öâöbF†R&Ğ¢¢—B7GVÆÇ’f—&W2â6†÷VÆFW&VBÂF†R×W§¦ÆR6öÖW2÷WBöâW†7FÇ’F†BævÆRàĞ¢¢Fòæ÷B&R×66ÆR—C²F†R6†÷VÆFW"&ÆVæBÂF†R&öG’w2÷vâÆVâ†&öG•—F6†ÀĞ¢¢72v†FWfW"–÷R6WBöâF†R&öG’w2&÷FF–öâç‚’æBF†R÷6Rw2G&ö÷&PĞ¢¢ÆÂ†æFÆVB†W&RàĞ¢¢&VÆöB÷7vöfÆ–æ6‚÷F‡&÷u&R(i#7F–öâ&öw&W76W2âF†W’Ö÷fRF†RtTôàĞ¢¢†æBÂf÷"&VÆöBÂF†R7W÷'B†æBw2F&vWBöâ—B’(	BæWfW"F†R&×0Ğ¢¢F—&V7FÇ’Â&V6W6RF†R&×2&R”²vBöçFòv†W&WfW"F†RvVöâVæG2Wæ@Ğ¢¢÷6–ærF†VÒ†W&R2vVÆÂv÷VÆB§W7Bf–v‡BF†B6öÇfRàĞ¢¢ğĞ¦W‡÷'BgVæ7F–öâÇ•&–fÆT6''’‡&–rÂvVöâÂ–ÒÂGBÂòÒ·Ò’°¢6öç7BÒÖF‚æÖ‚ƒÂÖF‚æÖ–âƒÂ–Ò’“°Ğ¢6öç7B¶–6²Òòæ¶–6²ÇÂ°Ğ¢6öç7B&VÆöBÒòç&VÆöBÇÂÂ7vÒòç7vÇÂÂfÆ–æ6‚ÒòæfÆ–æ6‚ÇÂ°Ğ¢òò(i"(i"6†W2f÷"F†R7F–öç2F†Bvò6öÖWv†W&RæB6öÖR&6²àĞ¢6öç7B&VÆöD"Ò&VÆöBâòÖF‚ç6–â„ÖF‚å’¢&VÆöB’¢°Ğ¢6öç7B7v"Ò7vâòÖF‚ç6–â„ÖF‚å’¢7v’¢°Ğ¢òò†—B—26†'öâæB6Æ÷röfbÂæ÷B7–ÖÖWG&–2àĞ¢6öç7BfÆ–æ6„"ÒfÆ–æ6‚â Ğ¢ò†fÆ–æ6‚ÂãRòfÆ–æ6‚òãR¢ÖF‚ç÷rƒÒ†fÆ–æ6‚ÒãR’òãƒRÂ"’’¢°Ğ¢òòv÷&¶–ærF†R&öÇBÂF†—&BöbF†Rv’F‡&÷Vv‚F†R&VÆöBàĞ¢6öç7B&6²Ò&VÆöBâòÖF‚æW‡‚ÔÖF‚ç÷r‚‡&VÆöBÒãc"’òãbÂ"’’¢°Ğ Ğ¢òòv†W&RF†R6†÷B—2vö–ærâ66ÆVB'’F†R6†÷VÆFW"&ÆVæBÂ&V6W6RG&öÀĞ¢òò6''’—2æ÷B–ÖVBBç—F†–ær(	BBÒF†R×W§¦ÆRÆæG2W†7FÇ’öàĞ¢òò–Õ—F6†ÂæB—BfFW2÷WB2F†R&–fÆR6öÖW2F÷vâöfbF†R6†÷VÆFW"àĞ¢òò&öG•—F6†6öÖW2&6²÷WB&V6W6RF†RvVöâ†æw2öfbF†R&öG’æ@Ğ¢òò–æ†W&—G2—G2'VâÆVã²v—F†÷WBF†BF†R×W§¦ÆR6—G2WFòœ+öfbBĞ¢òò7&–çF–ærÆVâv†–ÆRF†R6†÷B7F–ÆÂÆVfW2ÆöærF†R6ÖW&àĞ¢6öç7B–Õ—F6‚ÒÖF‚æÖ‚‚Ô”Õõ•D4…ôÄ”Ô•BÀĞ¢ÖF‚æÖ–â„”Õõ•D4…ôÄ”Ô•BÂ†òæ–Õ—F6‚ÇÂ’Ò†òæ&öG•—F6‚ÇÂ’’“°Ğ Ğ¢òòWfW'—F†–ærF†BÖ÷fW2F†R&–fÆRv—F†÷WB6†æv–ærF†Rw&—&–FW2F†—2öæPĞ¢òò6öÖÖöâÖÖöFR6†÷VÆFW"—F6ƒ¢F†R–Ò—G6VÆbÂ–FÆR'&VF†–ærò7G&–FRÂ&V6ö–ÂÀĞ¢òòæBÆ–gBF‡&÷Vv‚F†RÖ–FFÆRöbF†RG&öÎ(i&–Ò&ÆVæB†7G&–v‡@Ğ¢òò–çFW'öÆF–öâG&w2F†R'WGG7Fö6²F‡&÷Vv‚F†R&–v‡BV2öâF†Rv’7&÷72’àĞ¢6öç7B7v–ærÒ†–Õ—F6‚Ò”Õô$4Uõ•D4‚’¢Ğ¢²†òç7v–ærÇÂ’Ò¶–6²¢ã²ãb¢ÖF‚ç6–â„ÖF‚å’¢Ğ¢òò×W§¦ÆRG&÷2v†–ÆRF†R†æG2&R'W7’ÂæBv–âv†Vâ†—BàĞ¢Òã3B¢&VÆöD"ÒãSR¢7v"Òã3¢fÆ–æ6„"Òã¢&6³°Ğ Ğ¢÷÷2æÆW'fV7F÷'2…E$ôÂçwÂ”ÒçwÂ“°Ğ¢òò&÷rF†RF‚f÷'v&BF‡&÷Vv‚F†RÖ–FFÆRöbF†R&ÆVæB6òF†R'WGG7Fö6°Ğ¢òò7v–æw2&÷VæBF†R&–v‡BV2&F†W"F†â7G&–v‡BF‡&÷Vv‚—Bâg&VRFòFğĞ¢òòæ÷rF†BF†R†æG2&R”²vBFòv†W&WfW"F†R&–fÆRVæG2WàĞ¢÷÷2ç¢ÓÒãsR¢ÖF‚ç6–â„ÖF‚å’¢“°Ğ¢÷÷2ç¢³Ò¶–6²¢ã3²òò&V6ö–Â6†÷fW2—B&6°Ğ¢òò6ÆW'†æ÷BWVÆW"ÖÆW'’&WGvVVâF†RGvò6'&–W2(	BF†RG&öÂ÷6R—2Ğ¢òòÆ&vR6ö×÷VæB&÷FF–öâæBWVÆW"&ÆVæF–ær7v–æw2—BF‡&÷Vv‚§Væ²àĞ¢÷ç6ÆW'VFW&æ–öç2…÷G&öÂÂ÷–ÒÂ“°Ğ Ğ¢òò&VÆöB&öÆÇ2F†R&V6V—fW"WF÷v&BF†R&öG’6òF†RÖrvVÆÂf6W2F†PĞ¢òò7W÷'B†æC²7vG&÷2F†Rv†öÆRvVöâ÷WBöbg&ÖRæB'&–æw2—@Ğ¢òò&6²â&÷F‚&R&÷FF–öç2&÷WBF†RvVöâw2÷vâ†W2ÂÆ–VB&Vf÷&RF†PĞ¢òò6†÷VÆFW"7v–ær6òF†W’&VB2F†Rw&—7G2v÷&¶–ær&F†W"F†âF†RF÷'6òàĞ¢–b‡&VÆöD"ÇÂ7v"’°Ğ¢÷7Bç6WDg&öÔWVÆW"…öT7Bç6WBƒã3¢&VÆöD"Òãs¢7v"ÂÀĞ¢ãƒR¢&VÆöD"²ã3¢7v"’“°Ğ¢÷æ×VÇF—Ç’…÷7B“°Ğ¢÷÷2ç’ÓÒã2¢&VÆöD"²ã#B¢7v#°Ğ¢÷÷2ç‚ÓÒãR¢&VÆöD#°Ğ¢ĞĞ¢–b‡&6²’÷÷2ç¢³ÒãCR¢&6³²òòF†R&öÇBvö–ær&6°Ğ Ğ¢–b‡7v–ær’°¢òò&–v–B&÷FF–öâ&÷WBF†R‚†—2F‡&÷Vv‚F†R6†÷VÆFW"Æ–æR‡“Õ4„õTÄDU%õ’ÀĞ¢òò£Ó’Â6òF†R&–fÆR—f÷G2v†W&RF†R&×2&Ræ6†÷&VBàĞ¢÷7v–ærç6WDg&öÔ†—4ævÆR…ô…õ‚Â7v–ær“°Ğ¢6öç7BG’Ò÷÷2ç’Ò4„õTÄDU%õ’ÂG¢Ò÷÷2ç£°Ğ¢6öç7B72ÒÖF‚æ6÷2‡7v–ær’Â6âÒÖF‚ç6–â‡7v–ær“°Ğ¢÷÷2ç’Ò4„õTÄDU%õ’²G’¢72ÒG¢¢6ã°Ğ¢÷÷2ç¢ÒG’¢6â²G¢¢73°Ğ¢÷ç&V×VÇF—Ç’…÷7v–ær“°¢Ğ ¢òòæWGv÷&²6æ6†÷G2Âæ–ÖF–öâ7FFRVFvW2æB6ö'6Rg&ÖR6–ær6âÖ÷fP¢òòF†RFW6—&VB6''’'’6WfW&Â6VçF–ÖWG&W2–âöæRF–6²â6Öö÷F‚F†R6–ævÆP¢òò6÷W&6RÖöb×G'WF‚vVöâ÷6Rf—'7BÂF†Vâ6öÇfR&÷F‚&×2v–ç7BF†BW†7@¢òòF—7Æ–VB÷6R&VÆ÷râ6Öö÷F†–ær&×2æBwVâ–æFWVæFVçFÇ’v÷VÆBÖ¶RF†P¢òò†æG2f—6–&Ç’7v–ÒöfbF†Rw&—à¢–b‡vVöâbbòç6Öö÷F‚’°¢6öç7B7FFRÒvVöâçW6W$FFç&–fÆT6''•6Öö÷F†–ærÇÃÒ°¢–æ—F–Æ—¦VC¢fÇ6RÀ¢÷6—F–öã¢æWrD…$TRåfV7F÷#2‚’À¢VFW&æ–öã¢æWrD…$TRåVFW&æ–öâ‚’À¢Ó°¢–b‚7FFRæ–æ—F–Æ—¦VBÇÂ†GBâ’ÇÂGBâã"’°¢7FFRç÷6—F–öâæ6÷’…÷÷2“°¢7FFRçVFW&æ–öâæ6÷’…÷“°¢7FFRæ–æ—F–Æ—¦VBÒG'VS°¢ÒVÇ6R°¢òòf7B7&—F–6ÆÇ’ÖF×VBÖÆöö¶–ær&W7öç6S¢V–6²Væ÷Vv‚f÷"wVçÆ’À¢òò6öçF–çV÷W2Væ÷Vv‚F†B–Ò÷&VÆöB÷7vVFvW2Fòæ÷B÷F†RÖöFVÂà¢6öç7B÷6—F–öäÇ†ÒÒÖF‚æW‡‚Ó#"¢GB“°¢6öç7B&÷FF–öäÇ†ÒÒÖF‚æW‡‚Ó#b¢GB“°¢7FFRç÷6—F–öâæÆW'…÷÷2Â÷6—F–öäÇ†“°¢7FFRçVFW&æ–öâç6ÆW'…÷Â&÷FF–öäÇ†’ææ÷&ÖÆ—¦R‚“°¢Ğ¢÷÷2æ6÷’‡7FFRç÷6—F–öâ“°¢÷æ6÷’‡7FFRçVFW&æ–öâ“°¢Ğ ¢–b‡vVöâ’²vVöâç÷6—F–öâæ6÷’…÷÷2“²vVöâçVFW&æ–öâæ6÷’…÷“²Ğ Ğ¢–b‡&–r’°Ğ¢6öÇfT&Ò‡&–ræ&Õ"Â&–ræVÆ&÷u"Â4„õTÄDU%õ‚ÀĞ¢õBæ6÷’„u$•ôÄô4Â’æÇ•VFW&æ–öâ…÷’æFB…÷÷2’Â5t•dTÅõ"“°Ğ¢òòF†R7W÷'B†æBÆVfW2F†R†æFwV&Bf÷"F†RÖv¦–æRæB6öÖW2&6²àĞ¢òò†VÆBBF†RÖrF‡&÷Vv‚F†RÖ–FFÆRöbF†R&VÆöB&F†W"F†â6Æ–F–æpĞ¢òò6öçF–çV÷W6Ç’Â6ò—B&VG22GvòÖ÷fW2(	B7G&—Â6VB(	Bæ÷BöæR6ÖV"àĞ¢–b‡&VÆöBâ’°Ğ¢6öç7B†öÆBÒÖF‚æÖ–âƒÂÖF‚ç6–â„ÖF‚å’¢ÖF‚æÖ–âƒÂ&VÆöB¢ã‚’’¢ã’“°Ğ¢õBæ6÷’„„äDuT$EôÄô4Â’æÆW'„ÔuôÄô4ÂÂ†öÆB“°Ğ¢ÒVÇ6R°Ğ¢õBæ6÷’„„äDuT$EôÄô4Â“°Ğ¢ĞĞ¢õBæÇ•VFW&æ–öâ…÷’æFB…÷÷2“°Ğ¢6Æ–FUFõ&V6‚…õBÂÕ4„õTÄDU%õ‚“°Ğ¢6öÇfT&Ò‡&–ræ&ÔÂÂ&–ræVÆ&÷tÂÂÕ4„õTÄDU%õ‚ÂõBÂ5t•dTÅôÂ“°Ğ¢òòw&VæFRvöW2–âF†Röfb†æBÂ÷fW'&–F–ærF†R7W÷'Bw&—VçF—&VÇ’(	@Ğ¢òò—B†2Fò&RÆ–VBÆ7B÷"F†R”²&÷fRv÷VÆBWBF†R†æB&6²àĞ¢–b†òçF‡&÷u’Ç•F‡&÷t&Ò‡&–rÂòçF‡&÷u“°Ğ¢ĞĞ§ĞĞ Ğ¢ò¢¢F†RæWWG&Â‡VâÖæ–ÖFVB’G&ç6f÷&ÒÂf÷"GF6†–ærg&W6†Ç’'V–ÇBvVöââ¢ğĞ¦W‡÷'BgVæ7F–öâ&W7E&–fÆUG&ç6f÷&Ò‡vVöâ’°Ğ¢vVöâç÷6—F–öâæ6÷’…E$ôÂçw“°Ğ¢vVöâçVFW&æ–öâæ6÷’…÷G&öÂ“°Ğ§ĞĞ 