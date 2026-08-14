import * as THREE from 'three';
import { WEAPONS } from './weaponDefs.js';
import { buildWeaponModel, onWeaponModelsReady } from './WeaponModels.js';
import { applyWeaponSkin, animateWeaponSkin } from './WeaponSkins.js';
import { applySwordSkin, animateSwordSkin } from './SwordSkins.js';
import {
  advanceFireCooldown,
  scheduleNextShot,
  wantsTriggerShot,
} from './FireControl.js';

const FLASH_LIFE = 0.038;

// Stand-in "object" for a hit on one of the map's bare box colliders â€” it has
// no mesh, but the hit-handling code only ever reads userData off it.
const _BOX_OBJ = { userData: {} };

// â”€â”€ smoothing helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Frame-rate-INDEPENDENT exponential smoothing: the result is identical at any
// framerate (unlike `x += (t-x)*k*dt`, which jitters when dt varies). `lambda`
// is the decay rate â€” bigger = snappier. This is the core of the smooth feel.
function expDamp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}
// Exact critically damped spring. Unlike an Euler step, this produces the same
// pose after a given elapsed time at 30, 60, 144Hz, or a briefly uneven frame.
function springTo(x, v, target, stiffness, _damping, dt) {
  const h = Math.max(0, dt);
  const omega = Math.sqrt(stiffness);
  const offset = x - target;
  const impulse = v + omega * offset;
  const decay = Math.exp(-omega * h);
  return [
    target + (offset + impulse * h) * decay,
    (v - omega * impulse * h) * decay,
  ];
}

// Kawaii skins (anime pew, cat meow, uwu squeak, puppy yip, magic sparkle) all
// get the pink muzzle flash + sparkle-heart burst treatment.
const CUTE_SOUNDS = new Set(['anime', 'waifu', 'meow', 'uwu', 'bark', 'sparkle']);
// Fire-sound skins get an orange/red muzzle flash + ember burst.
const FIRE_SOUNDS = new Set(['fire']);

function createTracerMesh() {
  const geo = new THREE.CylinderGeometry(0.0035, 0.0035, 1, 5, 1, true);
  geo.translate(0, 0.5, 0);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.84 });
  return new THREE.Mesh(geo, mat);
}

// How far in front of the eye the viewmodel sits. The asynchronously loaded
// authored guns have much longer stocks than the procedural fallbacks (DMR is
// the worst case), and recoil moves the whole gun back toward the eye. Keeping
// the shared mount farther out preserves the hand-to-grip relationship while
// leaving every shipped model clear of the camera's near plane.
const VIEWMODEL_Z = -0.82;
// EV.IO's hip-fire rifle is shouldered diagonally rather than laid flat across
// the bottom of the screen: its butt exits the lower-right corner while the
// muzzle rises back toward the reticle.  The offset and three-axis cant are one
// shared transform so the weapon and both gripping hands cannot drift apart.
const VIEWMODEL_X = 0.40;
const VIEWMODEL_Y = -0.37;
const VIEWMODEL_SCALE = 0.76;
const VIEWMODEL_PITCH = 0.18;
const VIEWMODEL_YAW = 0.31;
const VIEWMODEL_ROLL = -0.10;
const REFERENCE_ASPECT = 16 / 9;

// First-person hand targets in each weapon model's local coordinate system.
// Procedural and authored weapons share the same forward convention (-Z), but
// their pistol grips do not share a depth. A single hand transform therefore
// made short weapons miss the palm and made rifles appear to float in front of
// it. These targets describe the centre of the physical grip/handguard; the
// rig converts them to wrist-group transforms below.
const DEFAULT_HAND_POSE = {
  trigger: [0.012, -0.086, 0.19],
  support: [-0.012, 0.022, -0.22],
  supportVisible: true,
};
const VIEWMODEL_HAND_POSES = {
  sidearm:       { trigger: [0.010, -0.108, 0.105], supportVisible: false },
  magnum:        { trigger: [0.010, -0.112, 0.105], supportVisible: false },
  uzi:           { trigger: [0.010, -0.060, 0.040], support: [-0.010, 0.020, -0.105] },
  levershotgun:  { trigger: [0.010, -0.088, 0.140], support: [-0.012, 0.016, -0.255] },
  m4:            { trigger: [0.012, -0.092, 0.200], support: [-0.012, 0.026, -0.235] },
  m16:           { trigger: [0.012, -0.088, 0.200], support: [-0.012, 0.020, -0.270] },
  rifle:         { trigger: [0.012, -0.100, 0.150], support: [-0.012, 0.018, -0.225] },
  lmg:           { trigger: [0.012, -0.114, 0.220], support: [-0.012, 0.012, -0.280] },
  rpg:           { trigger: [0.012, -0.082, 0.060], support: [-0.012, 0.010, -0.255] },
  boltsniper:    { trigger: [0.012, -0.082, 0.200], support: [-0.012, 0.016, -0.285] },
  battlerifle:   { trigger: [0.012, -0.090, 0.190], support: [-0.012, 0.020, -0.245] },
  needler:       { trigger: [0.012, -0.090, 0.145], support: [-0.012, 0.018, -0.185] },
  plasmarifle:   { trigger: [0.012, -0.086, 0.155], support: [-0.012, 0.018, -0.205] },
  dmr:           { trigger: [0.012, -0.082, 0.220], support: [-0.012, 0.020, -0.260] },
  fuelrod:       { trigger: [0.012, -0.095, 0.110], support: [-0.012, 0.015, -0.235] },
  concussion:    { trigger: [0.012, -0.090, 0.120], support: [-0.012, 0.018, -0.215] },
  energyshotgun: { trigger: [0.012, -0.092, 0.175], support: [-0.012, 0.018, -0.245] },
  sword:         { trigger: [0.000, -0.020, 0.160], supportVisible: false },
  knife:         { trigger: [0.000, -0.020, 0.120], supportVisible: false },
  ghammer:       { trigger: [0.010, -0.120, 0.180], support: [-0.010, -0.015, -0.035] },
};

// Preserve the lower-right composition on landscape screens without pushing
// both gloves out of portrait/mobile view. Capped on ultrawide so the weapon
// does not drift all the way into the corner.
function viewmodelAspectScale(aspect) {
  return THREE.MathUtils.clamp((aspect || REFERENCE_ASPECT) / REFERENCE_ASPECT, 0.32, 1.15);
}

function viewmodelReloadScale(aspect) {
  if (aspect < 1) return 0.38;
  if (aspect < 1.5) return 0.22;
  return 0.30;
}

// A narrow FOV magnifies the same world-space offset. Lift the mount only at
// sub-78Â° settings so the compact default pose stays low while 60Â° players do
// not lose the trigger glove below the frame.
function viewmodelFovLift(fov) {
  return THREE.MathUtils.clamp((78 - (fov || 78)) * 0.0067, 0, 0.12);
}

// The reticle owns the sight picture for the complete ADS transition. Hiding
// only near full zoom let a centered receiver sweep directly across the target
// while the FOV narrowedâ€”the obstruction players actually notice most. Clear
// on the first held-aim frame, then keep the rig out until the zoom is almost
// completely released so it cannot flash back over the target on scope-out.
// Melee weapons never enter ADS.
export function shouldHideAdsViewmodel(def, scopeT, aimHeld = false) {
  if (!def || def.kind === 'melee') return false;
  return aimHeld || scopeT > 0.08;
}

export class WeaponSystem {
  constructor(camera, scene, audio) {
    this.camera = camera;
    this.scene = scene;
    this.audio = audio;

    // Every weapon model/state is kept so any can be brought into a match, but
    // the ACTIVE loadout is exactly one gun + one melee (set via setLoadout).
    this.allWeapons = WEAPONS;
    const defGun   = WEAPONS.find((w) => w.kind !== 'melee');
    const defMelee = WEAPONS.find((w) => w.kind === 'melee');
    this.loadout = [defGun, defMelee].filter(Boolean);
    this.keyMap = new Map();
    this._rebuildKeyMap();
    this.currentIndex = 0;
    this.state = new Map();
    for (const w of this.allWeapons) {
      this.state.set(w.id, {
        magAmmo: w.kind === 'melee' ? 0 : w.magSize,
        reserveAmmo: w.kind === 'melee' ? 0 : w.reserveMax,
        isReloading: false,
        reloadTimer: 0
      });
    }

    // Thrown-knife projectiles
    this.thrownKnives = [];
    this._knifeCooldown = 0;
    this._prevRightMouse = false;

    this.fireTimer = 0;
    this.prevMouseDown = false;
    this.kickPos = new THREE.Vector3();
    this.kickVel = new THREE.Vector3();   // recoil spring velocity
    this.kickRotX = 0;
    this.kickRotXVel = 0;
    this.swingPhase = 1;
    this.scopeT = 0; // 0..1 zoom blend
    this._sprintT = 0; // 0..1 sprint carry blend
    // smoothed viewmodel state (all frame-rate-independent) â€” the applied
    // transform eases toward these targets so nothing ever snaps.
    this._swayX = 0; this._swayY = 0;         // smoothed look-sway
    this._swayVelX = 0; this._swayVelY = 0;   // smoothed mouse velocity
    this._bobPhase = 0;                       // continuous bob phase (own clock)
    this._mountPos = new THREE.Vector3(
      VIEWMODEL_X * viewmodelAspectScale(camera.aspect), VIEWMODEL_Y, VIEWMODEL_Z);
    this._mountRot = new THREE.Vector3(VIEWMODEL_PITCH, VIEWMODEL_YAW, VIEWMODEL_ROLL);
    this._raiseT = 1;                         // 0=just switched (lowered) â†’ 1=up
    this._wasGrounded = true;                 // viewmodel landing impulse edge
    this._landT = 0;                          // 0.22s settle after touching down
    this._landStrength = 0;                   // impact-scaled landing response
    this._fallSpeed = 0;                      // fastest downward speed this airtime
    this._shotBloom = 0;                      // sustained-fire accuracy cone

    this.tracers = [];
    this.muzzleSmoke = [];
    this.rockets = [];
    this.explosions = [];
    this.shells = [];
    this._idleT = 0;
    this.weaponSkin = null;
    this.swordSkin = null;
    this.animTime = 0;
    this.flashLight = new THREE.PointLight(0xffcc66, 0, 8, 1.8);
    // (sky-only lighting) flashLight not added to scene

    // Visible muzzle flash sprite â€” two crossed quads for a star shape
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xfff0a0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
    });
    this._flashMeshes = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.PlaneGeometry(0.18, 0.18);
      const mesh = new THREE.Mesh(geo, flashMat.clone());
      mesh.rotation.z = (i / 3) * Math.PI;
      this._flashMeshes.push(mesh);
    }

    // Pre-allocated scratch vectors â€” avoids GC spikes from per-shot allocations
    this._camPos      = new THREE.Vector3();
    this._camDir      = new THREE.Vector3();
    this._rightVec    = new THREE.Vector3();
    this._upVec       = new THREE.Vector3();
    this._fwdVec      = new THREE.Vector3();
    this._muzzleWorld = new THREE.Vector3();
    this._pelletDir   = new THREE.Vector3();
    this._farVec      = new THREE.Vector3();
    this._raycaster   = new THREE.Raycaster();
    this._targets     = [];   // reused raycast target list (no per-shot allocation)

    // Shared shell casing geo/mat â€” created once, reused by every ejected casing
    this._shellGeo = new THREE.CylinderGeometry(0.0048, 0.0035, 0.02, 6);
    this._shellMat = new THREE.MeshStandardMaterial({ color: 0xd4a520, roughness: 0.28, metalness: 0.9 });

    this._buildViewmodels();
    this._lastSpawnedTracerHolder = scene;

    this.onShoot = null; // (weaponDef) => void
    this.onHitBot = null; // (bot, dmg, point) => void
    this.onHitWorld = null; // (point) => void
    this.onEmpty = null; // () => void
    this.onReloadStart = null;
    this.applyRecoilToPlayer = null; // (amount) => void
  }

  _buildViewmodels() {
    this.weaponMount = new THREE.Object3D();
    // The reference rifle owns the lower-right quadrant but stays slim enough
    // to leave the arena readable. Keep the stock crossing the lower/right
    // edge instead of filling that whole quadrant like the previous 0.96 rig.
    // The weapon and visible trigger-side arm share this deeper mount. Moving
    // the model alone would clear the stock but detach the hand from its grip.
    this.weaponMount.position.set(
      VIEWMODEL_X * viewmodelAspectScale(this.camera.aspect), VIEWMODEL_Y, VIEWMODEL_Z);
    this.weaponMount.rotation.set(VIEWMODEL_PITCH, VIEWMODEL_YAW, VIEWMODEL_ROLL);
    this.weaponMount.scale.setScalar(VIEWMODEL_SCALE);
    this.camera.add(this.weaponMount);

    // Dedicated viewmodel key light â€” a short-range light parented to the camera
    // that rakes across the gun so its metal/clearcoat highlights always read.
    this.vmLight = new THREE.PointLight(0xffffff, 4.5, 1.8, 2);
    this.vmLight.position.set(0.5, 0.35, 0.0);
    // (sky-only lighting) vmLight not added to scene
    // Cool fill from the other side to shape the form.
    this.vmFill = new THREE.PointLight(0x88aaff, 1.6, 1.8, 2);
    this.vmFill.position.set(-0.5, -0.1, -0.2);
    // (sky-only lighting) vmFill not added to scene

    this.swayGroup = new THREE.Object3D();
    this.weaponMount.add(this.swayGroup);

    this.kickGroup = new THREE.Object3D();
    this.swayGroup.add(this.kickGroup);

    this.models = new Map();
    for (const w of this.allWeapons) {
      const { group, muzzle } = buildWeaponModel(w);
      group.visible = false;
      this.kickGroup.add(group);
      this.models.set(w.id, { group, muzzle });
    }
    this._setActiveModel(0);
    this._buildArm();

    // The viewmodels above are procedural (the GLB loads async and is rarely
    // ready this early). Swap in the detailed Blender models once it arrives.
    onWeaponModelsReady(() => this._refreshModels());
  }

  // Rebuild every viewmodel (e.g. after the weapon GLB finishes loading),
  // preserving visibility and any applied cosmetic state.
  _refreshModels() {
    for (const w of this.allWeapons) {
      const old = this.models.get(w.id);
      const { group, muzzle } = buildWeaponModel(w);
      group.visible = old ? old.group.visible : false;
      if (old) this.kickGroup.remove(old.group);
      this.kickGroup.add(group);
      this.models.set(w.id, { group, muzzle });
    }
    if (this._armoryMap) this.applyArmoryMap(this._armoryMap);
    if (this.weaponSkin) this.setWeaponSkin(this.weaponSkin);
    if (this.swordSkin) this.setSwordSkin(this.swordSkin);
  }

  _buildArm() {
    this.sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x2d3540, roughness: 0.78, metalness: 0.05, envMapIntensity: 0.6,
    });
    this.gloveMat = new THREE.MeshStandardMaterial({
      color: 0x353e4a, roughness: 0.58, metalness: 0.08, envMapIntensity: 1.0,
    });
    this.cuffMat = new THREE.MeshStandardMaterial({
      color: 0x0c0e12, roughness: 0.6, metalness: 0.08,
    });
    this.armPlateMat = new THREE.MeshStandardMaterial({
      color: 0x657080, roughness: 0.5, metalness: 0.26, envMapIntensity: 0.8,
    });

    const box = (w, h, d, material) => new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d), material,
    );
    const up = new THREE.Vector3(0, 1, 0);
    const segment = (a, b, startRa×¹ÒÚ$z{-®éÜj×F‡&÷r‡&–v‡BÖ6Æ–6²“¢öæRÖ†—B¶–ÆÂ²7‚&Wv&Bâ6ööÆF÷vâ†–FW2F†PĞ¢òò–âÖ†æB¶æ–fRVçF–Âg&W6‚öæR—2VÆÆVBàĞ¢–b‡F†—2åö¶æ–fT6ööÆF÷vââ’°Ğ¢F†—2åö¶æ–fT6ööÆF÷vâÓÒGC°Ğ¢–b‡F†—2åö¶æ–fT6ööÆF÷vâÃÒbbFVbæ¶–æBÓÓÒvÖVÆVRr’°Ğ¢6öç7BÒÒF†—2æÖöFVÇ2ævWB†FVbæ–B“°Ğ¢–b†Ò’Òæw&÷Wçf—6–&ÆRÒG'VS°Ğ¢ĞĞ¢ĞĞ¢6öç7B&–v‡D§W7E&W76VBÒ–çWBç&–v‡DÖ÷W6TF÷vâbbF†—2å÷&We&–v‡DÖ÷W6S°Ğ¢–b†FVbæ¶–æBÓÓÒvÖVÆVRrbbFVbçF‡&÷v&ÆRbb&–v‡D§W7E&W76VBbbF†—2åö¶æ–fT6ööÆF÷vâÃÒ’°Ğ¢F†—2å÷F‡&÷t¶æ–fR†FVb“°Ğ¢ĞĞ¢F†—2å÷&We&–v‡DÖ÷W6RÒ–çWBç&–v‡DÖ÷W6TF÷vã°Ğ Ğ¢òò7&–çB&ÆVæBf÷"4ôB6''’æ–ÖF–öâ†&Æö6·2E2Ğ¢F†—2å÷7&–çEBÒW‡F×‡F†—2å÷7&–çEBÂÆ–W"æ—57&–çF–ærò¢Â’ÂGB“°Ğ Ğ¢òòWfW'’Ubä”òf—&V&Ò6â¦ööÒâ6æ—W'27F–ÆÂW6RF†RgVÆÂ66÷R÷fW&Æ“°Ğ¢òò&VwVÆ"wVç26†÷VÆFW"–çFò6VçFW&VBÂÆ÷vW"Ôdõb6–v‡B–7GW&RàĞ¢6öç7BvçE66÷RÒFVbæ¶–æBÓÒvÖVÆVRrbb–çWBç&–v‡DÖ÷W6TF÷vâbbÆ–W"æ—57&–çF–æs°Ğ¢F†—2ç66÷UBÒW‡F×‡F†—2ç66÷UBÂvçE66÷Rò¢ÂFVbæG57VVBÇÂÂGB“°Ğ¢F†—2æ¶–6´w&÷Wçf—6–&ÆRÒ6†÷VÆD†–FTG5f–WvÖöFVÂ†FVbÂF†—2ç66÷UBÂvçE66÷R“°Ğ¢òò–Ö–ær¶VW2G&6Röb÷&væ–2Ö÷F–öâÂ'WB&VÖ÷fW2Væ÷Vv‚f–WvÖöFVÀĞ¢òòG&fVÂF†BF†R‡—6–6Â6–v‡BæBf—†VB66÷R÷fW&Æ’Fòæ÷BF—6w&VRàĞ¢6öç7BG4Ö÷F–öå66ÆRÒD…$TRäÖF…WF–Ç2æÆW'ƒÂFVbç66÷VBòã‚¢ã#BÂF†—2ç66÷UB“°Ğ¢6öç7B7&–çDf÷d&ö÷7BÒF†—2å÷7&–çEB¢c°Ğ¢6öç7B–ÖVDf÷bÒFVbç66÷VBò#‚¢†FVbæG4f÷bóòÖF‚æÖ‚ƒSBÂÆ–W"æ&6Tf÷bÒB’“°Ğ¢6öç7BF&vWDf÷bÒD…$TRäÖF…WF–Ç2æÆW'‡Æ–W"æ&6Tf÷b²7&–çDf÷d&ö÷7BÂ–ÖVDf÷bÂF†—2ç66÷UB“°Ğ¢–b„ÖF‚æ'2‡F†—2æ6ÖW&æf÷bÒF&vWDf÷b’âã’°Ğ¢F†—2æ6ÖW&æf÷bÒF&vWDf÷c°Ğ¢F†—2æ6ÖW&çWFFU&ö¦V7F–öäÖG&—‚‚“°Ğ¢ĞĞ Ğ¢òò&V6ö–Â7&–ærÖ&6²(	BF×VB7&–ær‡÷6—F–öâ²fVÆö6—G’’v—fW2Ğ¢òòVæ6‡’¶–6²F†B6æ2&6²æB6WGFÆW26Öö÷F†Ç’Â–ç7FVBöb7F–f`Ğ¢òòg&ÖR×&FRÖFWVæFVçBÆ–æV"FV6’àĞ¢6öç7B²Ò“ÂBÒ#S²òò7F–ffæW72òF×–ær‡æ7&—F–6ÆÇ’F×VBÂF–ç’6æĞ¢·F†—2æ¶–6µ÷2ç‚ÂF†—2æ¶–6µfVÂç…ÒÒ7&–æuFò‡F†—2æ¶–6µ÷2ç‚ÂF†—2æ¶–6µfVÂç‚ÂÂ²ÂBÂGB“°Ğ¢·F†—2æ¶–6µ÷2ç’ÂF†—2æ¶–6µfVÂç•ÒÒ7&–æuFò‡F†—2æ¶–6µ÷2ç’ÂF†—2æ¶–6µfVÂç’ÂÂ²ÂBÂGB“°Ğ¢·F†—2æ¶–6µ÷2ç¢ÂF†—2æ¶–6µfVÂç¥ÒÒ7&–æuFò‡F†—2æ¶–6µ÷2ç¢ÂF†—2æ¶–6µfVÂç¢ÂÂ²ÂBÂGB“°Ğ¢·F†—2æ¶–6µ&÷E‚ÂF†—2æ¶–6µ&÷E…fVÅÒÒ7&–æuFò‡F†—2æ¶–6µ&÷E‚ÂF†—2æ¶–6µ&÷E…fVÂÂÂ²ÂBÂGB“°Ğ¢òòvVöâ×7v—F6‚&—6S¢F†RÖöFVÂV6W2Wg&öÒÆ÷vW&VBöâWfW'’7v Ğ¢F†—2å÷&—6UBÒW‡F×‡F†—2å÷&—6UBÂÂBÂGB“°Ğ¢6öç7B&—6TG&÷ÒƒÒF†—2å÷&—6UB’¢ã#ƒ°Ğ¢6öç7B&—6UF–ÇBÒƒÒF†—2å÷&—6UB’¢ã“°Ğ¢F†—2æ¶–6´w&÷Wç÷6—F–öâç6WB‡F†—2æ¶–6µ÷2ç‚ÂF†—2æ¶–6µ÷2ç’Ò&—6TG&÷ÂF†—2æ¶–6µ÷2ç¢“°Ğ¢òòW7F&Æ—6‚F†R6ö×ÆWFR&6R÷6RWfW'’g&ÖRâ&VÆöB÷"&ÆFR&26àĞ¢òòFB&öÆÂ÷–r&VÆ÷rÂ'WBF†÷6R†W2×W7BæWfW"ÆV²–çFòF†RæW‡BvVöâàĞ¢F†—2æ¶–6´w&÷Wç&÷FF–öâç6WB‡F†—2æ¶–6µ&÷E‚Ò&—6UF–ÇBÂÂ“°Ğ Ğ¢òò7v÷&B7v–æræ–ÖF–öâ(	Bv–æGW(i"f7BF–vöæÂ6Æ6‚(i"&V6÷fW Ğ¢–b†FVbæ¶–æBÓÓÒvÖVÆVRrbbF†—2ç7v–æu†6RÂ’°Ğ¢F†—2ç7v–æu†6RÒÖF‚æÖ–âƒÂF†—2ç7v–æu†6R²GBòFVbæf—&U&FR“°Ğ¢6öç7B‚ÒF†—2ç7v–æu†6S°Ğ¢–b†FVbæ–BÓÓÒv¶æ–fRr’°Ğ¢6öç7B7G&–¶RÒ‚Âã3Bò‚òã3B¢Ò‡‚Òã3B’òãcc°Ğ¢6öç7BRÒD…$TRäÖF…WF–Ç2ç6Öö÷F‡7FW…D…$TRäÖF…WF–Ç2æ6Æ×‡7G&–¶RÂÂ’ÂÂ“°Ğ¢F†—2æ¶–6´w&÷Wç&÷FF–öâç6WB‚Óã²R¢ã#‚ÂÓã#‚²R¢ãc"ÂãÒR¢ãC"“°Ğ¢F†—2æ¶–6´w&÷Wç÷6—F–öâç6WB€Ğ¢F†—2æ¶–6µ÷2ç‚ÒR¢ã3RÀĞ¢F†—2æ¶–6µ÷2ç’²R¢ã#RÀĞ¢F†—2æ¶–6µ÷2ç¢ÒR¢ã#ÀĞ¢“°Ğ¢ÒVÇ6R–b‡‚Âã#"’°Ğ¢òòv–æGW¢&—6R&ÆFRWæB&6°Ğ¢6öç7BrÒ‚òã##°Ğ¢F†—2æ¶–6´w&÷Wç&÷FF–öâç’ÒÓãrÒr¢ãS°Ğ¢F†—2æ¶–6´w&÷Wç&÷FF–öâç‚Òr¢ãSS°Ğ¢F†—2æ¶–6´w&÷Wç&÷FF–öâç¢Ò×r¢ãC°Ğ¢F†—2æ¶–6´w&÷Wç÷6—F–öâç¢Òr¢ã#°Ğ¢ÒVÇ6R–b‡‚ÂãR’°Ğ¢òò6Æ6ƒ¢6æF÷vâÖ7&÷72f7@Ğ¢6öç7B2Ò‡‚Òã#"’òã#ƒ°Ğ¢6öç7BRÒ2¢2¢ƒ2Ò"¢2“²òò6Öö÷F‡7FW Ğ¢F†—2æ¶–6´w&÷Wç&÷FF–öâç’ÒÓã"²R¢"ã°Ğ¢F†—2æ¶–6´w&÷Wç&÷FF–öâç‚ÒãSRÒR¢ã°Ğ¢F†—2æ¶–6´w&÷Wç&÷FF–öâç¢ÒÓãB²R¢ã“°Ğ¢F†—2æ¶–6´w&÷Wç÷6—F–öâç¢Òã"ÒR¢ã3°Ğ¢ÒVÇ6R°Ğ¢òò&V6÷fW"&6²Fò&W7@Ğ¢6öç7B"Ò‡‚ÒãR’òãS°Ğ¢6öç7BRÒ"¢"¢ƒ2Ò"¢"“°Ğ¢F†—2æ¶–6´w&÷Wç&÷FF–öâç’Òã‚ÒR¢ãS°Ğ¢F†—2æ¶–6´w&÷Wç&÷FF–öâç‚ÒÓãSR²R¢ãSS°Ğ¢F†—2æ¶–6´w&÷Wç&÷FF–öâç¢ÒãRÒR¢ãS°Ğ¢F†—2æ¶–6´w&÷Wç÷6—F–öâç¢ÒÓã‚²R¢ãƒ°Ğ¢ĞĞ¢ÒVÇ6R–b†FVbæ¶–æBÓÓÒvÖVÆVRr’°Ğ¢–b†FVbæ–BÓÓÒv¶æ–fRr’F†—2æ¶–6´w&÷Wç&÷FF–öâç6WB‚ÓãÂÓã#‚Âã“°Ğ¢VÇ6RF†—2æ¶–6´w&÷Wç&÷FF–öâç’ÒÓãs°Ğ¢ĞĞ Ğ¢òò–FÆR'&VF†–æròvVöâ6WGFÆR(	BfFW2÷WBGW&–ær7&–çBâ—G2÷vâ6Öö÷F€Ğ¢òò6Æö6²†æ÷BF–VBFòç’6æ’7FFR’àĞ¢F†—2åö–FÆUB³ÒGC°Ğ¢–b†FVbæ¶–æBÓÒvÖVÆVRr’°Ğ¢6öç7B'&VF†T×BÒƒãÒF†—2å÷7&–çEB’¢G4Ö÷F–öå66ÆS°Ğ¢6öç7B'&VF†RÒÖF‚ç6–â‡F†—2åö–FÆUB¢ãb’¢ãB¢'&VF†T×C°Ğ¢6öç7B7v”"ÒÖF‚æ6÷2‡F†—2åö–FÆUB¢ã’¢ã2¢'&VF†T×C°Ğ¢F†—2æ¶–6´w&÷Wç÷6—F–öâç’³Ò'&VF†S°Ğ¢F†—2æ¶–6´w&÷Wç&÷FF–öâç¢Ò7v”#°Ğ Ğ¢òòF‡&VR&VF&ÆR&VÆöB&VG3¢Æ÷vW"÷&öÆÂF†R&–fÆRÂ6VBF†RÖv¦–æRÀĞ¢òòF†Vâ6æ—B&6²Fò&VG’âF†Rv†öÆRf–WvÖöFVÂÖ÷fW22öæR&–v–@Ğ¢òòö&¦V7BÂ6òWF†÷&VBvVöâvVöÖWG'’æWfW"æVVG2vVöâ×7V6–f–2&öæW2àĞ¢–b‡7Bæ—5&VÆöF–ær’°Ğ¢6öç7B&VÆöDg&ÖU66ÆRÒf–WvÖöFVÅ&VÆöE66ÆR‡F†—2æ6ÖW&æ7V7B“°Ğ¢6öç7BÒD…$TRäÖF…WF–Ç2æ6Æ×€Ğ¢Ò7Bç&VÆöEF–ÖW"òÖF‚æÖ‚ƒãÂFVbç&VÆöEF–ÖR’ÂÂĞ¢“°Ğ¢6öç7B6Öö÷F‚Ò‡‚’Óâ‚¢‚¢ƒ2Ò"¢‚“°Ğ¢6öç7BVçFW"Ò6Öö÷F‚…D…$TRäÖF…WF–Ç2æ6Æ×‡òã‚ÂÂ’“°Ğ¢6öç7BW†—BÒÒ6Öö÷F‚…D…$TRäÖF…WF–Ç2æ6Æ×‚‡ÒãsB’òã#bÂÂ’“°Ğ¢6öç7B†öÆBÒVçFW"¢W†—C°Ğ¢6öç7B6VBÒÖF‚ç6–â€Ğ¢D…$TRäÖF…WF–Ç2æ6Æ×‚‡Òã3b’òã3ÂÂ’¢ÖF‚åĞ¢“°Ğ¢F†—2æ¶–6´w&÷Wç÷6—F–öâç‚³Ò†öÆB¢ãsR¢&VÆöDg&ÖU66ÆS°Ğ¢òòF†RÖ÷VçB&VÆ÷rÇ&VG’Æ÷vW'2f÷"&VÆöBâ¶VWF†—2Æö6Â†æB&V@Ğ¢òò6ö×7B6òF†RÖv¦–æR†æB&VÖ–ç2f—6–&ÆRBcÖFVw&VRdõbàĞ¢F†—2æ¶–6´w&÷Wç÷6—F–öâç’ÓÒ††öÆB¢ã‚²6VB¢ãR’¢&VÆöDg&ÖU66ÆS°Ğ¢F†—2æ¶–6´w&÷Wç÷6—F–öâç¢³Ò†öÆB¢ãSR¢&VÆöDg&ÖU66ÆS°Ğ¢F†—2æ¶–6´w&÷Wç&÷FF–öâç‚³Ò††öÆB¢ã3²6VB¢ãr’¢&VÆöDg&ÖU66ÆS°Ğ¢F†—2æ¶–6´w&÷Wç&÷FF–öâç’³Ò†öÆB¢ãb¢&VÆöDg&ÖU66ÆS°Ğ¢F†—2æ¶–6´w&÷Wç&÷FF–öâç¢ÓÒ††öÆB¢ãS"²6VB¢ã‚’¢&VÆöDg&ÖU66ÆS°Ğ¢ĞĞ¢ĞĞ Ğ¢òòf–WvÖöFVÂÆöö²×7v“¢6Öö÷F‚F†R&rÖ÷W6RFVÇF–çFòdTÄô4•E’f—'7@Ğ¢òò†æ÷&ÖÆ—6VB'’GB6ò—Bw2g&ÖW&FRÖ–æFWVæFVçBÂæò¦—GFW"’ÂF†VâV6PĞ¢òòF†R7v’öfg6WBF÷v&B—B(	BGvò7FvW2öbF×–ærÒ'WGFW'’ÆràĞ¢6öç7B–çdGBÒGBâRÓBòòGB¢°Ğ¢6öç7B×e‚ÒD…$TRäÖF…WF–Ç2æ6Æ×‚Ö–çWBæÖ÷W6TE‚¢–çdGB¢ã2ÂÓãbÂãb“°Ğ¢6öç7B×e’ÒD…$TRäÖF…WF–Ç2æ6Æ×‚Ö–çWBæÖ÷W6TE’¢–çdGB¢ã2ÂÓãRÂãR“°Ğ¢F†—2å÷7v•fVÅ‚ÒW‡F×‡F†—2å÷7v•fVÅ‚Â×e‚ÂbÂGB“°Ğ¢F†—2å÷7v•fVÅ’ÒW‡F×‡F†—2å÷7v•fVÅ’Â×e’ÂbÂGB“°Ğ¢F†—2å÷7v•‚ÒW‡F×‡F†—2å÷7v•‚ÂF†—2å÷7v•fVÅ‚Â’ÂGB“°Ğ¢F†—2å÷7v•’ÒW‡F×‡F†—2å÷7v•’ÂF†—2å÷7v•fVÅ’Â’ÂGB“°Ğ¢F†—2ç7v”w&÷Wç&÷FF–öâç’ÒF†—2å÷7v•‚¢G4Ö÷F–öå66ÆS°Ğ¢F†—2ç7v”w&÷Wç&÷FF–öâç‚ÒF†—2å÷7v•’¢G4Ö÷F–öå66ÆS°Ğ Ğ¢òò4ôB×7G–ÆRvVöâ&ö"G&—fVâ'’4ôåD”åTõU2†6RF†B66VÆW&FW2v—F€Ğ¢òòÖ÷fR7VVB(	Bæò÷2v†Vâ7F'F–ær÷7F÷–ærÂæBg&ÖW&FRÖ–æFWVæFVçBàĞ¢6öç7BÖ÷fU7VVBÒÖF‚æ‡—÷B‡Æ–W"çfVÆö6—G“òç‚ÇÂÂÆ–W"çfVÆö6—G“òç¢ÇÂ“°Ğ¢6öç7B&ö$‡¢ÒÆ–W"æöäw&÷VæBòƒ"ã²Ö÷fU7VVB¢ã’’¢°Ğ¢F†—2åö&ö%†6R³Ò&ö$‡¢¢GC°Ğ¢6öç7B&ö$×EF&vWBÒ‡Æ–W"æöäw&÷VæBbbÖ÷fU7VVBâãRĞ¢ò‡Æ–W"æ—57&–çF–æròã#b¢ãb’¢G4Ö÷F–öå66ÆR¢ã°Ğ¢F†—2åö&ö$×BÒW‡F×‡F†—2åö&ö$×BóòÂ&ö$×EF&vWBÂ‚ÂGB“²òòfFR&ö"–âö÷W@Ğ¢6öç7B&ö%bÒÖF‚ç6–â‡F†—2åö&ö%†6R¢"’¢F†—2åö&ö$×C°Ğ¢6öç7B&ö$‚ÒÖF‚ç6–â‡F†—2åö&ö%†6R’¢F†—2åö&ö$×B¢ãSS°Ğ Ğ¢òò&VÆöC¢F†RwVâ6öÖW2F÷vâæB&öÆÇ2÷fW"6òF†RÖrvVÆÂf6W2–÷RÂv—F€Ğ¢òò¦öÇB2F†R&öÇBvöW2†öÖRâ&VF–ærF†R&VÆöBw2õtâF–ÖW"&F†W"F†àĞ¢òò7F'F–æræ÷F†W"öæR¶VW2F†—2–â7FWv—F‚F†RVF–òæBv—F‚F†PĞ¢òòF†—&B×W'6öâ&öG’Âv†–6‚æ–ÖFW2F†R6ÖR&VÆöBg&öÒF†R6ÖRçVÖ&W"àĞ¢òòv—F†÷WB—BF†Rf—'7B×W'6öâf–WrF–Bæ÷F†–ærBÆÂF‡&÷Vv‚&VÆöB(	@Ğ¢òò§W7BF†R…TB6÷VçFW"æB6÷VæBàĞ¢6öç7B%F–ÖRÒFVbç&VÆöEF–ÖRÇÂ°Ğ¢6öç7B&VÆöEÒ‡7Bæ—5&VÆöF–ærbb%F–ÖRâĞ¢òD…$TRäÖF…WF–Ç2æ6Æ×ƒÒ7Bç&VÆöEF–ÖW"ò%F–ÖRÂÂ’¢°Ğ¢6öç7B$&VÆÂÒ&VÆöEâòÖF‚ç6–â„ÖF‚å’¢&VÆöE’¢°Ğ¢6öç7B&6²Ò&VÆöEâòÖF‚æW‡‚ÔÖF‚ç÷r‚‡&VÆöEÒãc"’òãSRÂ"’’¢°Ğ¢6öç7B&VÆöDg&ÖU66ÆRÒf–WvÖöFVÅ&VÆöE66ÆR‡F†—2æ6ÖW&æ7V7B“°Ğ¢6öç7Bg&ÖVD&VÆÂÒ$&VÆÂ¢&VÆöDg&ÖU66ÆS°Ğ¢6öç7Bg&ÖVE&6²Ò&6²¢&VÆöDg&ÖU66ÆS°Ğ Ğ¢òòE2²7&–çB&ÆVæG2(i"4ÔôõD„TBÖ÷VçBF&vWBÂF†VâV6VB†æò6æöàĞ¢òò7F'B÷7F÷7&–çB÷"66÷R–âö÷WB’àĞ¢6öç7B7V7E66ÆRÒf–WvÖöFVÄ7V7E66ÆR‡F†—2æ6ÖW&æ7V7B“°Ğ¢6öç7B&6U‚Òd”UtÔôDTÅõ‚¢7V7E66ÆS°Ğ¢6öç7BG56†–gE‚Ò×F†—2ç66÷UB¢&6Uƒ°Ğ¢òò7&–çBÆ÷vW'2F†R6ö×ÆWFRwVâÖæBÖ†æG2&–râF†RöÆB÷6—F—fRöfg6W@Ğ¢òò&—6VB—B&6ÒÂ6öçG&F–7F–ærF†R–çFVæFVB6''’æBf÷&6–ær–×ÆW6–&ÇĞ¢òòÆöær6ÆVWfW2§W7BFò¶VWF†VÒ6öææV7FVBFòF†R&÷GFöÒöbF†Rg&ÖRàĞ¢6öç7B7&–çDG&÷ÒD…$TRäÖF…WF–Ç2æÆW'€Ğ¢Óã"ÂãBÂD…$TRäÖF…WF–Ç2æ6Æ×‚‡F†—2æ6ÖW&æf÷bÒc’ò‚ÂÂ’À¢“°Ğ¢6öç7B7&–çDG&÷’Ò×F†—2å÷7&–çEB¢7&–çDG&÷°Ğ¢6öç7B7&–çE6†–gE‚Ò×F†—2å÷7&–çEB¢ã"¢7V7E66ÆS°Ğ¢òò&VÆöB†Ö–æR’æBF†RÆæF–ærVÇ6R„6öFW‚w2’&R–æFWVæFVçBöfg6WG2öàĞ¢òòF†R6ÖRÖ÷VçBÂ6òF†W’6–×Ç’7VÒàĞ¢6öç7BFwE‚Ò&6U‚²7&–çE6†–gE‚²G56†–gE€Ğ¢²†&ö$‚²ãR¢g&ÖVD&VÆÂ’¢7V7E66ÆS°Ğ¢6öç7BFwE’Òd”UtÔôDTÅõ’²f–WvÖöFVÄf÷dÆ–gB‡F†—2æ6ÖW&æf÷b’²7&–çDG&÷’²&ö%`Ğ¢Òãr¢g&ÖVD&VÆÂÒãR¢g&ÖVE&6²ÒÆæEVÇ6R¢ãSS°Ğ¢F†—2åöÖ÷VçE÷2ç‚ÒW‡F×‡F†—2åöÖ÷VçE÷2ç‚ÂFwE‚Â‚ÂGB“°Ğ¢F†—2åöÖ÷VçE÷2ç’ÒW‡F×‡F†—2åöÖ÷VçE÷2ç’ÂFwE’Â‚ÂGB“°Ğ¢F†—2åöÖ÷VçE&÷Bç‚ÒW‡F×‡F†—2åöÖ÷VçE&÷Bç‚À¢d”UtÔôDTÅõ•D4‚²F†—2å÷7&–çEB¢ã#"²ãS¢g&ÖVD&VÆÀ¢²ãB¢g&ÖVE&6²²ÆæEVÇ6R¢ã"ÂBÂGB“°¢F†—2åöÖ÷VçE&÷Bç’ÒW‡F×‡F†—2åöÖ÷VçE&÷Bç’Âd”UtÔôDTÅõ”rÂBÂGB“°¢F†—2åöÖ÷VçE&÷Bç¢ÒW‡F×‡F†—2åöÖ÷VçE&÷Bç¢ÀĞ¢òò6ö×7B3,+6çB&VG22Æ÷vW&VB7&–çB6''’v—F†÷WB&÷FF–æpĞ¢òòF†R7W÷'B6†÷VÆFW"–çFòF†RÖ–FFÆRöbF†R67&VVââF†RöÆBS|+&öÆÀĞ¢òòv2v†BÖFRWfVâ‡VÖâÖÆVæwF‚6ÆVWfRV"FòVæB–âÖ–BÖ—"àĞ¢d”UtÔôDTÅõ$ôÄÂ²F†—2å÷7&–çEB¢ÓãC²ãC"¢g&ÖVD&VÆÂÂBÂGB“°¢òòF†RFW7FVB6†&VBFWF‚¶VW2F†RÆöævW7BWF†÷&VB7Fö6²æB—G2&V6ö–ÀĞ¢òòG&fVÂ6ÆV"öbF†RæV"ÆæRv—F†÷WB6W&F–ærV—F†W"vÆ÷fRàĞ¢F†—2çvVöäÖ÷VçBç÷6—F–öâç6WB‡F†—2åöÖ÷VçE÷2ç‚ÂF†—2åöÖ÷VçE÷2ç’Âd”UtÔôDTÅõ¢“°¢F†—2çvVöäÖ÷VçBç&÷FF–öâç‚ÒF†—2åöÖ÷VçE&÷Bçƒ°¢F†—2çvVöäÖ÷VçBç&÷FF–öâç’ÒF†—2åöÖ÷VçE&÷Bç“°¢F†—2çvVöäÖ÷VçBç&÷FF–öâç¢ÒF†—2åöÖ÷VçE&÷Bç£° Ğ¢òò×W§¦ÆRfÆ6‚FV6Ğ¢–b‡F†—2åöfÆ6…F–ÖW"ÓÒVæFVf–æVBbbF†—2åöfÆ6…F–ÖW"â’°Ğ¢F†—2åöfÆ6…F–ÖW"ÓÒGC°Ğ¢6öç7BBÒÖF‚æÖ‚ƒÂF†—2åöfÆ6…F–ÖW"òdÄ4…ôÄ”dR“°Ğ¢F†—2æfÆ6„Æ–v‡Bæ–çFVç6—G’ÒB¢ƒ°Ğ¢F†—2åöfÆ6„ÖW6†W2æf÷$V6‚‚†Ò’Óâ²ÒæÖFW&–Âæ÷6—G’ÒB¢ã“#²Ò“°Ğ¢–b‡BÓÓÒ’°Ğ¢F†—2åöfÆ6„ÖW6†W2æf÷$V6‚‚†Ò’ÓâÒç&VçCòç&VÖ÷fR†Ò’“°Ğ¢ĞĞ¢ĞĞ Ğ¢òòG&6W'0Ğ¢f÷"†ÆWB’ÒF†—2çG&6W'2æÆVæwF‚Ò²’ãÒ²’ÒÒ’°Ğ¢6öç7BG"ÒF†—2çG&6W'5¶•Ó°Ğ¢G"çG&fVÆÆVB³ÒG"ç7VVB¢GC°Ğ¢6öç7BF–ÂÒÖF‚æÖ–â‡G"æF—7Fæ6RÂÖF‚æÖ‚ƒÂG"çG&fVÆÆVBÒG"çG&–ÄÆVæwF‚’“°Ğ¢6öç7B†VBÒÖF‚æÖ–â‡G"æF—7Fæ6RÂÖF‚æÖ‚‡G"çG&–ÄÆVæwF‚ÂG"çG&fVÆÆVB’“°Ğ¢6öç7Bf—6–&ÆTÆVæwF‚ÒÖF‚æÖ‚ƒãÂ†VBÒF–Â“°Ğ¢G"æÖW6‚ç÷6—F–öâæ6÷’‡G"æg&öÒ’æFE66ÆVEfV7F÷"‡G"æF—&V7F–öâÂF–Â“°Ğ¢G"æÖW6‚ç66ÆRç¢Òf—6–&ÆTÆVæwFƒ°Ğ¢G"æfFRÒG"çG&fVÆÆVBâG"æF—7Fæ6PĞ¢òÖF‚æÖ‚ƒÂÒ‡G"çG&fVÆÆVBÒG"æF—7Fæ6R’òG"çG&–ÄÆVæwF‚Ğ¢¢°Ğ¢G"æÖW6‚æÖFW&–Âæ÷6—G’ÒG"æfFR¢ãƒC°Ğ¢–b‡G"æfFRÃÒ’°Ğ¢F†—2ç66VæRç&VÖ÷fR‡G"æÖW6‚“°Ğ¢G"æÖW6‚ævVöÖWG'’æF—7÷6R‚“°Ğ¢G"æÖW6‚æÖFW&–ÂæF—7÷6R‚“°Ğ¢F†—2çG&6W'2ç7Æ–6R†’Â“°Ğ¢ĞĞ¢ĞĞ Ğ¢òò&ö6¶WG2²W‡Æ÷6–öç2²V¦V7FVB6†VÆÇ2²F‡&÷vâ¶æ—fW0Ğ¢F†—2å÷WFFU&ö6¶WG2†GBÂv÷&ÆBÂ&÷DÖævW"“°Ğ¢F†—2å÷WFFUF‡&÷vä¶æ—fW2†GBÂv÷&ÆBÂ&÷DÖævW"“°Ğ¢F†—2å÷WFFTW‡Æ÷6–öç2†GB“°Ğ¢F†—2å÷WFFU6†VÆÇ2†GB“°Ğ¢F†—2å÷WFFT×W§¦ÆU6Öö¶R†GB“°Ğ¢F†—2å÷WFFTæ–ÖU7&¶ÆW2†GB“°Ğ¢F†—2å÷WFFTf—&TVÖ&W'2†GB“°Ğ Ğ¢òò6¶–âæ–ÖF–öç2†öæÇ’öâF†R7W'&VçFÇ’f—6–&ÆRvVöâĞ¢F†—2ææ–ÕF–ÖR³ÒGC°Ğ¢6öç7B7F—fTw&÷WÒF†—2æÖöFVÇ2ævWB†FVbæ–B’æw&÷W°Ğ¢òòW"×vVöâ6¶–âF¶W2&–÷&—G’÷fW"F†RvÆö&Â6¶–àĞ¢6öç7BW%6¶–âÒF†—2åö&Ö÷'”ÖòævWB†FVbæ–B“òç6¶–ã°Ğ¢6öç7B7F—fU6¶–âÒW%6¶–âÇÂ†FVbæ¶–æBÓÓÒvÖVÆVRròF†—2ç7v÷&E6¶–â¢F†—2çvVöå6¶–â“°Ğ¢–b†7F—fU6¶–ãòææ–ÖFVB’°Ğ¢òò&÷WFR'’6FÆör6†S¢F†R7v÷&BvV'2F†R6†&VBwVâ6FÆöpĞ¢òò†&öG’ö66VçBöVæW&w’&öÆW2’(	BöæÇ’ÆVv7’VçG&–W26''’æ&ÆFRàĞ¢–b†7F—fU6¶–âæ&ÆFRÓÒVæFVf–æVB’æ–ÖFU7v÷&E6¶–â†7F—fTw&÷WÂ7F—fU6¶–âÂF†—2ææ–ÕF–ÖR“°Ğ¢VÇ6Ræ–ÖFUvVöå6¶–â†7F—fTw&÷WÂ7F—fU6¶–âÂF†—2ææ–ÕF–ÖR“°Ğ¢ĞĞ¢ĞĞ Ğ¢vWD‡VD–æfò‚’°Ğ¢6öç7BFVbÒF†—2æ7W'&VçDFVc°Ğ¢6öç7B7BÒF†—2æ7W'&VçE7FFS°Ğ¢6öç7B7&VDÖ–âÒFVbç7&VDÖ–âóòFVbç7&VBóò°Ğ¢6öç7B7&VDÖ‚ÒFVbç7&VDÖ‚óòFVbç7&VBóò7&VDÖ–ã°Ğ¢6öç7B7&VE7âÒÖF‚æÖ‚ƒRÓbÂ7&VDÖ‚Ò7&VDÖ–â“°Ğ¢&WGW&â°Ğ¢æÖS¢FVbææÖRÀĞ¢—4ÖVÆVS¢FVbæ¶–æBÓÓÒvÖVÆVRrÀĞ¢ÖtÖÖó¢7BæÖtÖÖòÀĞ¢&W6W'fTÖÖó¢7Bç&W6W'fTÖÖòÀĞ¢—5&VÆöF–æs¢7Bæ—5&VÆöF–ærÀĞ¢&VÆöE&öw&W73¢7Bæ—5&VÆöF–æpĞ¢òD…$TRäÖF…WF–Ç2æ6Æ×ƒÒ7Bç&VÆöEF–ÖW"òÖF‚æÖ‚ƒãÂFVbç&VÆöEF–ÖR’ÂÂĞ¢¢ÀĞ¢&VÆöE&VÖ–æ–æs¢ÖF‚æÖ‚ƒÂ7Bç&VÆöEF–ÖW"’ÀĞ¢&VÆöDGW&F–öã¢FVbç&VÆöEF–ÖRÇÂÀĞ¢–Ö–æs¢F†—2ç66÷UBÀĞ¢7&VE&F–ó¢7&VDÖ‚â7&VDÖ–àĞ¢òD…$TRäÖF…WF–Ç2æ6Æ×‚‡F†—2å÷6†÷D&ÆööÒÒ7&VDÖ–â’ò7&VE7âÂÂĞ¢¢ÀĞ¢7W'&VçD–æFWƒ¢F†—2æ7W'&VçD–æFW‚ÀĞ¢6Æ÷G3¢F†—2æÆöF÷WBæÖ‚‡rÂ’’Óâ‡²¶W“¢7G&–ær†’²’Â–C¢ræ–BÂæÖS¢rææÖRÂ—4ÖVÆVS¢ræ¶–æBÓÓÒvÖVÆVRrÒ’Ğ¢Ó°Ğ¢ĞĞ§ĞĞ 