import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

// ───────────────────────────────────────────────────────────────────────────
// Real rigged human soldier (Mixamo "Vanguard"), with Idle / Walk / Run clips.
// Replaces the procedural block character: this is an actual human mesh driven
// by skeletal animation rather than rotating box primitives.
// ───────────────────────────────────────────────────────────────────────────
let _template   = null;   // { scene, animations }
let _loading    = false;
const _callbacks = [];

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

// ── Per-armor-type Spartan variants ─────────────────────────────────────────
// Each loadout armor type renders a visibly distinct futuristic super-soldier:
// its own armour colour, glowing visor/accent hue, surface finish, and build
// scale. This is what makes the loadout's armor cards each preview a different
// "model" instead of the same green Chief four times.
export const ARMOR_LOOKS = {
  assault: { // Master Chief green — the iconic default
    body: 0x5a7d35, visor: 0xffb02a,
    roughness: 0.55, metalness: 0.35, scale: 1.00,
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

/**
 * Build an independent, animated human-soldier instance.
 * Returns a THREE.Group whose userData carries { mixer, actions, setMotion, isHuman }.
 * Call `group.userData.mixer.update(dt)` every frame and
 * `group.userData.setMotion('idle'|'walk'|'run')` to switch clips.
 * `armorTypeId` selects one of the ARMOR_LOOKS variants so each loadout armor
 * type previews as a distinct super-soldier.
 */
export function buildHumanSoldier(skin = null, armorTypeId = 'assault') {
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
      o.material = o.material.clone();
      const n = (o.material.name || '') + ' ' + (o.name || '');
      if (/visor/i.test(n)) visorMats.push(o.material);
      else                  bodyMats.push(o.material);
    }
  });
  _applyArmorLook(bodyMats, visorMats, look);

  const group = new THREE.Group();
  group.add(root);

  // Bolt on this loadout's distinct armour set (bone-parented so plates ride the
  // skeleton during the animation). Each armor type gets its own silhouette.
  group.updateMatrixWorld(true);
  _buildArmorPieces(root, armorTypeId, look);

  // Measure the standing figure now, while its matrices resolve cleanly, and
  // stash the result. Re-measuring a posed SkinnedMesh elsewhere (e.g. the
  // loadout turntable) can collapse to a degenerate box, so consumers that
  // need to frame the model should read these instead of re-running setFromObject.
  group.updateMatrixWorld(true);
  const _box = new THREE.Box3().setFromObject(group);
  const _size = _box.getSize(new THREE.Vector3());
  const _ctr  = _box.getCenter(new THREE.Vector3());

  // ── Animation ──
  const mixer   = new THREE.AnimationMixer(root);
  const byName  = {};
  for (const clip of _template.animations) byName[clip.name] = clip;

  const actions = {
    idle: byName.Idle ? mixer.clipAction(byName.Idle) : null,
    walk: byName.Walk ? mixer.clipAction(byName.Walk) : null,
    run:  byName.Run  ? mixer.clipAction(byName.Run)  : null,
  };
  for (const a of Object.values(actions)) {
    if (a) { a.enabled = true; a.setEffectiveWeight(1); a.play(); a.setEffectiveWeight(0); }
  }

  let current = null;
  const setMotion = (name) => {
    const next = actions[name] || actions.idle;
    if (!next || next === current) return;
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.reset().play();
    if (current) current.crossFadeTo(next, 0.25, false);
    current = next;
  };
  setMotion('idle');

  group.userData = {
    isHuman: true,
    mixer,
    actions,
    setMotion,
    bodyMats,
    visorMats,
    armorTypeId,
    baseBodyColor: look.body, // the variant's plate colour, used as tint anchor
    // Cached framing metrics (see measurement above).
    standHeight: _size.y || 1.8,
    feetY:       _box.min.y,
    centerX:     _ctr.x,
    centerZ:     _ctr.z,
    // No recolorable primary/secondary plates on the human; expose stubs so
    // applySkinToCharacter() stays a no-op-safe call.
    primaryMat:   bodyMats[0] || null,
    secondaryMat: bodyMats[0] || null,
  };

  if (skin) tintHumanSoldier(group, skin);
  return group;
}

function _applyArmorLook(bodyMats, visorMats, look) {
  for (const m of bodyMats) {
    m.color.setHex(look.body);
    m.roughness = look.roughness;
    m.metalness = look.metalness;
    if (m.map) m.map = m.map; // keep the texture detail if present (real GLB)
    m.needsUpdate = true;
  }
  for (const m of visorMats) {
    m.color.setHex(look.visor);
    m.emissive?.setHex?.(look.visor);
    m.emissiveIntensity = 1.0;
    m.metalness = 0.95;
    m.roughness = 0.16;
    m.needsUpdate = true;
  }
}

// ── Procedural armour pieces ─────────────────────────────────────────────────
// Each loadout type gets a distinct hard-surface silhouette (pauldrons, chest
// plates, packs, helmet add-ons) so ASSAULT / RECON / HEAVY / STEALTH read as
// genuinely different armour, not just recolours. Pieces are parented to the
// Mixamo skeleton bones so they move with the walk/run animation.
const _v = new THREE.Vector3();
const _vScale = new THREE.Vector3(1, 1, 1);
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();

// Attach `mesh` to `bone` but position/scale it in the model's world space (so
// geometry can be authored in metres regardless of the bone's 0.01 bind scale).
function _attachAtWorld(bone, mesh, wx, wy, wz, worldScale, quat) {
  bone.add(mesh);
  bone.updateWorldMatrix(true, false);
  const q = quat || new THREE.Quaternion();
  const desired = _m.compose(_v.set(wx, wy, wz), q, _vScale.set(worldScale, worldScale, worldScale));
  const local = _m2.copy(bone.matrixWorld).invert().multiply(desired);
  local.decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.frustumCulled = false; // bone-driven bounds expand past the bind pose
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

function _buildArmorPieces(root, armorTypeId, look) {
  const bone = (n) => root.getObjectByName('mixamorig:' + n);
  const s = look.scale || 1;

  // Materials: a plate (armour-coloured), dark metal, and a glowing accent.
  const plate = new THREE.MeshStandardMaterial({
    color: new THREE.Color(look.body).multiplyScalar(0.78),
    roughness: look.roughness ?? 0.5, metalness: 0.62,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x11151d, roughness: 0.45, metalness: 0.78 });
  const accent = new THREE.MeshStandardMaterial({
    color: look.visor, emissive: look.visor, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.6,
  });

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const sph = (r) => new THREE.SphereGeometry(r, 12, 10);
  const oct = (r) => new THREE.OctahedronGeometry(r);
  const cyl = (r, h) => new THREE.CylinderGeometry(r, r, h, 8);

  // spec: [boneName, geometry, material, wx, wy, wz, (quat)]
  let specs = [];
  const tiltBack = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, 0));

  if (armorTypeId === 'recon') {
    // Light scout: slim chest, one pad, head scope + antenna.
    specs = [
      ['Spine2', box(0.24, 0.26, 0.06), plate, 0, 1.40, -0.075],
      ['LeftShoulder', box(0.11, 0.09, 0.13), plate, -0.16, 1.52, 0.04],
      ['Head', box(0.06, 0.05, 0.09), dark, 0.085, 1.585, -0.01],
      ['Head', cyl(0.008, 0.20), accent, 0.085, 1.72, 0.05],
      ['Spine2', box(0.05, 0.05, 0.10), accent, 0, 1.30, 0.12], // small back beacon
    ];
  } else if (armorTypeId === 'heavy') {
    // Juggernaut: big pauldrons, thick chest + abs, back power unit, collar, thighs.
    specs = [
      ['Spine2', box(0.40, 0.42, 0.18), plate, 0, 1.40, -0.05],
      ['Spine1', box(0.34, 0.18, 0.14), plate, 0, 1.21, -0.05],
      ['LeftShoulder', sph(0.135), plate, -0.205, 1.52, 0.03],
      ['RightShoulder', sph(0.135), plate, 0.205, 1.52, 0.03],
      ['LeftShoulder', box(0.10, 0.05, 0.10), accent, -0.205, 1.61, 0.03],
      ['RightShoulder', box(0.10, 0.05, 0.10), accent, 0.205, 1.61, 0.03],
      ['Spine2', box(0.32, 0.36, 0.20), dark, 0, 1.40, 0.17], // back power pack
      ['Spine2', box(0.07, 0.30, 0.06), accent, 0, 1.40, 0.28],
      ['Neck', box(0.28, 0.11, 0.24), plate, 0, 1.52, 0.04],   // collar guard
      ['LeftUpLeg', box(0.15, 0.24, 0.17), plate, -0.115, 0.92, -0.02],
      ['RightUpLeg', box(0.15, 0.24, 0.17), plate, 0.115, 0.92, -0.02],
    ];
  } else if (armorTypeId === 'stealth') {
    // Infiltrator: sleek angular plates, head cowl, back sheath.
    specs = [
      ['Spine2', box(0.25, 0.30, 0.05), plate, 0, 1.40, -0.075],
      ['LeftShoulder', oct(0.085), dark, -0.17, 1.52, 0.04],
      ['RightShoulder', oct(0.085), dark, 0.17, 1.52, 0.04],
      ['Head', box(0.20, 0.16, 0.20), dark, 0, 1.65, 0.10, tiltBack], // cowl/hood
      ['Spine2', box(0.05, 0.42, 0.10), dark, 0.07, 1.40, 0.14],      // back sheath
      ['Spine2', box(0.03, 0.30, 0.03), accent, 0, 1.40, -0.10],      // chest light strip
    ];
  } else {
    // Assault (default): balanced tactical plate, two pads, belt, small pack.
    specs = [
      ['Spine2', box(0.31, 0.35, 0.12), plate, 0, 1.40, -0.055],
      ['Spine2', box(0.05, 0.22, 0.04), accent, 0, 1.40, -0.115], // chest emitter
      ['LeftShoulder', box(0.15, 0.13, 0.17), plate, -0.18, 1.51, 0.04],
      ['RightShoulder', box(0.15, 0.13, 0.17), plate, 0.18, 1.51, 0.04],
      ['Spine', box(0.32, 0.09, 0.22), dark, 0, 1.13, -0.01],     // utility belt
      ['Spine2', box(0.22, 0.26, 0.13), dark, 0, 1.38, 0.14],     // small backpack
    ];
  }

  for (const [bn, geo, mat, wx, wy, wz, quat] of specs) {
    const b = bone(bn);
    if (!b) continue;
    const mesh = new THREE.Mesh(geo, mat);
    _attachAtWorld(b, mesh, wx * s, wy * s, wz * s, s, quat);
  }
}

// Cosmetic skin tint: recolours the armour plates toward the equipped skin
// while keeping the variant's glowing visor. Blends toward the variant base
// colour so equipped skins read as armour shades rather than flat solid blobs.
export function tintHumanSoldier(group, skin, armorSkin = null) {
  const mats = group.userData?.bodyMats;
  if (!mats || !mats.length) return;
  const hex = armorSkin ? armorSkin.primary : skin?.primary;
  if (hex == null) return;
  const anchor = new THREE.Color(group.userData?.baseBodyColor ?? 0x5a7d35);
  for (const m of mats) {
    m.color.setHex(hex).lerp(anchor, 0.35);
    m.needsUpdate = true;
  }
}
