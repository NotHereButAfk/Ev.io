import * as THREE from 'three';
import { WEAPONS, isMainWeaponId, isMatchPickupWeaponId } from './weaponDefs.js';
import { weaponHandPose } from './WeaponHandPoses.js';
import { buildWeaponModel, onWeaponModelsReady } from './WeaponModels.js';
import { applyWeaponSkin, animateWeaponSkin } from './WeaponSkins.js';
import { applySwordSkin, animateSwordSkin } from './SwordSkins.js';
import {
  advanceFireCooldown,
  isRunningAndFiring,
  scheduleNextShot,
  wantsTriggerShot,
} from './FireControl.js';
import { disposeExplosion, spawnExplosion, updateExplosion } from '../effects/ExplosionEffect.js';

const FLASH_LIFE = 0.038;

// Stand-in "object" for a hit on one of the map's bare box colliders — it has
// no mesh, but the hit-handling code only ever reads userData off it.
const _BOX_OBJ = { userData: {} };

// ── smoothing helpers ───────────────────────────────────────────────────────
// Frame-rate-INDEPENDENT exponential smoothing: the result is identical at any
// framerate (unlike `x += (t-x)*k*dt`, which jitters when dt varies). `lambda`
// is the decay rate — bigger = snappier. This is the core of the smooth feel.
function expDamp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}
// Exact critically damped spring. Unlike an Euler step, this produces the same
// pose after a given elapsed time at 30, 60, 144Hz, or a briefly uneven frame.
function springTo(out, x, v, target, stiffness, _damping, dt) {
  const h = Math.max(0, dt);
  const omega = Math.sqrt(stiffness);
  const offset = x - target;
  const impulse = v + omega * offset;
  const decay = Math.exp(-omega * h);
  out[0] = target + (offset + impulse * h) * decay;
  out[1] = (v - omega * impulse * h) * decay;
}

// Kawaii skins (anime pew, cat meow, uwu squeak, puppy yip, magic sparkle) all
// get the pink muzzle flash + sparkle-heart burst treatment.
const CUTE_SOUNDS = new Set(['anime', 'waifu', 'meow', 'uwu', 'bark', 'sparkle']);
// Fire-sound skins get an orange/red muzzle flash + ember burst.
const FIRE_SOUNDS = new Set(['fire']);

const TRACER_OPACITY = 0.96;
const TRACER_VISUAL_SPEED = 330;
const TRACER_LENGTH = 1.45;
const TRACER_END_FADE = 0.085;

function createTracerMesh() {
  // This is a tracer streak, not the physical bullet diameter.  The previous
  // 7 mm-wide line routinely covered less than one pixel and a fast round
  // could cross the screen between two rendered frames.  A slim additive
  // streak remains readable without looking like a laser beam.
  const geo = new THREE.CylinderGeometry(0.014, 0.014, 1, 6, 1, true);
  geo.translate(0, 0.5, 0);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xfff3c4,
    transparent: true,
    opacity: TRACER_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 4;
  return mesh;
}

// How far in front of the eye the viewmodel sits. The asynchronously loaded
// authored guns have much longer stocks than the procedural fallbacks (DMR is
// the worst case), and recoil moves the whole gun back toward the eye. Keeping
// the shared mount farther out preserves the hand-to-grip relationship while
// leaving every shipped model clear of the camera's near plane.
const VIEWMODEL_Z = -0.90;
// EV.IO's hip-fire rifle is shouldered diagonally rather than laid flat across
// the bottom of the screen: its butt exits near the lower centre/right while
// the muzzle rises to the open space left of the reticle. The offset and cant
// are shared by every firearm so swapping weapons never changes handedness.
const VIEWMODEL_X = -0.06;
const VIEWMODEL_Y = -0.30;
// Weapon-only first person: keep the gun large and readable like the reference
// while world/player weapons retain their physical third-person scale.
const VIEWMODEL_SCALE = 1.20;
const MELEE_VIEWMODEL_SCALE = 0.96;
const FIREARM_CARRY_SCALE = Object.freeze({
  pistol: 0.95,
  compact: 1.08,
  rifle: VIEWMODEL_SCALE,
  shotgun: 1.08,
  support: 1.02,
  launcher: 0.90,
  precision: 1.08,
});
const VIEWMODEL_PITCH = 0.68;
const VIEWMODEL_YAW = 0.83;
const VIEWMODEL_ROLL = -0.03;
// EV.IO's sword uses a dedicated close right-side guard. It is not centred in
// front of the reticle: the grip enters through the lower-right edge while the
// oversized blade rises almost vertically and leaves the top of the frame.
// Keep this on the shared viewmodel root so skins and the complete blade move
// as one rigid object while third-person/world weapons remain unchanged.
const SWORD_VIEWMODEL_X = 0.19;
const SWORD_VIEWMODEL_Y = -0.26;
const SWORD_VIEWMODEL_Z = -0.32;
const SWORD_VIEWMODEL_PITCH = 1.28;
const SWORD_VIEWMODEL_YAW = -0.14;
const SWORD_VIEWMODEL_ROLL = -0.035;
const REFERENCE_ASPECT = 16 / 9;

// First-person hand targets in each weapon model's local coordinate system.
// Procedural and authored weapons share the same forward convention (-Z), but
// their pistol grips do not share a depth. A single hand transform therefore
// made short weapons miss the palm and made rifles appear to float in front of
// it. These targets describe the centre of the physical grip/handguard; the
// rig converts them to wrist-group transforms below.
// Preserve the lower-right composition on landscape screens without pushing
// both gloves out of portrait/mobile view. Capped on ultrawide so the weapon
// does not drift all the way into the corner.
function viewmodelAspectScale(aspect) {
  return THREE.MathUtils.clamp((aspect || REFERENCE_ASPECT) / REFERENCE_ASPECT, 0.32, 1.15);
}

// The desktop reference intentionally uses a large, close weapon. Preserve it
// at 16:9 and wider, but scale the same carry down on narrow/mobile canvases so
// a long rifle does not become a clipped strip with no readable silhouette.
function firearmViewmodelScale(def, aspect) {
  const responsive = THREE.MathUtils.clamp(
    (aspect || REFERENCE_ASPECT) / REFERENCE_ASPECT,
    0.72,
    1,
  );
  const carry = weaponHandPose(def?.id).carry;
  return (FIREARM_CARRY_SCALE[carry] || 1.18) * responsive;
}

function viewmodelReloadScale(aspect) {
  if (aspect < 1) return 0.38;
  if (aspect < 1.5) return 0.22;
  return 0.30;
}

// Normal EV-style zoom keeps the firearm full-size in its three-quarter carry
// while the world FOV narrows. The actual shot still follows the fixed centre
// reticle, so the weapon can sit lower without changing accuracy.
// Only a magnified sniper optic hands off to the full-screen scope overlay, and
// only after the gun has travelled most of the way there.
// This also gives scope-out a readable reverse animation instead of popping the
// complete gun-and-hands rig in and out on right mouse down/up.
export function shouldHideAdsViewmodel(def, scopeT, aimHeld = false) {
  void aimHeld;
  return !!def?.scoped && scopeT > 0.68;
}

// Ordinary right-click aim aligns each weapon's measured rear sight with the
// fixed centre reticle.  The sight stays far enough from the camera that the
// receiver does not fill the screen, while the wider FOV preserves peripheral
// awareness.  True sniper scopes still use their dedicated 28-degree overlay.
const ADS_SIGHT_DEPTH = -0.70;
const ADS_SIGHT_Y = -0.018;
// Keep the shot/crosshair at screen centre but seat the physical optic a little
// below it. This preserves the full-size gun while clearing the target and the
// upper half of the POV during ordinary right-click aim.
// Keep the physical gun full-size, but seat its sight line below the reticle.
// At 0.012 the camera looked straight down the receiver and the orange upper
// housing became a solid vertical slab over the target. The shot still follows
// the centre reticle; this is presentation-only clearance.
const ADS_VIEWMODEL_DROP = 0.075;
const DEFAULT_ADS_FOV = 46;
const ADS_PITCH = 0;
const ADS_YAW = 0;
const ADS_ROLL = 0;

const _adsBox = new THREE.Box3();
const _adsSpecialBox = new THREE.Box3();
const _adsPoint = new THREE.Vector3();
const _adsCorner = new THREE.Vector3();
const _adsInverse = new THREE.Matrix4();

// Measure a weapon's rear sight in its own coordinate system. Authored models
// can provide an exact `sight_point`; otherwise optic glass is preferred and a
// conservative top/rear point is inferred from the complete weapon. Measuring
// the actual asset keeps one shared ADS solver working for pickups and future
// models instead of maintaining a brittle list of hand-tuned screen offsets.
export function measureWeaponSight(group) {
  const declared = group?.getObjectByName?.('sight_point');
  if (declared) {
    group.updateWorldMatrix(true, true);
    return group.worldToLocal(declared.getWorldPosition(new THREE.Vector3()));
  }

  group.updateWorldMatrix(true, true);
  _adsInverse.copy(group.matrixWorld).invert();
  _adsBox.makeEmpty();
  _adsSpecialBox.makeEmpty();
  group.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    if (!box) return;
    const role = object.material?.userData?.role;
    for (let ix = 0; ix < 2; ix++) for (let iy = 0; iy < 2; iy++) for (let iz = 0; iz < 2; iz++) {
      _adsCorner.set(
        ix ? box.max.x : box.min.x,
        iy ? box.max.y : box.min.y,
        iz ? box.max.z : box.min.z,
      ).applyMatrix4(object.matrixWorld).applyMatrix4(_adsInverse);
      _adsBox.expandByPoint(_adsCorner);
      if (role === 'special') _adsSpecialBox.expandByPoint(_adsCorner);
    }
  });

  const hasOptic = !_adsSpecialBox.isEmpty();
  const source = hasOptic ? _adsSpecialBox : _adsBox;
  if (source.isEmpty()) return new THREE.Vector3(0, 0.14, 0.05);
  source.getCenter(_adsPoint);
  // Optic glass centres define the axis directly. With iron sights, sit just
  // below the weapon's highest point so the front post remains visible.
  const y = hasOptic
    ? _adsPoint.y
    : THREE.MathUtils.lerp(_adsPoint.y, source.max.y, 0.88);
  // Imported pack models are a single mesh with no named optic. Their rear-most
  // Z point is the buttstock, not a sight; using it makes ADS stare directly at
  // the butt pad. Move the fallback anchor forward to the receiver/rail area.
  const z = hasOptic
    ? _adsPoint.z
    : source.max.z - (source.max.z - source.min.z) * 0.38;
  return new THREE.Vector3(_adsPoint.x, y, z);
}

export function adsMountForSight(
  sight,
  scale = VIEWMODEL_SCALE,
  depth = ADS_SIGHT_DEPTH,
) {
  return new THREE.Vector3(
    -sight.x * scale,
    -sight.y * scale + ADS_SIGHT_Y,
    depth - sight.z * scale,
  );
}

// Camera children still participate in the world depth buffer in Three.js.
// Without a dedicated viewmodel pass, a wall close to the player can therefore
// erase most (or all) of the held gun. Clone the model materials so disabling
// depth testing here never leaks to third-person guns, pickups, or thumbnails.
export function prepareFirstPersonModel(group) {
  // Quaternius firearms are authored for a left-side showcase render. In the
  // lower-right first-person carry that exposes the far side of the receiver,
  // making the whole gun read as backwards even though its muzzle still points
  // down -Z. Mirror only the lateral axis at the viewmodel boundary: forward,
  // scale, third-person carry, pickups and muzzle placement remain unchanged.
  if (group.userData.modelSource === 'quaternius') {
    group.scale.x = -Math.abs(group.scale.x || 1);
  }
  group.traverse((object) => {
    if (!object.isMesh) return;
    // Inverted-hull contours depend on world depth testing to reveal only the
    // rim. In a depth-independent viewmodel pass the enlarged back faces cover
    // the gun itself, producing the solid black slabs seen on the deployed GLBs.
    // The underlying gun already has strong material separation at ADS scale.
    if (object.name === 'outline') {
      object.visible = false;
      return;
    }
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material?.clone();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      material.depthTest = false;
      material.depthWrite = false;
    }
    object.renderOrder = 1000;
    object.frustumCulled = false;
  });
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
    this.mapGunId = null;
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
    this._springOut = new Float64Array(2);
    this.kickRotX = 0;
    this.kickRotXVel = 0;
    this.swingPhase = 1;
    this.scopeT = 0; // 0..1 zoom blend
    this._sprintT = 0; // 0..1 sprint carry blend
    this._movingFireT = 0; // 0..1 braced run-and-gun presentation blend
    // smoothed viewmodel state (all frame-rate-independent) — the applied
    // transform eases toward these targets so nothing ever snaps.
    this._swayX = 0; this._swayY = 0;         // smoothed look-sway
    this._swayVelX = 0; this._swayVelY = 0;   // smoothed mouse velocity
    this._bobPhase = 0;                       // continuous bob phase (own clock)
    this._mountPos = new THREE.Vector3(
      VIEWMODEL_X * viewmodelAspectScale(camera.aspect), VIEWMODEL_Y, VIEWMODEL_Z);
    this._mountRot = new THREE.Vector3(VIEWMODEL_PITCH, VIEWMODEL_YAW, VIEWMODEL_ROLL);
    this._raiseT = 1;                         // 0=just switched (lowered) → 1=up
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

    // Visible muzzle flash sprite — two crossed quads for a star shape
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

    // Pre-allocated scratch vectors — avoids GC spikes from per-shot allocations
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

    // Shared shell casing geo/mat — created once, reused by every ejected casing
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
    this.weaponMount.scale.setScalar(firearmViewmodelScale(this.currentDef, this.camera.aspect));
    this.camera.add(this.weaponMount);

    // Dedicated viewmodel key light — a short-range light parented to the camera
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
      prepareFirstPersonModel(group);
      group.visible = false;
      this.kickGroup.add(group);
      const sight = measureWeaponSight(group);
      this.models.set(w.id, {
        group,
        muzzle,
        sight,
        adsMount: adsMountForSight(sight, VIEWMODEL_SCALE, ADS_SIGHT_DEPTH),
      });
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
      prepareFirstPersonModel(group);
      group.visible = old ? old.group.visible : false;
      if (old) this.kickGroup.remove(old.group);
      this.kickGroup.add(group);
      const sight = measureWeaponSight(group);
      this.models.set(w.id, {
        group,
        muzzle,
        sight,
        adsMount: adsMountForSight(sight, VIEWMODEL_SCALE, ADS_SIGHT_DEPTH),
      });
    }
    if (this._armoryMap) this.applyArmoryMap(this._armoryMap);
    if (this.weaponSkin) this.setWeaponSkin(this.weaponSkin);
    if (this.swordSkin) this.setSwordSkin(this.swordSkin);
    // A late GLB swap must finish with exactly the equipped model visible.
    // Preserving each old group's flag was vulnerable to transient hidden
    // states (map transition, respawn, or a model refresh during a switch),
    // which could leave every replacement hidden for the rest of the match.
    this._ensureActiveModelVisibility();
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
    const segment = (a, b, startRadius, endRadius, material, sides = 6) => {
      const direction = b.clone().sub(a);
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(endRadius, startRadius, direction.length(), sides),
        material,
      );
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(up, direction.normalize());
      return mesh;
    };

    // Distinct closed-grip poses replace the old negatively-scaled clone. The
    // sleeve still exits below the camera, but its authored length stays within
    // a real arm. The previous endpoints were 1.64m / 1.80m from the wrist —
    // longer than the whole character's shoulder-to-floor distance — which is
    // why first person showed two black poles attached to otherwise good hands.
    const gripArm = ({ side, position, rotation, elbow, support = false }) => {
      const sign = side === 'left' ? -1 : 1;
      const arm = new THREE.Group();
      arm.position.copy(position);
      arm.rotation.copy(rotation);
      arm.userData.viewmodelHand = support ? 'support' : 'trigger';
      const hand = new THREE.Group();
      hand.name = 'viewmodel_grip';
      arm.add(hand);

      const palm = box(0.086, 0.058, 0.094, this.gloveMat);
      palm.name = 'viewmodel_palm';
      palm.position.set(0, -0.006, -0.034);
      palm.rotation.x = support ? -0.08 : 0.10;
      hand.add(palm);

      const handPlate = box(0.070, 0.012, 0.060, this.armPlateMat);
      handPlate.name = 'viewmodel_hand_plate';
      handPlate.position.set(0, 0.026, -0.020);
      handPlate.rotation.x = palm.rotation.x;
      hand.add(handPlate);

      // A single closed finger curl reads as a hand wrapped around the grip.
      // Four separate capsules looked like detached claws at gameplay scale.
      const fingerCurl = box(0.082, 0.044, 0.064, this.gloveMat);
      fingerCurl.name = 'viewmodel_finger_curl';
      fingerCurl.position.set(0, -0.032, -0.060);
      fingerCurl.rotation.x = support ? 0.32 : 0.52;
      hand.add(fingerCurl);

      // Two shallow knuckle ribs keep the closed silhouette readable under the
      // deliberately muted map lighting without turning the glove into a set
      // of detached capsule fingers.
      for (const x of [-0.021, 0.021]) {
        const knuckle = box(0.027, 0.010, 0.033, this.armPlateMat);
        knuckle.name = 'viewmodel_knuckle';
        knuckle.position.set(x, 0.032, -0.044);
        knuckle.rotation.x = palm.rotation.x;
        hand.add(knuckle);
      }

      const thumb = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.012, 0.032, 3, 7),
        this.gloveMat,
      );
      thumb.position.set(sign * 0.044, -0.002, -0.018);
      thumb.rotation.set(0.62, 0, -sign * 0.78);
      hand.add(thumb);

      arm.add(segment(
        new THREE.Vector3(0, -0.005, 0.018),
        new THREE.Vector3(0, -0.030, 0.098),
        0.035,
        0.042,
        this.gloveMat,
      ));
      const wrist = new THREE.Vector3(0, -0.025, 0.080);
      const sleeveEnd = new THREE.Vector3(sign * elbow.x, elbow.y, elbow.z);
      // Put a readable elbow in the silhouette. A single wrist→shoulder line
      // makes even correctly sized geometry look telescopic in perspective.
      // The bright shell stops at the elbow; the darker upper sleeve turns out
      // toward the shoulder and disappears into the lower/side frame.
      const armorEnd = new THREE.Vector3(
        sign * (support ? 0.10 : 0.08),
        support ? -0.15 : -0.14,
        support ? 0.02 : 0.03,
      );
      arm.userData.sleeveLength = wrist.distanceTo(sleeveEnd);

      // A short hard-surface forearm shell followed by a dark flexible sleeve.
      // Splitting the silhouette here matches the third-person exosuit and stops
      // the entire visible arm reading as one featureless cylinder.
      const forearm = segment(
        wrist, armorEnd,
        support ? 0.043 : 0.052,
        support ? 0.052 : 0.067,
        support ? this.armPlateMat : this.gloveMat,
        8,
      );
      forearm.name = 'viewmodel_forearm';
      // EV.IO visibly braces the handguard with the support forearm.  Keep its
      // compact forearm shell, while the longer shoulder segment below stays
      // hidden so it leaves the lower edge without becoming a second pole.
      forearm.visible = true;
      arm.add(forearm);
      const upperSleeve = segment(
        armorEnd, sleeveEnd,
        support ? 0.050 : 0.066,
        support ? 0.058 : 0.084,
        this.sleeveMat,
        8,
      );
      upperSleeve.name = 'viewmodel_upper_sleeve';
      // Preserve the authored support rig for future poses without drawing its
      // upper sleeve into the current one-arm first-person silhouette.
      upperSleeve.visible = !support;
      arm.add(upperSleeve);
      const elbowJoint = new THREE.Mesh(
        new THREE.SphereGeometry(0.056, 10, 7), this.cuffMat,
      );
      elbowJoint.name = 'viewmodel_elbow';
      elbowJoint.position.copy(armorEnd);
      elbowJoint.visible = !support;
      arm.add(elbowJoint);

      arm.add(segment(
        new THREE.Vector3(0, -0.024, 0.072),
        new THREE.Vector3(0, -0.029, 0.098),
        0.046,
        0.046,
        this.cuffMat,
      ));

      arm.traverse((object) => { if (object.isMesh) object.castShadow = true; });
      return arm;
    };

    const trigger = gripArm({
      side: 'right',
      position: new THREE.Vector3(0.012, -0.102, 0.165),
      rotation: new THREE.Euler(-0.08, 0.16, -0.08),
      // Compact lower-right exit: ev.io keeps the glove attached to the pistol
      // grip and lets a dark, thick sleeve leave frame without a long arm tube.
      elbow: new THREE.Vector3(0.25, -0.42, 0.02),
    });
    this.kickGroup.add(trigger);
    this.armGroup = trigger;

    const support = gripArm({
      side: 'left',
      position: new THREE.Vector3(-0.050, -0.095, -0.175),
      rotation: new THREE.Euler(-0.05, -0.40, 0.08),
      // The support shoulder exits toward the lower-left instead of extending
      // as a near-vertical pole. After the 0.74 viewmodel scale this is a
      // plausible 0.74m hand-to-shoulder reach, versus the old 1.33m on screen.
      elbow: new THREE.Vector3(0.65, -0.72, 0.40),
      support: true,
    });
    support.scale.setScalar(0.72);
    support.visible = false;
    this.kickGroup.add(support);
    this.supportArmGroup = support;
    this._applyViewmodelHandPose();
  }

  _applyViewmodelHandPose() {
    if (!this.armGroup || !this.supportArmGroup) return;
    const def = this.currentDef;
    const pose = weaponHandPose(def?.id);
    const portrait = this.camera.aspect < 1;

    // gripArm's palm centre is offset (0,-.006,-.034) from its group origin.
    // Convert the desired physical contact point back to that group origin.
    const trigger = pose.trigger;
    this.armGroup.position.set(
      trigger[0],
      trigger[1] + 0.006,
      trigger[2] + 0.034,
    );
    this.armGroup.scale.set(
      portrait ? 0.72 : 0.90,
      portrait ? 1 : 0.90,
      portrait ? 0.72 : 0.90,
    );

    const support = pose.support;
    this.supportArmGroup.position.set(support[0], support[1] + 0.006, support[2] + 0.034);
    this.supportArmGroup.scale.set(
      portrait ? 0.60 : 0.72,
      portrait ? 0.76 : 0.72,
      portrait ? 0.60 : 0.72,
    );
    // The owner uses a weapon-only first-person composition; the full hands,
    // arms and two-handed soldier carry remain visible to other players.
    this.armGroup.visible = false;
    this.supportArmGroup.visible = false;
    this.armGroup.userData.gripTarget = trigger.slice();
    this.supportArmGroup.userData.gripTarget = support.slice();
  }

  /**
   * Tint the first-person arm to the player's character.
   *
   * Compatibility path for the legacy two-colour character skin. Equipped
   * armour uses setArmAppearance() with the model's authored plate, frame,
   * joint and glow colours instead.
   */
  setSkin(skin) {
    this.setArmAppearance({
      plate: skin.primary,
      sleeve: skin.secondary,
      glove: new THREE.Color(skin.secondary).multiplyScalar(0.45).getHex(),
      accent: skin.primary,
    });
  }

  /** Apply the exact equipped character palette to the first-person gauntlet. */
  setArmAppearance({ plate, sleeve, glove, accent }) {
    this.armPlateMat.color.setHex(plate).multiplyScalar(0.34);
    this.sleeveMat.color.setHex(sleeve).multiplyScalar(0.30);
    this.gloveMat.color.setHex(glove).multiplyScalar(0.90);
    // Near-black cosmetics need to remain legible against the map's charcoal
    // floors. Preserve the hue but maintain enough value to read the grip.
    const gloveHsl = {};
    this.gloveMat.color.getHSL(gloveHsl);
    this.gloveMat.color.setHSL(gloveHsl.h, gloveHsl.s, Math.max(0.16, gloveHsl.l));
    this.cuffMat.color.setHex(accent);
    this.cuffMat.emissive.setHex(accent);
    this.cuffMat.emissiveIntensity = 0.05;
  }

  /** Apply a cosmetic weapon finish to all gun (non-melee) models. */
  setWeaponSkin(skin) {
    this.weaponSkin = skin;
    if (!skin) return;
    for (const w of this.allWeapons) {
      if (w.kind === 'melee') continue;
      applyWeaponSkin(this.models.get(w.id).group, skin);
    }
  }

  /** Apply a cosmetic finish to every melee model. */
  setSwordSkin(skin) {
    this.swordSkin = skin;
    if (!skin) return;
    for (const w of this.allWeapons) {
      if (w.kind !== 'melee') continue;
      applySwordSkin(this.models.get(w.id).group, skin);
    }
  }

  /**
   * Apply per-weapon skins from the Armory skin map.
   * Map<weaponId, { skin, isSword }> — each weapon gets its own individual finish.
   */
  applyArmoryMap(map) {
    this._armoryMap = map;
    for (const w of this.allWeapons) {
      const entry = map.get(w.id);
      if (!entry) continue;
      const { group } = this.models.get(w.id);
      if (entry.isSword) {
        this.swordSkin = entry.skin;
        applySwordSkin(group, entry.skin);
      } else {
        if (!this.weaponSkin) this.weaponSkin = entry.skin;
        applyWeaponSkin(group, entry.skin);
      }
    }
  }

  // Resolve the cosmetic skin currently applied to a given weapon: prefer the
  // per-weapon Armory entry, fall back to the global weapon/sword skin.
  _activeSkinFor(weaponId) {
    const entry = this._armoryMap?.get(weaponId);
    if (entry) return entry.skin;
    const def = this.loadout.find((w) => w.id === weaponId);
    return def?.kind === 'melee' ? this.swordSkin : this.weaponSkin;
  }

  _rebuildKeyMap() {
    // EV.IO keeps guns on the number row and reserves Z for melee.
    this.keyMap = new Map();
    let gunSlot = 1;
    this.loadout.forEach((w, i) => {
      if (w.kind === 'melee') this.keyMap.set('KeyZ', i);
      else this.keyMap.set(`Digit${gunSlot++}`, i);
    });
  }

  /** Set the active loadout to a single gun + single melee weapon. */
  setLoadout(gunId, meleeId) {
    const gun = this.allWeapons.find((w) => w.id === gunId && isMainWeaponId(w.id))
             || this.allWeapons.find((w) => isMainWeaponId(w.id));
    const melee = this.allWeapons.find((w) => w.id === meleeId && w.kind === 'melee')
               || this.allWeapons.find((w) => w.kind === 'melee');
    this.loadout = [gun, melee].filter(Boolean);
    this._mainGunId = gun?.id ?? null;   // remembered so map power-weapons can be dropped on respawn
    this._meleeId   = melee?.id ?? null;
    this.mapGunId = null;
    this.currentIndex = 0;
    this._rebuildKeyMap();
    this._setActiveModel(0);
  }

  // Add a map-collected POWER weapon as an extra slot alongside the main gun, so
  // the HUD shows [main gun, power gun, melee]. Switches to it and refills it.
  // Picking up a different power weapon replaces the power slot (you carry one).
  addMapGun(gunId) {
    const def = this.allWeapons.find((w) => w.id === gunId && isMatchPickupWeaponId(w.id));
    if (!def) return null;
    const main  = this.allWeapons.find((w) => w.id === this._mainGunId && w.kind !== 'melee')
               || this.loadout.find((w) => w.kind !== 'melee');
    const melee = this.allWeapons.find((w) => w.id === this._meleeId && w.kind === 'melee')
               || this.loadout.find((w) => w.kind === 'melee');
    const slots = [];
    if (main) slots.push(main);
    if (!main || main.id !== def.id) slots.push(def);   // the extra power slot
    if (melee) slots.push(melee);
    this.loadout = slots;
    this.mapGunId = def.id;
    this.currentIndex = this.loadout.indexOf(def);
    this._rebuildKeyMap();
    const st = this.state.get(def.id);
    if (st) {
      st.magAmmo = def.magSize;
      st.reserveAmmo = def.reserveMax;
      st.isReloading = false;
      st.reloadTimer = 0;
    }
    this._setActiveModel(this.currentIndex);
    return def;
  }

  // Drop any picked-up power weapon — back to the base main gun + melee.
  resetLoadout() {
    this.setLoadout(this._mainGunId, this._meleeId);
  }

  _setActiveModel(index) {
    // Hide every model, then show the active loadout slot.
    for (const w of this.allWeapons) {
      const m = this.models.get(w.id);
      if (m) m.group.visible = false;
    }
    const cur = this.loadout[index];
    if (cur) this.models.get(cur.id).group.visible = true;
    // Seat the hands against this weapon's own grip and handguard. The support
    // rig only renders its glove and cuff; its forearm and upper sleeve remain
    // hidden, avoiding the old pair of full-screen arm tubes.
    this._applyViewmodelHandPose();
    // Kick off the raise animation — the new gun eases up from lowered.
    this._raiseT = 0;
  }

  _ensureActiveModelVisibility() {
    const active = this.currentDef;
    if (!active) return;
    const knifeInFlight = active.kind === 'melee'
      && active.throwable && this._knifeCooldown > 0;
    for (const weapon of this.allWeapons) {
      const model = this.models.get(weapon.id)?.group;
      if (!model) continue;
      model.visible = weapon.id === active.id && !knifeInFlight;
    }
  }

  get currentDef() {
    return this.loadout[this.currentIndex];
  }

  get currentState() {
    return this.state.get(this.currentDef.id);
  }

  switchTo(index) {
    if (index === this.currentIndex || index < 0 || index >= this.loadout.length) return;
    const st = this.currentState;
    if (st.isReloading) {
      st.isReloading = false;
    }
    this.currentIndex = index;
    this.fireTimer = Math.max(this.fireTimer, 0.12);
    this._shotBloom = 0;
    // Never carry an unfinished blade arc into the next equipped weapon.
    this.swingPhase = 1;
    this._setActiveModel(index);
    this.audio.playWeaponSwitch();
  }

  resetMotionState() {
    this.kickPos.set(0, 0, 0);
    this.kickVel.set(0, 0, 0);
    this.kickRotX = 0;
    this.kickRotXVel = 0;
    this.swingPhase = 1;
    this.scopeT = 0;
    this._sprintT = 0;
    this._movingFireT = 0;
    this._swayX = 0;
    this._swayY = 0;
    this._swayVelX = 0;
    this._swayVelY = 0;
    this._bobPhase = 0;
    this._bobAmt = 0;
    this._idleT = 0;
    this._raiseT = 1;
    this._wasGrounded = true;
    this._landT = 0;
    this._landStrength = 0;
    this._fallSpeed = 0;
    this._shotBloom = 0;
    this.prevMouseDown = false;
    this._mountPos.set(
      VIEWMODEL_X * viewmodelAspectScale(this.camera.aspect), VIEWMODEL_Y, VIEWMODEL_Z,
    );
    this._mountRot.set(VIEWMODEL_PITCH, VIEWMODEL_YAW, VIEWMODEL_ROLL);
    this.weaponMount?.position.copy(this._mountPos);
    this.weaponMount?.rotation.set(VIEWMODEL_PITCH, VIEWMODEL_YAW, VIEWMODEL_ROLL);
    this.swayGroup?.position.set(0, 0, 0);
    this.swayGroup?.rotation.set(0, 0, 0);
    this.kickGroup?.position.set(0, 0, 0);
    this.kickGroup?.rotation.set(0, 0, 0);
    if (this.kickGroup) this.kickGroup.visible = true;
  }

  resetState(baseFov) {
    this.currentIndex = 0;
    this._setActiveModel(0);
    for (const w of this.allWeapons) {
      const st = this.state.get(w.id);
      st.magAmmo = w.kind === 'melee' ? 0 : w.magSize;
      st.reserveAmmo = w.kind === 'melee' ? 0 : w.reserveMax;
      st.isReloading = false;
      st.reloadTimer = 0;
    }
    this.fireTimer = 0;
    this.resetMotionState();
    this._knifeCooldown = 0;
    this._prevRightMouse = false;
    this.camera.fov = baseFov;
    this.camera.updateProjectionMatrix();

    // drop any in-flight thrown knives from a previous round
    for (const k of this.thrownKnives) {
      this.scene.remove(k.mesh);
      k.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    this.thrownKnives.length = 0;

    // drop any in-flight rockets / explosions from a previous round
    for (const r of this.rockets) {
      this.scene.remove(r.mesh);
      r.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    this.rockets.length = 0;
    for (const e of this.explosions) {
      disposeExplosion(this.scene, e);
    }
    this.explosions.length = 0;
    for (const s of this.shells) {
      this.scene.remove(s.mesh);
    }
    this.shells.length = 0;
    for (const tr of this.tracers) {
      this.scene.remove(tr.mesh);
      tr.mesh.geometry.dispose();
      tr.mesh.material.dispose();
    }
    this.tracers.length = 0;
    for (const puff of this.muzzleSmoke) {
      this.scene.remove(puff.mesh);
      puff.mesh.geometry.dispose();
      puff.mesh.material.dispose();
    }
    this.muzzleSmoke.length = 0;
  }

  startReload() {
    const def = this.currentDef;
    const st = this.currentState;
    if (def.kind === 'melee' || st.isReloading) return;
    if (st.magAmmo >= def.magSize || st.reserveAmmo <= 0) return;
    st.isReloading = true;
    st.reloadTimer = def.reloadTime;
    // Two-phase reload: mag drop immediately, rack/bolt halfway through
    this.audio.playReloadMag();
    setTimeout(() => { if (st.isReloading) this.audio.playReloadRack(); }, (def.reloadTime * 0.55) * 1000);
    if (this.onReloadStart) this.onReloadStart();
  }

  _completeReload() {
    const def = this.currentDef;
    const st = this.currentState;
    const needed = def.magSize - st.magAmmo;
    const transfer = Math.min(needed, st.reserveAmmo);
    st.magAmmo += transfer;
    st.reserveAmmo -= transfer;
    st.isReloading = false;
  }

  _spawnTracer(from, to, weaponDef = this.currentDef) {
    const mesh = createTracerMesh();
    const direction = to.clone().sub(from);
    const distance = direction.length();
    if (distance <= 0.001) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      return;
    }
    direction.multiplyScalar(1 / distance);
    // Cap presentation speed independently from simulation. Damage is still
    // instantaneous; this only guarantees the streak survives long enough for
    // a 30/60/144 Hz display to show it.
    const speed = Math.min(weaponDef?.tracerSpeed || TRACER_VISUAL_SPEED, TRACER_VISUAL_SPEED);
    const trailLength = Math.min(TRACER_LENGTH, distance);
    mesh.position.copy(from);
    mesh.scale.set(1, 1, trailLength);
    mesh.lookAt(to);
    if (weaponDef?.energyColor) mesh.material.color.setHex(weaponDef.energyColor);
    this.scene.add(mesh);
    this.tracers.push({
      mesh,
      from: from.clone(),
      to: to.clone(),
      direction,
      distance,
      travelled: 0,
      speed,
      trailLength,
      fade: 1,
      endAge: 0,
    });
  }

  /** Render a replicated shot without changing local ammo or applying damage. */
  showAuthoritativeTracer(weaponId, from, to) {
    const def = this.allWeapons.find((weapon) => weapon.id === weaponId) || this.currentDef;
    this._spawnTracer(from, to, def);
  }

  _flash() {
    const skinSound  = this._activeSkinFor?.(this.currentDef?.id)?.shootSound;
    const animeActive = CUTE_SOUNDS.has(skinSound);
    const fireActive  = FIRE_SOUNDS.has(skinSound);
    const flashColor  = animeActive ? 0xff69b4 : fireActive ? 0xff4400 : 0xffcc66;
    const flashHex    = animeActive ? 0xff9de0 : fireActive ? 0xff6600 : 0xfff0a0;
    this.flashLight.color.setHex(flashColor);
    this.flashLight.intensity = animeActive ? 12 : fireActive ? 14 : 8;
    this.models.get(this.currentDef.id).muzzle.getWorldPosition(this._muzzleWorld);
    this.camera.worldToLocal(this._muzzleWorld);
    const muzzleWorld = this._muzzleWorld;
    this.flashLight.position.copy(muzzleWorld);
    this._flashTimer = FLASH_LIFE;

    // Show sprite meshes at muzzle
    const muzzleObj = this.models.get(this.currentDef.id).muzzle;
    this._flashMeshes.forEach((m) => {
      muzzleObj.add(m);
      m.material.color.setHex(flashHex);
      m.material.opacity = 0.92;
      const scale = this.currentDef.muzzleFlashScale ?? 1;
      m.scale.setScalar(scale * (0.86 + Math.random() * 0.24));
      m.rotation.z += Math.random() * Math.PI;
    });
  }

  _spawnMuzzleSmoke() {
    const def = this.currentDef;
    if (!def.muzzleSmoke) return;
    this.models.get(def.id).muzzle.getWorldPosition(this._muzzleWorld);
    this.camera.getWorldDirection(this._fwdVec);
    this._upVec.setFromMatrixColumn(this.camera.matrixWorld, 1);
    this._rightVec.setFromMatrixColumn(this.camera.matrixWorld, 0);
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.026 + Math.random() * 0.012, 1),
        new THREE.MeshBasicMaterial({
          color: 0xc9d2d4,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
        }),
      );
      mesh.position.copy(this._muzzleWorld);
      mesh.position.addScaledVector(this._rightVec, (Math.random() - 0.5) * 0.025);
      const velocity = this._fwdVec.clone().multiplyScalar(0.55 + Math.random() * 0.45);
      velocity.addScaledVector(this._upVec, 0.12 + Math.random() * 0.18);
      velocity.addScaledVector(this._rightVec, (Math.random() - 0.5) * 0.22);
      this.scene.add(mesh);
      this.muzzleSmoke.push({ mesh, velocity, age: 0, life: 0.13 + Math.random() * 0.08 });
    }
  }

  _updateMuzzleSmoke(dt) {
    for (let i = this.muzzleSmoke.length - 1; i >= 0; i--) {
      const puff = this.muzzleSmoke[i];
      puff.age += dt;
      puff.mesh.position.addScaledVector(puff.velocity, dt);
      puff.velocity.multiplyScalar(Math.exp(-5 * dt));
      const t = Math.min(1, puff.age / puff.life);
      puff.mesh.scale.setScalar(1 + t * 2.2);
      puff.mesh.material.opacity = 0.2 * (1 - t) * (1 - t);
      if (t >= 1) {
        this.scene.remove(puff.mesh);
        puff.mesh.geometry.dispose();
        puff.mesh.material.dispose();
        this.muzzleSmoke.splice(i, 1);
      }
    }
  }

  _spawnShell() {
    const mesh = new THREE.Mesh(this._shellGeo, this._shellMat);
    this.models.get(this.currentDef.id).muzzle.getWorldPosition(this._muzzleWorld);
    this._rightVec.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this._upVec.setFromMatrixColumn(this.camera.matrixWorld, 1);
    mesh.position.copy(this._muzzleWorld)
      .addScaledVector(this._rightVec, 0.12)
      .addScaledVector(this._upVec, -0.05);
    this.scene.add(mesh);
    const vel = this._rightVec.clone().multiplyScalar(2.8 + Math.random() * 1.4);
    vel.addScaledVector(this._upVec, 1.8 + Math.random() * 1.0);
    vel.x += (Math.random() - 0.5) * 0.8;
    vel.z += (Math.random() - 0.5) * 0.8;
    this.shells.push({ mesh, vel, life: 0.55 });
  }

  _spawnAnimeSparkles() {
    if (!this._animeSparkles) this._animeSparkles = [];
    const colors = [0xff69b4, 0xff1493, 0xffa0d0, 0xffd700, 0xffffff];
    this.models.get(this.currentDef.id).muzzle.getWorldPosition(this._muzzleWorld);
    const muzzleWorld = this._muzzleWorld;
    this._upVec.setFromMatrixColumn(this.camera.matrixWorld, 1);
    this._rightVec.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = this._upVec, right = this._rightVec;
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.SphereGeometry(0.015 + Math.random() * 0.02, 4, 3);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        transparent: true, opacity: 1.0, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(muzzleWorld);
      this.scene.add(mesh);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        1.5 + Math.random() * 3,
        (Math.random() - 0.5) * 4
      );
      vel.addScaledVector(up,    Math.random() * 2.5);
      vel.addScaledVector(right, (Math.random() - 0.5) * 2);
      this._animeSparkles.push({ mesh, vel, life: 0.5 + Math.random() * 0.3, spin: Math.random() * 10 });
    }
  }

  _updateAnimeSparkles(dt) {
    if (!this._animeSparkles?.length) return;
    for (let i = this._animeSparkles.length - 1; i >= 0; i--) {
      const s = this._animeSparkles[i];
      s.vel.y -= 8 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.z += s.spin * dt;
      s.life -= dt;
      s.mesh.material.opacity = Math.max(0, s.life / 0.5);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        this._animeSparkles.splice(i, 1);
      }
    }
  }

  _spawnFireEmbers() {
    if (!this._fireEmbers) this._fireEmbers = [];
    const colors = [0xff2200, 0xff6600, 0xff9900, 0xffcc00, 0xff4400];
    this.models.get(this.currentDef.id).muzzle.getWorldPosition(this._muzzleWorld);
    const muzzleWorld = this._muzzleWorld;
    this._fwdVec.setFromMatrixColumn(this.camera.matrixWorld, 2).negate();
    this._upVec.setFromMatrixColumn(this.camera.matrixWorld, 1);
    this._rightVec.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const fwd = this._fwdVec, up = this._upVec, right = this._rightVec;
    for (let i = 0; i < 12; i++) {
      const size = 0.012 + Math.random() * 0.022;
      const geo = new THREE.SphereGeometry(size, 4, 3);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        transparent: true, opacity: 1.0, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(muzzleWorld);
      this.scene.add(mesh);
      const spread = 0.8 + Math.random() * 1.6;
      const vel = fwd.clone().multiplyScalar(5 + Math.random() * 8);
      vel.addScaledVector(up,    (Math.random() - 0.3) * spread * 4);
      vel.addScaledVector(right, (Math.random() - 0.5) * spread * 4);
      this._fireEmbers.push({ mesh, vel, life: 0.28 + Math.random() * 0.22, spin: Math.random() * 14 });
    }
  }

  _updateFireEmbers(dt) {
    if (!this._fireEmbers?.length) return;
    for (let i = this._fireEmbers.length - 1; i >= 0; i--) {
      const s = this._fireEmbers[i];
      s.vel.y += 6 * dt; // embers rise
      s.vel.multiplyScalar(1 - dt * 3.5); // drag
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.z += s.spin * dt;
      s.life -= dt;
      const t = Math.max(0, s.life / 0.35);
      s.mesh.material.opacity = t;
      s.mesh.scale.setScalar(0.5 + t * 0.6); // shrink as they fade
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        this._fireEmbers.splice(i, 1);
      }
    }
  }

  _updateShells(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.vel.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += dt * 18;
      s.mesh.rotation.z += dt * 14;
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.shells.splice(i, 1);
      }
    }
  }

  _doHitscanShot(world, botMeshes) {
    const def = this.currentDef;
    const st = this.currentState;
    this.camera.getWorldPosition(this._camPos);
    this.camera.getWorldDirection(this._camDir);
    this._rightVec.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this._upVec.setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.models.get(def.id).muzzle.getWorldPosition(this._muzzleWorld);

    this._raycaster.far = def.range;
    // Bots + collider VISUALS get an exact mesh raycast; the map's bare box
    // colliders are checked separately (world.raycastBoxHit) and the nearer of
    // the two wins.
    this._targets.length = 0;
    for (const m of botMeshes) this._targets.push(m);
    for (const m of world.raycastMeshes) this._targets.push(m);
    const targets = this._targets;

    const pelletCount = def.pellets || 1;
    const spreadMin = def.spreadMin ?? def.spread ?? 0;
    const spreadMax = def.spreadMax ?? def.spread ?? spreadMin;
    const hipSpread = THREE.MathUtils.clamp(this._shotBloom, spreadMin, spreadMax);
    const shotSpread = hipSpread * THREE.MathUtils.lerp(1, def.zoomSpreadMod ?? 0.45, this.scopeT);
    let anyHitBot = false;
    let lastImpact = null;

    for (let i = 0; i < pelletCount; i++) {
      this._pelletDir.copy(this._camDir);
      if (shotSpread > 0) {
        const jx = (Math.random() - 0.5) * shotSpread;
        const jy = (Math.random() - 0.5) * shotSpread;
        this._pelletDir.addScaledVector(this._rightVec, jx).addScaledVector(this._upVec, jy).normalize();
      }
      this._raycaster.set(this._camPos, this._pelletDir);
      const hits = this._raycaster.intersectObjects(targets, true);
      let hit = hits.find((h) => !h.object.userData.noHit);
      // A bare box in front of the mesh hit blocks the shot (and if nothing was
      // hit at all, the box IS the hit) — cover you can see now stops bullets.
      const boxHit = world.raycastBoxHit(this._raycaster.ray, def.range);
      if (boxHit && (!hit || boxHit.distance < hit.distance)) {
        hit = { point: boxHit.point, distance: boxHit.distance, object: _BOX_OBJ };
      }
      if (hit) {
        lastImpact = hit.point;
        const bot = hit.object.userData.bot;
        if (bot) {
          anyHitBot = true;
          // Three body kinds, three ways to know you hit a head, in order of
          // how much the body actually knows:
          //   headshotY  a skinned body states its own head height. There is no
          //              per-part head mesh left to tag on one — it is a handful
          //              of merged meshes — so without this every head hit on
          //              the block/lofted chassis silently counts as a body hit.
          //   isHuman    the rigged soldier is one skinned mesh: height rule.
          //   isHead     the old parts-on-pivots bodies, which do tag a mesh.
          const ud = bot.mesh?.userData;
          const headY = ud?.headshotY;
          const isHead = typeof headY === 'number'
            ? (hit.point.y - bot.position.y) > headY
            : ud?.isHuman
              ? (hit.point.y - bot.position.y) > 1.5
              : !!hit.object.userData.isHead;
          const mult   = isHead && def.headshotMultiplier ? def.headshotMultiplier : 1;
          if (this.onHitBot) this.onHitBot(bot, def.damage * mult, hit.point, { headshot: isHead, hitscan: true });
        } else if (this.onHitWorld) {
          this.onHitWorld(hit.point);
        }
        this._spawnTracer(this._muzzleWorld, hit.point);
      } else {
        this._farVec.copy(this._camPos).addScaledVector(this._pelletDir, def.range);
        this._spawnTracer(this._muzzleWorld, this._farVec);
      }
    }

    return anyHitBot;
  }

  _doMeleeSwing(player, world, botManager) {
    const def = this.currentDef;
    const camPos = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);
    const aimDir = new THREE.Vector3();
    this.camera.getWorldDirection(aimDir);
    const camDir = aimDir.clone();
    camDir.y = 0;
    camDir.normalize();

    for (const bot of botManager.bots) {
      if (!bot.alive) continue;
      const toBot = new THREE.Vector3(bot.position.x - player.position.x, 0, bot.position.z - player.position.z);
      const dist = toBot.length();
      if (dist > def.range) continue;
      toBot.normalize();
      const dot = camDir.dot(toBot);
      if (dot > Math.cos(def.arc)) {
        const meshData = bot.mesh?.userData;
        const headY = typeof meshData?.headshotY === 'number'
          ? meshData.headshotY
          : (meshData?.isHuman ? 1.62 : 1.55);
        const headPoint = new THREE.Vector3(bot.position.x, bot.position.y + headY, bot.position.z);
        const toHead = headPoint.clone().sub(camPos).normalize();
        // A sword critical still requires deliberate head aim; the broad body
        // sweep remains 75 damage instead of turning the whole arc into a
        // one-hit zone.
        const isHead = Boolean(def.headshotMultiplier)
          && aimDir.dot(toHead) > Math.cos(0.18);
        const damage = def.damage * (isHead ? def.headshotMultiplier : 1);
        if (this.onHitBot) this.onHitBot(
          bot,
          damage,
          isHead ? headPoint : bot.position,
          { headshot: isHead, melee: true },
        );
      }
    }
  }

  _makeThrownKnifeMesh(def) {
    const skin = this._activeSkinFor(def.id);
    const bladeColor = skin?.blade ?? 0xc0c6ce;
    const g = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({
      color: bladeColor, metalness: 0.9, roughness: 0.18,
      emissive: new THREE.Color(skin?.emissive ?? 0x000000),
      emissiveIntensity: skin?.emissiveIntensity ?? 0,
    });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.82, metalness: 0.1 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.26), bladeMat);
    blade.position.z = -0.1;
    g.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.07, 6), bladeMat);
    tip.rotation.x = -Math.PI / 2; tip.position.z = -0.27;
    g.add(tip);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.1), gripMat);
    grip.position.z = 0.08;
    g.add(grip);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  _throwKnife(def) {
    const muzzleWorld = new THREE.Vector3();
    this.models.get(def.id).muzzle.getWorldPosition(muzzleWorld);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir).normalize();

    const mesh = this._makeThrownKnifeMesh(def);
    mesh.position.copy(muzzleWorld);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    this.scene.add(mesh);

    this.thrownKnives.push({
      mesh, pos: muzzleWorld.clone(), dir: dir.clone(),
      speed: def.throwSpeed || 40, life: 3, def
    });

    this._knifeCooldown = def.throwCooldown || 0.9;
    // hide the in-hand knife until a fresh one is pulled (cooldown end)
    const m = this.models.get(def.id);
    if (m) m.group.visible = false;
    if (this.audio.playSwing) this.audio.playSwing();
  }

  _updateThrownKnives(dt, world, botManager) {
    if (!this.thrownKnives.length) return;
    const worldMeshes = world.raycastMeshes;
    const botMeshes = botManager.getRaycastTargets();
    const ray = new THREE.Raycaster();
    const spinAxis = new THREE.Vector3(1, 0, 0);

    for (let i = this.thrownKnives.length - 1; i >= 0; i--) {
      const k = this.thrownKnives[i];
      const prev = k.pos.clone();
      const step = k.speed * dt;
      k.pos.addScaledVector(k.dir, step);
      k.life -= dt;

      let hitPoint = null, hitBot = null;
      ray.set(prev, k.dir);
      ray.far = step + 0.2;
      const hits = ray
        .intersectObjects([...botMeshes, ...worldMeshes], true)
        .filter((h) => !h.object.userData.noHit);
      if (hits.length) { hitPoint = hits[0].point; hitBot = hits[0].object.userData.bot; }
      // Bare box colliders stick the knife too (and win if they're nearer).
      const kBox = world.raycastBoxHit(ray.ray, ray.far);
      if (kBox && (!hitPoint || kBox.distance < hits[0].distance)) {
        hitPoint = kBox.point; hitBot = null;
      }

      const oob = Math.abs(k.pos.x) > world.arenaHalf || Math.abs(k.pos.z) > world.arenaHalf;
      if (!hitPoint && (k.pos.y <= 0.05 || oob || k.life <= 0)) hitPoint = k.pos.clone();

      if (hitPoint) {
        if (hitBot && this.onHitBot) {
          // one-hit kill + 3x reward (only thrown knives carry rewardMult)
          this.onHitBot(hitBot, k.def.throwDamage || 9999, hitPoint,
            { rewardMult: k.def.throwRewardMult || 3, thrown: true });
        }
        this.scene.remove(k.mesh);
        k.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
        this.thrownKnives.splice(i, 1);
      } else {
        k.mesh.position.copy(k.pos);
        k.mesh.rotateOnAxis(spinAxis, dt * 24); // tumbling throw
      }
    }
  }

  _spawnRocket(def) {
    const muzzleWorld = new THREE.Vector3();
    this.models.get(def.id).muzzle.getWorldPosition(muzzleWorld);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.normalize();

    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6b6f55, roughness: 0.6, metalness: 0.3 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x3f6b34, roughness: 0.5, metalness: 0.3 });
    const finMat = new THREE.MeshStandardMaterial({ color: 0x222420, roughness: 0.7 });

    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 10), bodyMat);
    tube.rotation.x = Math.PI / 2;
    g.add(tube);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 10), noseMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -0.16;
    g.add(nose);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.06, 0.06), finMat);
      fin.position.z = 0.1;
      fin.rotation.z = (i / 4) * Math.PI * 2;
      fin.position.x = Math.cos((i / 4) * Math.PI * 2) * 0.04;
      fin.position.y = Math.sin((i / 4) * Math.PI * 2) * 0.04;
      g.add(fin);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.position.copy(muzzleWorld);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    this.scene.add(g);

    this.rockets.push({
      mesh: g,
      pos: muzzleWorld.clone(),
      dir: dir.clone(),
      speed: def.rocketSpeed || 40,
      life: 5,
      def
    });
  }

  _updateRockets(dt, world, botManager) {
    if (!this.rockets.length) return;
    const botMeshes = botManager.getRaycastTargets();
    const ray = new THREE.Raycaster();

    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      const prev = r.pos.clone();
      const stepLen = r.speed * dt;
      r.pos.addScaledVector(r.dir, stepLen);
      r.life -= dt;

      let hitPoint = null;
      let hitDistance = Infinity;
      ray.set(prev, r.dir);
      ray.far = stepLen + 0.15;
      const hits = ray
        .intersectObjects(botMeshes, true)
        .filter((h) => !h.object.userData.noHit);
      if (hits.length) {
        hitPoint = hits[0].point;
        hitDistance = hits[0].distance;
      }
      // Use collision geometry for the world impact. This catches thin floors,
      // elevated platforms, and invisible gameplay hulls even when the visible
      // map mesh is simplified.
      const worldHit = world.raycastCollisionHit?.(ray.ray, ray.far)
        || world.raycastBoxHit(ray.ray, ray.far);
      if (worldHit && worldHit.distance < hitDistance) {
        hitPoint = worldHit.point;
        hitDistance = worldHit.distance;
      }

      const outOfBounds = Math.abs(r.pos.x) > world.arenaHalf || Math.abs(r.pos.z) > world.arenaHalf;
      if (!hitPoint && (r.pos.y <= 0.05 || outOfBounds)) hitPoint = r.pos.clone();
      if (!hitPoint && r.life <= 0) hitPoint = r.pos.clone();

      if (hitPoint) {
        this._explode(hitPoint, r.def, botManager, world);
        this.scene.remove(r.mesh);
        r.mesh.traverse((o) => {
          if (o.isMesh) {
            o.geometry.dispose();
            o.material.dispose();
          }
        });
        this.rockets.splice(i, 1);
      } else {
        r.mesh.position.copy(r.pos);
      }
    }
  }

  _explode(point, def, botManager, world = null) {
    this.showAuthoritativeExplosion(point, def.splashRadius || 5, 'rocket');

    const radius = def.splashRadius || 5;
    const minF = def.splashMin !== undefined ? def.splashMin : 0.25;
    for (const bot of botManager.bots) {
      if (!bot.alive) continue;
      const bc = new THREE.Vector3(bot.position.x, bot.position.y + 0.9, bot.position.z);
      const d = bc.distanceTo(point);
      if (d <= radius) {
        // A blast expands through open space, not through solid walls.
        if (world?.raycastCollisionHit && d > 0.2) {
          const blastDir = bc.clone().sub(point).multiplyScalar(1 / d);
          const blastRay = new THREE.Ray(point.clone().addScaledVector(blastDir, 0.12), blastDir);
          const blocked = world.raycastCollisionHit(blastRay, Math.max(0, d - 0.18));
          if (blocked) continue;
        }
        const f = THREE.MathUtils.lerp(1, minF, THREE.MathUtils.clamp(d / radius, 0, 1));
        if (this.onHitBot) this.onHitBot(bot, def.damage * f, point);
      }
    }
  }

  /** Play a server-replicated blast without applying client-side damage. */
  showAuthoritativeExplosion(point, radius = 5, kind = 'rocket') {
    if (this.audio.playExplosion) {
      if (this.audio.playAt) this.audio.playAt(point, () => this.audio.playExplosion(kind));
      else this.audio.playExplosion(kind);
    }
    this.explosions.push(spawnExplosion(this.scene, point, radius, kind));
  }

  _updateExplosions(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      if (updateExplosion(e, dt)) {
        disposeExplosion(this.scene, e);
        this.explosions.splice(i, 1);
      }
    }
  }

  _applyViewmodelRecoil(amount) {
    this.kickPos.z += amount * 2.2;
    this.kickPos.y += amount * 0.4;
    this.kickRotX  -= amount * 3.2;
    this.kickVel.z += amount * 26;
    this.kickVel.y += amount * 6;
    this.kickRotXVel -= amount * 34;
  }

  _fire(world, botMeshes, player, botManager) {
    const def = this.currentDef;
    const st = this.currentState;

    if (def.kind === 'melee') {
      this.audio.playSwing();
      this._doMeleeSwing(player, world, botManager);
      this.swingPhase = 0;
      this.fireTimer = scheduleNextShot(this.fireTimer, def.fireRate);
      if (this.onShoot) this.onShoot(def);
      return;
    }

    if (st.isReloading) return;
    if (st.magAmmo <= 0) {
      this.audio.playEmptyClick();
      if (this.onEmpty) this.onEmpty();
      this.startReload();
      return;
    }

    st.magAmmo -= 1;
    this.fireTimer = scheduleNextShot(this.fireTimer, def.fireRate);
    // A themed skin can override the fire SFX (anime pew, laser, fire whoosh).
    const activeSkin = this._activeSkinFor(def.id);
    const skinSound  = activeSkin?.shootSound;
    if (!(skinSound && this.audio.playSkinShot(skinSound))) {
      this.audio.playShot(def.sound || 'rifle');
    }
    // Shell casing clink (not for melee, rocket, or shotgun — they eject differently)
    if (def.kind !== 'rocket' && def.kind !== 'melee'
        && def.id !== 'levershotgun' && def.id !== 'energyshotgun') {
      this.audio.playShellCasing();
    }
    if (def.kind === 'rocket') {
      this._spawnRocket(def);
    } else {
      this._doHitscanShot(world, botMeshes);
      if (def.spawnShells !== false) this._spawnShell();
    }
    this._flash();
    this._spawnMuzzleSmoke();
    // Kawaii skins: spawn pink sparkle hearts at the muzzle
    if (CUTE_SOUNDS.has(skinSound)) this._spawnAnimeSparkles();
    // Fire skins with fireEmbers flag: spawn orange ember burst
    const activeSkinDef = this._activeSkinFor?.(this.currentDef?.id);
    if (activeSkinDef?.fireEmbers) this._spawnFireEmbers();

    // Recoil impulse: a displacement kick PLUS a velocity punch, so the spring
    // launches fast and settles smoothly (juicier than a pure position offset).
    this._applyViewmodelRecoil(def.recoil);
    if (this.applyRecoilToPlayer) {
      this.applyRecoilToPlayer(def.cameraRecoil ?? def.recoil * 0.6);
    }
    if (def.spreadMax != null) {
      this._shotBloom = Math.min(
        def.spreadMax,
        Math.max(def.spreadMin || 0, this._shotBloom) + (def.spreadBloomPerShot || 0),
      );
    }

    if (this.onShoot) this.onShoot(def);

    if (st.magAmmo <= 0 && st.reserveAmmo > 0) {
      this.startReload();
    }
  }

  update(dt, input, world, botManager, player) {
    this.fireTimer = advanceFireCooldown(this.fireTimer, dt);
    // Re-evaluate after aspect/reload state changes so both palms remain fixed
    // to the weapon rather than drifting independently during animation.
    this._applyViewmodelHandPose();

    for (const [code, index] of this.keyMap) {
      if (input.consumeJustPressed(code)) this.switchTo(index);
    }
    // Scroll switches weapons only in FPS mode; in TPS the wheel zooms the camera.
    if (input.wheelDelta !== 0 && !(player?._camDist > 0)) {
      const dir = input.wheelDelta > 0 ? 1 : -1;
      this.switchTo((this.currentIndex + dir + this.loadout.length) % this.loadout.length);
    }

    if (input.consumeJustPressed('KeyR')) this.startReload();

    const st = this.currentState;
    if (st.isReloading) {
      st.reloadTimer -= dt;
      if (st.reloadTimer <= 0) this._completeReload();
    }

    const def = this.currentDef;
    // Keep first-person presentation self-healing. Network reconciliation and
    // asynchronous model replacement may happen between rendered frames, but
    // neither is allowed to strand the equipped firearm in a hidden state.
    this._ensureActiveModelVisibility();
    // A quick dip on touchdown gives jumps and grav-lifts visible weight in
    // first person. It is intentionally small—the camera already has its own
    // head motion—and only the viewmodel receives this impulse.
    const grounded = player?.onGround !== false;
    const fallingSpeed = Math.max(0, -(player?.velocity?.y || 0));
    if (!grounded) this._fallSpeed = Math.max(this._fallSpeed, fallingSpeed);
    if (grounded && !this._wasGrounded) {
      // Player.update has already zeroed velocity.y by the time the viewmodel
      // sees a landing, so retain the fastest downward speed from the airtime.
      // Tiny curb drops get a restrained settle; a hard fall gets the full dip.
      this._landStrength = THREE.MathUtils.clamp(this._fallSpeed / 14, 0.18, 1.2);
      this._landT = this._fallSpeed > 0.35 ? 0.22 : 0;
      this._fallSpeed = 0;
    } else if (grounded) {
      this._fallSpeed = 0;
    }
    this._wasGrounded = grounded;
    if (this._landT > 0) this._landT = Math.max(0, this._landT - dt);
    const landP = this._landT > 0 ? 1 - this._landT / 0.22 : 1;
    const landPulse = (this._landT > 0 ? Math.sin(landP * Math.PI) : 0) * this._landStrength;

    this._shotBloom = Math.max(
      def.spreadMin || 0,
      this._shotBloom - (def.spreadRecovery || 0) * dt,
    );
    const triggerPulled = wantsTriggerShot(def.automatic, input.mouseDown, this.prevMouseDown);

    if (triggerPulled && this.fireTimer <= 0) {
      this._fire(world, botManager.getRaycastTargets(), player, botManager);
    }
    if (!input.mouseDown && this.fireTimer < 0) this.fireTimer = 0;
    this.prevMouseDown = input.mouseDown;

    // Knife throw (right-click): one-hit kill + 3x reward. Cooldown hides the
    // in-hand knife until a fresh one is pulled.
    if (this._knifeCooldown > 0) {
      this._knifeCooldown -= dt;
      if (this._knifeCooldown <= 0 && def.kind === 'melee') {
        const m = this.models.get(def.id);
        if (m) m.group.visible = true;
      }
    }
    const rightJustPressed = input.rightMouseDown && !this._prevRightMouse;
    if (def.kind === 'melee' && def.throwable && rightJustPressed && this._knifeCooldown <= 0) {
      this._throwKnife(def);
    }
    this._prevRightMouse = input.rightMouseDown;

    // Sprint blend for COD carry animation. Firing remains legal while
    // sprinting; run-and-gun simply keeps the rig braced instead of allowing
    // the non-combat carry pose to bury the sights below the frame.
    this._sprintT = expDamp(this._sprintT, player.isSprinting ? 1 : 0, 9, dt);
    this._movingFireT = expDamp(
      this._movingFireT,
      isRunningAndFiring(player, input) ? 1 : 0,
      14,
      dt,
    );

    // Every EV.IO firearm can zoom. Regular guns remain visible and travel
    // onto their physical sight axis; snipers hand off to the overlay late in
    // the same motion rather than disappearing on the first held frame.
    const wantScope = def.kind !== 'melee' && input.rightMouseDown && !player.isSprinting;
    this.scopeT = expDamp(this.scopeT, wantScope ? 1 : 0, def.adsSpeed || 11, dt);
    this.kickGroup.visible = !shouldHideAdsViewmodel(def, this.scopeT, wantScope);
    // Aiming keeps a trace of organic motion, but removes enough viewmodel
    // travel that the physical sight and fixed scope overlay do not disagree.
    const adsMotionScale = THREE.MathUtils.lerp(1, def.scoped ? 0.05 : 0.10, this.scopeT);
    const sprintFovBoost = this._sprintT * 6;
    const aimedFov = def.scoped ? 28 : (def.adsFov ?? DEFAULT_ADS_FOV);
    const targetFov = THREE.MathUtils.lerp(player.baseFov + sprintFovBoost, aimedFov, this.scopeT);
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    // recoil spring-back — a damped spring (position + velocity) gives a
    // punchy kick that snaps back and settles smoothly, instead of a stiff
    // frame-rate-dependent linear decay.
    const K = 190, D = 25;   // stiffness / damping (~critically damped, tiny snap)
    const spring = this._springOut;
    springTo(spring, this.kickPos.x, this.kickVel.x, 0, K, D, dt);
    this.kickPos.x = spring[0]; this.kickVel.x = spring[1];
    springTo(spring, this.kickPos.y, this.kickVel.y, 0, K, D, dt);
    this.kickPos.y = spring[0]; this.kickVel.y = spring[1];
    springTo(spring, this.kickPos.z, this.kickVel.z, 0, K, D, dt);
    this.kickPos.z = spring[0]; this.kickVel.z = spring[1];
    springTo(spring, this.kickRotX, this.kickRotXVel, 0, K, D, dt);
    this.kickRotX = spring[0]; this.kickRotXVel = spring[1];
    // weapon-switch raise: the model eases up from lowered on every swap
    this._raiseT = expDamp(this._raiseT, 1, 14, dt);
    const raiseDrop = (1 - this._raiseT) * 0.28;
    const raiseTilt = (1 - this._raiseT) * 0.9;
    this.kickGroup.position.set(this.kickPos.x, this.kickPos.y - raiseDrop, this.kickPos.z);
    // Establish the complete base pose every frame. A reload or blade arc can
    // add roll/yaw below, but those axes must never leak into the next weapon.
    this.kickGroup.rotation.set(this.kickRotX - raiseTilt, 0, 0);

    // sword swing animation — raise → fast overhand chop → recover
    if (def.kind === 'melee' && this.swingPhase < 1) {
      this.swingPhase = Math.min(1, this.swingPhase + dt / def.fireRate);
      const ph = this.swingPhase;
      if (def.id === 'knife') {
        const strike = ph < 0.34 ? ph / 0.34 : 1 - (ph - 0.34) / 0.66;
        const e = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(strike, 0, 1), 0, 1);
        this.kickGroup.rotation.set(-0.10 + e * 0.28, -0.28 + e * 0.62, 0.10 - e * 0.42);
        this.kickGroup.position.set(
          this.kickPos.x - e * 0.035,
          this.kickPos.y + e * 0.025,
          this.kickPos.z - e * 0.20,
        );
      } else if (ph < 0.22) {
        // Lift the hilt and cock the blade back without sweeping across the
        // sightline before the attack begins.
        const w = ph / 0.22;
        const e = w * w * (3 - 2 * w);
        this.kickGroup.rotation.set(-0.22 * e, -0.08 * e, -0.05 * e);
        this.kickGroup.position.set(
          this.kickPos.x + 0.02 * e,
          this.kickPos.y + 0.08 * e,
          this.kickPos.z - 0.08 * e,
        );
      } else if (ph < 0.58) {
        // Drive the sword from above the shoulder down through the target.
        // Pitch owns the motion; small yaw/roll only keep the blade readable.
        const s = (ph - 0.22) / 0.36;
        const e = s * s * (3 - 2 * s);
        this.kickGroup.rotation.set(
          THREE.MathUtils.lerp(-0.22, 1.35, e),
          THREE.MathUtils.lerp(-0.08, 0.10, e),
          THREE.MathUtils.lerp(-0.05, 0.14, e),
        );
        this.kickGroup.position.set(
          this.kickPos.x + THREE.MathUtils.lerp(0.02, -0.10, e),
          this.kickPos.y + THREE.MathUtils.lerp(0.08, -0.22, e),
          this.kickPos.z + THREE.MathUtils.lerp(-0.08, -0.16, e),
        );
      } else {
        // Slower recovery lifts the blade precisely back into its right guard.
        const r = (ph - 0.58) / 0.42;
        const e = r * r * (3 - 2 * r);
        this.kickGroup.rotation.set(
          THREE.MathUtils.lerp(1.35, 0, e),
          THREE.MathUtils.lerp(0.10, 0, e),
          THREE.MathUtils.lerp(0.14, 0, e),
        );
        this.kickGroup.position.set(
          this.kickPos.x + THREE.MathUtils.lerp(-0.10, 0, e),
          this.kickPos.y + THREE.MathUtils.lerp(-0.22, 0, e),
          this.kickPos.z + THREE.MathUtils.lerp(-0.16, 0, e),
        );
      }
    } else if (def.kind === 'melee') {
      if (def.id === 'knife') this.kickGroup.rotation.set(-0.10, -0.28, 0.10);
      else this.kickGroup.rotation.set(0, 0, 0);
    }

    // idle breathing / weapon settle — fades out during sprint. Its own smooth
    // clock (not tied to any snappy state).
    this._idleT += dt;
    if (def.kind !== 'melee') {
      const breatheAmt = (1.0 - this._sprintT) * adsMotionScale;
      const breathe = Math.sin(this._idleT * 1.6) * 0.004 * breatheAmt;
      const swayB   = Math.cos(this._idleT * 1.1) * 0.003 * breatheAmt;
      this.kickGroup.position.y += breathe;
      this.kickGroup.rotation.z = swayB;

      // Three readable reload beats: lower/roll the rifle, seat the magazine,
      // then snap it back to ready. The whole viewmodel moves as one rigid
      // object, so authored weapon geometry never needs weapon-specific bones.
      if (st.isReloading) {
        const reloadFrameScale = viewmodelReloadScale(this.camera.aspect);
        const p = THREE.MathUtils.clamp(
          1 - st.reloadTimer / Math.max(0.01, def.reloadTime), 0, 1
        );
        const smooth = (x) => x * x * (3 - 2 * x);
        const enter = smooth(THREE.MathUtils.clamp(p / 0.18, 0, 1));
        const exit = 1 - smooth(THREE.MathUtils.clamp((p - 0.74) / 0.26, 0, 1));
        const hold = enter * exit;
        const seat = Math.sin(
          THREE.MathUtils.clamp((p - 0.36) / 0.30, 0, 1) * Math.PI
        );
        this.kickGroup.position.x += hold * 0.075 * reloadFrameScale;
        // The mount below already lowers for reload. Keep this local hand beat
        // compact so the magazine hand remains visible at 60-degree FOV.
        this.kickGroup.position.y -= (hold * 0.08 + seat * 0.015) * reloadFrameScale;
        this.kickGroup.position.z += hold * 0.055 * reloadFrameScale;
        this.kickGroup.rotation.x += (hold * 0.30 + seat * 0.07) * reloadFrameScale;
        this.kickGroup.rotation.y += hold * 0.16 * reloadFrameScale;
        this.kickGroup.rotation.z -= (hold * 0.52 + seat * 0.08) * reloadFrameScale;
      }
    }

    // viewmodel look-sway: smooth the raw mouse delta into a VELOCITY first
    // (normalised by dt so it's framerate-independent, no jitter), then ease
    // the sway offset toward it — two stages of damping = buttery lag.
    const invDt = dt > 1e-4 ? 1 / dt : 0;
    const mvX = THREE.MathUtils.clamp(-input.mouseDX * invDt * 0.000022, -0.045, 0.045);
    const mvY = THREE.MathUtils.clamp(-input.mouseDY * invDt * 0.000022, -0.04, 0.04);
    this._swayVelX = expDamp(this._swayVelX, mvX, 18, dt);
    this._swayVelY = expDamp(this._swayVelY, mvY, 18, dt);
    this._swayX = expDamp(this._swayX, this._swayVelX, 11, dt);
    this._swayY = expDamp(this._swayY, this._swayVelY, 11, dt);
    this.swayGroup.rotation.y = this._swayX * adsMotionScale;
    this.swayGroup.rotation.x = this._swayY * adsMotionScale;

    // COD-style weapon bob driven by a CONTINUOUS phase that accelerates with
    // move speed — no pops when starting/stopping, and framerate-independent.
    const moveSpeed = Math.hypot(player.velocity?.x || 0, player.velocity?.z || 0);
    const bobHz = player.onGround ? (2.0 + moveSpeed * 0.9) : 0;
    this._bobPhase += bobHz * dt;
    const bobAmtTarget = (player.onGround && moveSpeed > 0.5)
      ? (player.isSprinting ? 0.022 : 0.014) * adsMotionScale : 0.0;
    this._bobAmt = expDamp(this._bobAmt ?? 0, bobAmtTarget, 8, dt);   // fade bob in/out
    const bobV = Math.sin(this._bobPhase * 2) * this._bobAmt;
    const bobH = Math.sin(this._bobPhase) * this._bobAmt * 0.55;

    // Reload: the gun comes down and rolls over so the mag well faces you, with
    // a jolt as the bolt goes home. Reading the reload's OWN timer rather than
    // starting another one keeps this in step with the audio and with the
    // third-person body, which animates the same reload from the same number.
    // Without it the first-person view did nothing at all through a reload —
    // just the HUD counter and a sound.
    const rTime = def.reloadTime || 0;
    const reloadP = (st.isReloading && rTime > 0)
      ? THREE.MathUtils.clamp(1 - st.reloadTimer / rTime, 0, 1) : 0;
    const rBell = reloadP > 0 ? Math.sin(Math.PI * reloadP) : 0;
    const rack  = reloadP > 0 ? Math.exp(-Math.pow((reloadP - 0.62) / 0.055, 2)) : 0;
    const reloadFrameScale = viewmodelReloadScale(this.camera.aspect);
    const framedBell = rBell * reloadFrameScale;
    const framedRack = rack * reloadFrameScale;

    // ADS + sprint blends → SMOOTHED mount target, then eased (no snap on
    // start/stop sprint or scope in/out).
    const aspectScale  = viewmodelAspectScale(this.camera.aspect);
    const baseX        = VIEWMODEL_X * aspectScale;
    const swordGuard   = def.id === 'sword';
    const adsEase      = this.scopeT * this.scopeT * (3 - 2 * this.scopeT);
    // Sprint lowers the complete gun-and-hands rig. The old positive offset
    // raised it 12cm, contradicting the intended carry and forcing implausibly
    // long sleeves just to keep them connected to the bottom of the frame.
    const sprintDrop = THREE.MathUtils.lerp(
      -0.02, 0.14, THREE.MathUtils.clamp((this.camera.fov - 60) / 18, 0, 1),
    );
    // A moving shot is a combat pose, not a full sprint carry. Leave a small
    // amount of bob/cant so speed still reads, while keeping both hands and
    // the muzzle in a usable firing lane.
    const sprintCarry = this._sprintT * (1 - 0.72 * this._movingFireT);
    const sprintDropY  = -sprintCarry * sprintDrop;
    const sprintShiftX = -sprintCarry * 0.12 * aspectScale;
    // Reload (mine) and the landing pulse (Codex's) are independent offsets on
    // the same mount, so they simply sum.
    const hipX = swordGuard
      ? SWORD_VIEWMODEL_X * THREE.MathUtils.clamp(aspectScale, 0.26, 1.08)
        - sprintCarry * 0.025 * aspectScale
      : baseX + sprintShiftX;
    const hipY = swordGuard
      ? SWORD_VIEWMODEL_Y - sprintCarry * 0.075
      : VIEWMODEL_Y + sprintDropY;
    const hipZ = swordGuard ? SWORD_VIEWMODEL_Z - sprintCarry * 0.025 : VIEWMODEL_Z;
    const activeViewmodelScale = swordGuard
      ? MELEE_VIEWMODEL_SCALE
      : firearmViewmodelScale(def, this.camera.aspect);
    this.weaponMount.scale.setScalar(activeViewmodelScale);
    // The mount was solved from the actual model bounds at construction time.
    // Using that physical sight anchor here keeps every gun centred without a
    // per-weapon screen-offset table or changing third-person weapon scale.
    const measuredSight = this.models.get(def.id)?.sight;
    const adsX = measuredSight ? -measuredSight.x * activeViewmodelScale : 0;
    const adsY = (measuredSight
      ? -measuredSight.y * activeViewmodelScale + ADS_SIGHT_Y
      : ADS_SIGHT_Y) - ADS_VIEWMODEL_DROP;
    const adsZ = measuredSight
      ? ADS_SIGHT_DEPTH - measuredSight.z * activeViewmodelScale
      : ADS_SIGHT_DEPTH;
    const tgtX = THREE.MathUtils.lerp(hipX, adsX, adsEase)
      + (bobH + 0.05 * framedBell) * aspectScale;
    const tgtY = THREE.MathUtils.lerp(hipY, adsY, adsEase) + bobV
      - 0.07 * framedBell - 0.015 * framedRack - landPulse * 0.055;
    const tgtZ = THREE.MathUtils.lerp(hipZ, adsZ, adsEase);
    this._mountPos.x = expDamp(this._mountPos.x, tgtX, 20, dt);
    this._mountPos.y = expDamp(this._mountPos.y, tgtY, 20, dt);
    this._mountPos.z = expDamp(this._mountPos.z, tgtZ, 20, dt);
    const targetMountPitch = swordGuard
      ? SWORD_VIEWMODEL_PITCH - sprintCarry * 0.055 + landPulse * 0.05
      : THREE.MathUtils.lerp(VIEWMODEL_PITCH + sprintCarry * 0.22, ADS_PITCH, adsEase)
        + 0.50 * framedBell + 0.14 * framedRack + landPulse * 0.12;
    const targetMountYaw = swordGuard
      ? SWORD_VIEWMODEL_YAW + sprintCarry * 0.025
      : THREE.MathUtils.lerp(VIEWMODEL_YAW, ADS_YAW, adsEase);
    this._mountRot.x = expDamp(this._mountRot.x, targetMountPitch, 17, dt);
    this._mountRot.y = expDamp(this._mountRot.y, targetMountYaw, 17, dt);
    this._mountRot.z = expDamp(this._mountRot.z,
      // A compact 32° cant reads as a lowered sprint carry without rotating
      // the support shoulder into the middle of the screen. The old 57° roll
      // was what made even a human-length sleeve appear to end in mid-air.
      swordGuard
        ? SWORD_VIEWMODEL_ROLL - sprintCarry * 0.06
        : THREE.MathUtils.lerp(VIEWMODEL_ROLL + sprintCarry * -0.40, ADS_ROLL, adsEase)
          + 0.42 * framedBell, 17, dt);
    // The tested shared depth keeps the longest authored stock and its recoil
    // travel clear of the near plane without separating either glove.
    this.weaponMount.position.set(this._mountPos.x, this._mountPos.y, this._mountPos.z);
    this.weaponMount.rotation.x = this._mountRot.x;
    this.weaponMount.rotation.y = this._mountRot.y;
    this.weaponMount.rotation.z = this._mountRot.z;

    // muzzle flash decay
    if (this._flashTimer !== undefined && this._flashTimer > 0) {
      this._flashTimer -= dt;
      const t = Math.max(0, this._flashTimer / FLASH_LIFE);
      this.flashLight.intensity = t * 8;
      this._flashMeshes.forEach((m) => { m.material.opacity = t * 0.92; });
      if (t === 0) {
        this._flashMeshes.forEach((m) => m.parent?.remove(m));
      }
    }

    // tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.travelled += tr.speed * dt;
      const progress = Math.min(tr.distance, tr.travelled);
      const tail = Math.max(0, progress - tr.trailLength);
      const head = Math.min(tr.distance, Math.max(tr.trailLength, progress));
      const visibleLength = Math.max(0.001, head - tail);
      tr.mesh.position.copy(tr.from).addScaledVector(tr.direction, tail);
      tr.mesh.scale.z = visibleLength;
      if (tr.travelled >= tr.distance) tr.endAge += dt;
      tr.fade = Math.max(0, 1 - tr.endAge / TRACER_END_FADE);
      tr.mesh.material.opacity = tr.fade * TRACER_OPACITY;
      if (tr.fade <= 0) {
        this.scene.remove(tr.mesh);
        tr.mesh.geometry.dispose();
        tr.mesh.material.dispose();
        this.tracers.splice(i, 1);
      }
    }

    // rockets + explosions + ejected shells + thrown knives
    this._updateRockets(dt, world, botManager);
    this._updateThrownKnives(dt, world, botManager);
    this._updateExplosions(dt);
    this._updateShells(dt);
    this._updateMuzzleSmoke(dt);
    this._updateAnimeSparkles(dt);
    this._updateFireEmbers(dt);

    // skin animations (only on the currently visible weapon)
    this.animTime += dt;
    const activeGroup = this.models.get(def.id).group;
    // Per-weapon skin takes priority over the global skin
    const perSkin = this._armoryMap?.get(def.id)?.skin;
    const activeSkin = perSkin || (def.kind === 'melee' ? this.swordSkin : this.weaponSkin);
    if (activeSkin?.animated) {
      // Route by catalog shape: the sword wears the shared gun catalog
      // (body/accent/energy roles) — only legacy entries carry .blade.
      if (activeSkin.blade !== undefined) animateSwordSkin(activeGroup, activeSkin, this.animTime);
      else                                animateWeaponSkin(activeGroup, activeSkin, this.animTime);
    }
  }

  getHudInfo() {
    const def = this.currentDef;
    const st = this.currentState;
    const spreadMin = def.spreadMin ?? def.spread ?? 0;
    const spreadMax = def.spreadMax ?? def.spread ?? spreadMin;
    const spreadSpan = Math.max(1e-6, spreadMax - spreadMin);
    const info = this._hudInfo ||= {};
    if (this._hudSlotsLoadout !== this.loadout) {
      this._hudSlotsLoadout = this.loadout;
      let gunSlot = 1;
      this._hudSlots = this.loadout.map((w) => ({
        key: w.kind === 'melee' ? 'Z' : String(gunSlot++),
        id: w.id,
        name: w.name,
        isMelee: w.kind === 'melee',
      }));
    }
    this._hudSlots.forEach((slot) => {
      const slotState = this.state.get(slot.id);
      slot.magAmmo = slotState?.magAmmo ?? 0;
      slot.reserveAmmo = slotState?.reserveAmmo ?? 0;
    });
    info.name = def.name;
    info.isMelee = def.kind === 'melee';
    info.magAmmo = st.magAmmo;
    info.reserveAmmo = st.reserveAmmo;
    info.isReloading = st.isReloading;
    info.reloadProgress = st.isReloading
      ? THREE.MathUtils.clamp(1 - st.reloadTimer / Math.max(0.01, def.reloadTime), 0, 1)
      : 0;
    info.reloadRemaining = Math.max(0, st.reloadTimer);
    info.reloadDuration = def.reloadTime || 0;
    info.aiming = this.scopeT;
    info.spreadRatio = spreadMax > spreadMin
      ? THREE.MathUtils.clamp((this._shotBloom - spreadMin) / spreadSpan, 0, 1)
      : 0;
    info.currentIndex = this.currentIndex;
    info.slots = this._hudSlots;
    return info;
  }
}
