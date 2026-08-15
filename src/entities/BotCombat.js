// Pure combat steering shared by Bot.js and its headless behavior checks.
// Values are our adaptation of the mobile arena-fighter behavior visible in
// ev.io footage; they are not claimed as ev.io's internal AI constants.

export const BOT_TACTICS = Object.freeze({
  detectRadius: 42,
  memoryDuration: 5.5,
  rangedRetreatDistance: 5.0,
  rangedOrbitDistance: 13.0,
  meleeAttackDistance: 2.2,
});

// A public match should read as an arena full of players, not seven copies of
// the same infinite-ammo rifleman. These are deliberately gentler bot versions
// of the player weapons: the model, cadence, magazine and reload identity stay
// recognizable without importing the player's full damage values into the AI.
export const BOT_RANGED_LOADOUTS = Object.freeze([
  Object.freeze({ id: 'm4',      damage: 10, fireRate: 0.24, range: 26, magSize: 12, reloadTime: 1.8, sound: 'rifle' }),
  Object.freeze({ id: 'm16',     damage: 12, fireRate: 0.22, range: 29, magSize: 9,  reloadTime: 2.0, sound: 'rifle' }),
  Object.freeze({ id: 'rifle',   damage: 13, fireRate: 0.26, range: 30, magSize: 10, reloadTime: 1.9, sound: 'rifle' }),
  Object.freeze({ id: 'lmg',     damage: 8,  fireRate: 0.16, range: 24, magSize: 18, reloadTime: 2.7, sound: 'lmg' }),
]);

/** Stable five-slot squad pattern: four distinct ranged roles, then a blade. */
export function botLoadoutForId(id) {
  const slot = Math.max(0, Math.abs(id | 0) - 1) % 5;
  return slot === 4 ? null : BOT_RANGED_LOADOUTS[slot];
}

/** Advance a finite bot magazine without tying the rule to rendering. */
export function advanceBotMagazine(ammo, reloadRemaining, dt, loadout, fired = false) {
  if (!loadout) return { ammo: 0, reloadRemaining: 0 };
  const wasReloading = reloadRemaining > 0;
  let nextReload = Math.max(0, reloadRemaining - Math.max(0, dt));
  let nextAmmo = ammo;
  if (wasReloading && nextReload === 0) nextAmmo = loadout.magSize;
  if (fired && nextReload === 0 && nextAmmo > 0) {
    nextAmmo -= 1;
    if (nextAmmo === 0) nextReload = loadout.reloadTime;
  }
  return { ammo: nextAmmo, reloadRemaining: nextReload };
}

// Keep the arena a free-for-all while ensuring the human is not ignored behind
// a permanent cluster of closer bots. Roughly one third apply human pressure.
export function combatTargetScore({ distance, isHuman = false, botId = 0, sticky = false }) {
  const humanPressure = isHuman && Math.abs(botId | 0) % 3 === 0 ? -11 : 0;
  return distance + (sticky ? -9 : 0) + humanPressure;
}

// World-space miss radius used by the real ray shot. Keeping this pure makes
// aim quality measurable instead of silently regressing into wild spray.
export function botAimErrorMeters(distance, skill = 1) {
  return (0.32 + 0.018 * Math.max(0, distance)) * skill;
}

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
    return { forward: -0.78, strafe: 0.50 * side, mode: 'retreat' };
  }
  return { forward: 0.14, strafe: 0.70 * side, mode: 'orbit' };
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
