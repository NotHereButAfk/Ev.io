// Walk-cycle check — `npm run test:gait`
//
// Locks down the two things that make a character's legs look wrong, both of
// which shipped at some point and neither of which any other test would catch:
//
//   1. SKATING / MOONWALKING. The stride rate has to be derived from how far
//      one step actually carries the foot, or the feet slide along the floor.
//      This got worse the moment a body moved anything other than straight
//      forward: a strafe or a backpedal ran the forward stride, so the feet
//      travelled WITH the body (slip 1.0) or outran it (slip 1.5).
//   2. NO AIRBORNE POSE. A jump used to fall out of `moving`, so the legs eased
//      to a stand in mid-flight and the jump read as the character freezing.
//
// applyWalkCycle only reads and writes `.rotation` on the joints, so a rig of
// plain objects drives it exactly as three.js would — no browser, no renderer,
// exact 60Hz, deterministic.
//
// The forward kinematics below is deliberately a SECOND implementation. If it
// shared code with Locomotion.js it would agree with it by construction and
// check nothing. Cross-check that it is right: the lowest sole comes out at
// exactly 0mm, which is what groundBob() independently solves for.
import { applyWalkCycle } from '../src/player/Locomotion.js';

const HIP_Y = 1.21, KNEE_Y = 0.62, ANKLE_Y = 0.27;
const THIGH_L = HIP_Y - KNEE_Y, SHIN_L = KNEE_Y - ANKLE_Y;
const CORNERS = [[-0.27, 0.10], [-0.27, -0.20]];      // heel, toe in ankle space
const EPS = 0.01;                                     // soft stance weight, metres

const joint = () => ({ rotation: { x: 0, y: 0, z: 0, order: 'XYZ' } });
const newRig = () => ({ legL: joint(), legR: joint(), kneeL: joint(), kneeR: joint(),
  ankleL: joint(), ankleR: joint(), _walkT: 0, _moveBlend: 0, _lean: 0 });

// A sole corner (or, at 0,0, the ankle joint) in body-local space.
function sole(cy, cz, thigh, knee, ankle, lean, hipYaw) {
  let y = cy, z = cz, c, s;
  c = Math.cos(ankle); s = Math.sin(ankle); [y, z] = [y * c - z * s, y * s + z * c];
  y -= SHIN_L;
  c = Math.cos(knee);  s = Math.sin(knee);  [y, z] = [y * c - z * s, y * s + z * c];
  y -= THIGH_L;
  c = Math.cos(thigh); s = Math.sin(thigh); [y, z] = [y * c - z * s, y * s + z * c];
  y += HIP_Y;
  let x = 0;
  if (hipYaw) { const c2 = Math.cos(hipYaw), s2 = Math.sin(hipYaw); [x, z] = [z * s2, z * c2]; }
  const cl = Math.cos(lean), sl = Math.sin(lean);
  return { x, y: y * cl - z * sl, z: y * sl + z * cl };
}

/**
 * Walk at `speed` travelling `travelDeg` off the body's facing, and report how
 * far the loaded foot slides.
 *
 * slip = world travel of each ankle, weighted by how much of the body's weight
 * that foot is under, over the body's travel in the same interval.
 *   0 = the foot plants and the body moves over it   (correct)
 *   1 = the foot travels with the body               (feet do nothing)
 *   2 = the foot outruns the body                    (cycle runs backwards)
 *
 * The ankle rather than the contact point, because the contact point migrates
 * heel→toe as the foot rolls and a rolling foot is not a sliding one. Weighted
 * rather than gated on "which foot is lower", because that is a min over sole
 * corners and flickers where the two are close — gating on it moves the answer
 * by ±0.3 and hides real regressions.
 */
function measureSlip(speed, travelDeg, { run = 0, crouch = 0, dt = 1 / 240 } = {}) {
  const rig = newRig();
  const rad = (travelDeg * Math.PI) / 180;
  const dirF = Math.cos(rad), dirR = Math.sin(rad);    // forward is -Z, right is +X
  const opts = { speed, moving: speed > 0.6, run, crouch, dt, dirF, dirR };
  for (let i = 0; i < 960; i++) applyWalkCycle(rig, opts);   // settle the blend

  const read = (side, lean) => {
    const th = rig['leg' + side].rotation.x, kn = rig['knee' + side].rotation.x;
    const an = rig['ankle' + side].rotation.x, hy = rig['leg' + side].rotation.y || 0;
    let low = Infinity;
    for (const [cy, cz] of CORNERS) low = Math.min(low, sole(cy, cz, th, kn, an, lean, hy).y);
    return { low, ankle: sole(0, 0, th, kn, an, lean, hy) };
  };

  const ux = dirR, uz = -dirF;
  let bx = 0, bz = 0, prev = null, num = 0, den = 0, soleMin = Infinity, soleMax = -Infinity;
  const t0 = rig._walkT;
  // |Δphase|: a backpedal runs the cycle in reverse, so the phase decreases.
  for (let i = 0; i < 400000 && Math.abs(rig._walkT - t0) < Math.PI * 10; i++) {
    const g = applyWalkCycle(rig, opts);
    bx += dirR * speed * dt; bz += -dirF * speed * dt;
    const L = read('L', g.lean), R = read('R', g.lean);
    const onFloor = Math.min(L.low, R.low) + g.bob;
    soleMin = Math.min(soleMin, onFloor); soleMax = Math.max(soleMax, onFloor);
    const cur = {
      L: { x: bx + L.ankle.x, z: bz + L.ankle.z, w: 1 / (1 + Math.exp(-(R.low - L.low) / EPS)) },
      R: { x: bx + R.ankle.x, z: bz + R.ankle.z, w: 1 / (1 + Math.exp(-(L.low - R.low) / EPS)) },
    };
    if (prev) for (const s of ['L', 'R']) {
      const w = (prev[s].w + cur[s].w) / 2;
      num += w * ((cur[s].x - prev[s].x) * ux + (cur[s].z - prev[s].z) * uz);
      den += w * speed * dt;
    }
    prev = cur;
  }
  return { slip: den ? num / den : 0, soleY: [soleMin, soleMax] };
}

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log('   FAIL  ' + msg); } };

console.log('planted-foot slip  (0 = plants, 1 = feet do nothing, 2 = runs backwards)\n');
console.log('   direction          walk 6.2   sprint 9.6');
const DIRS = [[0, 'forward'], [180, 'backpedal'], [-90, 'strafe-left'], [90, 'strafe-right'],
              [135, 'back-right diag'], [45, 'fwd-right diag']];
const LIMIT = 0.25;
for (const [deg, name] of DIRS) {
  const w = measureSlip(6.2, deg, { run: 0 }).slip;
  const s = measureSlip(9.6, deg, { run: 1 }).slip;
  const bad = Math.max(Math.abs(w), Math.abs(s)) > LIMIT;
  console.log('   %s %s     %s%s', name.padEnd(16),
    w.toFixed(2).padStart(6), s.toFixed(2).padStart(6), bad ? '   <— SKATING' : '');
  check(!bad, `${name}: slip ${w.toFixed(2)}/${s.toFixed(2)} exceeds ±${LIMIT}`);
}

console.log('\ncrouch, and the sole staying on the floor');
for (const [deg, name] of [[0, 'forward'], [90, 'strafe-right']]) {
  const m = measureSlip(3.0, deg, { run: 0, crouch: 1 });
  console.log('   crouch %s slip=%s   sole %smm … %smm', name.padEnd(13), m.slip.toFixed(2),
    (m.soleY[0] * 1000).toFixed(0), (m.soleY[1] * 1000).toFixed(0));
  check(Math.abs(m.slip) <= LIMIT, `crouch ${name}: slip ${m.slip.toFixed(2)}`);
  // groundBob solves for the lowest sole sitting exactly on the floor.
  check(Math.abs(m.soleY[0]) < 1e-6 && Math.abs(m.soleY[1]) < 1e-6,
    `crouch ${name}: sole leaves the floor (${(m.soleY[0] * 1000).toFixed(1)}…${(m.soleY[1] * 1000).toFixed(1)}mm)`);
}

// ── the jump has to be a pose, not a freeze ─────────────────────────────────
console.log('\nairborne pose');
{
  const rig = newRig();
  const dt = 1 / 60;
  for (let i = 0; i < 120; i++) applyWalkCycle(rig, { speed: 6.2, moving: true, run: 0, dt, grounded: true });

  let vy = 9.5;
  const frames = [];
  for (let i = 0; i < 60; i++) {
    vy -= 20 * dt;
    const g = applyWalkCycle(rig, { speed: 6.2, moving: true, run: 0, dt, grounded: false, vy });
    // `air` defaulted, so a build that stopped reporting it fails a check
    // rather than throwing here.
    frames.push({ thigh: rig.legL.rotation.x, knee: rig.kneeL.rotation.x,
      air: g.air || 0, bob: g.bob, vy });
  }
  const spread  = Math.max(...frames.map((f) => f.thigh)) - Math.min(...frames.map((f) => f.thigh));
  const tuck    = Math.min(...frames.map((f) => f.knee));       // deepest, on the way up
  const last    = frames[frames.length - 1];
  console.log('   airborne blend reaches %s, thigh moves %s rad', last.air.toFixed(2), spread.toFixed(2));
  console.log('   knee tucks to %s rad, then unfolds to %s by the time it is falling',
    tuck.toFixed(2), last.knee.toFixed(2));
  check(last.air > 0.9, 'airborne blend never engages');
  check(spread > 0.15, `legs are frozen in mid-air (thigh moves only ${spread.toFixed(3)} rad)`);
  check(tuck < -0.9, `no knee tuck on the way up (deepest ${tuck.toFixed(2)} rad)`);
  check(last.vy < -4, 'test did not reach the falling half of the jump');
  check(last.knee > tuck + 0.3,
    `legs do not extend for the landing (knee ${tuck.toFixed(2)} → ${last.knee.toFixed(2)})`);
  check(Math.abs(last.bob) < 0.02,
    'the ground drop is still applied in mid-air (feet are tucked — nothing to stand on)');

  // landing absorb, then back to a normal stride
  const beforeLanding = rig.kneeL.rotation.x;
  let landKnee = 0;
  for (let i = 0; i < 4; i++) {
    applyWalkCycle(rig, { speed: 6.2, moving: true, run: 0, dt, grounded: true, vy: 0 });
    landKnee = Math.min(landKnee, rig.kneeL.rotation.x);
  }
  console.log('   landing knee bend %s rad (from %s)', landKnee.toFixed(2), beforeLanding.toFixed(2));
  check(landKnee < beforeLanding - 0.2, 'landing is not absorbed');
  for (let i = 0; i < 120; i++) applyWalkCycle(rig, { speed: 6.2, moving: true, run: 0, dt, grounded: true });
  check(Math.abs(applyWalkCycle(rig, { speed: 6.2, moving: true, run: 0, dt, grounded: true }).air) < 0.01,
    'airborne blend does not clear after landing');
}

// A body that never told us which way it is going (the bots) must be unchanged.
console.log('\ncallers that pass no direction default to straight ahead');
{
  const a = newRig(), b = newRig();
  a._walkT = b._walkT = 0.7;
  const dt = 1 / 60;
  for (let i = 0; i < 300; i++) {
    applyWalkCycle(a, { speed: 3.4, moving: true, run: 0.2, dt });
    applyWalkCycle(b, { speed: 3.4, moving: true, run: 0.2, dt, dirF: 1, dirR: 0 });
  }
  const same = Math.abs(a.legL.rotation.x - b.legL.rotation.x) < 1e-12 &&
               Math.abs((a.legL.rotation.y || 0) - (b.legL.rotation.y || 0)) < 1e-12;
  console.log('   omitted direction === explicit forward: %s', same);
  check(same, 'omitting dirF/dirR is not identical to travelling straight ahead');
}

console.log(failures ? `\n${failures} FAILED` : '\nall gait checks passed');
process.exit(failures ? 1 : 0);
