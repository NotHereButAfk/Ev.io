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

/**
 * Build an independent, animated human-soldier instance.
 * Returns a THREE.Group whose userData carries { mixer, actions, setMotion, isHuman }.
 * Call `group.userData.mixer.update(dt)` every frame and
 * `group.userData.setMotion('idle'|'walk'|'run')` to switch clips.
 */
export function buildHumanSoldier(skin = null) {
  if (!_template) return null;

  const root = cloneSkeleton(_template.scene);
  root.scale.setScalar(MODEL_SCALE);

  // Give this instance its own materials, and split body vs visor so we can
  // paint a Master-Chief-style Spartan: green armour + glowing gold visor.
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
  _applySpartanLook(bodyMats, visorMats);

  const group = new THREE.Group();
  group.add(root);

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
    armorTypeId: 'human',
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

// Master Chief / Spartan default: deep green armour plates + a reflective,
// self-lit gold visor. Used whenever no cosmetic skin overrides the colours.
const SPARTAN_GREEN = 0x5a7d35;
const VISOR_GOLD    = 0xffb02a;

function _applySpartanLook(bodyMats, visorMats) {
  for (const m of bodyMats) {
    m.color.setHex(SPARTAN_GREEN);
    m.roughness = 0.55;
    m.metalness = 0.35;
    if (m.map) m.map = m.map; // keep the texture detail if present (real GLB)
    m.needsUpdate = true;
  }
  for (const m of visorMats) {
    m.color.setHex(VISOR_GOLD);
    m.emissive?.setHex?.(VISOR_GOLD);
    m.emissiveIntensity = 0.9;
    m.metalness = 0.95;
    m.roughness = 0.18;
    m.needsUpdate = true;
  }
}

// Cosmetic skin tint: recolours the Spartan armour while keeping the gold
// visor. Blends toward the base green so equipped skins read as armour shades
// rather than flat solid blobs.
export function tintHumanSoldier(group, skin, armorSkin = null) {
  const mats = group.userData?.bodyMats;
  if (!mats || !mats.length) return;
  const hex = armorSkin ? armorSkin.primary : skin?.primary;
  if (hex == null) return;
  for (const m of mats) {
    m.color.setHex(hex).lerp(new THREE.Color(SPARTAN_GREEN), 0.35);
    m.needsUpdate = true;
  }
}
