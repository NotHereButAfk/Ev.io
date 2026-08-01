import {
  TPS_DEFAULT_DISTANCE,
  TPS_MAX_DISTANCE,
  nextThirdPersonDistance,
  safeThirdPersonObstructionDistance,
} from '../src/player/ThirdPersonCamera.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(nextThirdPersonDistance(0, 1) === TPS_DEFAULT_DISTANCE,
  'first outward notch must frame the whole player');
assert(nextThirdPersonDistance(TPS_DEFAULT_DISTANCE, -1) === 0,
  'first inward notch at the default distance must return to FPS');
assert(nextThirdPersonDistance(TPS_DEFAULT_DISTANCE, 1) > TPS_DEFAULT_DISTANCE,
  'outward notches must continue zooming');
assert(nextThirdPersonDistance(TPS_MAX_DISTANCE, 1) === TPS_MAX_DISTANCE,
  'camera distance must respect the maximum');
assert(nextThirdPersonDistance(4.4, -1) >= TPS_DEFAULT_DISTANCE,
  'intermediate inward zoom must not enter the model');
assert(nextThirdPersonDistance(3.2, -1) === TPS_DEFAULT_DISTANCE,
  'inward zoom must clamp to the safe TPS framing distance');
assert(nextThirdPersonDistance(3.2, 0) === 3.2,
  'zero wheel input must leave the camera untouched');
assert(Math.abs(safeThirdPersonObstructionDistance(2) - 1.45) < 1e-9,
  'wall collision must keep the camera near plane clear of the surface');
assert(safeThirdPersonObstructionDistance(0.6) === 0.35,
  'wall collision must preserve a stable minimum camera distance');

console.log(`third-person camera passed — safe frame ${TPS_DEFAULT_DISTANCE.toFixed(1)}-${TPS_MAX_DISTANCE.toFixed(1)}m`);
