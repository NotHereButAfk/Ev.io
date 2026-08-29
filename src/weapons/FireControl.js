// Shared trigger/cadence rules for the rendered weapon and authoritative
// network bridge. Keeping these rules pure prevents the two firing loops from
// drifting apart when a frame arrives late.

export function advanceFireCooldown(cooldown, dt) {
  return Number.isFinite(cooldown) ? cooldown - Math.max(0, dt || 0) : 0;
}

export function wantsTriggerShot(automatic, down, wasDown) {
  return !!down && (!!automatic || !wasDown);
}

export function scheduleNextShot(cooldown, interval) {
  const cadence = Math.max(0.001, Number(interval) || 0.12);
  // Retain at most one interval of timing debt. A hitch therefore does not
  // permanently slow an automatic gun, but also cannot dump a large burst in
  // one render frame after the tab resumes.
  return Math.max(-cadence, Number(cooldown) || 0) + cadence;
}

/**
 * Whether the local player is actively moving while holding the trigger.
 *
 * This is deliberately presentation-only: the fire loop never gates a shot
 * on movement, so sprinting and firing remain simultaneous. Keeping the
 * predicate here gives the first-person weapon and future input surfaces a
 * single, allocation-free run-and-gun contract.
 */
export function isRunningAndFiring(player, input, minSpeed = 0.5) {
  if (!input?.mouseDown || player?.isDead === true) return false;
  const vx = Number(player?.velocity?.x) || 0;
  const vz = Number(player?.velocity?.z) || 0;
  return Math.hypot(vx, vz) >= Math.max(0, Number(minSpeed) || 0);
}
