#!/usr/bin/env node
// Does the gun point where the bullets go?
//
// It did not. Three bodies carry a rifle — your own third-person body, the
// network avatars of everyone else, and the bots — and each owned its own
// idea of how much of the shooter's aim to show:
//
//   bots           no pitch at all; the rifle sat at -1.1° at every angle,
//                  so one shooting up at a balcony aimed at the floor
//   you + remotes  0.62 of the real pitch, so looking up 60° drew the gun at
//                  36°, a 24° lie that got worse the steeper you aimed
//
// The conversion now lives in applyRifleCarry() and the callers pass the raw
// angle, which is what stops them drifting apart again. This measures the
// result off the actual pose, and checks the callers still hand it over.

import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import {
  applyRifleCarry, GRIP_LOCAL, HANDGUARD_LOCAL, AIM_PITCH_LIMIT,
} from '../src/player/RifleCarry.js';
import { adsMountY, viewmodelZ } from '../src/weapons/WeaponSystem.js';

const R2D = 180 / Math.PI, D2R = Math.PI / 180;
let fails = 0;
const ok = (c, msg, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${msg}${detail ? '   ' + detail : ''}`);
};

// A real transform hierarchy, so the hands are read the way the renderer would
// read them rather than re-derived from the IK's own intermediate maths.
const root = new THREE.Object3D();
const mkArm = (x) => {
  const sh = new THREE.Object3D(); sh.position.set(x, 1.76, 0); root.add(sh);
  const el = new THREE.Object3D(); el.position.set(0, -0.48, 0); sh.add(el);
  const hd = new THREE.Object3D(); hd.position.set(0, -0.385, 0); el.add(hd);
  return { sh, el, hd };
};
const R = mkArm(0.27), L = mkArm(-0.27);
const rig = { armR: R.sh, elbowR: R.el, armL: L.sh, elbowL: L.el };
const weapon = new THREE.Object3D(); root.add(weapon);
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _h = new THREE.Vector3();

function pose(o) {
  applyRifleCarry(rig, weapon, o.aim ?? 1, 1 / 60, o);
  root.updateMatrixWorld(true);
  _d.set(0, 0, -1).applyQuaternion(weapon.quaternion);
  return {
    elev: Math.asin(THREE.MathUtils.clamp(_d.y, -1, 1)) * R2D,
    gripErr: R.hd.getWorldPosition(_h)
      .distanceTo(_t.copy(GRIP_LOCAL).applyQuaternion(weapon.quaternion).add(weapon.position)),
    guardErr: L.hd.getWorldPosition(_h)
      .distanceTo(_t.copy(HANDGUARD_LOCAL).applyQuaternion(weapon.quaternion).add(weapon.position)),
  };
}

// Torso as an upright capsule and the head as a sphere, both a shade larger
// than the real mesh so the answer errs toward complaining.
const TORSO = { y0: 1.05, y1: 1.72, r: 0.185 }, HEAD = { y: 2.03, r: 0.135 };
function intrusion() {
  let worst = 0;
  const p = new THREE.Vector3();
  for (let i = 0; i <= 60; i++) {
    p.set(0, -0.06, 0.30 + (-0.75) * (i / 60))
      .applyQuaternion(weapon.quaternion).add(weapon.position);
    const cy = Math.min(TORSO.y1, Math.max(TORSO.y0, p.y));
    worst = Math.max(worst, TORSO.r - Math.hypot(p.x, p.y - cy, p.z));
    worst = Math.max(worst, HEAD.r - Math.hypot(p.x, p.y - HEAD.y, p.z));
  }
  return Math.max(0, worst);
}

// The full range the player can actually look through — Player.js clamps its
// pitch at ±(PI/2 − 0.05), so nothing inside this should be cut short.
const SWEEP = [-87, -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 87];

console.log('\nshouldered — muzzle elevation against the angle it was asked for');
let worstErr = 0, worstGrip = 0, worstGuard = 0, worstIn = 0;
for (const deg of SWEEP) {
  const r = pose({ aimPitch: deg * D2R });
  const err = Math.abs(r.elev - deg);
  worstErr = Math.max(worstErr, err);
  worstGrip = Math.max(worstGrip, r.gripErr);
  worstGuard = Math.max(worstGuard, r.guardErr);
  worstIn = Math.max(worstIn, intrusion());
}
ok(worstErr < 0.15, 'the muzzle lands on the angle asked for, across ±87°',
   `worst ${worstErr.toFixed(3)}°`);
ok(worstGrip < 0.01 && worstGuard < 0.01, 'both hands stay ON the gun through the sweep',
   `grip ${(worstGrip * 100).toFixed(2)} cm, handguard ${(worstGuard * 100).toFixed(2)} cm`);
ok(worstIn <= 0, 'the rifle never passes through the shooter',
   `deepest ${(worstIn * 100).toFixed(2)} cm`);

// The limit has to cover the reachable look range, or steep shots read short.
ok(AIM_PITCH_LIMIT >= Math.PI / 2 - 0.05,
   'the aim limit covers the whole range a player can look through',
   `${AIM_PITCH_LIMIT.toFixed(2)} rad vs ${(Math.PI / 2 - 0.05).toFixed(2)} needed`);

console.log('\nthe body\'s own run lean does not steer the shot');
{
  let worst = 0;
  for (const lean of [-0.16, -0.08, 0, 0.08]) {
    for (const deg of [-45, 0, 30, 60]) {
      const r = pose({ aimPitch: deg * D2R, bodyPitch: lean });
      // The weapon hangs off the body, so the body's lean adds to whatever the
      // pose produces — the muzzle in WORLD terms is elev + lean.
      worst = Math.max(worst, Math.abs((r.elev + lean * R2D) - deg));
    }
  }
  ok(worst < 0.15, 'leaning into a run does not tilt the muzzle off the shot',
     `worst ${worst.toFixed(3)}°`);
}

console.log('\na patrol carry is not aimed at anything');
{
  const level = pose({ aimPitch: 0, aim: 0 }).elev;
  const up    = pose({ aimPitch: 60 * D2R, aim: 0 }).elev;
  ok(Math.abs(up - level) < 0.01,
     'at aim 0 the pitch is ignored — the rifle is slung, not pointed',
     `${(up - level).toFixed(3)}° of movement`);
  const half = pose({ aimPitch: 60 * D2R, aim: 0.5 }).elev;
  const full = pose({ aimPitch: 60 * D2R, aim: 1 }).elev;
  ok(half > level + 5 && half < full - 5,
     'coming onto the shoulder brings the aim up with it',
     `slung ${level.toFixed(1)}° → half ${half.toFixed(1)}° → shouldered ${full.toFixed(1)}°`);
}

// ── the callers ──────────────────────────────────────────────────────────────
// The original bug was not bad maths, it was three call sites that each decided
// for themselves. Nothing in the pose can catch a caller that simply omits the
// angle, so check the wiring itself.
console.log('\nevery body that carries a rifle hands over its aim');
for (const [file, what] of [
  ['src/core/Game.js', 'your own third-person body'],
  ['src/player/Avatar.js', 'the copy of you other players see'],
  ['src/entities/Bot.js', 'bots'],
]) {
  const src = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  // Only the per-frame animated carry matters — a call is that one if it feeds
  // the pose its stride (`swing`). Rest-pose calls that just seat a freshly
  // built weapon have no aim to pass and are not the ones that broke.
  const calls = [];
  for (let i = src.indexOf('applyRifleCarry('); i >= 0;
       i = src.indexOf('applyRifleCarry(', i + 1)) {
    // Skip prose. The module is named in comments too, and a comment slicing
    // forward to the next `});` swallows the real call and counts it twice —
    // which would also let a mention stand in for a call that was never fixed.
    const lineStart = src.lastIndexOf('\n', i) + 1;
    if (src.slice(lineStart, i).includes('//')) continue;
    const end = src.indexOf('});', i);
    const body = end < 0 ? src.slice(i, i + 200) : src.slice(i, end);
    if (/swing:/.test(body)) calls.push(body);
  }
  ok(calls.length > 0 && calls.every(c => /aimPitch:/.test(c) && /bodyPitch:/.test(c)),
     `${what} (${file})`,
     `${calls.length} animated carry call(s), all passing aimPitch + bodyPitch`);
  // A caller pre-scaling the angle is how the 0.62 lie got in the first place.
  ok(!/PITCH_FOLLOW/.test(src), `${file} does not re-scale the aim behind the pose's back`);
}

// ── first person: down the sights ────────────────────────────────────────────
// ADS used to slide the gun to the middle of the screen and leave it at hip
// height, so at 28° of scoped FOV the muzzle sat 57% of the way to the bottom
// edge (85% on the magnum) — you aimed over the top of the weapon while the
// crosshair floated on its own.
//
// The models cannot be built in Node (they bake their textures through a 2D
// canvas), so `npm run sights` measures them in a real browser and records
// tests/sights.json. This checks the whole arsenal against that record, and
// re-derives the mount from the recorded inputs so the maths here cannot drift
// away from what was actually surveyed.
console.log('\naiming down the sights puts every gun on the crosshair');
{
  const sights = JSON.parse(
    readFileSync(new URL('../tests/sights.json', import.meta.url), 'utf8'));
  const defs = readFileSync(new URL('../src/weapons/weaponDefs.js', import.meta.url), 'utf8');

  // Every gun in the game has to be in the record. A new weapon that nobody
  // surveyed is exactly the one whose sights will be wrong.
  const ids = [...defs.matchAll(/id:\s*'([a-z0-9_]+)'/g)].map(m => m[1]);
  const melee = new Set(['knife', 'sword', 'ghammer']);
  const guns = ids.filter(id => !melee.has(id));
  const missing = guns.filter(id => !(id in sights));
  ok(missing.length === 0,
     `every gun in the arsenal has been surveyed (${guns.length})`,
     missing.length ? `missing: ${missing.join(', ')}` : `${Object.keys(sights).length} recorded`);

  let worstOff = 0, worstOffId = '', minGap = Infinity, minGapId = '', drift = 0, driftId = '';
  for (const [id, v] of Object.entries(sights)) {
    // The sight must end up ON the axis: at it for a declared aim point, just
    // inside the top edge for an inferred one. Shipped, these sat 6-15cm below.
    worstOff = Math.max(worstOff, Math.abs(v.dip));
    if (Math.abs(v.dip) === worstOff) worstOffId = id;
    if (v.rearGap < minGap) { minGap = v.rearGap; minGapId = id; }
    // Re-derive from the recorded geometry — catches the maths changing under
    // a fixture that was not re-measured.
    const y = adsMountY({ x: v.boreX, y: v.bore }, v.sightTop, v.scale, v.declared);
    const z = viewmodelZ(v.ext.backZ, v.scale);
    const d = Math.max(Math.abs(y - v.mountY), Math.abs(z - v.mountZ));
    if (d > drift) { drift = d; driftId = id; }
  }
  ok(worstOff <= 0.031,
     'the sight comes up to the camera axis on every gun',
     `worst ${(worstOff * 100).toFixed(1)} cm (${worstOffId}) — was 6-15 cm below`);
  ok(Object.values(sights).every(v => v.dip >= 0),
     'the crosshair never sits above the sight');
  ok(Object.values(sights).every(v => !v.declared || v.dip === 0),
     'a declared aim point lands exactly on the axis, with no fudge');
  ok(minGap > 0.02,
     'no stock reaches back inside the camera near plane',
     `tightest ${minGap.toFixed(3)} m (${minGapId})`);
  // The fixture stores 4-decimal values, so agreement is to within rounding —
  // a tighter bound than that would just be testing toFixed().
  ok(drift < 5e-4,
     'the shipping maths still reproduces the surveyed mount',
     `worst ${(drift * 1000).toFixed(3)} mm${driftId ? ` (${driftId})` : ''}`);

  // The scale trap: the bore and sight are measured INSIDE the scaled mount, so
  // they have to be taken through that scale. Skipping it moves the gun the
  // right way by the wrong amount, which looks plausible in a screenshot.
  ok(adsMountY({ x: 0, y: 0.078 }, 0.198, 0.74) !== adsMountY({ x: 0, y: 0.078 }, 0.198, 1),
     'the mount scale is applied, not assumed to be 1');

  // Un-measurable weapon (melee, or a model with no meshes): must not throw.
  ok(adsMountY(null, null) === -0.26 && adsMountY({ x: 0, y: 0 }, null) === -0.26,
     'a weapon with no measurable sight leaves the mount where it was');
}

console.log('\nboth viewmodel build paths measure the weapon');
{
  const src = readFileSync(new URL('../src/weapons/WeaponSystem.js', import.meta.url), 'utf8');
  const builds = src.split('buildWeaponModel(w)').length - 1;
  const measured = src.split('extent: _extentIn').length - 1;
  // The GLB finishing its load rebuilds every model. Carrying the old offsets
  // over there would un-align ADS the moment the real meshes arrived.
  ok(builds > 0 && measured === builds,
     'every place a viewmodel is built re-measures its bore and sight',
     `${measured}/${builds} build sites`);
}

console.log(fails ? `\n${fails} aim check(s) FAILED` : '\nall aim checks passed');
process.exit(fails ? 1 : 0);
