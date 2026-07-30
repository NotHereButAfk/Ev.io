import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  bodyForwardAtYaw,
  cameraYawToBodyYaw,
  directionToBodyYaw,
} from '../src/player/Facing.js';

const EPS = 1e-8;
const near = (a, b, eps = EPS) => Math.abs(a - b) <= eps;
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};

// Camera yaw zero looks down world -Z. All cardinal camera headings must match
// the model's local -Z forward after conversion.
for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
  const bodyYaw = cameraYawToBodyYaw(yaw);
  const forward = bodyForwardAtYaw(bodyYaw);
  assert(near(forward.x, -Math.sin(yaw)), `camera yaw ${yaw}: x inverted`);
  assert(near(forward.z, -Math.cos(yaw)), `camera yaw ${yaw}: z inverted`);
}

// A movement-derived yaw starts from atan2(dx, dz), which describes local +Z.
// directionToBodyYaw must rotate local -Z onto the requested world vector.
for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1]]) {
  const len = Math.hypot(dx, dz);
  const forward = bodyForwardAtYaw(directionToBodyYaw(dx, dz));
  assert(near(forward.x, dx / len), `direction ${dx},${dz}: x inverted`);
  assert(near(forward.z, dz / len), `direction ${dx},${dz}: z inverted`);
}

// Prove the assumption against the actual soldier asset. During the planted
// portion of its walk cycle the foot moves toward +Z beneath the body, so the
// body's travel/visual-forward direction is -Z.
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
};

const bytes = fs.readFileSync(new URL('../public/soldier.glb', import.meta.url));
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(buffer, '', resolve, reject);
});
const walk = gltf.animations.find((clip) => clip.name === 'Walk');
assert(walk, 'soldier.glb is missing its Walk clip');

const mixer = new THREE.AnimationMixer(gltf.scene);
mixer.clipAction(walk).play();
const foot = gltf.scene.getObjectByName('mixamorigLeftToeBase')
  || gltf.scene.getObjectByName('mixamorigLeftFoot');
assert(foot, 'soldier.glb is missing its left foot bones');

const samples = [];
const point = new THREE.Vector3();
for (let i = 0; i <= 120; i++) {
  mixer.setTime(walk.duration * i / 120);
  gltf.scene.updateMatrixWorld(true);
  foot.getWorldPosition(point);
  samples.push({ y: point.y, z: point.z });
}
const minY = Math.min(...samples.map((sample) => sample.y));
const maxY = Math.max(...samples.map((sample) => sample.y));
const plantedCutoff = minY + (maxY - minY) * 0.30;
let plantedDz = 0;
let plantedSegments = 0;
for (let i = 1; i < samples.length; i++) {
  if (samples[i - 1].y < plantedCutoff && samples[i].y < plantedCutoff) {
    plantedDz += samples[i].z - samples[i - 1].z;
    plantedSegments++;
  }
}
assert(plantedSegments >= 20, 'walk clip did not expose a stable planted phase');
assert(plantedDz > 0.25, `walk clip forward-axis proof inverted (${plantedDz.toFixed(3)})`);

console.log(
  `facing check passed: camera/network/bot yaw agree; soldier planted-foot dz=${plantedDz.toFixed(3)} (+Z), body forward=-Z`
);
