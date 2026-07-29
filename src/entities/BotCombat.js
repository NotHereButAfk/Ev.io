// Pure combat steering shared by Bot.js and its headless behavior checks.
// Values are our adaptation of the mobile arena-fighter behavior visible in
// ev.io footage; they are not claimed as ev.io's internal AI constants.

export const BOT_TACTICS = Object.freeze({
  detectRadius: 32,
  memoryDuration: 5.5,
  rangedRetreatDistance: 5.0,
  rangedOrbitDistance: 13.0,
  meleeAttackDistance: 2.2,
});

/**
 * Return forward/strafe weights in a target-relative frame.
 *
 * forward  +1 = close on target, -1 = retreat
 * strafe   +1 = circle right,       -1 = circle left
 */
export function chooseCombatSteering({
  distance,
  hasLineOfSight,
  strafeSign = 1,
  melee = false,
}) {
  const side = strafeSign < 0 ? -1 : 1;

  if (!hasLineOfSight) {
    return { forward: 1, strafe: 0.12 * side, mode: 'pursue' };
  }

  if (melee) {
    return {
      forward: distance > BOT_TACTICS.meleeAttackDistance * 0.85 ? 1 : 0,
      strafe: distance > 6 ? 0.12 * side : 0.28 * side,
      mode: 'rush',
    };
  }

  if (distance > BOT_TACTICS.rangedOrbitDistance) {
    return { forward: 1, strafe: 0.28 * side, mode: 'close' };
  }
  if (distance < BOT_TACTICS.rangedRetreatDistance) {
    return { forward: -0.82, strafe: 0.72 * side, mode: 'retreat' };
  }
  return { forward: 0.08, strafe: 0.92 * side, mode: 'orbit' };
}

/**
 * Ranged bots fire recognizable short bursts instead of metronomic single
 * shots. Returns the timer until the next shot and the updated burst count.
 */
export function advanceBurst(shotsRemaining, random = Math.random) {
  if (shotsRemaining > 1) {
    return {
      shotsRemaining: shotsRemaining - 1,
      delayScale: 0.82 + random() * 0.30,
      burstPause: false,
    };
  }
  return {
    shotsRemaining: 2 + Math.floor(random() * 3),
    delayScale: 2.8 + random() * 2.3,
    burstPause: true,
  };
}
