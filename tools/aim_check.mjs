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

console.log(fails ? `\n${fails} aim check(s) FAILED` : '\nall aim checks passed');
process.exit(fails ? 1 : 0);
