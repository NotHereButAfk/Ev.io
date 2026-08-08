import assert from 'node:assert/strict';
import { ARMOR_SKINS } from '../src/player/ArmorSkins.js';

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

for (const skin of ARMOR_SKINS) {
  for (const field of ['primary', 'secondary', 'emissive']) {
    assert.ok(Number.isInteger(skin[field]) && skin[field] >= 0 && skin[field] <= 0xffffff,
      `${skin.id}.${field} must be a valid RGB hex`);
  }
  assert.equal(skin.shield, 0, `${skin.id} must remain cosmetic-only`);
}

console.log(`ok   ${ARMOR_SKINS.length} character finishes, 2 starter skins, 4 themed silhouettes`);
