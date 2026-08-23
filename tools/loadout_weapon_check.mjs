#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  MAIN_WEAPON_IDS,
  MATCH_PICKUP_WEAPON_IDS,
  isMainWeaponId,
  isMatchPickupWeaponId,
} from '../src/weapons/weaponDefs.js';
import { AUTHORED_WEAPON_BY_KIND } from '../src/world/PickupLayout.js';
import { AuthRoom } from '../server/authroom.mjs';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
};
const { GUNS, Loadout } = await import('../src/core/Loadout.js');

assert.deepEqual(
  GUNS.map((weapon) => weapon.id).sort(),
  [...MAIN_WEAPON_IDS].sort(),
);
for (const id of MAIN_WEAPON_IDS) {
  Loadout.setGun(id);
  assert.equal(Loadout.getGun(), id, `${id} must be a permanent loadout choice`);
  assert.equal(isMainWeaponId(id), true);
  assert.equal(isMatchPickupWeaponId(id), false);
}
for (const id of MATCH_PICKUP_WEAPON_IDS) {
  Loadout.setGun(id);
  assert.equal(Loadout.getGun(), 'm4', `${id} must not persist as spawn equipment`);
  assert.equal(isMainWeaponId(id), false);
  assert.equal(isMatchPickupWeaponId(id), true);
}
for (const spec of AUTHORED_WEAPON_BY_KIND.values()) {
  assert.equal(isMatchPickupWeaponId(spec.id), true, `${spec.id} pad must grant a pickup-only gun`);
}

const arena = {
  id: 'loadout-proof', name: 'Loadout Proof', region: 'test', half: 60,
  killY: -25, noBaseFloor: false, platforms: [], boxes: [],
  gravLifts: [], teleporters: [], spawns: [[20, 0, 20]],
  pickups: [{ type: 'weapon', x: 0, y: 0, z: 0, markerKind: 8388608 }],
};
const room = new AuthRoom(arena);
const playerId = room.add(() => {}, 'Loadout Probe');
const player = room.players.get(playerId);

room.onInput(playerId, { seq: 1, wid: 'rpg' });
room.update();
assert.equal(player.wid, 'm4', 'server must reject a pickup gun requested away from its pad');

room.onInput(playerId, { seq: 2, wid: 'battlerifle' });
room.update();
assert.equal(player.wid, 'battlerifle', 'server must accept any of the five main guns');

Object.assign(player.state, { px: 0, py: 0, pz: 0 });
room.onInput(playerId, { seq: 3, wid: 'rpg' });
room.update();
assert.equal(player.wid, 'rpg', 'server must grant a special at its authored in-match pad');
assert.equal(player.matchWeapons.has('rpg'), true);

player.invulnerableUntil = 0;
room._kill(player);
for (let i = 0; i < 60; i++) room.update();
assert.equal(player.wid, 'm4', 'respawn must drop collected specials');
assert.equal(player.matchWeapons.size, 0, 'respawn must clear server pickup grants');

console.log(`ok  loadout: ${MAIN_WEAPON_IDS.length} main guns; ${MATCH_PICKUP_WEAPON_IDS.length} match-only guns`);
