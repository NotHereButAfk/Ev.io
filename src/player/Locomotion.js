// ═══════════════════════════════════════════════════════════════════════════
// Walk / run cycle for the low-poly rigs — one implementation shared by the
// bots and the third-person player body, so they can't drift apart.
//
// The stride is driven off a single phase `t`. Per leg (right runs half a cycle
// behind the left):
//
//   thigh   swings sin(t)
//   knee    flexes through the SWING half (cos(p) > 0) so the foot clears the
//           floor, and keeps a few degrees of bend in stance so it never locks
//   ankle   keeps the sole level with the ground through stance, kicks into a
//           toe-off at the end of it, then dorsiflexes to clear during swing
//
// Plus the two things that sell it from outside the legs, returned for the
// caller to apply to the body transform:
//
//   bob     the pelvis drops when the legs are at full spread (they physically
//           have to — without it the feet skate above the floor)
//   lean    into the run, scaled by speed
//
// and `swing`, the matching rifle pitch, phase-locked to the bob so the weapon
// rides the stride instead of floating (feed it to applyRifleCarry).
// ═══════════════════════════════════════════════════════════════════════════

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Fraction of the geometric step length the pose actually converts into ground
// covered. Calibrated by measuring how far the PLANTED foot drifts in world
// space per frame and driving that to zero — the direct test for skating.
const STEP_EFFICIENCY = 0.88;

// ── leg geometry, straight off the low-poly model ────────────────────────────
const HIP_Y = 1.21, KNEE_Y = 0.62, ANKLE_Y = 0.27;
const THIGH_L = HIP_Y - KNEE_Y;      // 0.59
const SHIN_L  = KNEE_Y - ANKLE_Y;    // 0.35
// The two corners of the sole that can touch down, in ankle-local space.
const HEEL_Y = -0.27, HEEL_Z =  0.10;
const TOE_Y  = -0.27, TOE_Z  = -0.20;

// A sole corner's position, walking the chain ankle → knee → hip → lean.
// Only y and z matter (every joint here is a pitch about X).
const _sole = { y: 0, z: 0 };
function solePos(py, pz, thigh, knee, ankle, lean) {
  let y = py, z = pz, c, s;
  c = Math.cos(ankle); s = Math.sin(ankle);
  [y, z] = [y * c - z * s, y * s + z * c];
  y -= SHIN_L;
  c = Math.cos(knee); s = Math.sin(knee);
  [y, z] = [y * c - z * s, y * s + z * c];
  y -= THIGH_L;
  c = Math.cos(thigh); s = Math.sin(thigh);
  [y, z] = [y * c - z * s, y * s + z * c];
  y += HIP_Y;
  _sole.y = y * Math.cos(lean) - z * Math.sin(lean);
  _sole.z = y * Math.sin(lean) + z * Math.cos(lean);
  return _sole;
}
function soleY(py, pz, thigh, knee, ankle, lean) {
  return solePos(py, pz, thigh, knee, ankle, lean).y;
}

// How far the planted foot travels from the front of its stance to the back —
// i.e. how much ground ONE step actually covers.
//
// Sampled rather than solved at the extremes, and tracking whichever sole
// corner is LOWEST at each sample, because that's the corner touching the
// ground: the contact point migrates heel→toe across stance as the ankle
// rolls. Measuring only the toe overestimates the step by ~30%, which sets the
// stride rate too slow and puts the feet right back to skating.
function stepLength(amp, kAmp, kneeBase, cHip, run) {
  let lo = Infinity, hi = -Infinity;
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const p = Math.PI / 2 + (i / N) * Math.PI;        // stance half-cycle
    const thigh = amp * Math.sin(p) + cHip;
    const knee  = -kAmp * Math.max(0, Math.cos(p)) + kneeBase;
    const ank   = ankleAngle(thigh, knee, p, run);
    const h = solePos(HEEL_Y, HEEL_Z, thigh, knee, ank, 0);
    const hy = h.y, hz = h.z;                          // copy: solePos reuses one object
    const t = solePos(TOE_Y, TOE_Z, thigh, knee, ank, 0);
    const z = t.y < hy ? t.z : hz;
    if (z < lo) lo = z;
    if (z > hi) hi = z;
  }
  return hi - lo;
}

// How far to drop the body so whichever sole corner is lowest sits ON the floor.
// Solving this instead of hand-tuning a bob curve means the feet plant correctly
// at ANY stride amplitude or lean — no constant to re-tune per speed.
function groundBob(thighL, kneeL, ankleL, thighR, kneeR, ankleR, lean) {
  let lo = Infinity;
  for (const [th, kn, an] of [[thighL, kneeL, ankleL], [thighR, kneeR, ankleR]]) {
    lo = Math.min(lo, soleY(HEEL_Y, HEEL_Z, th, kn, an, lean),
                      soleY(TOE_Y,  TOE_Z,  th, kn, an, lean));
  }
  return -lo;
}

// Frame-rate-independent ease toward a target on one channel.
function ease(joint, tgt, k) {
  if (joint) joint.rotation.x += (tgt - joint.rotation.x) * k;
}

// Where the ankle has to be for the sole to sit flat on the ground, given how
// far the rest of the leg has rotated away from vertical.
function ankleAngle(thigh, knee, p, run) {
  const stance  = Math.max(0, -Math.cos(p));         // 1 through mid-stance
  const flat    = -(thigh + knee);                   // cancel the leg's rotation
  const clear   = 0.20;                              // toes up to clear in swing
  // Late stance (leg behind AND still planted) is the push-off.
  const toeOff  = -Math.max(0, -Math.sin(p)) * Math.max(0, -Math.cos(p));
  return stance * flat + (1 - stance) * clear + toeOff * (0.45 + 0.45 * run);
}

/**
 * Drive a rigged body's legs, and report what the torso should do.
 *
 * @param {object} rig  { legL, legR, kneeL, kneeR, ankleL, ankleR }
 * @param {object} o    { speed (m/s), moving, run (0=walk … 1=sprint),
 *                        crouch (0..1), dt }
 *   The stride PHASE is owned here and derived from `speed` — callers must not
 *   advance their own clock, or the feet skate. Read it back as `.phase`.
 * @returns {{bob:number, lean:number, swing:number}}
 *   bob   metres to drop the body by (≤ 0)
 *   lean  radians for the body's local pitch (already eased — ASSIGN it, do
 *         not ease it again, or it stops agreeing with `bob`)
 *   swing radians of common-mode shoulder pitch for the rifle carry
 */
export function applyWalkCycle(rig, o = {}) {
  if (!rig) return { bob: 0, lean: 0, swing: 0, phase: 0 };
  const dt     = o.dt ?? 1 / 60;
  const run    = clamp01(o.run || 0);
  const speed  = Math.max(0, o.speed || 0);
  const moving = !!o.moving;
  if (rig._walkT === undefined) rig._walkT = Math.random() * Math.PI * 2;

  // Crouching just means deeper knees and a hip tuck. The body height falls out
  // of the ground solve below on its own — no separate crouch offset to keep in
  // sync, which is the whole reason the drop is solved rather than tuned.
  const crouch = clamp01(o.crouch || 0);
  const cKnee  = -1.05 * crouch;
  const cHip   =  0.55 * crouch;

  const amp  = 0.50 + 0.38 * run;   // thigh swing
  const kAmp = 0.95 + 0.55 * run;   // knee flex through the swing phase

  // ── Lock the stride to the ground ──────────────────────────────────────────
  // The cycle rate is DERIVED from how far one step actually carries the foot,
  // so the planted foot stays put in the world while the body moves over it.
  // Picking a rate independently (which every caller used to do) makes the feet
  // skate — at 6.2 m/s the legs were cancelling only 22% of the body's motion,
  // which reads exactly like moonwalking.
  // The analytic step is the ideal; the pose delivers a fraction of it (the
  // ankle roll moves the contact point, and the swing foot overlaps stance at
  // the ends). Calibrated against measured planted-foot drift — see the
  // constant's definition.
  const step = Math.max(0.25, stepLength(amp, kAmp, -0.10 + cKnee, cHip, run) * STEP_EFFICIENCY);
  rig._walkT += moving ? (Math.PI * Math.max(speed, 0.4) / step) * dt : dt * 1.2;
  const t = rig._walkT;

  // Blend between standing and striding, then ASSIGN. The stride must not be
  // run through a per-frame ease: easing a sinusoid attenuates and phase-shifts
  // it, so the realized step comes out ~16% shorter than the one the rate was
  // solved for, and the feet skate again. Only the stand↔stride transition is
  // smoothed, which is the part that actually needs it.
  rig._moveBlend = (rig._moveBlend || 0) + ((moving ? 1 : 0) - (rig._moveBlend || 0)) * Math.min(1, dt * 7);
  const mb = rig._moveBlend;
  const mix = (a, b) => a + (b - a) * mb;

  const sThigh = cHip, sKnee = -0.07 + cKnee, sAnk = 0.02 + 0.5 * crouch;
  const wThighL =  amp * Math.sin(t) + cHip;
  const wThighR = -amp * Math.sin(t) + cHip;
  const wKneeL  = -kAmp * Math.max(0,  Math.cos(t)) - 0.10 + cKnee;
  const wKneeR  = -kAmp * Math.max(0, -Math.cos(t)) - 0.10 + cKnee;

  const thighL = mix(sThigh, wThighL), thighR = mix(sThigh, wThighR);
  const kneeL  = mix(sKnee,  wKneeL),  kneeR  = mix(sKnee,  wKneeR);
  const ankleL = mix(sAnk, ankleAngle(wThighL, wKneeL, t,            run));
  const ankleR = mix(sAnk, ankleAngle(wThighR, wKneeR, t + Math.PI,  run));

  if (rig.legL)   rig.legL.rotation.x   = thighL;
  if (rig.legR)   rig.legR.rotation.x   = thighR;
  if (rig.kneeL)  rig.kneeL.rotation.x  = kneeL;
  if (rig.kneeR)  rig.kneeR.rotation.x  = kneeR;
  if (rig.ankleL) rig.ankleL.rotation.x = ankleL;
  if (rig.ankleR) rig.ankleR.rotation.x = ankleR;

  // Negative = forward. Kept shallow: a walk barely leans, only a real sprint
  // pitches in noticeably. Eased HERE rather than by the caller, because the
  // ground solve below has to run against the lean that actually gets applied —
  // solving for the target while the body eases toward it drifts the feet.
  const leanTarget = (-(0.03 + 0.13 * run) * mb) - 0.10 * crouch;
  rig._lean = (rig._lean || 0) + (leanTarget - (rig._lean || 0)) * Math.min(1, dt * 6);
  const lean = rig._lean;
  const bob = groundBob(thighL, kneeL, ankleL, thighR, kneeR, ankleR, lean);

  return {
    bob, lean, phase: t,
    // Rifle lifts as the pelvis drops (i.e. away from the chest, not into it),
    // fading to a breathing idle when standing.
    swing: mb * -(0.028 + 0.022 * run) * Math.cos(t * 2)
         + (1 - mb) * Math.sin(t * 0.28) * 0.018,
  };
}
