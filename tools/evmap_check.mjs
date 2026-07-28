import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseEvMap } from '../src/world/EvMapLoader.js';

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

console.log(
  `ok   Daytime Rook ${bytes.length.toLocaleString()} bytes, `
  + `${map.geometries.length} geometries, ${map.materials.length} materials, `
  + `${map.playerSpawns.length} spawns`,
);
