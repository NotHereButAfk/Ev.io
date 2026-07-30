// Every playable body in this project is authored facing local -Z. Camera yaw
// already describes that axis, while a yaw calculated from a world movement
// vector describes +Z and therefore needs a half-turn.
//
// Keep these conversions centralized. The rigged soldier was once special-
// cased as +Z in the player paths but as -Z in the bot path, which made the
// same forward animation look like backpedalling depending on who owned it.

export function cameraYawToBodyYaw(cameraYaw = 0) {
  return cameraYaw;
}

export function directionToBodyYaw(dx, dz) {
  return Math.atan2(dx, dz) + Math.PI;
}

export function bodyForwardAtYaw(yaw = 0) {
  return {
    x: -Math.sin(yaw),
    z: -Math.cos(yaw),
  };
}
