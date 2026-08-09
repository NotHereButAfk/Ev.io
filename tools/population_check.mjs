#!/usr/bin/env node

import assert from 'node:assert/strict';
import { countAuthoritativePlayers, countLocalMatchPlayers } from '../src/core/Population.js';
import { ServerSim } from '../src/core/ServerSim.js';
import { AuthRoom } from '../server/authroom.mjs';
import { ROOK } from '../server/rookarena.mjs';
import { AuthClient } from '../src/net/AuthClient.js';

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

const room = new AuthRoom(ROOK, { targetPopulation: 4 });
assert.equal(room.players.size, 4, 'an authoritative room must backfill its configured slots');
assert.equal([...room.players.values()].filter((p) => p.isBot).length, 4);
let welcome = null;
const humanId = room.add((message) => { if (message.t === 'welcome') welcome = message; }, 'Human');
assert.equal(room.players.size, 4, 'a joining human must replace a bot instead of exceeding capacity');
assert.equal(welcome.players.length, 4, 'the welcome roster must immediately include bots');
assert.equal(welcome.players.filter((p) => p.isBot).length, 3);

const client = new AuthClient('unused');
client._recv(JSON.stringify(welcome));
assert.equal(client.roster.length, 4, 'the client must expose welcome population before the first snapshot');
let firePayload = null;
client.connected = true;
client.lastServerTick = 77;
client.ws = { send: (payload) => { firePayload = JSON.parse(payload); } };
client.sendFire('m4', 0.5, -0.1);
assert.equal(firePayload.viewTick, 77,
  'fire requests must identify the authoritative snapshot the shooter saw');

const before = [...room.players.values()].filter((p) => p.isBot)
  .map((p) => [p.id, p.state.px, p.state.pz]);
for (let i = 0; i < 40; i++) room.update();
assert.ok(before.some(([id, x, z]) => {
  const p = room.players.get(id);
  return p && Math.hypot(p.state.px - x, p.state.pz - z) > 0.1;
}), 'server bots must actively move rather than filling the roster as inert labels');

for (let i = 0; i < 3; i++) room.add(() => {}, `Human ${i + 2}`);
let fullReply = null;
assert.equal(room.add((message) => { fullReply = message; }, 'Overflow'), null,
  'an extra join must not push a full human room beyond its advertised capacity');
assert.equal(fullReply?.reason, 'match full');
assert.equal(room.players.size, 4);
room.remove(humanId);
assert.equal(room.players.size, 4, 'a vacated human slot must be backfilled by a bot');
assert.equal([...room.players.values()].filter((p) => p.isBot).length, 1);

console.log('player population passed: active bots occupy local, welcome, snapshot, and backfill slots');
