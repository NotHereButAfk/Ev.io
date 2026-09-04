import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ARMOR_SKINS } from '../src/player/ArmorSkins.js';
import { resolveViewmodelPalette } from '../src/player/PreviewCharacter.js';

assert.equal(new Set(ARMOR_SKINS.map((skin) => skin.id)).size, ARMOR_SKINS.length,
  'character skin ids must be unique');
assert.ok(ARMOR_SKINS.length >= 8, 'character catalog should not regress to an empty shell');
assert.equal(ARMOR_SKINS.filter((skin) => skin.starter).length, 2,
  'guest inventory should expose two starter finishes');
assert.ok(ARMOR_SKINS.some((skin) => skin.theme === 'ears'));
assert.ok(ARMOR_SKINS.some((skin) => skin.theme === 'horns'));
assert.ok(ARMOR_SKINS.some((skin) => skin.theme === 'crown'));
assert.ok(ARMOR_SKINS.some((skin) => skin.theme === 'bone'));

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const starter = ARMOR_SKINS.find((skin) => skin.id === 'cobalt_circuit');
assert.ok(starter && luminance(starter.primary) >= 0.65,
  'default character must retain a bright readable outer shell');
assert.ok(luminance(starter.secondary) <= 0.15,
  'default character must retain a dark flexible undersuit');
assert.ok(starter.emissive !== starter.primary,
  'default character must retain a distinct energy accent');
assert.ok(starter.roughness >= 0.7 && starter.metalness <= 0.15,
  'default character must retain the arena-compatible matte finish');
assert.ok(starter.emissiveIntensity <= 0.6,
  'default character accent must not overpower the arena lighting');

for (const skin of ARMOR_SKINS) {
  for (const field of ['primary', 'secondary', 'emissive']) {
    assert.ok(Number.isInteger(skin[field]) && skin[field] >= 0 && skin[field] <= 0xffffff,
      `${skin.id}.${field} must be a valid RGB hex`);
  }
  assert.equal(skin.shield, 0, `${skin.id} must remain cosmetic-only`);

  const view = resolveViewmodelPalette(null, 'vanguard', skin);
  const bodyPlate = new THREE.Color(skin.primary).multiplyScalar(0.92).getHex();
  const bodySleeve = new THREE.Color(skin.secondary)
    .lerp(new THREE.Color(0x4b5766), 0.42).getHex();
  const bodyGlove = new THREE.Color(skin.secondary)
    .lerp(new THREE.Color(0x303844), 0.28).multiplyScalar(0.72).getHex();
  assert.equal(view.plate, bodyPlate, `${skin.id} FPS plate differs from the third-person body`);
  assert.equal(view.sleeve, bodySleeve, `${skin.id} FPS sleeve differs from the third-person body`);
  assert.equal(view.glove, bodyGlove, `${skin.id} FPS glove differs from the third-person body`);
  assert.equal(view.accent, skin.emissive,
    `${skin.id} FPS accent differs from the third-person body`);
}

console.log(`ok   ${ARMOR_SKINS.length} character finishes, 2 starter skins, 4 themed silhouettes`);
