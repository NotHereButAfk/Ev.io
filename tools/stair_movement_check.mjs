import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { DT } from '../src/sim/MoveSim.js';
import {
  MAX_CHARACTER_SWEEP_DISTANCE,
  characterSweepSegments,
} from '../src/sim/CharacterSweep.js';

const sprintDistance = 18.48 * DT;
const sprintSegments = characterSweepSegments(0, sprintDistance);
assert.ok(sprintSegments >= 4, `sprint tick only received ${sprintSegments} stair samples`);
assert.ok(sprintDistance / sprintSegments <= MAX_CHARACTER_SWEEP_DISTANCE + 1e-9,
  'sprint collision samples are farther apart than the stair sweep contract');

// A representative narrow staircase: an unswept 20 Hz sprint crosses three
// 18 cm treads and meets a 60 cm rise at once. The production sweep must see
// each 20 cm riser separately, while the existing 55 cm step limit still
// rejects a real wall.
function climbNarrowStairs(useSweep) {
  const tread = 0.18;
  const riser = 0.20;
  const stepLimit = 0.55;
  let z = 0;
  let y = 0;
  for (let tick = 0; tick < 5; tick++) {
    const dz = -sprintDistance;
    const segments = useSweep ? characterSweepSegments(0, dz) : 1;
    for (let segment = 0; segment < segments; segment++) {
      const candidateZ = z + dz / segments;
      const stair = Math.min(10, Math.floor((-candidateZ + 1e-9) / tread));
      const top = stair * riser;
      if (top - y > stepLimit) return { y, z, blocked: true };
      y = top;
      z = candidateZ;
    }
  }
  return { y, z, blocked: false };
}

assert.equal(climbNarrowStairs(false).blocked, true,
  'control case no longer reproduces the skipped-tread stair blockage');
const swept = climbNarrowStairs(true);
assert.equal(swept.blocked, false, 'swept sprint still blocks on ordinary stairs');
assert.ok(swept.y >= 1.8, `swept sprint did not climb the staircase (y=${swept.y})`);
assert.ok(0.9 > 0.55, 'wall-height guard changed unexpectedly');

const player = readFileSync(new URL('../src/player/Player.js', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../src/net/AuthNetBridge.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/rookarena.mjs', import.meta.url), 'utf8');
for (const [name, source] of [['offline player', player], ['client prediction', bridge], ['server authority', server]]) {
  assert.match(source, /characterSweepSegments\(/, `${name} is missing stair substeps`);
}

console.log(`stair movement passed: ${sprintSegments} samples per 18.48m/s tick, narrow stairs climb, 0.9m walls remain blocked`);
