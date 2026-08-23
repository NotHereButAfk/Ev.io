import * as THREE from 'three';
import {
  MAIN_GUN_SKIN_SETS,
  WEAPON_SKINS,
  applyWeaponSkin,
  getWeaponIdForSkin,
  getWeaponSkinsFor,
  isSkinForWeapon,
} from '../src/weapons/WeaponSkins.js';
import { MAIN_WEAPON_IDS } from '../src/weapons/weaponDefs.js';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const noop = () => {};
const gradient = { addColorStop: noop };
const context2d = new Proxy({}, { get(target, key) {
  if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
  if (key === 'measureText') return () => ({ width: 10 });
  return target[key] ?? (target[key] = noop);
} });
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => context2d }),
};
assert(Object.keys(MAIN_GUN_SKIN_SETS).length === 5, 'expected five main-gun skin sets');
const assigned = [];
for (const weaponId of MAIN_WEAPON_IDS) {
  const skins = getWeaponSkinsFor(weaponId);
  assert(skins.length === 5, `${weaponId} has ${skins.length} skins instead of 5`);
  for (const skin of skins) {
    assert(isSkinForWeapon(weaponId, skin.id), `${skin.id} is not assigned to ${weaponId}`);
    assert(getWeaponIdForSkin(skin.id) === weaponId, `${skin.id} reverse assignment is wrong`);
    assigned.push(skin.id);
  }
}
assert(new Set(assigned).size === 25, 'main-gun skin assignments must be 25 unique finishes');
assert(assigned.every((id) => WEAPON_SKINS.some((skin) => skin.id === id)), 'assigned skin is missing');

// Applying every assigned finish must leave the model hierarchy, transforms,
// and vertex data untouched. Skins are material-only, never alternate meshes.
for (const skinId of assigned) {
  const skin = WEAPON_SKINS.find((entry) => entry.id === skinId);
  const geometry = new THREE.BoxGeometry(1, 0.4, 2);
  const material = new THREE.MeshStandardMaterial();
  material.userData.role = 'body';
  const mesh = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();
  group.add(mesh);
  const positions = [...geometry.attributes.position.array];
  const childCount = group.children.length;
  applyWeaponSkin(group, skin);
  assert(group.children.length === childCount, `${skinId} changed the model hierarchy`);
  assert(geometry.attributes.position.array.every((value, i) => value === positions[i]), `${skinId} changed gun geometry`);
  assert(mesh.position.length() === 0
    && mesh.rotation.x === 0 && mesh.rotation.y === 0 && mesh.rotation.z === 0,
  `${skinId} changed gun transforms`);
}

console.log('weapon skins passed: 5 unique material-only finishes for each of 5 main guns (25 total)');
