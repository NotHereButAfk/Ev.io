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

// ── leg geometry, straight off the low-poly model ────────────────────────────
const HIP_Y = 1.21, KNEE_Y = 0.62, ANKLE_Y = 0.27;
const THIGH_L = HIP_Y - KNEE_Y;      // 0.59
const SHIN_L  = KNEE_Y - ANKLE_Y;    // 0.35
// The two corners of the sole that can touch down, in ankle-local space.
const HEEL_Y = -0.27, HEEL_Z =  0.10;
const TOE_Y  = -0.27, TOE_Z  = -0.20;

// World height of a sole corner, walking the chain ankle → knee → hip → lean.
// Only y and z matter (every joint here is a pitch about X).
function soleY(py, pz, thigh, knee, ankle, lean) {
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
  return y * Math.cos(lean) - z * Math.sin(lean);
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
 * @param {object} o    { t, moving, run (0=walk … 1=sprint), crouch (0..1), dt }
 * @returns {{bob:number, lean:number, swing:number}}
 *   bob   metres to drop the body by (≤ 0)
 *   lean  radians for the body's local pitch (already eased — ASSIGN it, do
 *         not ease it again, or it stops agreeing with `bob`)
 *   swing radians of common-mode shoulder pitch for the rifle carry
 */
export function applyWalkCycle(rig, o = {}) {
  if (!rig) return { bob: 0, lean: 0, swing: 0 };
  const t   = o.t || 0;
  const dt  = o.dt ?? 1 / 60;
  const run = clamp01(o.run || 0);

  // Crouching just means deeper knees and a hip tuck. The body height falls out
  // of the ground solve below on its own — no separate crouch offset to keep in
  // sync, which is the whole reason the drop is solved rather than tuned.
  const crouch = clamp01(o.crouch || 0);
  const cKnee  = -1.05 * crouch;
  const cHip   =  0.55 * crouch;

  if (!o.moving) {
    // Settle into a relaxed stand: knees never fully locked, feet flat.
    const k = Math.min(1, dt * 6);
    ease(rig.legL, cHip, k);              ease(rig.legR, cHip, k);
    ease(rig.kneeL, -0.07 + cKnee, k);    ease(rig.kneeR, -0.07 + cKnee, k);
    ease(rig.ankleL, 0.02 + 0.5 * crouch, k);
    ease(rig.ankleR, 0.02 + 0.5 * crouch, k);
    const standLean = -0.10 * crouch;
    rig._lean = (rig._lean || 0) + (standLean - (rig._lean || 0)) * Math.min(1, dt * 6);
    return {
      bob: groundBob(rig.legL.rotation.x, rig.kneeL.rotation.x, rig.ankleL?.rotation.x || 0,
                     rig.legR.rotation.x, rig.kneeR.rotation.x, rig.ankleR?.rotation.x || 0,
                     rig._lean),
      lean: rig._lean,
      swing: Math.sin(t * 0.28) * 0.018,   // breathing
    };
  }

  const amp  = 0.50 + 0.38 * run;   // thigh swing
  const kAmp = 0.95 + 0.55 * run;   // knee flex through the swing phase
  const k    = Math.min(1, dt * 16);

  const thighL =  amp * Math.sin(t) + cHip;
  const thighR = -amp * Math.sin(t) + cHip;
  const kneeL  = -kAmp * Math.max(0,  Math.cos(t)) - 0.10 + cKnee;
  const kneeR  = -kAmp * Math.max(0, -Math.cos(t)) - 0.10 + cKnee;

  ease(rig.legL,  thighL, k);  ease(rig.legR,  thighR, k);
  ease(rig.kneeL, kneeL,  k);  ease(rig.kneeR, kneeR,  k);
  ease(rig.ankleL, ankleAngle(thighL, kneeL, t,           run), k);
  ease(rig.ankleR, ankleAngle(thighR, kneeR, t + Math.PI, run), k);

  // Negative = forward. Kept shallow: a walk barely leans, only a real sprint
  // pitches in noticeably. Eased HERE rather than by the caller, because the
  // ground solve below has to run against the lean that actually gets applied
  // — solving for the target while the body eases toward it drifts the feet.
  const leanTarget = -(0.03 + 0.13 * run) - 0.10 * crouch;
  rig._lean = (rig._lean || 0) + (leanTarget - (rig._lean || 0)) * Math.min(1, dt * 6);
  const lean = rig._lean;
  // Read the bob back off the joints we just eased into (not the targets), so
  // the body follows the legs exactly even mid-blend.
  const bob = groundBob(
    rig.legL.rotation.x, rig.kneeL.rotation.x, rig.ankleL?.rotation.x || 0,
    rig.legR.rotation.x, rig.kneeR.rotation.x, rig.ankleR?.rotation.x || 0, lean);

  return {
    bob, lean,
    // Rifle lifts as the pelvis drops (i.e. away from the chest, not into it).
    swing: -(0.028 + 0.022 * run) * Math.cos(t * 2),
  };
}
