import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MAIN_WEAPON_IDS, WEAPONS } from '../src/weapons/weaponDefs.js';

// WeaponTextures creates canvases while the procedural fallbacks are built.
// Geometry is all this probe needs, so a no-op 2D context keeps the check
// browser-free and deterministic.
const noop = () => {};
const gradient = { addColorStop: noop };
const context2d = new Proxy({}, {
  get(target, key) {
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
    if (key === 'measureText') return () => ({ width: 10 });
    return target[key] ?? (target[key] = noop);
  },
  set(target, key, value) {
    target[key] = value;
    return true;
  },
});
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => context2d }),
};
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
};

const {
  WeaponSystem,
  adsMountForSight,
  measureWeaponSight,
  prepareFirstPersonModel,
  shouldHideAdsViewmodel,
} = await import('../src/weapons/WeaponSystem.js');
const { orientWeaponModelForward } = await import('../src/weapons/WeaponModels.js');

const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};

async function loadGlb(relativePath) {
  const bytes = fs.readFileSync(new URL(relativePath, import.meta.url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer, '', resolve, reject);
  });
}

const [sidearmGlb, authoredGlb, legacyGlb] = await Promise.all([
  loadGlb('../public/sidearm.glb'),
  loadGlb('../public/weapons_authored.glb'),
  loadGlb('../public/weapons.glb'),
]);

function shippedSource(def) {
  if (def.proceduralModel) return null;
  const name = `weapon_${def.id}`;
  return (def.id === 'sidearm' ? sidearmGlb.scene.getObjectByName(name) : null)
    || authoredGlb.scene.getObjectByName(name)
    || legacyGlb.scene.getObjectByName(name)
    || null;
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, 16 / 9, 0.02, 300);
scene.add(camera);
const audio = new Proxy({}, { get: () => noop });
const system = new WeaponSystem(camera, scene, audio);

// The GLB pack uses an inverted-hull child named `outline`. That technique
// cannot share a depth-independent first-person pass or its back faces cover
// the colored receiver. Keep the base gun on top of the world and suppress only
// the contour shell.
const depthProbe = new THREE.Group();
const depthProbeBody = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
const depthProbeOutline = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), new THREE.MeshBasicMaterial());
depthProbeOutline.name = 'outline';
depthProbeBody.add(depthProbeOutline);
depthProbe.add(depthProbeBody);
prepareFirstPersonModel(depthProbe);
assert(!depthProbeBody.material.depthTest && !depthProbeBody.material.depthWrite,
  'first-person body still shares the world depth buffer');
assert(depthProbeOutline.visible === false,
  'first-person inverted-hull outline still covers the colored gun');

for (const [side, arm] of [
  ['trigger', system.armGroup],
  ['support', system.supportArmGroup],
]) {
  const length = arm?.userData?.sleeveLength;
  assert(Number.isFinite(length), `${side} arm exposes its authored sleeve length`);
  assert(length >= 0.45 && length <= 1.10,
    `${side} first-person sleeve is ${length?.toFixed(3)}m (expected a human-scale 0.45–1.10m)`);
}

// Reproduce WeaponModels' post-load selection using the actual shipped GLBs.
// The viewmodel refresh happens asynchronously in-game; testing only the
// procedural startup meshes would miss the long authored stocks that caused
// the clipping regression.
for (const def of WEAPONS) {
  const source = shippedSource(def);
  if (!source) continue;
  const record = system.models.get(def.id);
  const wasVisible = record.group.visible;
  system.kickGroup.remove(record.group);
  const group = new THREE.Group();
  const clone = source.clone(true);
  clone.position.set(0, 0, 0);
  let muzzle = null;
  clone.traverse((obj) => { if (!muzzle && /^muzzle_point/.test(obj.name)) muzzle = obj; });
  if (muzzle) {
    orientWeaponModelForward(clone, muzzle);
    const probeParent = new THREE.Group();
    probeParent.add(clone);
    probeParent.updateWorldMatrix(true, true);
    const muzzlePoint = muzzle.getWorldPosition(new THREE.Vector3());
    assert(muzzlePoint.z < -0.05, `${def.id} authored muzzle faces ${muzzlePoint.z.toFixed(3)} on +Z`);
    probeParent.remove(clone);
  }
  group.add(clone);
  prepareFirstPersonModel(group);
  group.visible = wasVisible;
  system.kickGroup.add(group);
  const sight = measureWeaponSight(group);
  system.models.set(def.id, {
    group,
    muzzle: muzzle || record.muzzle,
    sight,
    adsMount: adsMountForSight(sight),
  });
}

const input = {
  mouseDown: false,
  rightMouseDown: false,
  mouseDX: 0,
  mouseDY: 0,
  wheelDelta: 0,
  consumeJustPressed: () => false,
};
const world = {};
const botManager = { getRaycastTargets: () => [] };
const player = {
  isSprinting: false,
  onGround: true,
  baseFov: 78,
  velocity: { x: 0, z: 0 },
  _camDist: 0,
};

function tick(frames, fps = 60, beforeFrame = null) {
  const dt = 1 / fps;
  for (let i = 0; i < frames; i++) {
    beforeFrame?.(dt);
    system.update(dt, input, world, botManager, player);
  }
}

function settle() {
  system.kickPos.set(0, 0, 0);
  system.kickVel.set(0, 0, 0);
  system.kickRotX = 0;
  system.kickRotXVel = 0;
  system._raiseT = 1;
  system._sprintT = 0;
  system.scopeT = 0;
  player.isSprinting = false;
  player.velocity.x = 0;
  player.velocity.z = 0;
  input.rightMouseDown = false;
  tick(90);
}

function activate(def) {
  if (def.kind === 'melee') {
    system.setLoadout('m4', def.id);
    system.switchTo(1);
  } else {
    system.setLoadout(def.id, 'sword');
    // Power weapons are intentionally excluded from menu loadouts; exercise
    // them through the same pickup path used by a live match.
    if (system.currentDef.id !== def.id) system.addMapGun(def.id);
  }
  settle();
}

function nearDepth(root) {
  camera.updateMatrixWorld(true);
  root.updateWorldMatrix(true, true);
  return -new THREE.Box3().setFromObject(root).max.z;
}

function projectedRatioForBox(box) {
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const bounds = [Infinity, -Infinity, Infinity, -Infinity];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const point = new THREE.Vector3(x, y, z).project(camera);
        bounds[0] = Math.min(bounds[0], point.x);
        bounds[1] = Math.max(bounds[1], point.x);
        bounds[2] = Math.min(bounds[2], point.y);
        bounds[3] = Math.max(bounds[3], point.y);
      }
    }
  }
  const width = bounds[1] - bounds[0];
  const height = bounds[3] - bounds[2];
  if (!(width > 0 && height > 0)) return 0;
  const visibleWidth = Math.max(0, Math.min(1, bounds[1]) - Math.max(-1, bounds[0]));
  const visibleHeight = Math.max(0, Math.min(1, bounds[3]) - Math.max(-1, bounds[2]));
  return visibleWidth * visibleHeight / (width * height);
}

function projectedRatio(root) {
  root.updateWorldMatrix(true, true);
  return projectedRatioForBox(new THREE.Box3().setFromObject(root));
}

function projectedBounds(root) {
  root.updateWorldMatrix(true, true);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
    for (const z of [box.min.z, box.max.z]) {
      const point = new THREE.Vector3(x, y, z).project(camera);
      bounds.minX = Math.min(bounds.minX, point.x);
      bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y);
      bounds.maxY = Math.max(bounds.maxY, point.y);
    }
  }
  return bounds;
}

function viewportArea(root) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const bounds = [Infinity, -Infinity, Infinity, -Infinity];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
    for (const z of [box.min.z, box.max.z]) {
      const point = new THREE.Vector3(x, y, z).project(camera);
      bounds[0] = Math.min(bounds[0], point.x);
      bounds[1] = Math.max(bounds[1], point.x);
      bounds[2] = Math.min(bounds[2], point.y);
      bounds[3] = Math.max(bounds[3], point.y);
    }
  }
  const width = Math.max(0, Math.min(1, bounds[1]) - Math.max(-1, bounds[0]));
  const height = Math.max(0, Math.min(1, bounds[3]) - Math.max(-1, bounds[2]));
  return width * height / 4;
}

function meshViewportArea(root) {
  let area = 0;
  root.traverse((object) => {
    if (object.isMesh && object.visible) area += viewportArea(object);
  });
  return Math.min(1, area);
}

let lastGloveBounds = null;
function gloveRatio(group) {
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(group);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const bounds = [Infinity, -Infinity, Infinity, -Infinity];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
    for (const z of [box.min.z, box.max.z]) {
      const point = new THREE.Vector3(x, y, z).project(camera);
      bounds[0] = Math.min(bounds[0], point.x);
      bounds[1] = Math.max(bounds[1], point.x);
      bounds[2] = Math.min(bounds[2], point.y);
      bounds[3] = Math.max(bounds[3], point.y);
    }
  }
  lastGloveBounds = bounds;
  const width = bounds[1] - bounds[0];
  const height = bounds[3] - bounds[2];
  if (!(width > 0 && height > 0)) return 0;
  const visibleWidth = Math.max(0, Math.min(1, bounds[1]) - Math.max(-1, bounds[0]));
  const visibleHeight = Math.max(0, Math.min(1, bounds[3]) - Math.max(-1, bounds[2]));
  return visibleWidth * visibleHeight / (width * height);
}

let lastEdgeBounds = null;
function reachesViewportEdge(root) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  let minX = Infinity, maxX = -Infinity, minY = Infinity;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
    for (const z of [box.min.z, box.max.z]) {
      const point = new THREE.Vector3(x, y, z).project(camera);
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
    }
  }
  lastEdgeBounds = { minX, maxX, minY };
  return minY <= -0.75 || minX <= -0.75 || maxX >= 0.75;
}

const viewports = [
  { label: 'portrait', aspect: 9 / 16 },
  { label: '4:3', aspect: 4 / 3 },
  { label: '16:9', aspect: 16 / 9 },
  { label: '21:9', aspect: 21 / 9 },
];
const fovs = [60, 78, 110];

let worstRestDepth = { value: Infinity, label: '' };
let worstActionDepth = { value: Infinity, label: '' };
let worstWeaponFrame = { value: Infinity, label: '' };

for (const def of WEAPONS) {
  activate(def);
  const model = system.models.get(def.id).group;
  const restDepth = nearDepth(model);
  if (restDepth < worstRestDepth.value) worstRestDepth = { value: restDepth, label: def.id };
  assert(
    restDepth >= camera.near + 0.03,
    `${def.id} rests ${restDepth.toFixed(3)}m from the eye plane (near=${camera.near})`,
  );

  // Every shipped model must leave a readable piece on screen at the full
  // supported FOV/aspect matrix. Hands are checked more strictly below.
  for (const viewport of viewports) {
    camera.aspect = viewport.aspect;
    for (const fov of fovs) {
      player.baseFov = fov;
      camera.fov = fov;
      tick(45);
      const ratio = projectedRatio(model);
      const label = `${def.id}/${viewport.label}/${fov}`;
      if (ratio < worstWeaponFrame.value) worstWeaponFrame = { value: ratio, label };
      assert(ratio >= 0.04, `${label} leaves only ${(ratio * 100).toFixed(1)}% of its projected box visible`);
    }
  }

  camera.aspect = 16 / 9;
  player.baseFov = 78;
  camera.fov = 78;
  tick(45);

  let actionDepth = Infinity;
  if (def.kind === 'melee') {
    system.swingPhase = 0;
    const frames = Math.ceil(def.fireRate * 60) + 2;
    for (let i = 0; i < frames; i++) {
      tick(1);
      actionDepth = Math.min(actionDepth, nearDepth(model));
    }
  } else {
    system._applyViewmodelRecoil(def.recoil);
    for (let i = 0; i < 30; i++) {
      tick(1);
      actionDepth = Math.min(actionDepth, nearDepth(model));
    }

    settle();
    const state = system.currentState;
    state.isReloading = true;
    state.reloadTimer = def.reloadTime;
    const frames = Math.ceil(def.reloadTime * 60);
    for (let i = 0; i < frames; i++) {
      tick(1);
      actionDepth = Math.min(actionDepth, nearDepth(model));
    }
  }
  if (actionDepth < worstActionDepth.value) worstActionDepth = { value: actionDepth, label: def.id };
  assert(
    actionDepth >= camera.near + 0.03,
    `${def.id} action reaches ${actionDepth.toFixed(3)}m from the eye plane (near=${camera.near})`,
  );
}

// The reference first-person silhouette has one dominant trigger-side hand and
// a compact support glove seated under a rifle's handguard. Exercise both
// across every viewport, FOV and high-motion state; the support upper sleeve
// remains hidden instead of forming a second long tube.
activate(WEAPONS.find((def) => def.id === 'm4'));
camera.aspect = 16 / 9;
player.baseFov = 78;
camera.fov = 78;
tick(90);
const referenceRifleBounds = projectedBounds(system.models.get('m4').group);
assert(system.weaponMount.position.x >= 0.36 && system.weaponMount.position.x <= 0.44,
  `EV.IO rifle shoulder offset drifted (${system.weaponMount.position.x})`);
assert(system.weaponMount.position.y >= -0.43 && system.weaponMount.position.y <= -0.35,
  `EV.IO rifle vertical placement drifted (${system.weaponMount.position.y})`);
assert(system.weaponMount.rotation.x >= 0.19 && system.weaponMount.rotation.x <= 0.25,
  `EV.IO rifle diagonal pitch drifted (${system.weaponMount.rotation.x})`);
assert(system.weaponMount.rotation.y >= 0.28 && system.weaponMount.rotation.y <= 0.36,
  `EV.IO rifle shoulder yaw drifted (${system.weaponMount.rotation.y})`);
assert(referenceRifleBounds.maxX > 0.75,
  `EV.IO rifle butt does not own the lower-right quadrant (${JSON.stringify(referenceRifleBounds)})`);
assert(referenceRifleBounds.minY < -1,
  `EV.IO rifle butt must exit the bottom edge (${JSON.stringify(referenceRifleBounds)})`);
assert(referenceRifleBounds.minX > -0.24,
  `EV.IO rifle crosses too far over the reticle (${JSON.stringify(referenceRifleBounds)})`);
assert(system.weaponMount.rotation.x >= 0.12 && system.weaponMount.rotation.y >= 0.11,
  `EV.IO rifle lacks its shouldered pitch/yaw (${system.weaponMount.rotation.x}, ${system.weaponMount.rotation.y})`);
let worstGlove = { value: 0, label: 'weapon-only' };
assert(!system.armGroup.visible && !system.supportArmGroup.visible,
  'first-person must not render hands or sleeves');
for (const stateName of ['idle', 'sprint', 'reload']) {
  player.isSprinting = stateName === 'sprint';
  player.velocity.z = stateName === 'sprint' ? 10.85 : 0;
  const reloadState = system.currentState;
  reloadState.isReloading = stateName === 'reload';
  for (const viewport of viewports) {
    camera.aspect = viewport.aspect;
    for (const fov of fovs) {
      player.baseFov = fov;
      camera.fov = fov;
      tick(60, 60, (dt) => {
        if (stateName === 'reload') {
          reloadState.isReloading = true;
          reloadState.reloadTimer = system.currentDef.reloadTime * 0.5 + dt;
        }
      });
      for (const [side, glove] of [
        ['trigger', system.armGroup],
        ['support', system.supportArmGroup],
      ]) {
        if (!glove.visible) continue;
        const grip = glove.getObjectByName('viewmodel_grip') || glove;
        const ratio = gloveRatio(grip);
        const label = `${stateName}/${viewport.label}/${fov}/${side}`;
        if (ratio < worstGlove.value) worstGlove = { value: ratio, label };
        // Mid-reload intentionally lets part of the trigger glove leave frame;
        // at least 34% remains on landscape and 15% on portrait. The lower
        // EV-style framing intentionally lets the sleeve continue through the
        // bottom edge while the closed grip itself stays readable.
        const minimum = side === 'support'
          ? (viewport.aspect < 1 ? 0.08 : 0.18)
          : (viewport.aspect < 1 ? 0.15 : 0.34);
        assert(
          ratio >= minimum,
          `${label} leaves only ${(ratio * 100).toFixed(1)}% of the glove visible (${JSON.stringify(lastGloveBounds)})`,
        );
        // Sum of per-mesh projected boxes intentionally over-estimates the
        // curved/tapered cylinders; 36% keeps the real arm pixels compact while
        // allowing a sleeve to cross the frame edge during the sprint carry.
        const maxArea = side === 'support'
          ? (viewport.aspect < 1 ? 0.30 : 0.18)
          : (viewport.aspect < 1 ? 0.56 : 0.40);
        const armArea = meshViewportArea(glove);
        assert(
          armArea <= maxArea,
          `${label} arm occupies ${(armArea * 100).toFixed(1)}% of the viewport`,
        );
        // Do not resurrect metre-and-a-half sleeves solely to touch an edge
        // after the 110° sprint cant rotates the shoulder into view. Normal
        // gameplay FOVs still require an unbroken exit; the extreme wide-FOV
        // sprint relies on the closed, dark shoulder-side cap instead.
        if (side === 'trigger' && !(stateName === 'sprint' && fov >= 100)) {
          assert(
            reachesViewportEdge(glove),
            `${label} sleeve terminates inside the viewport (${JSON.stringify(lastEdgeBounds)})`,
          );
        }
      }
    }
  }
  reloadState.isReloading = false;
}

assert(!system.armGroup.visible && !system.supportArmGroup.visible,
  'rifle viewmodel unexpectedly renders hands');
assert(
  system.supportArmGroup.getObjectByName('viewmodel_upper_sleeve')?.visible === false,
  'support hand grew a second full-screen upper arm',
);
activate(WEAPONS.find((def) => def.id === 'sidearm'));
assert(!system.supportArmGroup.visible, 'one-handed sidearm renders a stray support hand');

function advanceSeconds(seconds, fps, beforeFrame = null) {
  let remaining = seconds;
  while (remaining > 1e-10) {
    const dt = Math.min(1 / fps, remaining);
    beforeFrame?.(dt);
    system.update(dt, input, world, botManager, player);
    remaining -= dt;
  }
}

function resetMotionState() {
  system._sprintT = 0;
  system.scopeT = 0;
  system._swayX = 0;
  system._swayY = 0;
  system._swayVelX = 0;
  system._swayVelY = 0;
  system._bobPhase = 0;
  system._bobAmt = 0;
  system._idleT = 0;
  system._fallSpeed = 0;
  system._landStrength = 0;
  system._landT = 0;
  system._wasGrounded = true;
  system.kickPos.set(0, 0, 0);
  system.kickVel.set(0, 0, 0);
  system.kickRotX = 0;
  system.kickRotXVel = 0;
  system._raiseT = 1;
  input.mouseDown = false;
  input.rightMouseDown = false;
  input.mouseDX = 0;
  input.mouseDY = 0;
  player.isSprinting = false;
  player.onGround = true;
  player.baseFov = 78;
  player.velocity.x = 0;
  player.velocity.y = 0;
  player.velocity.z = 0;
  camera.aspect = 16 / 9;
  camera.fov = 78;
  camera.updateProjectionMatrix();
}

// The blend state itself must be identical after the same elapsed time,
// regardless of how many render frames divided that interval.
activate(WEAPONS.find((def) => def.id === 'boltsniper'));
const rates = [30, 60, 144];
const sprintSamples = [];
const adsSamples = [];
for (const fps of rates) {
  resetMotionState();
  player.isSprinting = true;
  player.velocity.z = 10.85;
  advanceSeconds(0.1, fps);
  sprintSamples.push({ fps, blend: system._sprintT, fov: camera.fov });

  resetMotionState();
  input.rightMouseDown = true;
  advanceSeconds(0.1, fps);
  adsSamples.push({ fps, blend: system.scopeT, fov: camera.fov });
}
const spread = (samples, key) => {
  const values = samples.map((sample) => sample[key]);
  return Math.max(...values) - Math.min(...values);
};
assert(spread(sprintSamples, 'blend') < 1e-10, 'sprint carry blend changes with refresh rate');
assert(spread(adsSamples, 'blend') < 1e-10, 'ADS blend changes with refresh rate');
assert(spread(sprintSamples, 'fov') < 1e-9, 'sprint FOV changes with refresh rate');
assert(spread(adsSamples, 'fov') < 1e-9, 'ADS FOV changes with refresh rate');

// The recoil spring used to be Euler-integrated and visibly recovered at a
// different rate on 30Hz displays. Its full position and rotation state must
// now compose to the same result over equal elapsed time.
const recoilSamples = [];
for (const fps of rates) {
  resetMotionState();
  system._applyViewmodelRecoil(1);
  advanceSeconds(0.25, fps);
  recoilSamples.push({
    fps,
    x: system.kickPos.x,
    y: system.kickPos.y,
    z: system.kickPos.z,
    rot: system.kickRotX,
  });
}
for (const key of ['x', 'y', 'z', 'rot']) {
  assert(spread(recoilSamples, key) < 1e-10, `recoil ${key} changes with refresh rate`);
}

// A rifle reload adds roll to the shared kick group. Equipping a blade must
// establish a clean blade pose instead of inheriting that gun-only transform.
activate(WEAPONS.find((def) => def.id === 'm4'));
system.currentState.isReloading = true;
system.currentState.reloadTimer = system.currentDef.reloadTime * 0.5;
tick(1);
assert(Math.abs(system.kickGroup.rotation.z) > 0.1, 'reload did not exercise gun roll');
system.switchTo(1);
tick(1);
assert(Math.abs(system.kickGroup.rotation.z) < 1e-12, 'gun reload roll leaked into melee carry');
activate(WEAPONS.find((def) => def.id === 'knife'));
const knifeGrip = system.armGroup.userData.gripTarget;
assert(Math.abs(knifeGrip[1] + 0.020) < 1e-9 && Math.abs(knifeGrip[2] - 0.120) < 1e-9,
  'knife glove must close around the authored handle centre');
assert(Math.abs(system.kickGroup.rotation.y + 0.28) < 1e-9,
  'knife must use its compact forward guard instead of the long sword pose');
activate(WEAPONS.find((def) => def.id === 'boltsniper'));

// Feed the same physical look velocity at each refresh rate. Full ADS should
// retain only a small trace of movement, and that result should itself remain
// stable at 30/60/144 Hz.
const adsStability = [];
for (const fps of rates) {
  resetMotionState();
  input.rightMouseDown = true;
  player.velocity.z = 6.6;
  advanceSeconds(1.2, fps, (dt) => {
    input.mouseDX = 600 * dt;
    input.mouseDY = -300 * dt;
  });
  adsStability.push({
    fps,
    scope: system.scopeT,
    bob: system._bobAmt,
    sway: Math.hypot(system.swayGroup.rotation.x, system.swayGroup.rotation.y),
  });
}
for (const sample of adsStability) {
  assert(sample.scope > 0.999, `ADS did not settle at ${sample.fps}Hz`);
  assert(sample.bob < 0.0015, `ADS walk bob is ${sample.bob.toFixed(5)}m at ${sample.fps}Hz`);
  assert(sample.sway < 0.002, `ADS look sway is ${sample.sway.toFixed(5)}rad at ${sample.fps}Hz`);
}
assert(!system.kickGroup.visible, 'scoped ADS leaves the gun and arms blocking the optic');
input.rightMouseDown = false;
advanceSeconds(0.25, 60);
assert(system.kickGroup.visible, 'viewmodel did not return after leaving the scope');
assert(spread(adsStability, 'bob') < 1e-6, 'ADS bob changes with refresh rate');
assert(spread(adsStability, 'sway') < 2e-5, 'ADS sway changes with refresh rate');

// Exercise the complete transition at 240Hz. Ordinary guns move from the
// cropped hip pose into EV.IO's partially shouldered top-of-gun picture;
// true scoped optics disappear only after the overlay is established.
for (const def of WEAPONS.filter((weapon) => weapon.kind !== 'melee')) {
  activate(def);
  resetMotionState();
  advanceSeconds(0.25, 240);
  const hipDepth = system.weaponMount.position.z;
  input.rightMouseDown = true;
  advanceSeconds(1 / 240, 240);
  assert(system.kickGroup.visible, `${def.id} vanishes on the first ADS frame`);
  assert(system.scopeT < 0.5, `${def.id} first-frame ADS probe skipped the transition`);
  advanceSeconds(0.5 - 1 / 240, 240);
  assert(system.kickGroup.visible === !def.scoped,
    `${def.id} uses the wrong full-ADS viewmodel mode`);
  if (!def.scoped) {
    assert(Math.abs(system.weaponMount.rotation.x - 0.08) < 0.012
      && Math.abs(system.weaponMount.rotation.y - 0.12) < 0.012
      && Math.abs(system.weaponMount.rotation.z + 0.02) < 0.012,
      `${def.id} zoom does not settle into the partial shoulder pose`);
    if (MAIN_WEAPON_IDS.includes(def.id)) {
      const record = system.models.get(def.id);
      assert(Math.abs(camera.fov - 30) < 0.3,
        `${def.id} does not settle at the EV-style 30-degree zoom (${camera.fov.toFixed(2)})`);
      camera.updateMatrixWorld(true);
      record.group.updateWorldMatrix(true, true);
      const adsMountNdc = system.weaponMount.getWorldPosition(new THREE.Vector3()).project(camera);
      assert(Math.abs(system.weaponMount.position.z - hipDepth) < 0.02,
        `${def.id} zoom pushes the gun away and makes it smaller`);
      assert(adsMountNdc.x > 0.20 && adsMountNdc.x < 0.50,
        `${def.id} zoom mount is outside the EV.IO shoulder lane (${adsMountNdc.x.toFixed(3)})`);
      assert(adsMountNdc.y < -0.50,
        `${def.id} zoom does not keep the enlarged weapon below the reticle`);
      record.group.traverse((object) => {
        if (!object.isMesh) return;
        if (object.name === 'outline') {
          assert(object.visible === false, `${def.id} first-person contour covers the receiver`);
          return;
        }
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        assert(materials.every((material) => !material.depthTest && !material.depthWrite),
          `${def.id} viewmodel can still be hidden by world geometry`);
        assert(object.renderOrder >= 1000, `${def.id} viewmodel render order is not isolated`);
      });
      const aimRay = new THREE.Raycaster();
      aimRay.setFromCamera(new THREE.Vector2(0, 0), camera);
      const centerHits = aimRay.intersectObject(record.group, true);
      assert(centerHits.length === 0,
        `${def.id} ADS geometry still blocks the centre aim ray`);
    }
  }
  input.rightMouseDown = false;
  advanceSeconds(0.2, 240);
  advanceSeconds(0.3, 240);
  assert(system.kickGroup.visible, `${def.id} viewmodel did not return after ADS`);
}
assert(!shouldHideAdsViewmodel(WEAPONS.find((def) => def.id === 'm4'), 1, true),
  'ordinary rifle zoom must retain the lower-right weapon carry');
assert(shouldHideAdsViewmodel(WEAPONS.find((def) => def.id === 'boltsniper'), 0.8, true),
  'scoped rifle must clear only after the scope overlay is established');
assert(!shouldHideAdsViewmodel(WEAPONS.find((def) => def.id === 'knife'), 1),
  'melee viewmodel must not be hidden by firearm ADS rules');

// Landing response is derived from the velocity retained during airtime.
const landingStrength = (fallSpeed) => {
  resetMotionState();
  player.onGround = false;
  player.velocity.y = -fallSpeed;
  advanceSeconds(1 / 60, 60);
  player.onGround = true;
  player.velocity.y = 0;
  advanceSeconds(1 / 60, 60);
  return system._landStrength;
};
const softLanding = landingStrength(2);
const hardLanding = landingStrength(18);
assert(softLanding >= 0.17 && softLanding <= 0.25, `soft landing strength is ${softLanding}`);
assert(hardLanding >= 1 && hardLanding <= 1.2, `hard landing strength is ${hardLanding}`);
assert(hardLanding > softLanding * 4, 'landing response does not scale with impact velocity');

console.log(
  `viewmodel passed: ${WEAPONS.length} shipped weapons, `
  + `${viewports.length * fovs.length} FOV/aspect frames; `
  + `rest clearance=${worstRestDepth.value.toFixed(3)}m (${worstRestDepth.label}), `
  + `action clearance=${worstActionDepth.value.toFixed(3)}m (${worstActionDepth.label}), `
  + `weapon frame=${(worstWeaponFrame.value * 100).toFixed(1)}% (${worstWeaponFrame.label}), `
  + `glove frame=${(worstGlove.value * 100).toFixed(1)}% (${worstGlove.label}); `
  + `30/60/144Hz blends match, ADS bob=${Math.max(...adsStability.map((s) => s.bob)).toFixed(4)}m, `
  + `ADS sway=${Math.max(...adsStability.map((s) => s.sway)).toFixed(4)}rad, `
  + `landing=${softLanding.toFixed(2)}x/${hardLanding.toFixed(2)}x`,
);
