import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildEvMapScene, parseEvMap } from '../src/world/EvMapLoader.js';
import { authoredWeaponSpecs } from '../src/world/PickupLayout.js';

const EXPECTED_SHA256 = '038d9709dfa9f3066f1c580f39f8bf181974a80a09f26b54692c99999b1d7a45';
const bytes = await readFile(new URL('../public/maps/RookLit_0.evmap', import.meta.url));
const hash = createHash('sha256').update(bytes).digest('hex');
assert.equal(hash, EXPECTED_SHA256, 'RookLit_0.evmap does not match the official node-755 download');

const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const map = parseEvMap(buffer);
assert.equal(map.bytesRead, map.byteLength, 'decoder did not consume the complete .evmap file');
assert.equal(map.geometries.length, 43);
assert.equal(map.materials.length, 23);
assert.equal(map.textures.length, 4);
assert.equal(map.playerSpawns.filter((spawn) => spawn.enabled).length, 15);
assert.deepEqual(
  map.markers.map((marker) => marker.kind),
  [524288, 8388608, 1048576, 2097152],
  'Rook authored weapon-marker kinds changed',
);
const scene = buildEvMapScene(map);
assert.deepEqual(
  scene.weaponSpawnPoints.map((point) => [
    Number(point.x.toFixed(2)),
    Number(point.y.toFixed(2)),
    Number(point.z.toFixed(2)),
    point.markerKind,
  ]),
  [
    [-40, 18.75, 64, 524288],
    [-0.5, 18, -0.75, 8388608],
    [100, 17.5, 24.02, 1048576],
    [-28.5, 10.75, -46, 2097152],
  ],
  'Rook authored weapon spawns were not mirrored into game coordinates',
);
assert.deepEqual(
  authoredWeaponSpecs(scene.weaponSpawnPoints)
    .map((spec) => [
      spec.id,
      Number(spec.position.x.toFixed(2)),
      Number(spec.position.y.toFixed(2)),
      Number(spec.position.z.toFixed(2)),
    ]),
  [
    ['boltsniper', -40, 18.75, 64],
    ['rpg', -0.5, 18, -0.75],
    ['fuelrod', 100, 17.5, 24.02],
    ['concussion', -28.5, 10.75, -46],
  ],
  'power weapons were not placed on Rook authored markers',
);

console.log(
  `ok   Daytime Rook ${bytes.length.toLocaleString()} bytes, `
  + `${map.geometries.length} geometries, ${map.materials.length} materials, `
  + `${map.playerSpawns.length} spawns`,
);
