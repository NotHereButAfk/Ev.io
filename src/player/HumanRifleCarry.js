import * as THREE from 'three';

// Body-local weapon poses. The muzzle is model-local -Z and the soldier faces
// body-local -Z, so AIM is nearly identity. PATROL is the high, close
// combat-ready carry visible in ev.io's official third-person material: stock
// at the shoulder, receiver at the upper chest, muzzle only slightly lowered.
const PATROL_Q = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-0.160, 0.220, 0.200)
);
const AIM_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.020, 0, 0));

// Assault/Idle shoulder midpoint after HumanSoldier's production UPRIGHT and
// gun-stance layers, averaged over the real Idle clip. Weapon poses are kept as
// offsets from this point so crouch/stance/armor scaling cannot leave the fixed
// body-space rifle behind while the shoulders move.
const SHOULDER_REF = new THREE.Vector3(-0.05476, 1.37841, 0.04928);
const BASE_ARM_REACH = 0.47268;
// Receiver offsets from the live shoulder midpoint. The earlier values were
// inherited from the old 2.2m procedural figure: on the 1.8m Soldier they put
// the receiver 10-16cm ABOVE the shoulders, drove the stock through the head,
// and made both forearms cover the face. Keep low-ready below the shoulder and
// let a full aim rise only to the shoulder pocket.
const PATROL_OFFSET = new THREE.Vector3(0.28, -0.13, -0.18);
const AIM_OFFSET = new THREE.Vector3(0.28, -0.05, -0.20);

// Idle third person is a low-ready carry, not a permanent 68% ADS pose. Export
// the contract so the production controller and QA measure the same posture.
export const HUMAN_LOW_READY_AIM = 0.18;

export const HUMAN_GRIP_LOCAL = new THREE.Vector3(0, -0.12, 0.10);
// The Mixamo support arm reaches 0.472m shoulder-to-wrist. A target at the
// muzzle-side end of the authored handguard was 0.66–0.73m away while aiming,
// leaving the visible palm up to 25.7cm off the rifle. Use the receiver-side
// handguard: still ahead of the trigger grip, but reachable in every clip.
export const HUMAN_HANDGUARD_LOCAL = new THREE.Vector3(-0.08, -0.02, -0.16);
// Wrist target on the left face of the common magazine, rather than its
// bottom-centre. The X clearance places the palm around the mag body.
export const HUMAN_MAG_LOCAL = new THREE.Vector3(-0.08, -0.15, 0.02);

const V = Array.from({ length: 32 }, () => new THREE.Vector3());
const Q = Array.from({ length: 12 }, () => new THREE.Quaternion());
const E = new THREE.Euler();

function smoothstep(v) {
  const x = THREE.MathUtils.clamp(v, 0, 1);
  return x * x * (3 - 2 * x);
}

function worldPosition(object, out) {
  const e = object.matrixWorld.elements;
  return out.set(e[12], e[13], e[14]);
}

// Return the post-pose shoulder midpoint in body space and the rig's scale
// relative to the calibrated 47.268cm assault arms. HumanSoldier calls the
// carry after every posture/action layer, so this is the authoritative frame.
function shoulderAnchor(body, rig, out) {
  if (!rig.lArm || !rig.rArm || !rig.lFore || !rig.rFore || !rig.lHand || !rig.rHand) {
    out.copy(SHOULDER_REF);
    return 1;
  }
  body.updateMatrixWorld(true);
  const lShoulder = worldPosition(rig.lArm, V[19]);
  const lElbow = worldPosition(rig.lFore, V[20]);
  const lHand = worldPosition(rig.lHand, V[21]);
  const rShoulder = worldPosition(rig.rArm, V[22]);
  const rElbow = worldPosition(rig.rFore, V[23]);
  const rHand = worldPosition(rig.rHand, V[24]);
  out.addVectors(lShoulder, rShoulder).multiplyScalar(0.5);
  body.worldToLocal(out);
  const reach = (
    lShoulder.distanceTo(lElbow) + lElbow.distanceTo(lHand)
    + rShoulder.distanceTo(rElbow) + rElbow.distanceTo(rHand)
  ) * 0.5;
  return Number.isFinite(reach) && reach > 1e-5 ? reach / BASE_ARM_REACH : 1;
}

function armReach(arm, forearm, hand) {
  if (!arm || !forearm || !hand) return 0;
  const shoulder = worldPosition(arm, V[26]);
  const elbow = worldPosition(forearm, V[27]);
  const wrist = worldPosition(hand, V[28]);
  return shoulder.distanceTo(elbow) + elbow.distanceTo(wrist);
}

// Move the entire rifle just enough to keep a requested wrist target inside
// the real arm's reachable sphere. Alternating both arms preserves the authored
// silhouette while surviving the shoulder motion in every clip/armor scale.
function pullWeaponWithinReach(body, weapon, localTarget, shoulderBone, reach) {
  if (!shoulderBone || reach <= 1e-5) return false;
  body.updateMatrixWorld(true);
  const target = V[26].copy(localTarget).applyMatrix4(weapon.matrixWorld);
  const shoulder = worldPosition(shoulderBone, V[27]);
  const toward = V[28].subVectors(shoulder, target);
  const distance = toward.length();
  const limit = reach * 0.992;
  if (distance <= limit || distance < 1e-6) return false;
  toward.multiplyScalar((distance - limit) / distance);
  body.getWorldQuaternion(Q[6]).invert();
  toward.applyQuaternion(Q[6]);
  body.getWorldScale(V[29]);
  toward.set(
    toward.x / Math.max(1e-6, V[29].x),
    toward.y / Math.max(1e-6, V[29].y),
    toward.z / Math.max(1e-6, V[29].z)
  );
  weapon.position.add(toward);
  return true;
}

// Rotate a bone in world space so its child segment follows `desiredDirection`,
// then convert the result back into the bone's parent-local quaternion.
function pointBoneAt(bone, child, desiredDirection) {
  if (!bone || !child || !bone.parent) return;
  const from = worldPosition(bone, V[0]);
  const to = worldPosition(child, V[1]);
  const currentDirection = V[2].subVectors(to, from);
  if (currentDirection.lengthSq() < 1e-10 || desiredDirection.lengthSq() < 1e-10) return;
  currentDirection.normalize();
  desiredDirection.normalize();

  bone.getWorldQuaternion(Q[0]);
  Q[1].setFromUnitVectors(currentDirection, desiredDirection);
  Q[2].copy(Q[1]).multiply(Q[0]);
  bone.parent.getWorldQuaternion(Q[3]).invert();
  bone.quaternion.copy(Q[3].multiply(Q[2]));
}

// Generic two-bone solve against the actual Mixamo segment lengths and current
// clip pose. Unlike hard-coded Euler offsets, this survives every locomotion
// frame and keeps both palms on the weapon.
function solveArm(body, arm, forearm, hand, targetWorld, side) {
  if (!arm || !forearm || !hand) return;
  body.updateMatrixWorld(true);
  const shoulder = worldPosition(arm, V[3]);
  const elbowNow = worldPosition(forearm, V[4]);
  const handNow = worldPosition(hand, V[5]);
  const upper = shoulder.distanceTo(elbowNow);
  const lower = elbowNow.distanceTo(handNow);
  const toTarget = V[6].subVectors(targetWorld, shoulder);
  let distance = toTarget.length();
  if (upper < 1e-5 || lower < 1e-5 || distance < 1e-5) return;
  distance = Math.min(distance, (upper + lower) * 0.995);
  const direction = toTarget.normalize();
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const centre = V[7].copy(direction).multiplyScalar(along).add(shoulder);

  // Elbows prefer down and away from the ribs. Build that pole in body-local
  // coordinates, transform it into world space, and remove its component along
  // the shoulder→hand line.
  const pole = V[8].set(side * 0.72, -0.82, 0.20).transformDirection(body.matrixWorld);
  pole.addScaledVector(direction, -pole.dot(direction));
  if (pole.lengthSq() < 1e-8) pole.set(side, -0.5, 0);
  pole.normalize();
  const elbowTarget = V[9].copy(centre).addScaledVector(pole, height);

  pointBoneAt(arm, forearm, V[10].subVectors(elbowTarget, shoulder));
  body.updateMatrixWorld(true);
  const elbow = worldPosition(forearm, V[11]);
  pointBoneAt(forearm, hand, V[12].subVectors(targetWorld, elbow));
  body.updateMatrixWorld(true);
}

/**
 * Place a rifle in body space, then solve the real Mixamo arms onto its grip.
 * The weapon is the source of truth, so recoil/reload/swap cannot detach hands.
 */
export function applyHumanRifleCarry(body, rig, weapon, state = {}) {
  if (!body || !weapon || !rig) return;
  const aim = THREE.MathUtils.clamp(state.aim || 0, 0, 1);
  const reload = THREE.MathUtils.clamp(state.reload || 0, 0, 1);
  const swap = THREE.MathUtils.clamp(state.swap || 0, 0, 1);
  const sprint = THREE.MathUtils.clamp(state.sprint || 0, 0, 1);
  const recoil = Math.max(0, state.recoil || 0);
  const reloadBell = reload > 0 ? Math.sin(Math.PI * reload) : 0;
  const swapBell = swap > 0 ? Math.sin(Math.PI * swap) : 0;
  const rack = reload > 0 ? Math.exp(-Math.pow((reload - 0.70) / 0.055, 2)) : 0;

  const anchor = V[18];
  const rigScale = shoulderAnchor(body, rig, anchor);
  weapon.position.copy(anchor).add(
    V[25].lerpVectors(PATROL_OFFSET, AIM_OFFSET, aim).multiplyScalar(rigScale)
  );
  weapon.position.z -= 0.075 * Math.sin(Math.PI * aim) * rigScale;
  weapon.quaternion.slerpQuaternions(PATROL_Q, AIM_Q, aim);

  // Same common-mode vertical follow as the procedural third-person rig:
  // looking pitch moves the shouldered weapon and both IK arms as one unit.
  const lookPitch = aim * THREE.MathUtils.clamp(state.pitch || 0, -0.95, 0.95) * 0.62;
  const carryPitch = lookPitch + (state.sway || 0) - sprint * 0.26
    - reloadBell * 0.30 - swapBell * 0.54 - recoil * 0.10 - rack * 0.08;
  if (reloadBell || swapBell) {
    // Roll the magazine toward the support shoulder. The opposite sign presents
    // it body-right and puts the target beyond the real Mixamo arm's reach.
    Q[4].setFromEuler(E.set(
      reloadBell * 0.30 - swapBell * 0.68,
      0,
      -reloadBell * 0.84 + swapBell * 0.28
    ));
    weapon.quaternion.multiply(Q[4]);
    weapon.position.y -= (reloadBell * 0.13 + swapBell * 0.25) * rigScale;
    weapon.position.x -= reloadBell * 0.05 * rigScale;
  }
  if (rack) weapon.position.z += rack * 0.045 * rigScale;
  if (recoil) weapon.position.z += recoil * 0.035 * rigScale;
  if (carryPitch) {
    Q[5].setFromAxisAngle(V[13].set(1, 0, 0), carryPitch);
    const dy = weapon.position.y - anchor.y;
    const dz = weapon.position.z - anchor.z;
    const cs = Math.cos(carryPitch), sn = Math.sin(carryPitch);
    weapon.position.y = anchor.y + dy * cs - dz * sn;
    weapon.position.z = anchor.z + dy * sn + dz * cs;
    weapon.quaternion.premultiply(Q[5]);
  }

  // Smooth the one authoritative rifle transform before solving either arm.
  // The hands are then IK'd to the exact displayed pose, so animation clips,
  // network snapshots and aim/reload edges cannot make them swim off the gun.
  // A missing/large dt is a deliberate snap for deterministic probes, spawns
  // and teleports.
  const dt = state.dt || 0;
  const smoothing = weapon.userData.humanRifleCarrySmoothing ||= {
    initialized: false,
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  };
  if (!smoothing.initialized || !(dt > 0) || dt > 0.2) {
    smoothing.position.copy(weapon.position);
    smoothing.quaternion.copy(weapon.quaternion);
    smoothing.initialized = true;
  } else {
    smoothing.position.lerp(weapon.position, 1 - Math.exp(-24 * dt));
    smoothing.quaternion.slerp(weapon.quaternion, 1 - Math.exp(-30 * dt)).normalize();
    weapon.position.copy(smoothing.position);
    weapon.quaternion.copy(smoothing.quaternion);
  }

  const supportLocal = V[15].copy(HUMAN_HANDGUARD_LOCAL);
  if (reload > 0) {
    const inT = smoothstep(reload / 0.28);
    const outT = smoothstep((reload - 0.74) / 0.26);
    supportLocal.lerp(HUMAN_MAG_LOCAL, inT * (1 - outT));
  }
  const rightReach = armReach(rig.rArm, rig.rFore, rig.rHand);
  const leftReach = armReach(rig.lArm, rig.lFore, rig.lHand);
  for (let i = 0; i < 4; i++) {
    const pulledRight = pullWeaponWithinReach(
      body, weapon, HUMAN_GRIP_LOCAL, rig.rArm, rightReach
    );
    const pulledLeft = !(state.throwP > 0) && pullWeaponWithinReach(
      body, weapon, supportLocal, rig.lArm, leftReach
    );
    if (!pulledRight && !pulledLeft) break;
  }

  body.updateMatrixWorld(true);
  const gripWorld = V[14].copy(HUMAN_GRIP_LOCAL).applyMatrix4(weapon.matrixWorld);
  solveArm(body, rig.rArm, rig.rFore, rig.rHand, gripWorld, 1);

  // During a reload the support hand moves decisively to the magazine, seats
  // it, then returns. A grenade throw owns that arm instead of the handguard.
  if (!(state.throwP > 0)) {
    body.updateMatrixWorld(true);
    const supportWorld = V[16].copy(supportLocal).applyMatrix4(weapon.matrixWorld);
    solveArm(body, rig.lArm, rig.lFore, rig.lHand, supportWorld, -1);
  }
}

export function humanRifleGripError(rig, weapon) {
  if (!rig || !weapon) return { right: Infinity, left: Infinity };
  const grip = V[14].copy(HUMAN_GRIP_LOCAL).applyMatrix4(weapon.matrixWorld);
  const support = V[15].copy(HUMAN_HANDGUARD_LOCAL).applyMatrix4(weapon.matrixWorld);
  return {
    right: rig.rHand ? worldPosition(rig.rHand, V[16]).distanceTo(grip) : Infinity,
    left: rig.lHand ? worldPosition(rig.lHand, V[17]).distanceTo(support) : Infinity,
  };
}
