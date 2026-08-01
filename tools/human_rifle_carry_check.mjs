import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { createHumanActionPose, sampleHumanActionPose } from '../src/player/HumanActionMotion.js';
import {
  applyHumanRifleCarry,
  HUMAN_GRIP_LOCAL,
  HUMAN_HANDGUARD_LOCAL,
  HUMAN_MAG_LOCAL,
} from '../src/player/HumanRifleCarry.js';

const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
const smoothstep = (value) => {
  const x = THREE.MathUtils.clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};
const findBone = (root, name) => (
  root.getObjectByName(`mixamorig:${name}`)
  || root.getObjectByName(`mixamorig${name}`)
  || root.getObjectByName(name)
);
const worldPosition = (object) => object.getWorldPosition(new THREE.Vector3());

globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
};

const bytes = fs.readFileSync(new URL('../public/soldier.glb', import.meta.url));
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(buffer, '', resolve, reject);
});
const clips = Object.fromEntries(gltf.animations.map((clip) => [clip.name, clip]));
for (const name of ['Idle', 'Walk', 'Run']) {
  assert(clips[name], `soldier.glb is missing its ${name} clip`);
}

// Exercise the carry against frames that put the shoulders in materially
// different places. Reload samples cover hand departure, magazine seat, rack,
// and recovery; a single idle-frame fixture would miss reach failures caused
// by locomotion.
const CASES = [
  { name: 'low-ready',       clip: 'Idle', phase: 0.13, aim: 0.00 },
  { name: 'aim',             clip: 'Idle', phase: 0.47, aim: 1.00 },
  { name: 'walk + aim',      clip: 'Walk', phase: 0.31, aim: 0.72, sway: 0.03 },
  { name: 'run + aim',       clip: 'Run',  phase: 0.69, aim: 0.62, sway: -0.03 },
  { name: 'sprint tuck',     clip: 'Run',  phase: 0.18, aim: 0.00, sprint: 1.00, sway: 0.03 },
  { name: 'reload depart',   clip: 'Idle', phase: 0.21, aim: 0.35, reload: 0.28 },
  { name: 'reload seat',     clip: 'Idle', phase: 0.52, aim: 0.35, reload: 0.48 },
  { name: 'walk reload',     clip: 'Walk', phase: 0.63, aim: 0.20, reload: 0.60, sway: -0.03 },
  { name: 'reload rack',     clip: 'Idle', phase: 0.78, aim: 0.35, reload: 0.72 },
  { name: 'reload recover',  clip: 'Idle', phase: 0.38, aim: 0.35, reload: 0.88 },
  { name: 'aim up',          clip: 'Idle', phase: 0.33, aim: 1.00, pitch:  0.65 },
  { name: 'aim down',        clip: 'Idle', phase: 0.33, aim: 1.00, pitch: -0.65 },
];

const ARMORS = {
  assault: { scale: 1.00, spineLean:  0.00, headPitch:  0.00 },
  recon:   { scale: 0.97, spineLean: -0.04, headPitch: -0.06 },
  heavy:   { scale: 1.09, spineLean:  0.11, headPitch:  0.05 },
  stealth: { scale: 0.95, spineLean:  0.13, headPitch:  0.09 },
};

const actionPose = createHumanActionPose();
const actionEuler = new THREE.Euler();
const actionQuat = new THREE.Quaternion();
const axisX = new THREE.Vector3(1, 0, 0);
const axisY = new THREE.Vector3(0, 1, 0);

function expectedSupportLocal(reload) {
  const support = HUMAN_HANDGUARD_LOCAL.clone();
  if (reload > 0) {
    const inT = smoothstep(reload / 0.28);
    const outT = smoothstep((reload - 0.74) / 0.26);
    support.lerp(HUMAN_MAG_LOCAL, inT * (1 - outT));
  }
  return support;
}

function applyProductionTorsoLayers(rig, armor, reload, swap = 0) {
  for (const [bone, angle] of [
    [rig.spine, -0.15], [rig.s1, -0.15], [rig.s2, -0.09],
    [rig.neck, -0.18], [rig.head, 0.07],
  ]) bone?.quaternion.multiply(actionQuat.setFromAxisAngle(axisX, angle));
  rig.s1?.quaternion.multiply(actionQuat.setFromAxisAngle(axisX, armor.spineLean));
  rig.head?.quaternion.multiply(actionQuat.setFromAxisAngle(axisX, armor.headPitch));
  // These are the gun-specific layers applied immediately before
  // applyHumanRifleCarry() in HumanSoldier's armorTick.
  rig.s1?.quaternion.multiply(actionQuat.setFromAxisAngle(axisY, 0.10));
  rig.spine?.quaternion.multiply(actionQuat.setFromAxisAngle(axisX, 0.03));
  sampleHumanActionPose({ reload, swap }, actionPose);
  if (rig.spine && (actionPose.torsoX || actionPose.torsoZ)) {
    rig.spine.quaternion.multiply(actionQuat.setFromEuler(
      actionEuler.set(actionPose.torsoX, 0, actionPose.torsoZ)
    ));
  }
}

function measure(spec, armorName, armor) {
  const root = cloneSkeleton(gltf.scene);
  root.scale.setScalar(armor.scale);
  const body = new THREE.Group();
  const weapon = new THREE.Object3D();
  body.add(root, weapon);

  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clips[spec.clip]);
  action.play();
  mixer.setTime(clips[spec.clip].duration * spec.phase);

  const rig = {
    spine: findBone(root, 'Spine'),
    s1: findBone(root, 'Spine1'),
    s2: findBone(root, 'Spine2'),
    neck: findBone(root, 'Neck'),
    head: findBone(root, 'Head'),
    lArm: findBone(root, 'LeftArm'),
    rArm: findBone(root, 'RightArm'),
    lFore: findBone(root, 'LeftForeArm'),
    rFore: findBone(root, 'RightForeArm'),
    lHand: findBone(root, 'LeftHand'),
    rHand: findBone(root, 'RightHand'),
  };
  for (const name of ['spine', 's1', 'lArm', 'rArm', 'lFore', 'rFore', 'lHand', 'rHand']) {
    assert(rig[name], `soldier.glb is missing ${name}`);
  }

  applyProductionTorsoLayers(rig, armor, spec.reload || 0, spec.swap || 0);
  body.updateMatrixWorld(true);
  const leftReach = worldPosition(rig.lArm).distanceTo(worldPosition(rig.lFore))
    + worldPosition(rig.lFore).distanceTo(worldPosition(rig.lHand));
  const rightReach = worldPosition(rig.rArm).distanceTo(worldPosition(rig.rFore))
    + worldPosition(rig.rFore).distanceTo(worldPosition(rig.rHand));

  applyHumanRifleCarry(body, rig, weapon, spec);
  body.updateMatrixWorld(true);
  const rightTarget = HUMAN_GRIP_LOCAL.clone().applyMatrix4(weapon.matrixWorld);
  const leftTarget = expectedSupportLocal(spec.reload || 0).applyMatrix4(weapon.matrixWorld);
  const leftShoulderDistance = worldPosition(rig.lArm).distanceTo(leftTarget);
  const rightShoulderDistance = worldPosition(rig.rArm).distanceTo(rightTarget);
  const muzzle = new THREE.Vector3(0, 0, -1).applyQuaternion(
    weapon.getWorldQuaternion(new THREE.Quaternion())
  );
  const muzzlePitch = Math.asin(THREE.MathUtils.clamp(muzzle.y, -1, 1));

  return {
    name: `${armorName} ${spec.name}`,
    rightError: worldPosition(rig.rHand).distanceTo(rightTarget),
    leftError: worldPosition(rig.lHand).distanceTo(leftTarget),
    rightReach,
    leftReach,
    rightShoulderDistance,
    leftShoulderDistance,
    requestedPitch: spec.pitch || 0,
    muzzlePitch,
  };
}

const results = Object.entries(ARMORS).flatMap(([name, armor]) =>
  CASES.map((spec) => measure(spec, name, armor))
);
const MAX_GRIP_ERROR = 0.008;
const MAX_REACH_FRACTION = 0.9951;
let failures = 0;

console.log('real soldier rifle carry (centimetres)');
console.log('  state'.padEnd(23) + 'right hand  left hand  left target/reach');
for (const result of results) {
  const rightOk = result.rightError <= MAX_GRIP_ERROR;
  const leftOk = result.leftError <= MAX_GRIP_ERROR;
  const leftReachOk = result.leftShoulderDistance <= result.leftReach * MAX_REACH_FRACTION;
  const rightReachOk = result.rightShoulderDistance <= result.rightReach * MAX_REACH_FRACTION;
  const pitchOk = Math.abs(result.requestedPitch) < 0.01
    || (Math.sign(result.muzzlePitch) === Math.sign(result.requestedPitch)
        && Math.abs(result.muzzlePitch) > 0.25);
  if (!rightOk || !leftOk || !leftReachOk || !rightReachOk || !pitchOk) failures++;
  const marker = rightOk && leftOk && leftReachOk && rightReachOk && pitchOk ? 'ok' : 'FAIL';
  console.log(
    `  ${marker.padEnd(5)} ${result.name.padEnd(17)}`
    + `${(result.rightError * 100).toFixed(2).padStart(6)}cm`
    + `${(result.leftError * 100).toFixed(2).padStart(9)}cm`
    + `  ${(result.leftShoulderDistance * 100).toFixed(1)}`
    + `/${(result.leftReach * 100).toFixed(1)}cm`
  );
}

const worstRight = Math.max(...results.map((result) => result.rightError));
const worstLeft = Math.max(...results.map((result) => result.leftError));
if (failures) {
  console.error(`\n${failures} rifle carry state(s) failed the real-rig grip/reach gate`);
  process.exit(1);
}
console.log(
  `\nhuman rifle carry passed: ${results.length} production Soldier states, worst wrist error `
  + `R=${(worstRight * 100).toFixed(2)}cm L=${(worstLeft * 100).toFixed(2)}cm`
);
