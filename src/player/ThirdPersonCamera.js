export const TPS_DEFAULT_DISTANCE = 2.15;
export const TPS_MAX_DISTANCE = 5.5;
export const TPS_ZOOM_STEP = 0.7;
export const TPS_WALL_CLEARANCE = 0.55;
export const TPS_SHOULDER_OFFSET = 0.38;
export const TPS_CAMERA_HEIGHT = 1.52;

// EV-style combat framing: the camera sits over the right shoulder and looks
// parallel to the player's aim instead of looking back at the body's centre.
// That places the soldier left of the reticle and keeps the firing lane clear.
export function setThirdPersonDesired(out, position, yaw, pitch, distance) {
  const d = Number.isFinite(distance) ? distance : TPS_DEFAULT_DISTANCE;
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  const downLook = Math.max(0, pitch);
  const horizontal = d * (1 - Math.sin(downLook * 0.5) * 0.22);
  out.set(
    position.x + sinY * horizontal + cosY * TPS_SHOULDER_OFFSET,
    position.y + TPS_CAMERA_HEIGHT + Math.sin(downLook * 0.5) * d * 0.42,
    position.z + cosY * horizontal - sinY * TPS_SHOULDER_OFFSET,
  );
  return out;
}

// Find the first wall between the shoulder pivot and the desired camera. The
// point-inside-box pass is essential: one-sided map meshes do not report an
// outward ray when the desired shoulder camera has already crossed a wall.
export function findThirdPersonObstruction(raycaster, world, target, desired, scratch) {
  const direction = scratch.copy(desired).sub(target);
  const desiredDistance = direction.length();
  if (desiredDistance <= 1e-5) return null;

  raycaster.set(target, direction.normalize());
  raycaster.near = 0.05;
  raycaster.far = desiredDistance;
  let nearest = raycaster.intersectObjects(world.raycastMeshes || [], true)[0] || null;
  const boxHit = world.raycastBoxHit?.(raycaster.ray, desiredDistance);
  if (boxHit && (!nearest || boxHit.distance < nearest.distance)) nearest = boxHit;

  for (const collider of world.colliders || []) {
    const box = collider?.box;
    if (!box?.containsPoint(desired)) continue;
    raycaster.set(desired, scratch.copy(target).sub(desired).normalize());
    const exit = raycaster.ray.intersectBox(box, scratch);
    if (!exit) continue;
    const fromTarget = desiredDistance - desired.distanceTo(exit);
    if (fromTarget > 0.05 && (!nearest || fromTarget < nearest.distance)) {
      nearest = { distance: fromTarget, point: exit.clone() };
    }
  }
  return nearest;
}

// The first wheel notch is a view-mode switch, not a tiny zoom increment.
// Enter TPS far enough back to frame the whole soldier; one notch toward the
// player returns to FPS from the default shoulder-camera distance.
export function nextThirdPersonDistance(current, wheelDelta) {
  if (!Number.isFinite(wheelDelta) || wheelDelta === 0) return current;
  const distance = Number.isFinite(current) ? current : 0;

  if (distance <= 0 && wheelDelta > 0) return TPS_DEFAULT_DISTANCE;
  if (distance <= TPS_DEFAULT_DISTANCE && wheelDelta < 0) return 0;

  return Math.min(
    TPS_MAX_DISTANCE,
    Math.max(TPS_DEFAULT_DISTANCE, distance + wheelDelta * TPS_ZOOM_STEP),
  );
}

export function safeThirdPersonObstructionDistance(hitDistance) {
  return Math.max(0.35, hitDistance - TPS_WALL_CLEARANCE);
}
