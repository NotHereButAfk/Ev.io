export const TPS_DEFAULT_DISTANCE = 2.8;
export const TPS_MAX_DISTANCE = 6.0;
export const TPS_ZOOM_STEP = 0.8;
export const TPS_WALL_CLEARANCE = 0.55;

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
