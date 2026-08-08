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
const VIEWMODEL_Z = -0.78;
const VIEWMODEL_X = 0.32;
const VIEWMODEL_Y = -0.34;
const REFERENCE_ASPECT = 16 / 9;

// Preserve the lower-right composition on landscape screens without pushing
// both gloves out of portrait/mobile view. Capped on ultrawide so the weapon
// does not drift all the way into the corner.
function viewmodelAspectScale(aspect) {
  return THREE.MathUtils.clamp((aspect || REFERENCE_ASPECT) / REFERENCE_ASPECT, 0.32, 1.15);
}

// A narrow FOV magnifies the same world-space offset. Lift the mount only at
// sub-78° settings so the compact default pose stays low while 60° players do
// not lose the trigger glove below the frame.
function viewmodelFovLift(fov) {
  return THREE.MathUtils.clamp((78 - (fov || 78)) * 0.0067, 0, 0.12);
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
    // smoothed viewmodel state (all frame-rate-independent) — the applied
    // transform eases toward these targets so nothing ever snaps.
    this._swayX = 0; this._swayY = 0;         // smoothed look-sway
    this._swayVelX = 0; this._swayVelY = 0;   // smoothed mouse velocity
    this._bobPhase = 0;                       // continuous bob phase (own clock)
    this._mountPos = new THREE.Vector3(
      VIEWMODEL_X * viewmodelAspectScale(camera.aspect), VIEWMODEL_Y, VIEWMODEL_Z);
    this._mountRot = new THREE.Vector3(0, 0, 0);
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
    // Tucked lower-right and scaled down so the gun frames the corner of the
    // screen instead of blocking a third of the view (ev.io-style proportion).
    // The complete weapon + two-hand rig shares this deeper mount. Moving the
    // model alone would clear the stock but detach both palms from their grips.
    this.weaponMount.position.set(
      VIEWMODEL_X * viewmodelAspectScale(this.camera.aspect), VIEWMODEL_Y, VIEWMODEL_Z);
    this.weaponMount.scale.setScalar(0.74);
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
      color: 0x242a33, roughness: 0.52, metalness: 0.12, envMapIntensity: 1.0,
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
    const segment = (a, b, startRadius, endRadius, material, sides = 12) => {
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
      palm.position.set(0, -0.006, -0.034);
      palm.rotation.x = support ? -0.08 : 0.10;
      hand.add(palm);

      const handPlate = box(0.070, 0.012, 0.060, this.armPlateMat);
      handPlate.position.set(0, 0.026, -0.020);
      handPlate.rotation.x = palm.rotation.x;
      hand.add(handPlate);

      [-0.027, -0.009, 0.009, 0.027].forEach((xOffset, index) => {
        const finger = new THREE.Mesh(
          new THREE.CapsuleGeometry(
            0.0095,
            index === 0 || index === 3 ? 0.024 : 0.030,
            3,
            7,
          ),
          this.gloveMat,
        );
        finger.position.set(xOffset, -0.030, -0.055);
        finger.rotation.x = 0.58;
        hand.add(finger);
      });

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
        sign * (support ? 0.18 : 0.12),
        support ? -0.23 : -0.25,
        support ? 0.14 : 0.15,
      );
      arm.userData.sleeveLength = wrist.distanceTo(sleeveEnd);

      // A short hard-surface forearm shell followed by a dark flexible sleeve.
      // Splitting the silhouette here matches the third-person exosuit and stops
      // the entire visible arm reading as one featureless cylinder.
      arm.add(segment(wrist, armorEnd, 0.043, 0.052, this.armPlateMat));
      arm.add(segment(armorEnd, sleeveEnd, 0.050, 0.058, this.sleeveMat));
      const elbowJoint = new THREE.Mesh(
        new THREE.SphereGeometry(0.056, 10, 7), this.cuffMat,
      );
      elbowJoint.position.copy(armorEnd);
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
      position: new THREE.Vector3(0.000, -0.105, 0.185),
      rotation: new THREE.Euler(-0.10, 0.20, -0.10),
      elbow: new THREE.Vector3(0.55, -0.55, 0.35),
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
    support.scale.setScalar(0.92);
    this.kickGroup.add(support);
    this.supportArmGroup = support;
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
    this.armPlateMat.color.setHex(plate).multiplyScalar(0.52);
    this.sleeveMat.color.setHex(sleeve).multiplyScalar(0.68);
    this.gloveMat.color.setHex(glove).multiplyScalar(0.78);
    this.cuffMat.color.setHex(accent);
    this.cuffMat.emissive.setHex(accent);
    this.cuffMat.emissiveIntensity = 0.18;
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
    // Active loadout maps to slots 1 (gun) and 2 (melee).
    this.keyMap = new Map();
    this.loadout.forEach((w, i) => this.keyMap.set(`Digit${i + 1}`, i));
  }

  /** Set the active loadout to a single gun + single melee weapon. */
  setLoadout(gunId, meleeId) {
    const gun = this.allWeapons.find((w) => w.id === gunId && w.kind !== 'melee')
             || this.allWeapons.find((w) => w.kind !== 'melee');
    const melee = this.allWeapons.find((w) => w.id === meleeId && w.kind === 'melee')
               || this.allWeapons.find((w) => w.kind === 'melee');
    this.loadout = [gun, melee].filter(Boolean);
    this._mainGunId = gun?.id ?? null;   // remembered so map power-weapons can be dropped on respawn
    this._meleeId   = melee?.id ?? null;
    this.currentIndex = 0;
    this._rebuildKeyMap();
    this._setActiveModel(0);
  }

  // Add a map-collected POWER weapon as an extra slot alongside the main gun, so
  // the HUD shows [main gun, power gun, melee]. Switches to it and refills it.
  // Picking up a different power weapon replaces the power slot (you carry one).
  addMapGun(gunId) {
    const def = this.allWeapons.find((w) => w.id === gunId && w.kind !== 'melee');
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
    if (this.supportArmGroup) this.supportArmGroup.visible = cur?.kind !== 'melee';
    // Kick off the raise animation — the new gun eases up from lowered.
    this._raiseT = 0;
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
    this._mountRot.set(0, 0, 0);
    this.weaponMount?.position.copy(this._mountPos);
    this.weaponMount?.rotation.set(0, 0, 0);
    this.swayGroup?.position.set(0, 0, 0);
    this.swayGroup?.rotation.set(0, 0, 0);
    this.kickGroup?.position.set(0, 0, 0);
    this.kickGroup?.rotation.set(0, 0, 0);
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
      this.scene.remove(e.mesh);
      this.scene.remove(e.light);
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

  _spawnTracer(from, to) {
    const mesh = createTracerMesh();
    const direction = to.clone().sub(from);
    const distance = direction.length();
    if (distance <= 0.001) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      return;
    }
    direction.multiplyScalar(1 / distance);
    const speed = this.currentDef.tracerSpeed || 720;
    const trailLength = Math.min(0.7, distance);
    mesh.position.copy(from);
    mesh.scale.set(1, 1, trailLength);
    mesh.lookAt(to);
    if (this.currentDef.energyColor) mesh.material.color.setHex(this.currentDef.energyColor);
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
    });
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
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
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
        if (this.onHitBot) this.onHitBot(bot, def.damage, bot.position);
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
    const worldMeshes = world.raycastMeshes;
    const botMeshes = botManager.getRaycastTargets();
    const ray = new THREE.Raycaster();

    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      const prev = r.pos.clone();
      const stepLen = r.speed * dt;
      r.pos.addScaledVector(r.dir, stepLen);
      r.life -= dt;

      let hitPoint = null;
      ray.set(prev, r.dir);
      ray.far = stepLen + 0.15;
      const hits = ray
        .intersectObjects([...worldMeshes, ...botMeshes], true)
        .filter((h) => !h.object.userData.noHit);
      if (hits.length) hitPoint = hits[0].point;
      // Bare box colliders detonate the rocket too (nearest hit wins).
      const rBox = world.raycastBoxHit(ray.ray, ray.far);
      if (rBox && (!hitPoint || rBox.distance < hits[0].distance)) hitPoint = rBox.point;

      const outOfBounds = Math.abs(r.pos.x) > world.arenaHalf || Math.abs(r.pos.z) > world.arenaHalf;
      if (!hitPoint && (r.pos.y <= 0.05 || outOfBounds)) hitPoint = r.pos.clone();
      if (!hitPoint && r.life <= 0) hitPoint = r.pos.clone();

      if (hitPoint) {
        this._explode(hitPoint, r.def, botManager);
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

  _explode(point, def, botManager) {
    if (this.audio.playExplosion) this.audio.playExplosion();

    const fireball = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffa53a, transparent: true, opacity: 0.95 })
    );
    fireball.position.copy(point);
    this.scene.add(fireball);
    const light = new THREE.PointLight(0xff8a3a, 10, (def.splashRadius || 5) * 3.5, 2);
    light.position.copy(point);
    // (sky-only lighting) explosion light not added to scene
    this.explosions.push({ mesh: fireball, light, t: 0, life: 0.45, radius: def.splashRadius || 5 });

    const radius = def.splashRadius || 5;
    const minF = def.splashMin !== undefined ? def.splashMin : 0.25;
    for (const bot of botManager.bots) {
      if (!bot.alive) continue;
      const bc = new THREE.Vector3(bot.position.x, bot.position.y + 0.9, bot.position.z);
      const d = bc.distanceTo(point);
      if (d <= radius) {
        const f = THREE.MathUtils.lerp(1, minF, THREE.MathUtils.clamp(d / radius, 0, 1));
        if (this.onHitBot) this.onHitBot(bot, def.damage * f, point);
      }
    }
  }

  _updateExplosions(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.t += dt;
      const p = e.t / e.life;
      if (p >= 1) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.scene.remove(e.light);
        this.explosions.splice(i, 1);
        continue;
      }
      const visR = THREE.MathUtils.lerp(0.3, e.radius * 0.7, p);
      e.mesh.scale.setScalar(visR / 0.3);
      e.mesh.material.opacity = 0.95 * (1 - p);
      e.light.intensity = 10 * (1 - p);
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
    if (def.kind !== 'rocket' && def.kind !== 'melee' && def.sound !== 'shotgun') {
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
    // Keep the trigger glove framed on narrow phones without pulling it away
    // from the pistol grip on desktop aspect ratios.
    if (this.armGroup) {
      const portrait = this.camera.aspect < 1;
      const reloading = !!this.currentState?.isReloading;
      const portraitReload = portrait && reloading;
      this.armGroup.position.x = portraitReload ? -0.120 : (portrait ? 0.010 : 0.000);
      this.armGroup.position.y = reloading
        ? (portrait ? 0.160 : 0.050)
        : (portrait ? 0.050 : -0.105);
      this.armGroup.scale.set(portrait ? 0.72 : 1, 1, portrait ? 0.72 : 1);
      this.supportArmGroup?.scale.set(portrait ? 0.66 : 0.92, 0.92, portrait ? 0.66 : 0.92);
    }

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

    // Sprint blend for COD carry animation (blocks ADS)
    this._sprintT = expDamp(this._sprintT, player.isSprinting ? 1 : 0, 9, dt);

    // Every EV.IO firearm can zoom. Snipers still use the full scope overlay;
    // regular guns shoulder into a centered, lower-FOV sight picture.
    const wantScope = def.kind !== 'melee' && input.rightMouseDown && !player.isSprinting;
    this.scopeT = expDamp(this.scopeT, wantScope ? 1 : 0, def.adsSpeed || 11, dt);
    // Aiming keeps a trace of organic motion, but removes enough viewmodel
    // travel that the physical sight and fixed scope overlay do not disagree.
    const adsMotionScale = THREE.MathUtils.lerp(1, def.scoped ? 0.08 : 0.24, this.scopeT);
    const sprintFovBoost = this._sprintT * 6;
    const aimedFov = def.scoped ? 28 : (def.adsFov ?? Math.max(54, player.baseFov - 14));
    const targetFov = THREE.MathUtils.lerp(player.baseFov + sprintFovBoost, aimedFov, this.scopeT);
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    // recoil spring-back — a damped spring (position + velocity) gives a
    // punchy kick that snaps back and settles smoothly, instead of a stiff
    // frame-rate-dependent linear decay.
    const K = 190, D = 25;   // stiffness / damping (~critically damped, tiny snap)
    [this.kickPos.x, this.kickVel.x] = springTo(this.kickPos.x, this.kickVel.x, 0, K, D, dt);
    [this.kickPos.y, this.kickVel.y] = springTo(this.kickPos.y, this.kickVel.y, 0, K, D, dt);
    [this.kickPos.z, this.kickVel.z] = springTo(this.kickPos.z, this.kickVel.z, 0, K, D, dt);
    [this.kickRotX, this.kickRotXVel] = springTo(this.kickRotX, this.kickRotXVel, 0, K, D, dt);
    // weapon-switch raise: the model eases up from lowered on every swap
    this._raiseT = expDamp(this._raiseT, 1, 14, dt);
    const raiseDrop = (1 - this._raiseT) * 0.28;
    const raiseTilt = (1 - this._raiseT) * 0.9;
    this.kickGroup.position.set(this.kickPos.x, this.kickPos.y - raiseDrop, this.kickPos.z);
    // Establish the complete base pose every frame. A reload or blade arc can
    // add roll/yaw below, but those axes must never leak into the next weapon.
    this.kickGroup.rotation.set(this.kickRotX - raiseTilt, 0, 0);

    // sword swing animation — windup → fast diagonal slash → recover
    if (def.kind === 'melee' && this.swingPhase < 1) {
      this.swingPhase = Math.min(1, this.swingPhase + dt / def.fireRate);
      const ph = this.swingPhase;
      if (ph < 0.22) {
        // windup: raise blade up and back
        const w = ph / 0.22;
        this.kickGroup.rotation.y = -0.7 - w * 0.5;
        this.kickGroup.rotation.x = w * 0.55;
        this.kickGroup.rotation.z = -w * 0.4;
        this.kickGroup.position.z = w * 0.12;
      } else if (ph < 0.5) {
        // slash: snap down-across fast
        const s = (ph - 0.22) / 0.28;
        const e = s * s * (3 - 2 * s); // smoothstep
        this.kickGroup.rotation.y = -1.2 + e * 2.0;
        this.kickGroup.rotation.x = 0.55 - e * 1.1;
        this.kickGroup.rotation.z = -0.4 + e * 0.9;
        this.kickGroup.position.z = 0.12 - e * 0.3;
      } else {
        // recover back to rest
        const r = (ph - 0.5) / 0.5;
        const e = r * r * (3 - 2 * r);
        this.kickGroup.rotation.y = 0.8 - e * 1.5;
        this.kickGroup.rotation.x = -0.55 + e * 0.55;
        this.kickGroup.rotation.z = 0.5 - e * 0.5;
        this.kickGroup.position.z = -0.18 + e * 0.18;
      }
    } else if (def.kind === 'melee') {
      this.kickGroup.rotation.y = -0.7;
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
        this.kickGroup.position.x += hold * 0.075;
        // The mount below already lowers for reload. Keep this local hand beat
        // compact so the magazine hand remains visible at 60-degree FOV.
        this.kickGroup.position.y -= hold * 0.08 + seat * 0.015;
        this.kickGroup.position.z += hold * 0.055;
        this.kickGroup.rotation.x += hold * 0.30 + seat * 0.07;
        this.kickGroup.rotation.y += hold * 0.16;
        this.kickGroup.rotation.z -= hold * 0.52 + seat * 0.08;
      }
    }

    // viewmodel look-sway: smooth the raw mouse delta into a VELOCITY first
    // (normalised by dt so it's framerate-independent, no jitter), then ease
    // the sway offset toward it — two stages of damping = buttery lag.
    const invDt = dt > 1e-4 ? 1 / dt : 0;
    const mvX = THREE.MathUtils.clamp(-input.mouseDX * invDt * 0.00003, -0.06, 0.06);
    const mvY = THREE.MathUtils.clamp(-input.mouseDY * invDt * 0.00003, -0.05, 0.05);
    this._swayVelX = expDamp(this._swayVelX, mvX, 16, dt);
    this._swayVelY = expDamp(this._swayVelY, mvY, 16, dt);
    this._swayX = expDamp(this._swayX, this._swayVelX, 9, dt);
    this._swayY = expDamp(this._swayY, this._swayVelY, 9, dt);
    this.swayGroup.rotation.y = this._swayX * adsMotionScale;
    this.swayGroup.rotation.x = this._swayY * adsMotionScale;

    // COD-style weapon bob driven by a CONTINUOUS phase that accelerates with
    // move speed — no pops when starting/stopping, and framerate-independent.
    const moveSpeed = Math.hypot(player.velocity?.x || 0, player.velocity?.z || 0);
    const bobHz = player.onGround ? (2.0 + moveSpeed * 0.9) : 0;
    this._bobPhase += bobHz * dt;
    const bobAmtTarget = (player.onGround && moveSpeed > 0.5)
      ? (player.isSprinting ? 0.026 : 0.016) * adsMotionScale : 0.0;
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

    // ADS + sprint blends → SMOOTHED mount target, then eased (no snap on
    // start/stop sprint or scope in/out).
    const aspectScale  = viewmodelAspectScale(this.camera.aspect);
    const baseX        = VIEWMODEL_X * aspectScale;
    const adsShiftX    = -this.scopeT * baseX;
    // Sprint lowers the complete gun-and-hands rig. The old positive offset
    // raised it 12cm, contradicting the intended carry and forcing implausibly
    // long sleeves just to keep them connected to the bottom of the frame.
    const sprintDrop = THREE.MathUtils.lerp(
      0.04, 0.14, THREE.MathUtils.clamp((this.camera.fov - 60) / 18, 0, 1),
    );
    const sprintDropY  = -this._sprintT * sprintDrop;
    const sprintShiftX = -this._sprintT * 0.12 * aspectScale;
    // Reload (mine) and the landing pulse (Codex's) are independent offsets on
    // the same mount, so they simply sum.
    const tgtX = baseX + sprintShiftX + adsShiftX
      + (bobH + 0.05 * rBell) * aspectScale;
    const tgtY = VIEWMODEL_Y + viewmodelFovLift(this.camera.fov) + sprintDropY + bobV
      - 0.07 * rBell - 0.015 * rack - landPulse * 0.055;
    this._mountPos.x = expDamp(this._mountPos.x, tgtX, 18, dt);
    this._mountPos.y = expDamp(this._mountPos.y, tgtY, 18, dt);
    this._mountRot.x = expDamp(this._mountRot.x,
      this._sprintT * 0.22 + 0.50 * rBell + 0.14 * rack + landPulse * 0.12, 14, dt);
    this._mountRot.z = expDamp(this._mountRot.z,
      // A compact 32° cant reads as a lowered sprint carry without rotating
      // the support shoulder into the middle of the screen. The old 57° roll
      // was what made even a human-length sleeve appear to end in mid-air.
      this._sprintT * -0.55 + 0.42 * rBell, 14, dt);
    // The tested shared depth keeps the longest authored stock and its recoil
    // travel clear of the near plane without separating either glove.
    this.weaponMount.position.set(this._mountPos.x, this._mountPos.y, VIEWMODEL_Z);
    this.weaponMount.rotation.x = this._mountRot.x;
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
      const tail = Math.min(tr.distance, Math.max(0, tr.travelled - tr.trailLength));
      const head = Math.min(tr.distance, Math.max(tr.trailLength, tr.travelled));
      const visibleLength = Math.max(0.001, head - tail);
      tr.mesh.position.copy(tr.from).addScaledVector(tr.direction, tail);
      tr.mesh.scale.z = visibleLength;
      tr.fade = tr.travelled > tr.distance
        ? Math.max(0, 1 - (tr.travelled - tr.distance) / tr.trailLength)
        : 1;
      tr.mesh.material.opacity = tr.fade * 0.84;
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
    return {
      name: def.name,
      isMelee: def.kind === 'melee',
      magAmmo: st.magAmmo,
      reserveAmmo: st.reserveAmmo,
      isReloading: st.isReloading,
      reloadProgress: st.isReloading
        ? THREE.MathUtils.clamp(1 - st.reloadTimer / Math.max(0.01, def.reloadTime), 0, 1)
        : 0,
      reloadRemaining: Math.max(0, st.reloadTimer),
      reloadDuration: def.reloadTime || 0,
      aiming: this.scopeT,
      spreadRatio: spreadMax > spreadMin
        ? THREE.MathUtils.clamp((this._shotBloom - spreadMin) / spreadSpan, 0, 1)
        : 0,
      currentIndex: this.currentIndex,
      slots: this.loadout.map((w, i) => ({ key: String(i + 1), id: w.id, name: w.name, isMelee: w.kind === 'melee' }))
    };
  }
}
