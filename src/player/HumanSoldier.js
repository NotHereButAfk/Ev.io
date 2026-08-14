import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  dampHumanTimeScale,
  humanStrideWarpAngle,
  humanTravelPose,
  humanMotionTransitionSeconds,
  mapHumanMotionPhase,
  selectHumanMotion,
  targetHumanStrideScale,
  targetHumanTimeScale,
} from './HumanLocomotion.js';
import { ACTION_TIME } from './Actions.js';
import {
  createHumanActionPose,
  createHumanDeathPose,
  sampleHumanActionPose,
  sampleHumanDeathPose,
} from './HumanActionMotion.js';
import { applyHumanRifleCarry, HUMAN_LOW_READY_AIM } from './HumanRifleCarry.js';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Real rigged human soldier (Mixamo "Vanguard"), with Idle / Walk / Run clips.
// Replaces the procedural block character: this is an actual human mesh driven
// by skeletal animation rather than rotating box primitives.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let _template   = null;   // { scene, animations }
let _loading    = false;
const _callbacks = [];

function _asMapToonMaterial(source) {
  const material = new THREE.MeshToonMaterial({
    color: source.color?.clone?.() ?? new THREE.Color(0x343a40),
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    side: source.side,
  });
  material.name = source.name;
  return material;
}

export function preloadHumanSoldier(onLoad) {
  if (onLoad) _callbacks.push(onLoad);
  if (_template) { onLoad?.(); return; }
  if (_loading) return;
  _loading = true;
  new GLTFLoader().load('/soldier.glb',
    (gltf) => {
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = false; // skinned bounds expand past the bind pose
        }
      });
      _template = { scene: gltf.scene, animations: gltf.animations };
      _loading  = false;
      _callbacks.splice(0).forEach((cb) => cb());
    },
    undefined,
    (err) => { console.warn('[HumanSoldier] load failed:', err?.message); _loading = false; }
  );
}

export function isHumanSoldierReady() { return !!_template; }

// The Vanguard model is authored ~1.8 world units tall already, but the game's
// character pedestal / capsule assumes ~1.8m standing at y=0. Tune to taste.
const MODEL_SCALE = 1.0;

// The Vanguard head/hair is tall; we compress it vertically (and shrink it a
// little) so the helmet can be a compact round shape instead of a tall egg. The
// head is fully hidden under the helmet, so this only frees up the silhouette.
const HEAD_SQUASH = new THREE.Vector3(0.82, 0.6, 0.86);

// â”€â”€ Per-armor-type Spartan variants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Each loadout armor type renders a visibly distinct futuristic super-soldier:
// its own armour colour, glowing visor/accent hue, surface finish, and build
// scale. This is what makes the loadout's armor cards each preview a different
// "model" instead of the same green Chief four times.
export const ARMOR_LOOKS = {
  assault: { // matte warm-gray exosuit with restrained cyan signal light
    body: 0xaeb3b5, visor: 0x79cbd6,
    roughness: 0.78, metalness: 0.08, scale: 1.00,
  },
  recon: {   // sleek light-blue scout exo
    body: 0x2f6fae, visor: 0x36f0ff,
    roughness: 0.42, metalness: 0.48, scale: 0.97,
  },
  heavy: {   // bulky burnt-orange juggernaut plate
    body: 0x9a4a1f, visor: 0xff7a1a,
    roughness: 0.62, metalness: 0.30, scale: 1.09,
  },
  stealth: { // dark infiltrator plate with violet glow (kept light enough to read)
    body: 0x2c3042, visor: 0xb24bff,
    roughness: 0.30, metalness: 0.62, scale: 0.95,
  },
};
const DEFAULT_LOOK = ARMOR_LOOKS.assault;

function _lookFor(armorTypeId) {
  return ARMOR_LOOKS[armorTypeId] || DEFAULT_LOOK;
}

// Resolve a Mixamo bone by short name across the naming variants GLTF/THREE can
// produce: "mixamorig:Head" (raw), "mixamorigHead" (colon sanitized away), or a
// bare "Head". Returns null if none match.
function findBone(root, name) {
  return root.getObjectByName('mixamorig:' + name)
      || root.getObjectByName('mixamorig' + name)
      || root.getObjectByName(name)
      || null;
}

/**
 * Build an independent, animated human-soldier instance.
 * Returns a THREE.Group whose userData carries { mixer, actions, setMotion, isHuman }.
 * Call `group.userData.mixer.update(dt)` every frame and
 * `group.userData.setMotion('idle'|'walk'|'run')` to switch clips.
 * `armorTypeId` selects one of the ARMOR_LOOKS variants so each loadout armor
 * type previews as a distinct super-soldier.
 */
export function buildHumanSoldier(skin = null, armorTypeId = 'assault', armorSkin = null) {
  if (!_template) return null;

  const look = _lookFor(armorTypeId);
  const root = cloneSkeleton(_template.scene);
  root.scale.setScalar(MODEL_SCALE * look.scale);

  // Give this instance its own materials, and split body vs visor so we can
  // paint each armour variant: coloured plate + glowing visor.
  const bodyMats = [];
  const visorMats = [];
  root.traverse((o) => {
    if (o.isMesh && o.material) {
      const source = o.material;
      const n = (source.name || '') + ' ' + (o.name || '');
      o.material = _asMapToonMaterial(source);
      if (/visor/i.test(n)) visorMats.push(o.material);
      else                  bodyMats.push(o.material);
    }
  });
  _applyArmorLook(bodyMats, visorMats, look);

  const group = new THREE.Group();
  group.add(root);

  // Squash the head down. The Vanguard's tall hair/scalp forces any helmet that
  // covers it into an egg silhouette; since the head is fully hidden under the
  // helmet, we vertically compress (and slightly shrink) the head bone so a
  // compact, ROUND helmet can cover it. The armour pieces are pinned in world
  // space by _attachAtWorld, so they are unaffected by this bone scale â€” only the
  // hidden head mesh shrinks. HEAD_SQUASH is re-asserted each frame in armorTick.
  const _headBone = findBone(root, 'Head');
  if (_headBone) _headBone.scale.copy(HEAD_SQUASH);

  // Bolt on this loadout's distinct armour set (bone-parented so plates ride the
  // skeleton during the animation). Each armor type gets its own silhouette.
  group.updateMatrixWorld(true);
  const armor = _buildArmorPieces(root, armorTypeId, look, armorSkin);

  // Measure the standing figure now, while its matrices resolve cleanly, and
  // stash the result. Re-measuring a posed SkinnedMesh elsewhere (e.g. the
  // loadout turntable) can collapse to a degenerate box, so consumers that
  // need to frame the model should read these instead of re-running setFromObject.
  group.updateMatrixWorld(true);
  const _box = new THREE.Box3().setFromObject(group);
  const _size = _box.getSize(new THREE.Vector3());
  const _ctr  = _box.getCenter(new THREE.Vector3());

  // â”€â”€ Animation: 3 clips (idle/walk/run) + rich procedural motion layers â”€â”€
  const mixer   = new THREE.AnimationMixer(root);
  const byName  = {};
  for (const source of _template.animations) {
    const clip = source.clone();
    byName[clip.name] = clip;
  }

  const actions = {
    idle: byName.Idle ? mixer.clipAction(byName.Idle) : null,
    walk: byName.Walk ? mixer.clipAction(byName.Walk) : null,
    run:  byName.Run  ? mixer.clipAction(byName.Run)  : null,
  };
  for (const a of Object.values(actions)) {
    if (a) { a.enabled = true; a.setEffectiveWeight(1); a.play(); a.setEffectiveWeight(0); }
  }

  let current = null;
  // Phase-matched crossfades preserve which foot is planted. Resetting every
  // new clip to frame zero made both feet pop whenever walk/run switched, while
  // Three's warp option briefly sped one clip up and slowed the other down.
  const _fadeKey = (from, to) => {
    if (!from || !to) return 0.2;
    const f = from === actions.idle ? 'idle' : from === actions.walk ? 'walk' : 'run';
    const t = to   === actions.idle ? 'idle' : to   === actions.walk ? 'walk' : 'run';
    return humanMotionTransitionSeconds(f, t);
  };
  const setMotion = (name, fadeOverride) => {
    const next = actions[name] || actions.idle;
    if (!next || next === current) return;
    const fromName = current === actions.walk ? 'walk'
      : current === actions.run ? 'run' : 'idle';
    const toName = next === actions.walk ? 'walk'
      : next === actions.run ? 'run' : 'idle';
    const rawPhase = current
      ? (current.time / Math.max(1e-5, current.getClip().duration)) % 1 : 0;
    const phase = mapHumanMotionPhase(rawPhase, fromName, toName);
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.reset().play();
    if (phase > 0) next.time = phase * next.getClip().duration;
    if (current) {
      const fade = Number.isFinite(fadeOverride) ? fadeOverride : _fadeKey(current, next);
      current.crossFadeTo(next, fade, false);
    }
    current = next;
  };
  setMotion('idle');

  // â”€â”€ Per-armor motion: animation speed + additive stance + animated armour â”€â”€
  const motion = ARMOR_MOTION[armorTypeId] || ARMOR_MOTION.assault;
  const baseTS = motion.speed;
  mixer.timeScale = baseTS;

  // â”€â”€ Bone lookup (Mixamo rig) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Cached once so armorTick doesn't traverse the skeleton every frame. Any
  // bone that's missing degrades gracefully (procedural offsets just skip it).
  // GLTF/THREE sanitizes node names, so "mixamorig:Head" can arrive as
  // "mixamorigHead" (or bare "Head") â€” resolve all forms.
  const B = {
    hips:  findBone(root, 'Hips'),
    spine: findBone(root, 'Spine'),
    s1:    findBone(root, 'Spine1'),
    s2:    findBone(root, 'Spine2'),
    neck:  findBone(root, 'Neck'),
    head:  findBone(root, 'Head'),
    lArm:  findBone(root, 'LeftArm'),
    rArm:  findBone(root, 'RightArm'),
    lFore: findBone(root, 'LeftForeArm'),
    rFore: findBone(root, 'RightForeArm'),
    lHand: findBone(root, 'LeftHand'),
    rHand: findBone(root, 'RightHand'),
    lLeg:  findBone(root, 'LeftUpLeg'),
    rLeg:  findBone(root, 'RightUpLeg'),
    lCalf: findBone(root, 'LeftLeg'),
    rCalf: findBone(root, 'RightLeg'),
  };

  // â”€â”€ Weapon-hold references â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Bake the idle clip's first frame into the bones once, and snapshot the arm
  // rotations. Holding poses are defined as offsets from this natural
  // arms-at-side stance (rather than the GLB's T-pose bind), so the same
  // offsets read correctly no matter which clip is playing underneath.
  mixer.update(0);
  const _armRef = {
    lArm:  B.lArm  ? B.lArm.quaternion.clone()  : null,
    rArm:  B.rArm  ? B.rArm.quaternion.clone()  : null,
    lFore: B.lFore ? B.lFore.quaternion.clone() : null,
    rFore: B.rFore ? B.rFore.quaternion.clone() : null,
  };
  const _E = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  // Two-handed rifle carry: weapon arm folds across the chest, support arm
  // reaches over toward the forend. Sword: blade arm bends to a low guard,
  // off-hand swings free for balance.
  // Axis map (probed on the Vanguard rig, right side; left mirrors Z):
  //   arm  X+ = flex forward/up/in    arm  Z+ = pull across the chest
  //   fore X+ = elbow flex up         fore Z+ = pull the hand inward
  const HOLD_POSES = {
    gun: {   // two-handed low-ready: trigger hand at the chest, SUPPORT hand reaches
             // forward onto the handguard. Upper arms hang low; the forearms flex
             // up so both hands meet the weapon in front of the chest.
      rArm:  _E(0.32, 0, 0.22),  rFore: _E(0.52, 0, 0.44),
      lArm:  _E(0.54, 0, -0.30), lFore: _E(0.74, 0, -0.44),
      w: { idle: 0.90, walk: 0.85, run: 0.70, air: 0.92 },
    },
    melee: { // relaxed low guard: blade arm bent forward at the side, off-hand free
      rArm:  _E(0.35, 0, 0.18),  rFore: _E(0.30, 0, 0.25),
      lArm:  null, lFore: null,  // free arm counter-swings for balance
      w: { idle: 0.70, walk: 0.58, run: 0.42, air: 0.80 },
    },
  };
  const _qHold = new THREE.Quaternion();
  // Blend a clip-posed bone toward ref*offset â€” damps the walk/run arm swing
  // into a believable carry without freezing it solid.
  const _holdBone = (bone, ref, off, w) => {
    if (!bone || !ref || !off || w <= 0) return;
    _qHold.copy(ref).multiply(off);
    bone.quaternion.slerp(_qHold, w);
  };
  let _weaponKind = null;   // null | 'gun' | 'melee'
  let _holdRunT   = 0;      // smoothed 0..1 run blend for the sprint tuck

  // Locomotion driver: choose the clip (with hysteresis to stop flicker) and
  // scale playback to the real movement speed so the feet track the ground and
  // don't slide. Extra state (accel, air time, strafe) feeds the procedural
  // layer for lean, launch/land bounce, etc.
  const _clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  let _locName    = 'idle';
  let _reportedSpeed = 0;
  let _targetTimeScale = baseTS;
  let _currentTimeScale = baseTS;
  let _targetStrideScale = 1;
  let _strideScale = 1;
  let _lastSpeed  = 0;
  let _accel      = 0;                     // smoothed dSpeed/dt for lean
  let _grounded   = true;
  let _airT       = 0;                     // seconds off the ground
  let _landT      = 0;                     // seconds since landing (landing squish)
  let _strafeLean = 0;                     // â€“1 (right) .. +1 (left)
  let _targetStrafeLean = 0;
  let _targetLowerYaw = 0;                 // legs follow travel while torso keeps aim
  let _lowerYaw = 0;
  let _reverseGait = false;
  let _forwardLean = 0;                    // 0..1 momentum lean forward
  let _fireRecoil = 0;                     // recoil kick amplitude, decays
  let _flinch     = { x: 0, y: 0, t: 0 };  // damage flinch, decays
  let _aimYaw     = 0;                     // desired upper-body yaw offset
  let _aimPitch   = 0;                     // desired head pitch offset
  let _sAimYaw    = 0; ×žõîÚ$z{-®éÜj×#‚Â£¢ÓãRÒÀÐ¢²&öæS¢u7–æSrÂvVó¢&÷‚ƒã3BÂã‚ÂãB’ÂÖC¢ÆFRÂƒ¢Â“¢ãBÂ£¢ÓãRÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢&÷‚ƒãrÂã#BÂãB’ÂÖC¢66VçBÂƒ¢Â“¢ã#‚Â£¢Óã‚ÀÐ¢æ–Ó¢²G—S¢wVÇ6RrÂg&W¢"ãBÂÖ–ã¢ãRÂÖƒ¢"ãÒÒÂòò6†W7B&V7F÷"7G&— Ð¢²&öæS¢tÆVgE6†÷VÆFW"rÂvVó¢7‚ƒã3R’ÂÖC¢ÆFRÂƒ¢Óã#RÂ“¢ãCbÂ£¢ã"ÒÀÐ¢²&öæS¢u&–v‡E6†÷VÆFW"rÂvVó¢7‚ƒã3R’ÂÖC¢ÆFRÂƒ¢ã#RÂ“¢ãCbÂ£¢ã"ÒÀÐ¢²&öæS¢tÆVgE6†÷VÆFW"rÂvVó¢&÷‚ƒãÂãRÂã’ÂÖC¢66VçBÂƒ¢Óã#RÂ“¢ãSRÂ£¢ã"ÀÐ¢æ–Ó¢²G—S¢wF‡'W7FW"rÂg&W¢"ã"ÂÖ–ã¢ãbÂÖƒ¢"ãbÒÒÂòò6†÷VÆFW"fVçG0Ð¢²&öæS¢u&–v‡E6†÷VÆFW"rÂvVó¢&÷‚ƒãÂãRÂã’ÂÖC¢66VçBÂƒ¢ã#RÂ“¢ãSRÂ£¢ã"ÀÐ¢æ–Ó¢²G—S¢wF‡'W7FW"rÂg&W¢"ã"ÂÖ–ã¢ãbÂÖƒ¢"ãbÂ†6S¢ãÒÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢&÷‚ƒã3"Âã3BÂã#’ÂÖC¢F&²Âƒ¢Â“¢ã#rÂ£¢ãbÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢&÷‚ƒãrÂã#‚Âãb’ÂÖC¢66VçBÂƒ¢Â“¢ã#rÂ£¢ã#rÀÐ¢æ–Ó¢²G—S¢wVÇ6RrÂg&W¢ãbÂÖ–ã¢ãRÂÖƒ¢"ãBÒÒÂòò÷vW"6÷&PÐ¢²&öæS¢tæV6²rÂvVó¢&÷‚ƒã3ÂãÂã#R’ÂÖC¢ÆFRÂƒ¢Â“¢ãC"Â£¢ã2ÒÀÐ¢²&öæS¢tÆVgEWÆVrrÂvVó¢&÷‚ƒãRÂã#BÂãr’ÂÖC¢ÆFRÂƒ¢ÓãRÂ“¢ã“"Â£¢Óã"ÒÀÐ¢²&öæS¢u&–v‡EWÆVrrÂvVó¢&÷‚ƒãRÂã#BÂãr’ÂÖC¢ÆFRÂƒ¢ãRÂ“¢ã“"Â£¢Óã"ÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢7–ÂƒãCRÂã"’ÂÖC¢66VçBÂƒ¢ÓãÂ“¢ãRÂ£¢ã#’ÀÐ¢æ–Ó¢²G—S¢wF‡'W7FW"rÂg&W¢2ÂÖ–ã¢ãBÂÖƒ¢"ã"ÒÒÂòòW††W7Bæ÷§¦ÆW0Ð¢²&öæS¢u7–æS"rÂvVó¢7–ÂƒãCRÂã"’ÂÖC¢66VçBÂƒ¢ãÂ“¢ãRÂ£¢ã#’ÀÐ¢æ–Ó¢²G—S¢wF‡'W7FW"rÂg&W¢2ÂÖ–ã¢ãBÂÖƒ¢"ã"Â†6S¢ãbÒÒÀÐ¢Ó°Ð¢ÒVÇ6R–b†&Ö÷%G—T–BÓÓÒw7FVÇF‚r’°Ð¢7V72Ò°Ð¢²&öæS¢u7–æS"rÂvVó¢&÷‚ƒã#bÂã3"Âãb’ÂÖC¢ÆFRÂƒ¢Â“¢ã#‚Â£¢ÓãsÒÀÐ¢²&öæS¢tÆVgE6†÷VÆFW"rÂvVó¢ö7BƒãƒR’ÂÖC¢F&²Âƒ¢ÓãƒRÂ“¢ãCRÂ£¢ã"ÒÀÐ¢²&öæS¢u&–v‡E6†÷VÆFW"rÂvVó¢ö7BƒãƒR’ÂÖC¢F&²Âƒ¢ãƒRÂ“¢ãCRÂ£¢ã"ÒÀÐ¢²&öæS¢t†VBrÂvVó¢&÷‚ƒãƒRÂãRÂãB’ÂÖC¢F&²Âƒ¢Â“¢ãScRÂ£¢ãRÂVC¢F–ÇD&6²ÒÂòò†öö@Ð¢²&öæS¢t†VBrÂvVó¢&÷‚ƒãRÂã2Âã"’ÂÖC¢66VçBÂƒ¢Â“¢ãSÂ£¢ãRÀÐ¢æ–Ó¢²G—S¢wVÇ6RrÂg&W¢ãRÂÖ–ã¢ã"ÂÖƒ¢ãrÒÒÂòò†ööB&–ÒvÆ÷pÐ¢²&öæS¢u7–æS"rÂvVó¢&÷‚ƒãRÂãC"Âã’ÂÖC¢F&²Âƒ¢ãrÂ“¢ã#rÂ£¢ã2ÀÐ¢æ–Ó¢²G—S¢w7v’rÂ†—3¢w‚rÂ×¢ãbÂg&W¢ãbÒÒÂòò&6²6†VF€Ð¢²&öæS¢u7–æS"rÂvVó¢&÷‚ƒã2Âã#‚Âã2’ÂÖC¢66VçBÂƒ¢Â“¢ã#‚Â£¢Óã“RÀÐ¢æ–Ó¢²G—S¢wVÇ6RrÂg&W¢"ãÂÖ–ã¢ãRÂÖƒ¢ã“RÒÒÂòò6†W7BÆ–v‡B7G&— Ð¢²&öæS¢u7–æS"rÂvVó¢&÷‚ƒã3"ÂãSRÂã"’ÂÖC¢6RÂƒ¢Â“¢ã"Â£¢ã#RÀÐ¢æ–Ó¢²G—S¢w7v’rÂ†—3¢w‚rÂ×¢ãÂg&W¢ã#RÒÒÂòòfÆ÷v–ær6PÐ¢Ó°Ð¢ÒVÇ6R°Ð¢7V72Ò°Ð¢òòÆ–W&VB6†W7B7V—&72…7–æS"ãã3B“¢Ö–â'&V7GÆFRÂâWW"Ö6†W7@Ð¢òò6öÆÆ"FV6²ÂæBöÆ—6†VB7FW&çVÒ&–FvRv—F‚F†RvÆ÷v–ærVÖ—GFW"6WB–âàÐ¢òò'&öBF&²6'&–W"ÇW26W&FRæwVÆ"ÆFW3¢F†—2v—fW2F†RF÷'6ðÐ¢òòF†RÆ–W&VBUb×7G–ÆRW†÷7V—B&VBv—F†÷WB6÷––ær&÷&–WF'’ÖW6‚àÐ¢²&öæS¢u7–æS"rÂvVó¢FW"ƒã3rÂã#’Âã3BÂã2ÂãR’ÂÖC¢F&²Âƒ¢Â“¢ã#‚Â£¢Óã3RÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢FW"ƒãSRÂã#RÂãbÂãƒRÂã“RÂÓã’ÂÖC¢ÆFRÂƒ¢ÓãƒRÂ“¢ã3cRÂ£¢Óã##RÂVC¢6†W7DÆVgBÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢FW"ƒãSRÂã#RÂãbÂãƒRÂã“RÂã’ÂÖC¢ÆFRÂƒ¢ãƒRÂ“¢ã3cRÂ£¢Óã##RÂVC¢6†W7E&–v‡BÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢FW"ƒãÂãsRÂã#3RÂãrÂã‚’ÂÖC¢ÆFRÂƒ¢Â“¢ã#CRÂ£¢Óã##RÒÀÐ¢²&öæS¢u7–æSrÂvVó¢FW"ƒã‚Âã#"ÂãƒRÂãsRÂã’’ÂÖC¢ÆFRÂƒ¢Â“¢ãRÂ£¢Óã’ÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢&÷‚ƒã3"ÂãSRÂã#"’ÂÖC¢66VçBÂƒ¢Â“¢ã#ƒRÂ£¢Óã#‚ÀÐ¢æ–Ó¢²G—S¢wVÇ6RrÂg&W¢2ã"ÂÖ–ã¢ãRÂÖƒ¢ãrÒÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢7–Âƒã3BÂã#b’ÂÖC¢G&–ÒÂƒ¢ÓãÂ“¢ã3BÂ£¢ÓãBÂVC¢f6TF—62ÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢7–Âƒã3BÂã#b’ÂÖC¢G&–ÒÂƒ¢ãÂ“¢ã3BÂ£¢ÓãBÂVC¢f6TF—62ÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢&÷‚ƒãrÂã#"Âã#b’ÂÖC¢G&–ÒÂƒ¢Â“¢ãC#RÂ£¢Óã#RÒÀÐ¢òòÆ–W&VBVÆG&öç2‡6†÷VÆFW"&öæRããC#’“¢&÷VæFVB6ÂöÆ—6†VBG&–ÐÐ¢òòÆ—ÂæB7FGW2&V6öâöâF†R÷WFW"f6RàÐ¢²&öæS¢tÆVgE6†÷VÆFW"rÂvVó¢FW"ƒã’ÂãBÂã#RÂã‚ÂãBÂÓãB’ÂÖC¢ÆFRÂƒ¢Óã’Â“¢ãC2Â£¢ãÒÀÐ¢²&öæS¢u&–v‡E6†÷VÆFW"rÂvVó¢FW"ƒã’ÂãBÂã#RÂã‚ÂãBÂãB’ÂÖC¢ÆFRÂƒ¢ã’Â“¢ãC2Â£¢ãÒÀÐ¢²&öæS¢tÆVgE6†÷VÆFW"rÂvVó¢&÷‚ƒãRÂã#BÂãR’ÂÖC¢G&–ÒÂƒ¢Óã’Â“¢ãC’Â£¢ãÒÀÐ¢²&öæS¢u&–v‡E6†÷VÆFW"rÂvVó¢&÷‚ƒãRÂã#BÂãR’ÂÖC¢G&–ÒÂƒ¢ã’Â“¢ãC’Â£¢ãÒÀÐ¢²&öæS¢tÆVgE6†÷VÆFW"rÂvVó¢FW"ƒãCRÂãRÂã’ÂãsRÂãb’ÂÖC¢ÆFRÂƒ¢Óã’Â“¢ãC2Â£¢ãRÒÀÐ¢²&öæS¢u&–v‡E6†÷VÆFW"rÂvVó¢FW"ƒãCRÂãRÂã’ÂãsRÂãb’ÂÖC¢ÆFRÂƒ¢ã’Â“¢ãC2Â£¢ãRÒÀÐ¢²&öæS¢tÆVgE6†÷VÆFW"rÂvVó¢&÷‚ƒã3RÂã3RÂã3R’ÂÖC¢66VçBÂƒ¢Óã##RÂ“¢ãC‚Â£¢Óã"ÀÐ¢æ–Ó¢²G—S¢v&Æ–æ²rÂg&W¢BÂöã¢ã’Âöfc¢ã"ÒÒÂòò6†÷VÆFW"&V6öç2†ÇFW&æF–ærÐ¢²&öæS¢u&–v‡E6†÷VÆFW"rÂvVó¢&÷‚ƒã3RÂã3RÂã3R’ÂÖC¢66VçBÂƒ¢ã##RÂ“¢ãC‚Â£¢Óã"ÀÐ¢æ–Ó¢²G—S¢v&Æ–æ²rÂg&W¢BÂöã¢ã’Âöfc¢ã"Â†6S¢ÖF‚å’ÒÒÀÐ¢²&öæS¢u7–æRrÂvVó¢&÷‚ƒã32Âã’Âã#2’ÂÖC¢F&²Âƒ¢Â“¢ãBÂ£¢ÓãÒÂòò&VÇB…7–æRããsRÐ¢²&öæS¢u7–æRrÂvVó¢&÷‚ƒã3RÂã2Âã#R’ÂÖC¢G&–ÒÂƒ¢Â“¢ãƒRÂ£¢ÓãÒÂòò&VÇBG&–ÒÆ— Ð¢²&öæS¢u7–æRrÂvVó¢&÷‚ƒãƒRÂãÂã’ÂÖC¢ÆFRÂƒ¢Óã3RÂ“¢ãÂ£¢Óã#RÒÀÐ¢²&öæS¢u7–æRrÂvVó¢&÷‚ƒãƒRÂãÂã’ÂÖC¢ÆFRÂƒ¢ã3RÂ“¢ãÂ£¢Óã#RÒÀÐ¢òò7Æ—B†—wV&G2v–FVâF†R6–Æ†÷VWGFRv—F†÷WBf–ÆÆ–ærF†RfÆW†–&ÆPÐ¢òòw&ö–âö†—¦ö–çG3²V6‚&–FW2—G2÷vâF†–v‚F‡&÷Vv‚7&÷V6†W2æB§V×2àÐ¢²&öæS¢tÆVgEWÆVrrÂvVó¢FW"ƒãRÂãsRÂã#"ÂãƒRÂãcRÂÓã‚’ÂÖC¢ÆFRÂƒ¢Óã‚Â“¢ã“BÂ£¢ãÒÀÐ¢²&öæS¢u&–v‡EWÆVrrÂvVó¢FW"ƒãRÂãsRÂã#"ÂãƒRÂãcRÂã‚’ÂÖC¢ÆFRÂƒ¢ã‚Â“¢ã“BÂ£¢ãÒÀÐ Ð¢òò6VvÖVçFVBÆ–Ö"&Ö÷W"¶VW2F†R&Æ6²fÆW‚¦ö–çG2f—6–&ÆRv†–ÆRv—f–æpÐ¢òòF†Rf÷&V&×2ÂF†–v‡2Â¶æVW2Â6†–ç2ÂæB&ö÷G2F†R6ÖRWF†÷&VB&‡—F†ÒàÐ¢²&öæS¢tÆVgD&ÒrÂvVó¢&÷‚ƒã3RÂãRÂãR’ÂÖC¢ÆFRÂƒ¢Óã#cRÂ“¢ãCCRÂ£¢ãÒÀÐ¢²&öæS¢u&–v‡D&ÒrÂvVó¢&÷‚ƒã3RÂãRÂãR’ÂÖC¢ÆFRÂƒ¢ã#cRÂ“¢ãCCRÂ£¢ãÒÀÐ¢²&öæS¢tÆVgD&ÒrÂvVó¢&÷‚ƒãbÂã#RÂã#"’ÂÖC¢66VçBÂƒ¢Óã#cRÂ“¢ãCCRÂ£¢ÓãcBÒÀÐ¢²&öæS¢u&–v‡D&ÒrÂvVó¢&÷‚ƒãbÂã#RÂã#"’ÂÖC¢66VçBÂƒ¢ã#cRÂ“¢ãCCRÂ£¢ÓãcBÒÀÐ¢²&öæS¢tÆVgEWÆVrrÂvVó¢FW"ƒãBÂãRÂã#ƒRÂãRÂã’’ÂÖC¢ÆFRÂƒ¢ÓãRÂ“¢ãƒ"Â£¢Óã2ÒÀÐ¢²&öæS¢u&–v‡EWÆVrrÂvVó¢FW"ƒãBÂãRÂã#ƒRÂãRÂã’’ÂÖC¢ÆFRÂƒ¢ãRÂ“¢ãƒ"Â£¢Óã2ÒÀÐ¢²&öæS¢tÆVgEWÆVrrÂvVó¢FW"ƒãÂãƒRÂã#BÂãrÂãb’ÂÖC¢ÆFRÂƒ¢ÓãRÂ“¢ãƒÂ£¢ã2ÒÀÐ¢²&öæS¢u&–v‡EWÆVrrÂvVó¢FW"ƒãÂãƒRÂã#BÂãrÂãb’ÂÖC¢ÆFRÂƒ¢ãRÂ“¢ãƒÂ£¢ã2ÒÀÐ¢²&öæS¢tÆVgEWÆVrrÂvVó¢&÷‚ƒã3RÂã#Âã#"’ÂÖC¢66VçBÂƒ¢ÓãRÂ“¢ãƒ2Â£¢Óã‚ÒÀÐ¢²&öæS¢u&–v‡EWÆVrrÂvVó¢&÷‚ƒã3RÂã#Âã#"’ÂÖC¢66VçBÂƒ¢ãRÂ“¢ãƒ2Â£¢Óã‚ÒÀÐ¢²&öæS¢tÆVgDÆVrrÂvVó¢&÷‚ƒãBÂãRÂãR’ÂÖC¢G&–ÒÂƒ¢ÓãÂ“¢ãSbÂ£¢ÓãSRÒÀÐ¢²&öæS¢u&–v‡DÆVrrÂvVó¢&÷‚ƒãBÂãRÂãR’ÂÖC¢G&–ÒÂƒ¢ãÂ“¢ãSbÂ£¢ÓãSRÒÀÐ¢²&öæS¢tÆVgDÆVrrÂvVó¢FW"ƒã2Âã“RÂã3ÂãÂãƒR’ÂÖC¢ÆFRÂƒ¢ÓãÂ“¢ã3RÂ£¢Óã#RÒÀÐ¢²&öæS¢u&–v‡DÆVrrÂvVó¢FW"ƒã2Âã“RÂã3ÂãÂãƒR’ÂÖC¢ÆFRÂƒ¢ãÂ“¢ã3RÂ£¢Óã#RÒÀÐ¢²&öæS¢tÆVgDÆVrrÂvVó¢FW"ƒãÂãsRÂã#RÂãcRÂãSR’ÂÖC¢ÆFRÂƒ¢ÓãÂ“¢ã3BÂ£¢ãRÒÀÐ¢²&öæS¢u&–v‡DÆVrrÂvVó¢FW"ƒãÂãsRÂã#RÂãcRÂãSR’ÂÖC¢ÆFRÂƒ¢ãÂ“¢ã3BÂ£¢ãRÒÀÐ¢²&öæS¢tÆVgDÆVrrÂvVó¢&÷‚ƒã3"Âã#CRÂã#"’ÂÖC¢66VçBÂƒ¢ÓãÂ“¢ã3RÂ£¢Óã‚ÒÀÐ¢²&öæS¢u&–v‡DÆVrrÂvVó¢&÷‚ƒã3"Âã#CRÂã#"’ÂÖC¢66VçBÂƒ¢ãÂ“¢ã3RÂ£¢Óã‚ÒÀÐ¢²&öæS¢tÆVgDfö÷BrÂvVó¢&÷‚ƒãRÂãRÂã#2’ÂÖC¢F&²Âƒ¢ÓãÂ“¢ã’Â£¢Óã2ÒÀÐ¢²&öæS¢u&–v‡Dfö÷BrÂvVó¢&÷‚ƒãRÂãRÂã#2’ÂÖC¢F&²Âƒ¢ãÂ“¢ã’Â£¢Óã2ÒÀÐ¢²&öæS¢tÆVgDfö÷BrÂvVó¢&÷‚ƒãRÂã3RÂãr’ÂÖC¢ÆFRÂƒ¢ÓãÂ“¢ãCRÂ£¢ÓãSRÒÀÐ¢²&öæS¢u&–v‡Dfö÷BrÂvVó¢&÷‚ƒãRÂã3RÂãr’ÂÖC¢ÆFRÂƒ¢ãÂ“¢ãCRÂ£¢ÓãSRÒÀÐ¢òò6ö×7BÂÆ–W&VB÷vW"6³¢F†Rv—7BæB&×2&VÖ–â&VF&ÆRg&öÐÐ¢òò&V†–æBÂæBF†R6VÆV7FVBÆFR6öÆ÷W"æ÷r6'&–W2–çFòF†R&V"f–WràÐ¢²&öæS¢u7–æS"rÂvVó¢&÷‚ƒã#BÂã#’Âã’’ÂÖC¢F&²Âƒ¢Â“¢ã#‚Â£¢ã#SRÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢FW"ƒãRÂã‚Âã#SRÂãSRÂãCRÂÓã‚’ÂÖC¢ÆFRÂƒ¢Óãƒ"Â“¢ã#’Â£¢ã3#RÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢FW"ƒãRÂã‚Âã#SRÂãSRÂãCRÂã‚’ÂÖC¢ÆFRÂƒ¢ãƒ"Â“¢ã#’Â£¢ã3#RÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢&÷‚ƒãC"Âã#RÂã#B’ÂÖC¢F&²Âƒ¢Â“¢ã#‚Â£¢ã3bÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢&÷‚ƒãRÂã#RÂã#R’ÂÖC¢G&–ÒÂƒ¢Â“¢ã33RÂ£¢ã3bÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢&÷‚ƒãBÂã#RÂã‚’ÂÖC¢66VçBÂƒ¢ÓãBÂ“¢ã3‚Â£¢ã3sRÀÐ¢æ–Ó¢²G—S¢wVÇ6RrÂg&W¢ãBÂÖ–ã¢ã2ÂÖƒ¢ã"ÒÒÀÐ¢²&öæS¢u7–æS"rÂvVó¢&÷‚ƒãBÂã#RÂã‚’ÂÖC¢66VçBÂƒ¢ãBÂ“¢ã3‚Â£¢ã3sRÀÐ¢æ–Ó¢²G—S¢wVÇ6RrÂg&W¢ãBÂÖ–ã¢ã2ÂÖƒ¢ã"Â†6S¢ÖF‚å’¢ãRÒÒÀÐ¢Ó°Ð¢ÐÐ Ð¢7V72Ò²ââæ†VÆÖWBÂââç7V75Ó°Ð Ð¢6öç7Bæ–ÖFVBÒµÓ°Ð¢6öç7B&Ö÷$ÖFW&–Ç2ÒæWr6WB…·ÆFRÂF&²ÂG&–ÒÂ66VçBÂ6RÂ†VÆÖWDÖBÂf—6÷$ÖEÒ“°Ð¢f÷"†6öç7B7öb7V72’°Ð¢6öç7B"Ò&öæR‡7æ&öæR“°Ð¢–b‚"’6öçF–çVS°Ð¢6öç7BÖBÒ7ææ–Òò7æÖBæ6ÆöæR‚’¢7æÖC²òò–æFWVæFVçBæ–ÖF–öâW"–V6PÐ¢&Ö÷$ÖFW&–Ç2æFB†ÖB“°Ð¢6öç7BÖW6‚ÒæWrD…$TRäÖW6‚‡7ævVòÂÖB“°Ð¢öGF6„Ev÷&ÆB†"ÂÖW6‚Â7ç‚¢2Â7ç’¢2Â7ç¢¢2Â2Â7çVB“°Ð¢–b‡7ææ–Ò’°Ð¢æ–ÖFVBçW6‚‡²ÖW6‚ÂÖBÂæ–Ó¢7ææ–ÒÂ&6UVC¢ÖW6‚çVFW&æ–öâæ6ÆöæR‚’Ò“°Ð¢ÐÐ¢ÐÐ Ð¢òò)H)Hf÷&V&ÒvVçFÆWG2²†æBÆFW2†&öæRÔÄô4ÂGF6‚’)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H Ð¢òòF†Rv÷&ÆB×76R7V27—7FVÒ&÷fR77VÖW2F†R&–æB÷6RÂ'WBF†R&×2&PÐ¢òò÷6VBvVÆÂv’g&öÒ&–æB(	B6ò&Ò&Ö÷W"—2GF6†VBF—&V7FÇ’–âV6€Ð¢òò&öæRw2Äô4Â76RÂv†W&RF†RÆ–Ö"†—2—27F&ÆRµ’†f÷&V&Þ(i&†æBöfg6W@Ð¢òò—2³Â¶ÆVâÂÒ’âF†RÆFW2F†Vâ&–FRF†Rf÷&V&Òö†æB–âå’÷6RâF†—0Ð¢òò¶—G2÷WBF†R&Wf–÷W6Ç’Ö&&R&×26òF†W’&VB2&Ö÷W&VBÂæ÷B&6R7V—BàÐ¢6öç7Bö&ÕÆFRÒ†f÷&TæÖRÂ†æDæÖR’Óâ°Ð¢6öç7Bf÷&RÒ&öæR†f÷&TæÖR’Â†æBÒ&öæR††æDæÖR“°Ð¢–b‚f÷&RÇÂ†æB’&WGW&ã°Ð¢6öç7BÂÒ†æBç÷6—F–öâæÆVæwF‚‚’ÇÂ#C²òòf÷&V&ÒÆVæwF‚†&öæRÖÆö6ÂVæ—G2Ð¢6öç7BFEFòÒ‡&VçBÂvVòÂÖBÂ’Â¢Ò’Óâ°Ð¢6öç7BÒÒæWrD…$TRäÖW6‚†vVòÂÖB“°Ð¢Òç÷6—F–öâç6WBƒÂ’Â¢“°Ð¢Òæg'W7GVÔ7VÆÆVBÒfÇ6S²Òæ67E6†F÷rÒG'VS²Òç&V6V—fU6†F÷rÒG'VS°Ð¢&VçBæFB†Ò“°Ð¢Ó°Ð¢òòw&–ærvVçFÆWB÷fW"F†RÆ÷vW"Gvò×F†—&G2öbF†Rf÷&V&ÒàÐ¢FEFò†f÷&RÂ&÷‚„Â¢ã3"ÂÂ¢ãcBÂÂ¢ã3"’ÂÆFRÂÂ¢ãSR“°Ð¢òòF&²w&—7B7Vfbv†W&RF†RvVçFÆWBÖVWG2F†R†æB‡7V'FÆRw&ö÷fRÂæ÷BÐ¢òò'&–v‡B&æB(	B¶VWF†R6–Æ†÷VWGFRF&²’àÐ¢FEFò†f÷&RÂ&÷‚„Â¢ãCÂÂ¢ãÂÂ¢ãC’ÂF&²ÂÂ¢ã““°Ð¢òòF†–âF†VÖVB66VçB6Æ—fW"öâF†R÷WFW"f÷&V&Ò†ÖF6†W2F†Rf—6÷"vÆ÷r’àÐ¢FEFò†f÷&RÂ&÷‚„Â¢ãÂÂ¢ã3BÂÂ¢ã3CR’Â66VçBÂÂ¢ãSRÂÔÂ¢ã"“°Ð¢òòVÆ&÷r6BF†RF÷öbF†Rf÷&V&ÒàÐ¢FEFò†f÷&RÂ&÷‚„Â¢ã3BÂÂ¢ãbÂÂ¢ã3B’ÂÆFRÂÂ¢ã“°Ð¢òò¶çV6¶ÆRÆFR&–F–ærF†R&6²öbF†R†æBF÷v&BF†Rf–ævW'2àÐ¢6öç7B„6†–ÆBÒ†æBæ6†–ÆG&Vâæf–æB†2Óâ2æ—4&öæR“°Ð¢6öç7B‡’Ò„6†–ÆBò„6†–ÆBç÷6—F–öâæÆVæwF‚‚’¢ãR¢Â¢ãc°Ð¢FEFò††æBÂ&÷‚„Â¢ã3ÂÂ¢ã#"ÂÂ¢ã3B’ÂÆFRÂ‡’“°Ð¢Ó°Ð¢ö&ÕÆFR‚tÆVgDf÷&T&ÒrÂtÆVgD†æBr“°Ð¢ö&ÕÆFR‚u&–v‡Df÷&T&ÒrÂu&–v‡D†æBr“°Ð Ð¢&WGW&â²æ–ÖFVBÂÖFW&–Ç3¢²ââæ&Ö÷$ÖFW&–Ç5ÒÓ°Ð§ÐÐ Ð¢òò6÷6ÖWF–26¶–âF–çC¢&V6öÆ÷W'2F†R&Ö÷W"ÆFW2F÷v&BF†RWV—VB6¶–àÐ¢òòv†–ÆR¶VW–ærF†Rf&–çBw2vÆ÷v–ærf—6÷"â&ÆVæG2F÷v&BF†Rf&–çB&6PÐ¢òò6öÆ÷W"6òWV—VB6¶–ç2&VB2&Ö÷W"6†FW2&F†W"F†âfÆB6öÆ–B&Æö'2àÐ¦W‡÷'BgVæ7F–öâF–çD‡VÖå6öÆF–W"†w&÷WÂ6¶–âÂ&Ö÷%6¶–âÒçVÆÂ’°Ð¢6öç7BÖG2Òw&÷WçW6W$FFòæ&öG”ÖG3°Ð¢–b‚ÖG2ÇÂÖG2æÆVæwF‚’&WGW&ã°Ð¢6öç7B†W‚Ò&Ö÷%6¶–âò&Ö÷%6¶–âç&–Ö'’¢6¶–ãòç&–Ö'“°Ð¢–b††W‚ÓÒçVÆÂ’&WGW&ã°Ð¢6öç7BF–çBÒæWrD…$TRä6öÆ÷"††W‚“°Ð¢f÷"†6öç7BÒöbÖG2’°Ð¢–b†&Ö÷%6¶–â’°Ð¢òòF†R6÷W&6RtÄ"—2F7F–6Â6öÆF–W"âöæ6Râ&Ö÷"f–æ—6‚—2WV—VBÀÐ¢òò—G2f'&–2öÆ&VFòv÷VÆB6†÷rö6¶WG2æB6Ö÷VfÆvRF‡&÷Vv‚F†R7V—Bæ@Ð¢òòÖ¶RF†R6†&7FW"&VB2â&×’ÖöFVÂâ¶VWF†Ræ÷&ÖÂFWF–Â'W@Ð¢òòGW&âF†R6÷W&6R7W&f6R–çFòF†Rf–æ—6‚w26ÆVâw&†—FRfÆW‚Æ–W#°Ð¢òòF†R&ö6VGW&Â†&BÆFW2&VÖ–âF†Rf—6–&ÆR÷WFW"6†VÆÂàÐ¢ÒæÖÒçVÆÃ°Ð¢Òæ6öÆ÷"æ6÷’†æWrD…$TRä6öÆ÷"†&Ö÷%6¶–âç6V6öæF'’’’æÆW'†æWrD…$TRä6öÆ÷"ƒƒF#Sscb’ÂãC"“°Ð¢ÒVÇ6R–b†ÒæÖ’°Ð¢òò'&–v‡FVâF÷v&BF†R6¶–â6öÆ÷W"6òÆ–v‡B6¶–ç2‡v†—FR&Ö÷W"’&VB'&–v‡BÀÐ¢òòv†–ÆR¶VW–ærF†RFW‡GW&RFWF–Â‡fÇVW26âW†6VVBFòÆ–gBF†RtÄ"w&W’’àÐ¢Òæ6öÆ÷"ç6WE$t"ƒãCR²ãr¢F–çBç"ÂãCR²ãr¢F–çBærÂãCR²ãr¢F–çBæ"“°Ð¢ÒVÇ6R°Ð¢Òæ6öÆ÷"æ6÷’‡F–çB’æÆW'†æWrD…$TRä6öÆ÷"†w&÷WçW6W$FFòæ&6T&öG”6öÆ÷"óòƒVvC3R’Âã3R“°Ð¢ÐÐ¢ÒææVVG5WFFRÒG'VS°Ð¢ÐÐ¢–b†&Ö÷%6¶–âbbw&÷WçW6W$FFòæ&Ö÷$ÖG2’°Ð¢6öç7BÆFRÒæWrD…$TRä6öÆ÷"†&Ö÷%6¶–âç&–Ö'’“°Ð¢6öç7BVæFW"ÒæWrD…$TRä6öÆ÷"†&Ö÷%6¶–âç6V6öæF'’“°Ð¢6öç7BvÆ÷rÒæWrD…$TRä6öÆ÷"†&Ö÷%6¶–âæVÖ—76—fRóò&Ö÷%6¶–âç&–Ö'’“°Ð¢f÷"†6öç7BÒöbw&÷WçW6W$FFæ&Ö÷$ÖG2’°Ð¢6öç7B&öÆRÒÒçW6W$FFòæ&Ö÷%&öÆS°Ð¢–b‡&öÆRÓÓÒwÆFRr’Òæ6öÆ÷"æ6÷’‡ÆFR’æ×VÇF—Ç•66Æ"ƒã“"“°Ð¢VÇ6R–b‡&öÆRÓÓÒvF&²r’°Ð¢Òæ6öÆ÷"æ6÷’‡VæFW"’æÆW'†æWrD…$TRä6öÆ÷"ƒƒ33ƒCB’Âã#‚’æ×VÇF—Ç•66Æ"ƒãs"“°Ð¢ÐÐ¢VÇ6R–b‡&öÆRÓÓÒwG&–Òr’Òæ6öÆ÷"æ6÷’‡ÆFR’æÆW'†æWrD…$TRä6öÆ÷"ƒ†S†VFc"’ÂãS‚“°Ð¢VÇ6R–b‡&öÆRÓÓÒv66VçBr’°Ð¢Òæ6öÆ÷"æ6÷’†vÆ÷r“°Ð¢ÒæVÖ—76—fSòæ6÷“òâ†vÆ÷r“°Ð¢ÒæVÖ—76—fT–çFVç6—G’Ò&Ö÷%6¶–âæVÖ—76—fT–çFVç6—G’óòãS#°Ð¢ÐÐ¢ÒææVVG5WFFRÒG'VS°Ð¢ÐÐ¢ÐÐ§ÐÐ 