import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { getWeapon } from '../src/weapons/weaponDefs.js';
import {
  advanceFireCooldown,
  scheduleNextShot,
  wantsTriggerShot,
} from '../src/weapons/FireControl.js';

function automaticShots(fps, seconds, interval) {
  let cooldown = 0;
  let shots = 0;
  const dt = 1 / fps;
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    cooldown = advanceFireCooldown(cooldown, dt);
    if (wantsTriggerShot(true, true, true) && cooldown <= 0) {
      shots++;
      cooldown = scheduleNextShot(cooldown, interval);
    }
  }
  return shots;
}

const ar = getWeapon('m4');
assert.equal(ar.magSize, 50, 'EV.IO Auto Rifle magazine must hold 50 rounds');
assert.equal(ar.spreadMin, 0, 'Auto Rifle must begin pin-accurate');
assert.equal(ar.spreadMax, 0.02, 'Auto Rifle sustained-fire bloom must cap at 0.02');
assert.equal(ar.zoomSpreadMod, 0, 'aiming must remove Auto Rifle bloom');
assert.equal(ar.muzzleSmoke, true, 'Auto Rifle must emit muzzle smoke');
assert.equal(ar.spawnShells, true, 'Auto Rifle must eject shells');

const weaponSystemSource = readFileSync(new URL('../src/weapons/WeaponSystem.js', import.meta.url), 'utf8');
const tracerRadius = Number(weaponSystemSource.match(/CylinderGeometry\((0\.\d+),\s*\1,\s*1,\s*6/)?.[1]);
const tracerSpeed = Number(weaponSystemSource.match(/TRACER_VISUAL_SPEED\s*=\s*(\d+)/)?.[1]);
const tracerFadeMs = Number(weaponSystemSource.match(/TRACER_END_FADE\s*=\s*(0\.\d+)/)?.[1]) * 1000;
assert.ok(tracerRadius >= 0.012, 'bullet tracer is too thin to remain visible in motion');
assert.ok(tracerSpeed <= 360, 'presentation tracer can still skip across the screen between frames');
assert.ok(tracerFadeMs >= 75, 'bullet tracer must linger briefly at its impact point');
assert.match(weaponSystemSource, /AdditiveBlending/, 'bullet tracer must use a readable glow blend');

let bloom = ar.spreadMin;
for (let shot = 0; shot < 12; shot++) {
  bloom = Math.max(ar.spreadMin, bloom - ar.spreadRecovery * ar.fireRate);
  bloom = Math.min(ar.spreadMax, bloom + ar.spreadBloomPerShot);
}
assert.ok(bloom > 0.015, 'sustained fire must visibly build toward maximum bloom');

assert.equal(wantsTriggerShot(false, true, false), true, 'semi-auto fires on press edge');
assert.equal(wantsTriggerShot(false, true, true), false, 'semi-auto cannot fire while held');
assert.equal(wantsTriggerShot(true, true, true), true, 'automatic keeps firing while held');

const expected = automaticShots(60, 1, ar.fireRate);
for (const fps of [30, 60, 144]) {
  assert.ok(
    Math.abs(automaticShots(fps, 1, ar.fireRate) - expected) <= 1,
    `automatic cadence drifted at ${fps}Hz`,
  );
}

// A single 180ms hitch may defer presentation by one frame, but timing debt
// must be preserved instead of resetting the entire cadence.
let cd = scheduleNextShot(-0.18, ar.fireRate);
assert.ok(cd <= 0.001, 'hitch timing debt was discarded');

console.log(`gunfeel passed: ${expected} AR rounds/s; visible tracers, ADS, bloom, smoke, shell and trigger rules verified`);
