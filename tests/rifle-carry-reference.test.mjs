import * as THREE from 'three';
import { applyRifleCarry, HANDGUARD_LOCAL } from '../src/player/RifleCarry.js';
import { SHOULDER_X } from '../src/player/Proportions.js';
import { buildHeroBody } from '../src/player/HeroBody.js';
import { weaponHandPose } from '../src/weapons/WeaponHandPoses.js';

const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};

const weapon = new THREE.Object3D();
applyRifleCarry(null, weapon, 0, 0);

const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(weapon.quaternion);
const pitch = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
const yaw = Math.atan2(forward.x, -forward.z);

// Verified against ev.io's official Hall of Champions third-person frame:
// the relaxed rifle remains shoulder-high and nearly forward, not at the old
// -23.4-degree / 45.9-degree deep cross-body angle.
assert(weapon.position.y > 1.24, `patrol receiver is too low (${weapon.position.y.toFixed(3)}m)`);
assert(Math.abs(pitch) < THREE.MathUtils.degToRad(15),
  `patrol muzzle drops ${THREE.MathUtils.radToDeg(pitch).toFixed(1)} degrees`);
assert(Math.abs(yaw) < THREE.MathUtils.degToRad(20),
  `patrol muzzle crosses ${THREE.MathUtils.radToDeg(yaw).toFixed(1)} degrees`);
assert(weapon.position.x > SHOULDER_X,
  `patrol receiver is inside the torso/shoulder silhouette (`
  + `${weapon.position.x.toFixed(3)}m <= ${SHOULDER_X.toFixed(3)}m)`);

// The entire neutral patrol-to-aim path has to remain outside the right
// shoulder line. Checking only the endpoints allowed a visually buried rifle
// to ship even though the wrist IK was numerically perfect.
let minimumReceiverRight = Infinity;
for (let i = 0; i <= 20; i++) {
  applyRifleCarry(null, weapon, i / 20, 0);
  minimumReceiverRight = Math.min(minimumReceiverRight, weapon.position.x);
}
assert(minimumReceiverRight > SHOULDER_X,
  `receiver crosses the torso during the carry blend (`
  + `${minimumReceiverRight.toFixed(3)}m <= ${SHOULDER_X.toFixed(3)}m)`);

// Exercise the production skinned chassis, not only a free weapon transform.
// Exact wrist IK can coexist with a buried rifle, so this checks both at once
// through idle, movement sway, aim, reload, swap, flinch, and vertical aim.
const body = buildHeroBody('vanguard');
const liveWeapon = new THREE.Object3D();
body.add(liveWeapon);
const rig = body.userData.rig;
const bones = body.userData.bones;
const carryStates = [
  ['idle', 0.18, {}],
  ['walk', 0.18, { swing: 0.04 }],
  ['run', 0.30, { swing: -0.05, bodyPitch: -0.12 }],
  ['aim', 1.00, {}],
  ['aim up', 1.00, { aimPitch: 0.65 }],
  ['aim down', 1.00, { aimPitch: -0.65 }],
  ['reload', 0.35, { reload: 0.50 }],
  ['swap', 0.20, { swap: 0.50 }],
  ['flinch', 0.35, { flinch: 0.20 }],
];
let worstTriggerWrist = 0;
let worstSupportRail = 0;
let leastActionReceiverRight = Infinity;
for (const [name, aim, options] of carryStates) {
  applyRifleCarry(rig, liveWeapon, aim, 1 / 60, options);
  body.updateMatrixWorld(true);
  const triggerTarget = new THREE.Vector3(...weaponHandPose(liveWeapon).trigger)
    .applyMatrix4(liveWeapon.matrixWorld);
  const triggerWrist = bones.handR.getWorldPosition(new THREE.Vector3());
  const triggerError = triggerWrist.distanceTo(triggerTarget);
  worstTriggerWrist = Math.max(worstTriggerWrist, triggerError);
  assert(triggerError < 0.003,
    `${name} trigger wrist misses the grip by ${(triggerError * 100).toFixed(2)}cm`);

  // During reload the support hand deliberately leaves the rail for the mag;
  // in every other state it must remain on the weapon's centre strip, with a
  // reachable longitudinal grip allowed to slide back along long rifles.
  if (!options.reload && !options.swap) {
    const supportLocal = liveWeapon.worldToLocal(
      bones.handL.getWorldPosition(new THREE.Vector3())
    );
    const railError = Math.hypot(
      supportLocal.x - HANDGUARD_LOCAL.x,
      supportLocal.y - HANDGUARD_LOCAL.y,
    );
    worstSupportRail = Math.max(worstSupportRail, railError);
    // The displayed hand belongs on the near face, not the weapon centreline.
    // The shared carry can move it up to 1.2cm inward when extra shoulder
    // clearance is needed; that is still well inside a real handguard surface.
    assert(railError < 0.015,
      `${name} support wrist leaves the handguard rail by ${(railError * 100).toFixed(2)}cm`);
  }

  const receiverLocal = body.worldToLocal(
    liveWeapon.getWorldPosition(new THREE.Vector3())
  );
  leastActionReceiverRight = Math.min(leastActionReceiverRight, receiverLocal.x);
  assert(receiverLocal.x > SHOULDER_X,
    `${name} receiver enters the torso silhouette at ${receiverLocal.x.toFixed(3)}m`);
}

console.log(
  `rifle carry reference passed: receiver y=${weapon.position.y.toFixed(3)}m, `
  + `muzzle pitch=${THREE.MathUtils.radToDeg(pitch).toFixed(1)}deg, `
  + `cross-body=${THREE.MathUtils.radToDeg(yaw).toFixed(1)}deg, `
  + `minimum lateral clearance=${((minimumReceiverRight - SHOULDER_X) * 100).toFixed(1)}cm, `
  + `action clearance=${((leastActionReceiverRight - SHOULDER_X) * 100).toFixed(1)}cm, `
  + `wrist error R=${(worstTriggerWrist * 100).toFixed(2)}cm `
  + `L=${(worstSupportRail * 100).toFixed(2)}cm`,
);
