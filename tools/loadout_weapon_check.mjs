#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  MAIN_WEAPON_IDS,
  MATCH_PICKUP_WEAPON_IDS,
  isMainWeaponId,
  isMatchPickupWeaponId,
} from '../src/weapons/weaponDefs.js';
import { AUTHORED_WEAPON_BY_KIND, randomLootSpecs } from '../src/world/PickupLayout.js';
import { MAX_PICKUP_SHIELD, SHIELD_PER_STACK } from '../src/core/ShieldConfig.js';
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

const rolled = randomLootSpecs([
  { x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 },
  { x: 16, y: 0, z: 0 }, { x: 24, y: 0, z: 0 },
], 12345);
assert.ok(rolled.some((drop) => drop.lootType === 'shield'), 'a full pad generation must include a shield');
assert.ok(rolled.some((drop) => drop.lootType === 'weapon'), 'a full pad generation must include a weapon');
for (const drop of rolled.filter((entry) => entry.lootType === 'weapon')) {
  assert.equal(isMatchPickupWeaponId(drop.gunId), true, `${drop.gunId} must be pickup-only`);
}

const arena = {
  id: 'loadout-proof', name: 'Loadout Proof', region: 'test', half: 60,
  killY: -25, noBaseFloor: false, platforms: [], boxes: [],
  gravLifts: [], teleporters: [], spawns: [[20, 0, 20]],
  pickups: [
    { type: 'weapon', x: 0, y: 0, z: 0, markerKind: 8388608 },
    { type: 'weapon', x: 8, y: 0, z: 0, markerKind: 524288 },
  ],
};
const room = new AuthRoom(arena, { lootSeed: 7 });
const playerId = room.add(() => {}, 'Loadout Probe');
const player = room.players.get(playerId);

room.onInput(playerId, { seq: 1, wid: 'rpg' });
room.update();
assert.equal(player.wid, 'm4', 'server must reject a pickup gun requested away from its pad');

room.onInput(playerId, { seq: 2, wid: 'battlerifle' });
room.update();
assert.equal(player.wid, 'battlerifle', 'server must accept any of the five main guns');
assert.equal(player.mainWid, 'battlerifle', 'server must remember the selected main gun across death');

const weaponPad = room.lootPads[0];
Object.assign(weaponPad, { lootType: 'weapon', gunId: 'rpg', active: true });
assert.equal(room.onPickup(playerId, { seq: 1, padId: weaponPad.padId }), false,
  'server must reject a pickup requested away from its pad');
Object.assign(player.state, { px: weaponPad.x, py: weaponPad.y, pz: weaponPad.z });
assert.equal(room.onPickup(playerId, { seq: 2, padId: weaponPad.padId }), true,
  'server must accept a random weapon at the authoritative pad');
assert.equal(player.wid, 'rpg', 'collected weapon must equip immediately');
assert.equal(player.matchWeapons.has('rpg'), true);
assert.equal(weaponPad.active, false, 'collected pad must hide for every player');
assert.equal(room.onPickup(playerId, { seq: 2, padId: weaponPad.padId }), false,
  'replayed pickup request must be ignored');

const shieldPad = room.lootPads[1];
Object.assign(shieldPad, { lootType: 'shield', gunId: undefined, active: true });
Object.assign(player.state, { px: shieldPad.x, py: shieldPad.y, pz: shieldPad.z });
assert.equal(room.onPickup(playerId, { seq: 3, padId: shieldPad.padId }), true);
assert.equal(player.shield, SHIELD_PER_STACK, 'first shield pickup must create real shield');
assert.equal(player.maxShield, SHIELD_PER_STACK);
for (let stack = 1; stack < 8; stack++) {
  shieldPad.active = true;
  room.onPickup(playerId, { seq: 3 + stack, padId: shieldPad.padId });
}
assert.equal(player.shield, MAX_PICKUP_SHIELD, 'shield pickups must stack up to the configured cap');
assert.equal(player.maxShield, MAX_PICKUP_SHIELD);

player.invulnerableUntil = 0;
room._kill(player);
for (let i = 0; i < 60; i++) room.update();
assert.equal(player.wid, 'battlerifle', 'respawn must retain the chosen main gun');
assert.equal(player.matchWeapons.size, 0, 'respawn must clear server pickup grants');
assert.equal(player.shield, 0, 'respawn must clear stacked shield pickups');
assert.equal(player.maxShield, 0, 'respawn must clear shield capacity from the previous life');

console.log(`ok  loot/loadout: ${MAIN_WEAPON_IDS.length} main guns; ${MATCH_PICKUP_WEAPON_IDS.length} random pickup guns; ${MAX_PICKUP_SHIELD} max shield`);
