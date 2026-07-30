// Playback calibration measured from public/soldier.glb. At 1x playback the
// planted feet travel beneath the body at roughly these world speeds.
export const HUMAN_CLIP_SPEED = Object.freeze({
  walk: 1.70,
  run: 4.28,
});

export function selectHumanMotion(speed, sprinting = false, current = 'idle') {
  if (sprinting) return 'run';
  if (current === 'run') {
    if (speed > 3.55) return 'run';
  } else if (speed > 4.05) {
    return 'run';
  }
  if (speed > (current === 'idle' ? 0.55 : 0.32)) return 'walk';
  return 'idle';
}

export function targetHumanTimeScale(motion, speed, characterScale = 1) {
  if (motion === 'walk') {
    return characterScale * Math.max(0.55, Math.min(1.70, speed / HUMAN_CLIP_SPEED.walk));
  }
  if (motion === 'run') {
    // A full ground-match at the 10.85 m/s sci-fi sprint would require 2.5x
    // playback and read like a cartoon. Cap cadence at a believable five-ish
    // steps/second; the remaining speed is expressed as a longer powered stride.
    return characterScale * Math.max(0.72, Math.min(1.72, speed / HUMAN_CLIP_SPEED.run));
  }
  return characterScale;
}

export function dampHumanTimeScale(current, target, dt, response = 9) {
  return target + (current - target) * Math.exp(-response * Math.max(0, dt));
}

export function normalizeRootPositionValues(values, bindPosition) {
  if (!values || values.length < 3 || !bindPosition) return values;
  const dx = bindPosition.x - values[0];
  const dy = bindPosition.y - values[1];
  const dz = bindPosition.z - values[2];
  for (let i = 0; i < values.length; i += 3) {
    values[i] += dx;
    values[i + 1] += dy;
    values[i + 2] += dz;
  }
  return values;
}
