import * as THREE from 'three';

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

const PATROL = {
  wp:   new THREE.Vector3(0.090, 1.327, -0.211),
  wr:   new THREE.Euler(-0.646, 0.525, 0.611),
  armR: [-0.577,  0.269, 0.078], elbowR: 1.934,
  armL: [ 0.226, -0.468, 0.134], elbowL: 1.038,
};
const AIM = {
  wp:   new THREE.Vector3(0.155, 1.514, -0.277),
  wr:   new THREE.Euler(-0.060, 0, 0),
  armR: [-0.411,  0.478, 0.135], elbowR: 2.165,
  armL: [ 0.878, -0.520, 0.459], elbowL: 1.030,
};

const _qPatrol = new THREE.Quaternion().setFromEuler(PATROL.wr);
const _qAim    = new THREE.Quaternion().setFromEuler(AIM.wr);
const _q       = new THREE.Quaternion();
const _qKick   = new THREE.Quaternion();
const _pos     = new THREE.Vector3();
const _AX_X    = new THREE.Vector3(1, 0, 0);

const mix = (a, b, t) => a + (b - a) * t;

// Frame-rate-independent ease of one euler channel toward a target.
function ease(joint, ax, ay, az, s) {
  if (!joint) return;
  const r = joint.rotation;
  r.x += (ax - r.x) * s;
  r.y += (ay - r.y) * s;
  r.z += (az - r.z) * s;
}

/**
 * Pose a rigged body's arms onto the rifle and place the rifle in its hands.
 *
 * @param {object} rig     { armL, armR, elbowL, elbowR } limb pivots
 * @param {THREE.Object3D} weapon  the weapon model parented to the body (or null)
 * @param {number} aim     0 = patrol carry, 1 = shouldered and aiming
 * @param {number} dt      frame delta (seconds)
 * @param {object} [o]     { sway, breathe, bob, kick, ease }
 */
export function applyRifleCarry(rig, weapon, aim, dt, o = {}) {
  const a       = Math.max(0, Math.min(1, aim));
  const s       = Math.min(1, dt * (o.ease ?? 9));
  const sway    = o.sway    || 0;
  const breathe = o.breathe || 0;
  const bob     = o.bob     || 0;
  const kick    = o.kick    || 0;

  if (rig) {
    // Trigger arm — stride sway rides on the shoulder pitch so the carry
    // breathes with the walk instead of being welded rigid.
    ease(rig.armR,
      mix(PATROL.armR[0], AIM.armR[0], a) + sway,
      mix(PATROL.armR[1], AIM.armR[1], a),
      mix(PATROL.armR[2], AIM.armR[2], a), s);
    ease(rig.elbowR, mix(PATROL.elbowR, AIM.elbowR, a), 0, 0, s);
    // Support arm counter-sways so the rifle stays put between the hands.
    ease(rig.armL,
      mix(PATROL.armL[0], AIM.armL[0], a) - sway,
      mix(PATROL.armL[1], AIM.armL[1], a),
      mix(PATROL.armL[2], AIM.armL[2], a), s);
    ease(rig.elbowL, mix(PATROL.elbowL, AIM.elbowL, a), 0, 0, s);
  }

  if (weapon) {
    _pos.lerpVectors(PATROL.wp, AIM.wp, a);
    weapon.position.set(
      _pos.x + sway * 0.3,
      _pos.y + breathe - bob,
      _pos.z + kick * 0.07,          // recoil shoves the rifle back
    );
    // Slerp (not euler-lerp) between the two carries — the patrol pose is a
    // large compound rotation and euler blending swings it through junk.
    _q.slerpQuaternions(_qPatrol, _qAim, a);
    if (kick) {
      _qKick.setFromAxisAngle(_AX_X, kick * 0.22);   // muzzle climb
      _q.multiply(_qKick);
    }
    weapon.quaternion.copy(_q);
  }
}

/** The neutral (un-animated) transform, for attaching a freshly built weapon. */
export function restRifleTransform(weapon) {
  weapon.position.copy(PATROL.wp);
  weapon.quaternion.copy(_qPatrol);
}
