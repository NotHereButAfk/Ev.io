import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
};
const noop = () => {};
const gradient = { addColorStop: noop };
const context2d = new Proxy({}, { get(target, key) {
  if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
  if (key === 'measureText') return () => ({ width: 10 });
  return target[key] ?? (target[key] = noop);
} });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context2d }) };
const { QUATERNIUS_GUNS } = await import('../src/weapons/WeaponModels.js');

const uniqueModels = [...new Set(Object.values(QUATERNIUS_GUNS))];
for (const model of uniqueModels) {
  const url = new URL(`../public/vendor/quaternius/scifi-guns/${model}.gltf`, import.meta.url);
  if (!fs.existsSync(url)) throw new Error(`missing mapped gun ${model}.gltf`);
  const json = fs.readFileSync(url, 'utf8');
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(json, '', resolve, reject));
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const size = bounds.getSize(new THREE.Vector3());
  let meshes = 0;
  gltf.scene.traverse((node) => { if (node.isMesh) meshes += 1; });
  if (!meshes || size.x < 0.15 || size.y < 0.05 || size.z < 0.04) {
    throw new Error(`${model} has invalid geometry: meshes=${meshes}, size=${size.toArray()}`);
  }
}
if (Object.keys(QUATERNIUS_GUNS).length !== 17) {
  throw new Error(`expected all 17 firearms to be mapped, got ${Object.keys(QUATERNIUS_GUNS).length}`);
}
console.log(`Quaternius gun pack passed: 17 firearms mapped to ${uniqueModels.length} complete authored glTF models`);
