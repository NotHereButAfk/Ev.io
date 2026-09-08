import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildViewmodelArm } from '../src/player/ViewmodelArms.js';

const bytes = await readFile(new URL('../public/kyx-view-arms.glb', import.meta.url));
const { scene } = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
for (const side of ['Left', 'Right']) {
  const source = scene.getObjectByName(`KYX_ViewArm_${side}`);
  const before = new Map();
  source.traverse(mesh => {
    if (mesh.isMesh) before.set(mesh.name, Array.from(mesh.geometry.attributes.position.array));
  });
  const arm = buildViewmodelArm(side, scene);
  let moved = 0;
  arm.traverse(mesh => {
    if (!mesh.isMesh) return;
    const original = before.get(mesh.name);
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const offset = i * 3;
      const point = [positions.getX(i), positions.getY(i), positions.getZ(i)];
      assert(point.every(Number.isFinite), `${side}: invalid arm vertex`);
      if (/_Hand$/.test(mesh.name) || original[offset + 2] <= 0.18) {
        assert.deepEqual(point, original.slice(offset, offset + 3), `${side}: grip region moved`);
      } else if (point[2] > original[offset + 2]) moved++;
    }
  });
  assert(moved > 0, `${side}: shoulder continuation missing`);
  source.traverse(mesh => {
    if (mesh.isMesh) assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),
      before.get(mesh.name), `${side}: shared template mutated`);
  });
}
console.log('Authored arm continuity passed: both shoulders extended, grips and shared template unchanged');
