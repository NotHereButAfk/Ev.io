#!/usr/bin/env node

import assert from 'node:assert/strict';
import { countAuthoritativePlayers, countLocalMatchPlayers } from '../src/core/Population.js';
import { ServerSim } from '../src/core/ServerSim.js';

const bots = Array.from({ length: 7 }, (_, index) => ({
  isHumanSlot: index < 3,
  displayName: index < 3 ? `Human ${index + 1}` : `Bot ${index - 2}`,
}));

assert.equal(countLocalMatchPlayers(bots), 8, 'seven bots plus the local human must count as eight players');
assert.equal(countAuthoritativePlayers([
  { id: 1, isBot: false },
  { id: 2, isBot: true },
  { id: 3, isBot: true },
]), 3, 'authoritative bots must count exactly like authoritative humans');
assert.equal(countAuthoritativePlayers([]), 1, 'the pre-snapshot HUD must retain the local player');

let displayed = null;
const sim = new ServerSim({
  maxPlayers: 8,
  botManager: { bots, count: bots.length },
  hud: { setServerPop: (count, max) => { displayed = { count, max }; } },
});
sim.start();
assert.deepEqual(displayed, { count: 8, max: 8 }, 'offline HUD must include every bot slot');

console.log('player population passed: bots occupy player slots in local and authoritative rosters');
