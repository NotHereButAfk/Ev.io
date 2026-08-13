import * as THREE from 'three';
import { applyRifleCarry } from '../src/player/RifleCarry.js';

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

console.log(
  `rifle carry reference passed: receiver y=${weapon.position.y.toFixed(3)}m, `
  + `muzzle pitch=${THREE.MathUtils.radToDeg(pitch).toFixed(1)}deg, `
  + `cross-body=${THREE.MathUtils.radToDeg(yaw).toFixed(1)}deg`,
);
