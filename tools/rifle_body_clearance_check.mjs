#!/usr/bin/env node
// Geometry and hand-contact gate for every production firearm against the
// player body.
//
// A transform-only check can prove that the weapon origin is outside the
// shoulder while a one-metre mesh still runs through the chest behind it. This
// probe builds every shipped procedural firearm, transforms every vertex
// through the real carry function, tests it against conservative torso and
// shoulder volumes, and verifies both wrists against their final IK targets
// through the complete action sweep.

const noop = () => {};
const gradient = { addColorStop: noop };
const context2d = new Proxy({}, {
  get(target, key) {
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
    if (key === 'measureText') return () => ({ width: 10 });
    return target[key] ?? (target[key] = noop);
  },
  set(target, key, value) { target[key] = value; return true; },
});
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => context2d }),
};

const THREE = await import('three');
const { buildWeaponModel } = await import('../src/weapons/WeaponModels.js');
const { WEAPONS } = await import('../src/weapons/weaponDefs.js');
const {
  applyRifleCarry, restRifleTransform,
} = await import('../src/player/RifleCarry.js');
const { SHOULDER_X, SHOULDER_Y } = await import('../src/player/Proportions.js');
const { buildHeroBody } = await import('../src/player/HeroBody.js');
const { WEAPON_HAND_POSES, weaponHandPose } = await import('../src/weapons/WeaponHandPoses.js');

const TORSO = [
  // y, half-width, half-depth. These sit just inside the visible connected
  // trunk/armor, so a weapon vertex inside one is an unambiguous body clip.
  [0.98, 0.115, 0.085],
  [1.08, 0.145, 0.105],
  [1.22, 0.145, 0.102],
  [1.38, 0.150, 0.105],
  [1.52, 0.175, 0.118],
  [1.64, 0.170, 0.112],
  [1.74, 0.105, 0.080],
];
// Includes the largest playable pauldron, not only the bare shoulder joint.
// The smaller core sphere let the stock vanish into visible armor while the
// numerical test still reported zero contact.
const SHOULDER_RADIUS = 0.145;
const MAX_PENETRATION = 0.008;

function torsoRadii(y) {
  if (y < TORSO[0][0] || y > TORSO.at(-1)[0]) return null;
  for (let i = 0; i < TORSO.length - 1; i++) {
    const a = TORSO[i], b = TORSO[i + 1];
    if (y > b[0]) continue;
    const t = (y - a[0]) / (b[0] - a[0]);
    return [THREE.MathUtils.lerp(a[1], b[1], t), THREE.MathUtils.lerp(a[2], b[2], t)];
  }
  return null;
}

function torsoPenetration(p) {
  const radii = torsoRadii(p.y);
  if (!radii) return 0;
  const [rx, rz] = radii;
  // The trunk loft is a rounded rectangle rather than an ellipse. Exponent 3
  // follows that authored cross-section without counting empty AABB corners.
  const q = (Math.abs(p.x) / rx) ** 3 + (Math.abs(p.z) / rz) ** 3;
  return q < 1 ? (1 - Math.cbrt(q)) * Math.min(rx, rz) : 0;
}

const shoulderCenters = [
  new THREE.Vector3(-SHOULDER_X, SHOULDER_Y - 0.012, -0.005),
  new THREE.Vector3( SHOULDER_X, SHOULDER_Y - 0.012, -0.005),
];
function shoulderPenetration(p) {
  let deepest = 0;
  for (const c of shoulderCenters)
    deepest = Math.max(deepest, SHOULDER_RADIUS - p.distanceTo(c));
  return Math.max(0, deepest);
}

const states = [
  ['fresh attach', 0, {}, true],
  ['idle', 0.18, {}],
  ['walk crest', 0.18, { swing: 0.055 }],
  ['run trough', 0.30, { swing: -0.065, bodyPitch: -0.12 }],
  ['aim', 1, {}],
  ['aim up', 1, { aimPitch: 0.65 }],
  ['aim down', 1, { aimPitch: -0.65 }],
  ['flinch', 0.35, { flinch: 0.20 }],
  ...[0.20, 0.35, 0.50, 0.65, 0.80].map((reload) =>
    [`reload ${reload.toFixed(2)}`, 0.35, { reload }]),
  ...[0.25, 0.50, 0.75].map((swap) =>
    [`swap ${swap.toFixed(2)}`, 0.20, { swap }]),
];

const firearms = WEAPONS.filter((def) => def.kind !== 'melee');
const EXPECTED_CARRY = {
  m4: 'rifle', m16: 'rifle', rifle: 'rifle',
  sidearm: 'pistol', magnum: 'pistol',
  uzi: 'compact', needler: 'compact', plasmarifle: 'compact',
  levershotgun: 'shotgun', energyshotgun: 'shotgun',
  lmg: 'support',
  boltsniper: 'precision', battlerifle: 'precision', dmr: 'precision',
  rpg: 'launcher', fuelrod: 'launcher', concussion: 'launcher',
};
let failures = 0;
let globalTorso = 0;
let globalShoulder = 0;
let totalPoses = 0;
for (const def of firearms) {
  if (!WEAPON_HAND_POSES[def.id]) {
    console.error(`FAIL ${def.id}: missing explicit hand-contact profile`);
    failures++;
  }
  const actualCarry = weaponHandPose(def.id).carry;
  if (actualCarry !== EXPECTED_CARRY[def.id]) {
    console.error(`FAIL ${def.id}: carry=${actualCarry}, expected=${EXPECTED_CARRY[def.id]}`);
    failures++;
  }
  const body = buildHeroBody('vanguard');
  const rig = body.userData.rig;
  const bones = body.userData.bones;
  let weaponTorso = 0, weaponShoulder = 0, weaponRear = -Infinity;
  let weaponTrigger = 0, weaponSupport = 0, weaponFailures = 0;
  for (const [name, aim, options, freshAttach = false] of states) {
    totalPoses++;
    const weapon = buildWeaponModel(def, { procedural: true }).group;
    body.add(weapon);
    if (freshAttach) restRifleTransform(weapon);
    else applyRifleCarry(rig, weapon, aim, 1 / 60, options);
    body.updateMatrixWorld(true);

    let torso = 0, shoulder = 0, rear = -Infinity;
    const p = new THREE.Vector3();
    weapon.traverse((mesh) => {
      const position = mesh.isMesh && mesh.geometry?.attributes?.position;
      if (!position) return;
      for (let i = 0; i < position.count; i++) {
        p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        torso = Math.max(torso, torsoPenetration(p));
        shoulder = Math.max(shoulder, shoulderPenetration(p));
        // A stock disappearing behind the body-facing shoulder plane reads as
        // embedded even when no sampled vertex lands inside the conservative
        // torso volumes. Track the complete gun's rear-most surface too.
        if (p.y >= 1.20 && p.y <= 1.72) rear = Math.max(rear, p.z);
      }
    });
    globalTorso = Math.max(globalTorso, torso);
    globalShoulder = Math.max(globalShoulder, shoulder);
    weaponTorso = Math.max(weaponTorso, torso);
    weaponShoulder = Math.max(weaponShoulder, shoulder);
    weaponRear = Math.max(weaponRear, rear);
    let triggerError = 0, supportError = 0;
    if (!freshAttach) {
      const triggerTarget = new THREE.Vector3(...weaponHandPose(def.id).trigger)
        .applyMatrix4(weapon.matrixWorld);
      const triggerWrist = bones.handR.getWorldPosition(new THREE.Vector3());
      triggerError = triggerWrist.distanceTo(triggerTarget);
      const supportTarget = weapon.userData.rifleSupportTarget
        .clone().applyMatrix4(body.matrixWorld);
      supportError = bones.handL.getWorldPosition(new THREE.Vector3())
        .distanceTo(supportTarget);
    }
    weaponTrigger = Math.max(weaponTrigger, triggerError);
    weaponSupport = Math.max(weaponSupport, supportError);
    const rearClear = rear === -Infinity || rear <= 0;
    const ok = torso <= MAX_PENETRATION && shoulder <= MAX_PENETRATION && rearClear
      && triggerError <= MAX_PENETRATION && supportError <= MAX_PENETRATION;
    if (!ok) {
      failures++;
      weaponFailures++;
      console.log(
        `FAIL ${def.id.padEnd(15)} ${name.padEnd(14)} `
        + `torso=${(torso * 100).toFixed(1)}cm shoulder=${(shoulder * 100).toFixed(1)}cm `
        + `rear=${rear === -Infinity ? 'n/a' : `${(rear * 100).toFixed(1)}cm`} `
        + `trigger=${(triggerError * 100).toFixed(1)}cm `
        + `support=${(supportError * 100).toFixed(1)}cm`,
      );
    }
    body.remove(weapon);
  }
  const ok = weaponFailures === 0;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${def.id.padEnd(15)} ${states.length} poses `
    + `torso=${(weaponTorso * 100).toFixed(1)}cm `
    + `shoulder=${(weaponShoulder * 100).toFixed(1)}cm `
    + `rear=${weaponRear === -Infinity ? 'n/a' : `${(weaponRear * 100).toFixed(1)}cm`} `
    + `trigger=${(weaponTrigger * 100).toFixed(1)}cm `
    + `support=${(weaponSupport * 100).toFixed(1)}cm`,
  );
}

if (failures) {
  console.error(
    `firearm body clearance failed: ${failures}/${totalPoses} poses violate clearance/contact `
    + `(worst torso ${(globalTorso * 100).toFixed(1)}cm, `
    + `shoulder ${(globalShoulder * 100).toFixed(1)}cm)`,
  );
  process.exit(1);
}
console.log(
  `firearm body clearance passed: ${firearms.length} firearms, ${totalPoses} production poses, `
  + `worst torso ${(globalTorso * 100).toFixed(1)}cm, `
  + `shoulder ${(globalShoulder * 100).toFixed(1)}cm`,
);
