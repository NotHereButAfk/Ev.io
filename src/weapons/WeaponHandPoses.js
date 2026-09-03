// Physical hand-contact points in weapon-local space. Both first- and
// third-person rigs consume this one table, so a model cannot be correct in
// the viewmodel while a remote soldier grabs empty air (or vice versa).
export const DEFAULT_WEAPON_HAND_POSE = Object.freeze({
  trigger: [0.012, -0.086, 0.19],
  support: [-0.012, 0.022, -0.22],
  reload: [-0.040, -0.240, -0.020],
  supportVisible: true,
  carry: 'rifle',
});

export const WEAPON_HAND_POSES = Object.freeze({
  sidearm:       { trigger: [0.010, -0.108, 0.105], support: [-0.052, -0.094, 0.092], reload: [-0.025, -0.230, 0.105], supportVisible: false, carry: 'pistol' },
  magnum:        { trigger: [0.010, -0.112, 0.105], support: [-0.054, -0.098, 0.090], reload: [-0.025, -0.235, 0.105], supportVisible: false, carry: 'pistol' },
  uzi:           { trigger: [0.010, -0.060, 0.040], support: [-0.010, 0.020, -0.105], reload: [-0.040, -0.190, 0.020], carry: 'compact' },
  levershotgun:  { trigger: [0.010, -0.088, 0.140], support: [-0.012, 0.016, -0.255], reload: [-0.040, -0.225, -0.035], carry: 'shotgun' },
  m4:            { trigger: [0.012, -0.092, 0.200], support: [-0.012, -0.035, -0.440], reload: [-0.040, -0.260, -0.020] },
  m16:           { trigger: [0.012, -0.088, 0.200], support: [-0.012, 0.020, -0.270], reload: [-0.040, -0.250, -0.030] },
  rifle:         { trigger: [0.012, -0.100, 0.150], support: [-0.012, 0.018, -0.225], reload: [-0.040, -0.250, -0.020] },
  lmg:           { trigger: [0.012, -0.114, 0.220], support: [-0.012, 0.012, -0.280], reload: [-0.050, -0.265, 0.010], carry: 'support' },
  rpg:           { trigger: [0.012, -0.082, 0.060], support: [-0.012, 0.010, -0.255], reload: [-0.045, -0.205, -0.030], carry: 'launcher' },
  boltsniper:    { trigger: [0.012, -0.082, 0.200], support: [-0.012, 0.016, -0.285], reload: [-0.040, -0.245, -0.020], carry: 'precision' },
  battlerifle:   { trigger: [0.012, -0.090, 0.190], support: [-0.012, 0.020, -0.245], reload: [-0.040, -0.245, -0.020], carry: 'precision' },
  needler:       { trigger: [0.012, -0.090, 0.145], support: [-0.012, 0.018, -0.185], reload: [-0.045, -0.230, 0.015], carry: 'compact' },
  plasmarifle:   { trigger: [0.012, -0.086, 0.155], support: [-0.012, 0.018, -0.205], reload: [-0.045, -0.230, 0.005], carry: 'compact' },
  dmr:           { trigger: [0.012, -0.082, 0.220], support: [-0.012, 0.020, -0.260], reload: [-0.040, -0.245, -0.020], carry: 'precision' },
  fuelrod:       { trigger: [0.012, -0.095, 0.110], support: [-0.012, 0.015, -0.235], reload: [-0.050, -0.220, 0.000], carry: 'launcher' },
  concussion:    { trigger: [0.012, -0.090, 0.120], support: [-0.012, 0.018, -0.215], reload: [-0.045, -0.225, 0.000], carry: 'launcher' },
  energyshotgun: { trigger: [0.012, -0.092, 0.175], support: [-0.012, 0.018, -0.245], reload: [-0.040, -0.240, -0.015], carry: 'shotgun' },
  sword:         { trigger: [0.000, -0.020, 0.160], supportVisible: false, carry: 'melee' },
  knife:         { trigger: [0.000, -0.020, 0.120], supportVisible: false, carry: 'melee' },
  ghammer:       { trigger: [0.010, -0.120, 0.180], support: [-0.010, -0.015, -0.035], carry: 'melee' },
});

const RESOLVED_WEAPON_HAND_POSES = Object.freeze(Object.fromEntries(
  Object.entries(WEAPON_HAND_POSES).map(([id, pose]) => [
    id, Object.freeze({ ...DEFAULT_WEAPON_HAND_POSE, ...pose }),
  ]),
));

export function weaponHandPose(weaponOrId) {
  const id = typeof weaponOrId === 'string' ? weaponOrId : weaponOrId?.userData?.weaponId;
  return RESOLVED_WEAPON_HAND_POSES[id] || DEFAULT_WEAPON_HAND_POSE;
}
