#!/usr/bin/env node

import assert from 'node:assert/strict';
import { getMode } from '../src/core/GameModes.js';
import { AuthRoom } from '../server/authroom.mjs';
import {
  MATCH_DURATION_MS,
  MATCH_EPOCH_MS,
  continuousMatchState,
} from '../server/matchclock.mjs';

assert.equal(MATCH_DURATION_MS, 180_000, 'public deathmatch must last three minutes');
assert.equal(getMode('deathmatch').timeLimit * 1000, MATCH_DURATION_MS,
  'client and authoritative server deathmatch lengths diverged');

const now = MATCH_EPOCH_MS + MATCH_DURATION_MS * 247 + 42_000;
const state = continuousMatchState(now, 3);
assert.equal(state.matchStart, MATCH_EPOCH_MS + MATCH_DURATION_MS * 247);
assert.equal(state.remainingMs, MATCH_DURATION_MS - 42_000);
assert.equal(state.arenaIndex, 247 % 3);

const arenas = [0, 1, 2].map((index) => ({
  id: `clock-${index}`, name: `Clock ${index}`, region: 'test', half: 20, killY: -20,
  noBaseFloor: false, platforms: [], boxes: [], gravLifts: [], teleporters: [],
  pickups: [], spawns: [[0, 0, 0]], groundHeightAt: () => 0,
  raycast: (_ox, _oy, _oz, _dx, _dy, _dz, far) => far,
}));
const beforeRestart = new AuthRoom(arenas, { now, lootSeed: 1 });
const afterRestart = new AuthRoom(arenas, { now: now + 1_000, lootSeed: 1 });
assert.equal(afterRestart.matchStart, beforeRestart.matchStart,
  'server restart reset the active round clock');
assert.equal(afterRestart.arena.id, beforeRestart.arena.id,
  'server restart reset the active map rotation');

const nextStart = beforeRestart.matchStart + MATCH_DURATION_MS;
assert.equal(beforeRestart._rotateMatch(nextStart + 5), true,
  'continuous room did not advance at the global round boundary');
assert.equal(beforeRestart.matchStart, nextStart,
  'round rotation drifted away from the fixed wall-clock cadence');
assert.equal(beforeRestart._arenaIndex, (state.arenaIndex + 1) % arenas.length);

console.log('match clock passed: three-minute rounds survive restarts and rotate continuously');
