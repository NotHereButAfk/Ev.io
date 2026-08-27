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

// Bots keep their ordinary sprint, then punctuate it with short readable bursts.
// The extra speed is applied only after a full clear-lane/ground check, so this
// feels like an arena dash without teleporting through cover or off a ledge.
export const BOT_DASH = Object.freeze({
  duration: 0.36,
  bonusSpeed: 8.8,
  cooldownMin: 1.9,
  cooldownMax: 3.2,
  laneDistance: 7.2,
});

// Personal space prevents a squad from collapsing into one moving pile when
// several bots choose the same corridor or target. The browser and server both
// consume this pure helper so they cannot drift into different behavior.
export const BOT_SEPARATION_RADIUS = 4.2;

export function botSeparationVector({
  x, z, id = 0, neighbors = [], radius = BOT_SEPARATION_RADIUS, botsOnly = false,
}) {
  let repelX = 0;
  let repelZ = 0;
  let pressure = 0;
  const radiusSq = radius * radius;

  for (const neighbor of neighbors) {
    if (!neighbor || neighbor.alive === false || neighbor.isDead) continue;
    if (botsOnly && !neighbor.isBot) continue;
    const neighborId = neighbor.id ?? 0;
    if (neighborId === id && id !== 0) continue;
    const nx = neighbor.state?.px ?? neighbor.position?.x;
    const nz = neighbor.state?.pz ?? neighbor.position?.z;
    if (!Number.isFinite(nx) || !Number.isFinite(nz)) continue;

    let dx = x - nx;
    let dz = z - nz;
    let distanceSq = dx * dx + dz * dz;
    if (distanceSq >= radiusSq) continue;

    if (distanceSq < 1e-6) {
      // Stable escape directions split coincident spawns without introducing
      // frame-to-frame random jitter.
      const angle = ((Math.abs(id * 37 + neighborId * 17) % 360) * Math.PI) / 180;
      dx = Math.cos(angle);
      dz = Math.sin(angle);
      distanceSq = 1;
    }
    const distance = Math.sqrt(distanceSq);
    const weight = 1 - Math.min(1, distance / radius);
    const push = weight * weight;
    repelX += (dx / distance) * push;
    repelZ += (dz / distance) * push;
    pressure += weight;
  }

  const length = Math.hypot(repelX, repelZ);
  if (length < 1e-6) return { x: 0, z: 0, strength: 0 };
  return {
    x: repelX / length,
    z: repelZ / length,
    strength: Math.min(1.35, pressure),
  };
}

export function botDashBonusSpeed(remaining, duration = BOT_DASH.duration) {
  const t = Math.max(0, Math.min(1, remaining / Math.max(1e-6, duration)));
  return BOT_DASH.bonusSpeed * (0.32 + 0.68 * t * t);
}

export function isBotDashLaneSafe({
  x, y, z, dx, dz,
  killY = -25,
  laneDistance = BOT_DASH.laneDistance,
  groundHeightAt,
  raycast,
}) {
  const length = Math.hypot(dx, dz);
  if (length < 1e-5 || typeof groundHeightAt !== 'function') return false;
  const dirX = dx / length;
  const dirZ = dz / length;
  if (typeof raycast === 'function'
      && raycast(x, y + 0.82, z, dirX, 0, dirZ, laneDistance) < laneDistance - 0.45) {
    return false;
  }

  let floorY = y;
  for (const distance of [laneDistance * 0.5, laneDistance]) {
    const nextFloor = groundHeightAt(
      x + dirX * distance,
      z + dirZ * distance,
      floorY,
      floorY,
    );
    if (!Number.isFinite(nextFloor) || nextFloor <= killY || Math.abs(nextFloor - floorY) > 0.72) {
      return false;
    }
    floorY = nextFloor;
  }
  return true;
}

export const BOT_STATES = Object.freeze({
  ROAM: 'roam',
  REACT: 'react',
  ENGAGE: 'engage',
  SEARCH: 'search',
  DEAD: 'dead',
});

// A bot that has just been attacked plants its feet and returns deliberately
// sloppy fire. This multiplier is applied to the existing world-space miss
// radius, so cover still blocks bullets and the bot remains less accurate at
// distance without turning shots into fake probability rolls.
export const BOT_RETALIATION_AIM_SCALE = 4.0;

// Server and offline bots consume the same named presets. Values are expressed
// in seconds/metres so designers can tune behavior without knowing the 20 Hz
// authoritative tick rate. `aimErrorScale` is intentionally above zero even on
// hard: these are casual arena players, never perfect aim locks.
export const BOT_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({
    reactionMin: 0.65, reactionMax: 1.05,
    aimErrorScale: 1.75, detectionDistance: 30, fovDegrees: 92,
    scanInterval: 0.55, decisionInterval: 0.65, losInterval: 0.25,
    searchDuration: 2.0, focusDuration: 7.0, targetSwitchRatio: 0.62,
    aimTurnSpeed: 3.2, strafeChance: 0.38, jumpChance: 0.025,
    movementSpeed: 0.86, roamSprintChance: 0.12, combatSprintDistance: 28,
  }),
  normal: Object.freeze({
    reactionMin: 0.32, reactionMax: 0.68,
    aimErrorScale: 1.2, detectionDistance: 42, fovDegrees: 112,
    scanInterval: 0.35, decisionInterval: 0.45, losInterval: 0.15,
    searchDuration: 3.25, focusDuration: 10.0, targetSwitchRatio: 0.78,
    aimTurnSpeed: 5.0, strafeChance: 0.62, jumpChance: 0.045,
    movementSpeed: 1.0, roamSprintChance: 0.24, combatSprintDistance: 22,
  }),
  hard: Object.freeze({
    reactionMin: 0.18, reactionMax: 0.42,
    aimErrorScale: 0.88, detectionDistance: 52, fovDegrees: 132,
    scanInterval: 0.22, decisionInterval: 0.32, losInterval: 0.10,
    searchDuration: 4.5, focusDuration: 13.0, targetSwitchRatio: 0.9,
    aimTurnSpeed: 7.0, strafeChance: 0.78, jumpChance: 0.065,
    movementSpeed: 1.08, roamSprintChance: 0.38, combatSprintDistance: 17,
  }),
});

export function getBotDifficulty(name = 'normal', overrides = null) {
  const preset = BOT_DIFFICULTIES[name] || BOT_DIFFICULTIES.normal;
  if (!overrides) return preset;
  return Object.freeze({ ...preset, ...overrides });
}

export function isInsideBotFov(botYaw, dx, dz, fovDegrees) {
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return true;
  const forwardX = -Math.sin(botYaw);
  const forwardZ = -Math.cos(botYaw);
  const dot = (dx * forwardX + dz * forwardZ) / length;
  return dot >= Math.cos((fovDegrees * Math.PI / 180) * 0.5);
}

export function smoothBotAim(current, desired, turnSpeed, dt) {
  let delta = desired - current;
  delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI;
  return current + delta * (1 - Math.exp(-Math.max(0, turnSpeed) * Math.max(0, dt)));
}

/**
 * Pick a patrol point that a bot can actually reach in a straight run.
 *
 * Imported arenas do not ship a navigation mesh. Choosing a distant spawn and
 * hoping collision resolution will find a route makes bots run into the same
 * wall, jump, and repeat. This samples broad local destinations, verifies the
 * floor along the complete lane, and rejects lanes blocked at chest height.
 * Successive local legs let a bot cover the arena without expensive per-frame
 * pathfinding.
 */
export function chooseReachableRoamPoint({
  x, y, z,
  half = 100,
  killY = -25,
  random = Math.random,
  groundHeightAt,
  raycast,
  attempts = 18,
  minDistance = 8,
  maxDistance = 27,
}) {
  if (typeof groundHeightAt !== 'function') return null;
  const safeHalf = Math.max(3, half - 2);
  let best = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const angle = random() * Math.PI * 2;
    const distance = minDistance + (maxDistance - minDistance) * Math.sqrt(random());
    const targetX = Math.max(-safeHalf, Math.min(safeHalf, x + Math.cos(angle) * distance));
    const targetZ = Math.max(-safeHalf, Math.min(safeHalf, z + Math.sin(angle) * distance));
    const laneDistance = Math.hypot(targetX - x, targetZ - z);
    if (laneDistance < minDistance * 0.75) continue;

    const dirX = (targetX - x) / laneDistance;
    const dirZ = (targetZ - z) / laneDistance;
    if (typeof raycast === 'function' && raycast(x, y + 0.82, z, dirX, 0, dirZ, laneDistance) < laneDistance - 0.6) {
      continue;
    }

    let floorY = y;
    let walkable = true;
    const samples = Math.max(4, Math.ceil(laneDistance / 2.5));
    for (let sample = 1; sample <= samples; sample++) {
      const t = sample / samples;
      const sampleX = x + (targetX - x) * t;
      const sampleZ = z + (targetZ - z) * t;
      const nextFloor = groundHeightAt(sampleX, sampleZ, floorY, floorY - 1.0);
      if (!Number.isFinite(nextFloor) || nextFloor <= killY || Math.abs(nextFloor - floorY) > 0.7) {
        walkable = false;
        break;
      }
      floorY = nextFloor;
    }
    if (!walkable) continue;

    // Prefer long lanes, but vary the winner so a squad does not converge on
    // the same mathematically-farthest corridor.
    const score = laneDistance * (0.84 + random() * 0.32);
    if (score > bestScore) {
      bestScore = score;
      best = [targetX, floorY, targetZ];
    }
  }
  return best;
}

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
