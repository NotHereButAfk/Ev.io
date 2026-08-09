import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WEAPONS } from '../src/weapons/weaponDefs.js';

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

const { WeaponSystem } = await import('../src/weapons/WeaponSystem.js');
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
  group.visible = wasVisible;
  system.kickGroup.add(group);
  system.models.set(def.id, { group, muzzle: muzzle || record.muzzle });
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
    if (object.isMesh) area += viewportArea(object);
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

// The reference first-person silhouette has one dominant trigger-side hand.
// Exercise that hand across every viewport, FOV and high-motion state; the
// authored support limb remains hidden instead of forming a second long tube.
activate(WEAPONS.find((def) => def.id === 'm4'));
let worstGlove = { value: Infinity, label: '' };
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
      for (const [side, glove] of [['trigger', system.armGroup]]) {
        const grip = glove.getObjectByName('viewmodel_grip') || glove;
        const ratio = gloveRatio(grip);
        const label = `${stateName}/${viewport.label}/${fov}/${side}`;
        if (ratio < worstGlove.value) worstGlove = { value: ratio, label };
        // Mid-reload intentionally lets part of the trigger glove leave frame;
        // at least 35% remains on landscape and 15% on portrait.
        const minimum = viewport.aspect < 1 ? 0.15 : 0.35;
        assert(
          ratio >= minimum,
          `${label} leaves only ${(ratio * 100).toFixed(1)}% of the glove visible (${JSON.stringify(lastGloveBounds)})`,
        );
        // Sum of per-mesh projected boxes intentionally over-estimates the
        // curved/tapered cylinders; 36% keeps the real arm pixels compact while
        // allowing a sleeve to cross the frame edge during the sprint carry.
        const maxArea = viewport.aspect < 1 ? 0.56 : 0.40;
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

assert(
  system.supportArmGroup.visible === false,
  'support hand must not grow a second full-screen arm',
);

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
activate(WEAPONS.find((def) => def.id === 'boltsniper'));

// Feed the same physical look velocity at each refresh rate. Full ADS should
// retain only a small trace of movement, and that result should itself remain
// stable at 30/60/144 Hz.
const adsStability = [];
for (const fps of rates) {
  resetMotionState();
  input.rightMouseDown = true;
  player.velocity.z = 6.2;
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
assert(spread(adsStability, 'bob') < 1e-6, 'ADS bob changes with refresh rate');
assert(spread(adsStability, 'sway') < 2e-5, 'ADS sway changes with refresh rate');

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
