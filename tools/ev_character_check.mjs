import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { installEvCharacter, buildEvCharacter } from '../src/player/EvCharacter.js';
import { STATURE } from '../src/player/Proportions.js';

globalThis.ProgressEvent ??= class { constructor(type, data) { Object.assign(this, { type }, data); } };
const bytes = fs.readFileSync(new URL('../public/ev-default.glb', import.meta.url));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
installEvCharacter(gltf);
const a = buildEvCharacter(), b = buildEvCharacter();
const pos = (o) => o.getWorldPosition(new THREE.Vector3());
assert(a.userData.isEvCharacter);
assert.equal(a.userData.animationActions.length, 13);
assert.equal(Object.keys(a.userData.bones).length, 52);
assert.notEqual(a.userData.bones.Bip001_Head, b.userData.bones.Bip001_Head);
assert.notEqual(a.userData.animationMixer, b.userData.animationMixer);
let meshes = 0;
a.traverse((o) => {
  if (!o.isSkinnedMesh) return;
  meshes++;
  const other = b.getObjectByName(o.name);
  assert.equal(o.geometry, other.geometry);
  assert.equal(o.geometry.userData.shared, true);
  assert.notEqual(o.material, other.material);
  assert.notEqual(o.skeleton, other.skeleton);
});
assert(meshes >= 2);
const untouched = b.userData.bones.Bip001_Pelvis.quaternion.clone();
const cases = [
  ['idle', 0, false, {}, 0],
  ['walk', 1.2, false, {}, 1],
  ['run', 6.2, true, {}, 2],
  ['shoot', 0, false, { firing: 1 }, 3],
  ['walk-shoot', 1.2, false, { firing: 1 }, 4],
  ['run-shoot', 6.2, true, { firing: 1 }, 5],
  ['crouch', 0, false, { crouch: 1 }, 7],
  ['crouch-shoot', 0, false, { crouch: 1, firing: 1 }, 8],
  ['crouch-walk', 1, false, { crouch: 1 }, 9],
  ['crouch-walk-shoot', 1, false, { crouch: 1, firing: 1 }, 10],
  ['jump-rise', 2, false, { vy: 8 }, 12, false],
  ['jump-fall', 2, false, { vy: -8 }, 12, false],
];
const results = [];
for (const [name, speed, sprint, state, clip, grounded = true] of cases) {
  const c = buildEvCharacter();
  const u = c.userData;
  u.setLocomotion(speed, grounded, sprint);
  u.setActionState({ crouch: 0, firing: 0, reload: 0, slide: 0, ...state });
  let low = Infinity, high = -Infinity;
  let muzzleZ = 0;
  for (let i = 0; i < 180; i++) {
    u.mixer.update(1 / 60);
    c.updateMatrixWorld(true);
    for (const bone of Object.values(u.bones)) {
      assert(bone.matrixWorld.elements.every(Number.isFinite), `${name}: finite bone transforms`);
      assert(Math.abs(bone.quaternion.length() - 1) < 1e-4, `${name}: unit bone rotations`);
    }
    if (i < 60 || i % 6) continue;
    const box = new THREE.Box3();
    c.traverse((o) => { if (o.isSkinnedMesh) box.union(new THREE.Box3().setFromObject(o, true)); });
    low = Math.min(low, box.min.y); high = Math.max(high, box.max.y);
    const muzzle = pos(c.getObjectByName('BIND_BULLET'));
    const grip = pos(c.getObjectByName('BIND_RIGHTHAND'));
    muzzleZ = muzzle.z - grip.z;
    assert(muzzleZ < -0.1, `${name}: muzzle faces forward -Z`);
  }
  assert.equal(u.activeAnimation, gltf.animations[clip].name, `${name}: authored animation selection`);
  if (grounded) assert(low > -0.025, `${name}: skinned feet penetrate the floor (${low})`);
  results.push({ name, low, high, cadence: u.animationCadence, stride: u.strideScale, muzzleZ });
}
const reset = buildEvCharacter();
reset.userData.setLocomotion(6, false, true, 1, 0, 1);
reset.userData.setAim(0.7, 0.4);
reset.userData.setActionState({ crouch: 1, firing: 1, reload: 0.5 });
reset.userData.triggerFire();
for (let i = 0; i < 60; i++) reset.userData.mixer.update(1 / 60);
reset.userData.triggerTeleport();
assert.equal(reset.userData.activeAnimation, gltf.animations[0].name, 'respawn returns directly to armed idle');
for (const [name, bone] of Object.entries(reset.userData.bones)) {
  const expected = b.userData.bones[name].quaternion.toArray();
  assert(bone.quaternion.toArray().every((v, i) => Math.abs(v - expected[i]) < 1e-6), `${name}: respawn clears aim/stride/action pose`);
}
assert(b.userData.bones.Bip001_Pelvis.quaternion.equals(untouched), 'animating an instance cannot move another skeleton');
console.log(JSON.stringify({ stature: STATURE, measuredSpeeds: a.userData.measuredSpeeds, states: results }, null, 2));
console.log('EV character: real asset clones, skeletons, finite animation states and forward-facing rifle passed');
