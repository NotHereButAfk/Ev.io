import * as THREE from 'three';
import { applyThrowArm } from './Actions.js';

// ═══════════════════════════════════════════════════════════════════════════
// Rifle carry — how a soldier actually holds the gun.
//
// Two hand-solved poses, blended by an `aim` weight (0 = relaxed, 1 = engaged):
//
//   PATROL  the real-world across-the-body carry: buttstock up in the right
//           shoulder pocket, rifle laid diagonally over the chest, muzzle
//           angled down and out to the left. What you see on a patrolling
//           soldier — the weapon is up and ready but not pointed at anything.
//   AIM     shouldered and level: stock in the shoulder, barrel straight down
//           the body's forward axis, support arm extended along the handguard.
//           What a bot/player snaps to the instant it engages.
//
// Both were solved with 2-bone IK against the low-poly rig (shoulder pivots at
// y=1.76 ±0.27, elbows at y=1.28, hands at y=0.895) so the right hand lands
// exactly on the pistol grip and the left hand on the handguard — the hands sit
// ON the weapon in both poses instead of near it.
//
// Body-local space: front = −Z, the model's right = +X, up = +Y. The weapon's
// muzzle is its own local −Z.
// ═══════════════════════════════════════════════════════════════════════════

// Grip points in weapon-local space (used by the solver; kept here as the
// contract the poses below were fitted to).
export const GRIP_LOCAL      = new THREE.Vector3(0, -0.12,  0.10);
export const HANDGUARD_LOCAL = new THREE.Vector3(0, -0.02, -0.28);
// Where the support hand goes during a reload: under the receiver, on the
// magazine well, a little behind the handguard it just left.
const MAG_LOCAL = new THREE.Vector3(0, -0.26, -0.02);

// Both were additionally swept against the body's own collision volumes so the
// rifle rides clear of the chest instead of sinking into it — pose-lab.html
// ?sweep=patrol|aim reports the deepest penetration for a candidate, and these
// two measure ZERO against the torso/pelvis/head.
const PATROL = {
  wp: new THREE.Vector3(0.058, 1.390, -0.333),
  wr: new THREE.Euler(-0.679, 0.646, 0.702),
};
const AIM = {
  wp: new THREE.Vector3(0.240, 1.538, -0.262),
  wr: new THREE.Euler(-0.020, 0, 0),
};

// ── rig metrics the IK runs against (shared by every low-poly body) ──────────
const SHOULDER_Y = 1.76, SHOULDER_X = 0.27;
const UP_ARM = 0.48;      // shoulder → elbow
const FOREARM = 0.385;    // elbow → hand centre
const REACH = (UP_ARM + FOREARM) * 0.995;

// ── where the gun POINTS ─────────────────────────────────────────────────────
// The AIM pose carries 0.020 rad of its own muzzle droop. `aimPitch` is given
// against the true horizon — the angle the shot actually leaves at — so that
// droop has to be cancelled or every body in the game aims 1.15° under its own
// bullets. Callers pass the look/shot pitch and nothing else: the conversion
// lives here so the local body, the network avatars and the bots cannot drift
// apart, which is exactly what happened when each owned its own constant (bots
// held the rifle dead level at every angle; the other two showed 62% of the
// real pitch and were up to 24° out).
const AIM_BASE_PITCH = -0.020;
// Bound on the pose, matched to the player's own look clamp (Player.js stops
// at PI/2 - 0.05) so nothing inside the reachable range is ever cut short. It
// can safely be this wide: measured across the full sweep, both hands stay on
// the gun to 0.00 cm and the rifle never crosses the torso, because the
// shouldered carry already rides outboard of it on the right shoulder. The
// 0.95 rad ceiling this replaces was not protecting against anything.
export const AIM_PITCH_LIMIT = Math.PI / 2 - 0.05;   // ~87.1°, Player.js's own clamp

// Elbow swivel about the shoulder→hand axis: where the elbow sits on the cone
// of valid solutions. Tuned to drop the trigger elbow down/back against the
// ribs and swing the support elbow out under the handguard.
const SWIVEL_R = -0.6, SWIVEL_L = 0.2;

const _qPatrol = new THREE.Quaternion().setFromEuler(PATROL.wr);
const _qAim    = new THREE.Quaternion().setFromEuler(AIM.wr);
const _q       = new THREE.Quaternion();
const _qSwing  = new THREE.Quaternion();
const _qArm    = new THREE.Quaternion();
const _qAct    = new THREE.Quaternion();
const _eAct    = new THREE.Euler();
const _pos     = new THREE.Vector3();
const _T       = new THREE.Vector3();
const _d       = new THREE.Vector3();
const _h       = new THREE.Vector3();
const _AX_X    = new THREE.Vector3(1, 0, 0);

// Two-bone IK onto a hand target. The elbow is a hinge on the limb's local X,
// the shoulder is a free rotation, and `swivel` picks a point on the cone of
// otherwise-equivalent elbow placements.
function solveArm(shoulder, elbow, sx, T, swivel) {
  if (!shoulder || !elbow) return;
  _d.set(T.x - sx, T.y - SHOULDER_Y, T.z);
  const D = Math.min(_d.length(), REACH);
  if (D < 1e-5) return;
  _d.normalize();
  const c = Math.max(-1, Math.min(1,
    (D * D - UP_ARM * UP_ARM - FOREARM * FOREARM) / (2 * UP_ARM * FOREARM)));
  const bend = Math.acos(c);                       // + folds the forearm forward
  // Where the hand sits in shoulder-local space for that bend, before the
  // shoulder rotates: straight down the limb axis, swung forward by the elbow.
  _h.set(0, -UP_ARM - FOREARM * Math.cos(bend), -FOREARM * Math.sin(bend)).normalize();
  _qArm.setFromUnitVectors(_h, _d);
  if (swivel) _qArm.premultiply(_qSwing.setFromAxisAngle(_d, swivel));
  shoulder.quaternion.copy(_qArm);
  elbow.rotation.set(bend, 0, 0);
}

/**
 * Place the rifle, then solve both arms onto it.
 *
 * The weapon transform is the single source of truth: it is interpolated
 * between the two carries and then the hands are IK'd onto the grip and the
 * handguard every frame. That means the hands are exactly on the gun at any
 * blend value, any stride phase, any recoil state — there is no pose pair to
 * drift apart, which is what happens if you interpolate arms and weapon
 * separately along their own paths.
 *
 * `swing` is the life in the pose — breathing at rest, the rifle riding the
 * stride while moving. It rotates the rifle about the shoulder line, and the
 * arms simply follow it.
 *
 * @param {object} rig     { armL, armR, elbowL, elbowR } limb pivots
 * @param {THREE.Object3D} weapon  the weapon model parented to the body (or null)
 * @param {number} aim     0 = patrol carry, 1 = shouldered and aiming
 * @param {number} dt      frame delta (seconds) — unused, kept for callers
 * @param {object} [o]     { aimPitch, swing, kick, reload, swap, flinch, throwP }
 *   `aimPitch` is where this body is SHOOTING, in radians against the horizon
 *   (positive up) — pass the look pitch, or for a bot the elevation of the ray
 *   it actually fires. Shouldered, the muzzle comes out on exactly that angle.
 *   Do not pre-scale it; the shoulder blend, the body's own lean (`bodyPitch`,
 *   pass whatever you set on the body's rotation.x) and the pose's droop are
 *   all handled here.
 *   reload/swap/flinch/throwP are 0→1 action progresses. They move the WEAPON
 *   (and, for a reload, the support hand's target on it) — never the arms
 *   directly, because the arms are IK'd onto wherever the weapon ends up and
 *   posing them here as well would just fight that solve.
 */
export function applyRifleCarry(rig, weapon, aim, dt, o = {}) {
  const a    = Math.max(0, Math.min(1, aim));
  const kick = o.kick || 0;
  const reload = o.reload || 0, swap = o.swap || 0, flinch = o.flinch || 0;
  // 0 → 1 → 0 shapes for the actions that go somewhere and come back.
  const reloadB = reload > 0 ? Math.sin(Math.PI * reload) : 0;
  const swapB   = swap   > 0 ? Math.sin(Math.PI * swap)   : 0;
  // A hit is sharp on and slow off, not symmetric.
  const flinchB = flinch > 0
    ? (flinch < 0.15 ? flinch / 0.15 : Math.pow(1 - (flinch - 0.15) / 0.85, 2)) : 0;
  // Working the bolt, a third of the way through the reload.
  const rack = reload > 0 ? Math.exp(-Math.pow((reload - 0.62) / 0.06, 2)) : 0;

  // Where the shot is going. Scaled by the shoulder blend, because a patrol
  // carry is not aimed at anything — at a = 1 the muzzle lands exactly on
  // `aimPitch`, and it fades out as the rifle comes down off the shoulder.
  // `bodyPitch` comes back out because the weapon hangs off the body and
  // inherits its run lean; without that the muzzle sits up to 9° off at a
  // sprinting lean while the shot still leaves along the camera.
  const aimPitch = Math.max(-AIM_PITCH_LIMIT,
    Math.min(AIM_PITCH_LIMIT, (o.aimPitch || 0) - (o.bodyPitch || 0)));

  // Everything that moves the rifle without changing the grip rides this one
  // common-mode shoulder pitch: the aim itself, idle breathing / stride, recoil,
  // and a lift through the middle of the patrol→aim blend (a straight
  // interpolation drags the buttstock through the right pec on the way across).
  const swing = (aimPitch - AIM_BASE_PITCH) * a
    + (o.swing || 0) - kick * 0.10 + 0.16 * Math.sin(Math.PI * a)
    // Muzzle drops while the hands are busy, and again when hit.
    - 0.34 * reloadB - 0.55 * swapB - 0.30 * flinchB - 0.10 * rack;

  _pos.lerpVectors(PATROL.wp, AIM.wp, a);
  // Bow the path forward through the middle of the blend so the buttstock
  // swings around the right pec rather than straight through it. Free to do
  // now that the hands are IK'd to wherever the rifle ends up.
  _pos.z -= 0.075 * Math.sin(Math.PI * a);
  _pos.z += kick * 0.03;                           // recoil shoves it back
  // Slerp (not euler-lerp) between the two carries — the patrol pose is a
  // large compound rotation and euler blending swings it through junk.
  _q.slerpQuaternions(_qPatrol, _qAim, a);

  // Reload rolls the receiver up toward the body so the mag well faces the
  // support hand; a swap drops the whole weapon out of frame and brings it
  // back. Both are rotations about the weapon's own axes, applied before the
  // shoulder swing so they read as the wrists working rather than the torso.
  if (reloadB || swapB) {
    _qAct.setFromEuler(_eAct.set(0.30 * reloadB - 0.70 * swapB, 0,
                                 0.85 * reloadB + 0.30 * swapB));
    _q.multiply(_qAct);
    _pos.y -= 0.13 * reloadB + 0.24 * swapB;
    _pos.x -= 0.05 * reloadB;
  }
  if (rack) _pos.z += 0.045 * rack;                // the bolt going back

  if (swing) {
    // Rigid rotation about the X axis through the shoulder line (y=SHOULDER_Y,
    // z=0), so the rifle pivots where the arms are anchored.
    _qSwing.setFromAxisAngle(_AX_X, swing);
    const dy = _pos.y - SHOULDER_Y, dz = _pos.z;
    const cs = Math.cos(swing), sn = Math.sin(swing);
    _pos.y = SHOULDER_Y + dy * cs - dz * sn;
    _pos.z = dy * sn + dz * cs;
    _q.premultiply(_qSwing);
  }

  if (weapon) { weapon.position.copy(_pos); weapon.quaternion.copy(_q); }

  if (rig) {
    solveArm(rig.armR, rig.elbowR,  SHOULDER_X,
             _T.copy(GRIP_LOCAL).applyQuaternion(_q).add(_pos), SWIVEL_R);
    // The support hand leaves the handguard for the magazine and comes back.
    // Held at the mag through the middle of the reload rather than sliding
    // continuously, so it reads as two moves — strip, seat — not one smear.
    if (reload > 0) {
      const hold = Math.min(1, Math.sin(Math.PI * Math.min(1, reload * 1.18)) * 1.9);
      _T.copy(HANDGUARD_LOCAL).lerp(MAG_LOCAL, hold);
    } else {
      _T.copy(HANDGUARD_LOCAL);
    }
    solveArm(rig.armL, rig.elbowL, -SHOULDER_X,
             _T.applyQuaternion(_q).add(_pos), SWIVEL_L);
    // A grenade goes in the off hand, overriding the support grip entirely —
    // it has to be applied last or the IK above would put the hand back.
    if (o.throwP) applyThrowArm(rig, o.throwP);
  }
}

/** The neutral (un-animated) transform, for attaching a freshly built weapon. */
export function restRifleTransform(weapon) {
  weapon.position.copy(PATROL.wp);
  weapon.quaternion.copy(_qPatrol);
}
