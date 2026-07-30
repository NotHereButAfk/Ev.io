import fs from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  dampHumanTimeScale,
  HUMAN_CLIP_SPEED,
  normalizeRootPositionValues,
  selectHumanMotion,
  targetHumanTimeScale,
} from '../src/player/HumanLocomotion.js';

const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};

assert(HUMAN_CLIP_SPEED.walk > 1.5 && HUMAN_CLIP_SPEED.walk < 2.0, 'walk calibration drifted');
assert(HUMAN_CLIP_SPEED.run > 4.0 && HUMAN_CLIP_SPEED.run < 4.6, 'run calibration drifted');
assert(selectHumanMotion(0, false, 'idle') === 'idle', 'idle threshold failed');
assert(selectHumanMotion(2.5, false, 'walk') === 'walk', 'walk selection failed');
assert(selectHumanMotion(4.2, false, 'walk') === 'run', 'run selection failed');
assert(selectHumanMotion(3.7, false, 'run') === 'run', 'run hysteresis failed');
assert(selectHumanMotion(2.0, true, 'walk') === 'run', 'sprint did not force run');

const walkRate = targetHumanTimeScale('walk', 2.5);
const runRate = targetHumanTimeScale('run', 6.2);
const sprintRate = targetHumanTimeScale('run', 10.85);
assert(walkRate > 1 && walkRate < 1.7, `walk rate is implausible (${walkRate})`);
assert(runRate > 1.3 && runRate < 1.6, `run rate is implausible (${runRate})`);
assert(sprintRate === 1.72, `sprint cadence cap changed (${sprintRate})`);

let smooth = 1;
for (let i = 0; i < 6; i++) smooth = dampHumanTimeScale(smooth, sprintRate, 1 / 60);
assert(smooth > 1 && smooth < sprintRate, 'time-scale damping snapped or stalled');

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
const hips = gltf.scene.getObjectByName('mixamorigHips');
assert(hips, 'soldier hips bone missing');
for (const clip of gltf.animations.filter((item) => ['Idle', 'Walk', 'Run'].includes(item.name))) {
  const track = clip.tracks.find((item) => /Hips\.position$/i.test(item.name));
  assert(track, `${clip.name} hips track missing`);
  const values = track.values.slice();
  const originalRange = Math.max(...values.filter((_, i) => i % 3 === 2))
    - Math.min(...values.filter((_, i) => i % 3 === 2));
  normalizeRootPositionValues(values, hips.position);
  assert(Math.abs(values[0] - hips.position.x) < 1e-5, `${clip.name} hips x not normalized`);
  assert(Math.abs(values[1] - hips.position.y) < 1e-5, `${clip.name} hips y not normalized`);
  assert(Math.abs(values[2] - hips.position.z) < 1e-5, `${clip.name} hips z not normalized`);
  const normalizedRange = Math.max(...values.filter((_, i) => i % 3 === 2))
    - Math.min(...values.filter((_, i) => i % 3 === 2));
  assert(Math.abs(originalRange - normalizedRange) < 1e-4, `${clip.name} root sway was lost`);
}

console.log(
  `human locomotion passed: walk=${walkRate.toFixed(2)}x run=${runRate.toFixed(2)}x sprint=${sprintRate.toFixed(2)}x, phase-matched and root-normalized`
);
