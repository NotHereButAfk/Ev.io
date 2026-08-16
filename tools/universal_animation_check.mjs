import fs from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
};

const path = new URL('../public/vendor/quaternius/universal-animation-library.glb', import.meta.url);
const bytes = fs.readFileSync(path);
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
const names = new Set(gltf.animations.map((clip) => clip.name));
const requiredClips = [
  'Idle_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop',
  'Crouch_Idle_Loop', 'Crouch_Fwd_Loop',
  'Jump_Start', 'Jump_Loop', 'Jump_Land',
  'Pistol_Idle_Loop', 'Pistol_Shoot', 'Pistol_Reload',
];
for (const name of requiredClips) {
  if (!names.has(name)) throw new Error(`animation library is missing ${name}`);
}
const bones = new Set();
gltf.scene.traverse((node) => { if (node.isBone) bones.add(node.name); });
for (const name of ['root', 'DEF-hips', 'DEF-spine003', 'DEF-head',
  'DEF-upper_armL', 'DEF-forearmL', 'DEF-upper_armR', 'DEF-forearmR',
  'DEF-thighL', 'DEF-shinL', 'DEF-footL', 'DEF-thighR', 'DEF-shinR', 'DEF-footR']) {
  if (!bones.has(name)) throw new Error(`animation library is missing bone ${name}`);
}
console.log(`universal animations passed: ${gltf.animations.length} clips, ${bones.size} bones; locomotion, crouch, air and weapon actions present`);
