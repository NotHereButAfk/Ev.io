// Pure authored-marker mapping kept separate from PickupSystem's browser-only
// weapon model imports so the official map verifier can test it in Node.
export const AUTHORED_WEAPON_BY_KIND = new Map([
  [524288,  { id: 'boltsniper', color: 0x33d0ec }],
  [1048576, { id: 'fuelrod',    color: 0x5cff7a }],
  [2097152, { id: 'concussion', color: 0xb27bff }],
  [8388608, { id: 'rpg',        color: 0xff7a1a }],
]);

export function authoredWeaponSpecs(points = []) {
  return points
    .map((position) => {
      const spec = AUTHORED_WEAPON_BY_KIND.get(position.markerKind);
      return spec ? { ...spec, position } : null;
    })
    .filter(Boolean);
}
