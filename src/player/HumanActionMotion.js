// Additive action poses for the rigged Mixamo soldier.
//
// The GLB supplies continuous idle/walk/run motion. These deterministic curves
// supply the upper-body beats missing from that asset: reload, weapon swap,
// grenade throw, and melee strike.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
const mix = (a, b, t) => a + (b - a) * t;

export function createHumanActionPose() {
  return {
    torsoX: 0, torsoZ: 0,
    rArmX: 0, rArmY: 0, rArmZ: 0, rForeX: 0, rForeZ: 0,
    lArmX: 0, lArmY: 0, lArmZ: 0, lForeX: 0, lForeZ: 0,
  };
}

function clear(out) {
  for (const key of Object.keys(out)) out[key] = 0;
  return out;
}

function addPose(out, pose) {
  for (const key of Object.keys(out)) out[key] += pose[key] || 0;
}

function threeKey(p, firstAt, secondAt, a, b, c, out) {
  let from, to, t;
  if (p <= firstAt) {
    from = a; to = b; t = smooth(p / Math.max(1e-5, firstAt));
  } else if (p <= secondAt) {
    from = b; to = c; t = smooth((p - firstAt) / Math.max(1e-5, secondAt - firstAt));
  } else {
    from = c; to = a; t = smooth((p - secondAt) / Math.max(1e-5, 1 - secondAt));
  }
  for (const key of Object.keys(out)) out[key] = mix(from[key] || 0, to[key] || 0, t);
  return out;
}

const ZERO = createHumanActionPose();
const TMP = createHumanActionPose();

const SWAP_LOW = {
  torsoX: 0.08, torsoZ: -0.04,
  rArmX: -0.62, rArmZ: 0.18, rForeX: -0.34,
  lArmX: -0.52, lArmZ: -0.12, lForeX: -0.32,
};
const RELOAD_MAG = {
  torsoX: 0.08, torsoZ: 0.055,
  rArmX: 0.16, rArmZ: 0.18, rForeX: 0.18, rForeZ: 0.12,
  lArmX: -0.48, lArmY: -0.10, lArmZ: -0.20,
  lForeX: -0.64, lForeZ: -0.24,
};
const RELOAD_RACK = {
  torsoX: 0.045, torsoZ: -0.025,
  rArmX: 0.10, rArmZ: 0.10, rForeX: 0.12,
  lArmX: 0.20, lArmY: 0.12, lArmZ: -0.08,
  lForeX: 0.36, lForeZ: 0.18,
};
const THROW_WIND = {
  torsoX: -0.08, torsoZ: -0.14,
  lArmX: -1.55, lArmY: -0.16, lArmZ: -0.38,
  lForeX: -0.92, lForeZ: -0.26,
};
const THROW_RELEASE = {
  torsoX: 0.12, torsoZ: 0.11,
  lArmX: 0.72, lArmY: 0.10, lArmZ: 0.18,
  lForeX: 0.18, lForeZ: 0.12,
};
const MELEE_WIND = {
  torsoX: -0.08, torsoZ: -0.22,
  rArmX: -1.14, rArmY: 0.12, rArmZ: 0.48,
  rForeX: 0.72, rForeZ: 0.34,
  lArmX: 0.18, lArmZ: -0.16,
};
const MELEE_CUT = {
  torsoX: 0.18, torsoZ: 0.24,
  rArmX: 0.88, rArmY: -0.08, rArmZ: -0.58,
  rForeX: -0.48, rForeZ: -0.32,
  lArmX: -0.22, lArmZ: 0.14,
};

/**
 * Sample an additive pose. Progress values start and end neutral, preventing
 * the one-frame pop that an event-driven, per-frame incremental pose creates.
 */
export function sampleHumanActionPose(input = {}, out = createHumanActionPose()) {
  clear(out);

  const swap = clamp01(input.swap || 0);
  if (swap > 0 && swap < 1) {
    threeKey(swap, 0.30, 0.58, ZERO, SWAP_LOW, SWAP_LOW, TMP);
    addPose(out, TMP);
  }

  const reload = clamp01(input.reload || 0);
  if (reload > 0 && reload < 1) {
    threeKey(reload, 0.34, 0.68, ZERO, RELOAD_MAG, RELOAD_RACK, TMP);
    addPose(out, TMP);
    const seat = Math.exp(-Math.pow((reload - 0.48) / 0.055, 2));
    const rack = Math.exp(-Math.pow((reload - 0.72) / 0.045, 2));
    out.lForeX += seat * 0.20 + rack * 0.24;
    out.torsoX -= rack * 0.035;
  }

  const throwP = clamp01(input.throwP || 0);
  if (throwP > 0 && throwP < 1) {
    threeKey(throwP, 0.32, 0.64, ZERO, THROW_WIND, THROW_RELEASE, TMP);
    addPose(out, TMP);
  }

  const swing = input.swing == null ? 1 : clamp01(input.swing);
  if (swing < 1) {
    threeKey(swing, 0.30, 0.57, ZERO, MELEE_WIND, MELEE_CUT, TMP);
    addPose(out, TMP);
  }

  return out;
}
