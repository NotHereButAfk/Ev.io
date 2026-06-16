// Weapon stats for the 5 guns + 1 melee weapon. Times are in seconds.
export const WEAPONS = [
  {
    id: 'sidearm',
    name: 'Sidearm',
    kind: 'hitscan',
    damage: 18,
    pellets: 1,
    spread: 0.006,
    fireRate: 0.22,
    automatic: false,
    magSize: 12,
    reserveMax: 72,
    reloadTime: 1.1,
    range: 120,
    recoil: 0.018,
    color: 0x9aa5b1
  },
  {
    id: 'smg',
    name: 'Viper SMG',
    kind: 'hitscan',
    damage: 11,
    pellets: 1,
    spread: 0.018,
    fireRate: 0.085,
    automatic: true,
    magSize: 32,
    reserveMax: 160,
    reloadTime: 1.6,
    range: 90,
    recoil: 0.012,
    color: 0x4a5560
  },
  {
    id: 'shotgun',
    name: 'Buckshot',
    kind: 'hitscan',
    damage: 9,
    pellets: 8,
    spread: 0.09,
    fireRate: 0.85,
    automatic: false,
    magSize: 6,
    reserveMax: 30,
    reloadTime: 2.1,
    range: 28,
    recoil: 0.05,
    color: 0x6b4a2f
  },
  {
    id: 'rifle',
    name: 'Falcon Rifle',
    kind: 'hitscan',
    damage: 24,
    pellets: 1,
    spread: 0.01,
    fireRate: 0.13,
    automatic: true,
    magSize: 28,
    reserveMax: 112,
    reloadTime: 1.9,
    range: 140,
    recoil: 0.022,
    color: 0x3f4a3a
  },
  {
    id: 'sniper',
    name: 'Longshot',
    kind: 'hitscan',
    damage: 95,
    pellets: 1,
    spread: 0.001,
    fireRate: 1.15,
    automatic: false,
    magSize: 5,
    reserveMax: 20,
    reloadTime: 2.4,
    range: 300,
    recoil: 0.05,
    scoped: true,
    color: 0x2a2e35
  },
  {
    id: 'sword',
    name: 'Reaver Blade',
    kind: 'melee',
    damage: 65,
    fireRate: 0.45,
    range: 2.6,
    arc: 1.0,
    color: 0xc7ccd1
  }
];

export function getWeapon(id) {
  return WEAPONS.find((w) => w.id === id);
}
