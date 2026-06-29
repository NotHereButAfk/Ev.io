// Player loadout selection: you bring exactly ONE gun and ONE melee into a
// match. Backed by localStorage so the choice persists between sessions.
import { WEAPONS } from '../weapons/weaponDefs.js';
import { MainWeapons } from './MainWeapons.js';

const _KEY = 'sio_loadout';

export const GUNS  = WEAPONS.filter((w) => w.kind !== 'melee');
// Only the Arc Blade is available in the standard loadout melee slot
export const MELEE = WEAPONS.filter((w) => w.id === 'sword');

const DEFAULTS = { gun: 'm4', melee: 'sword' };

function _load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(_KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
function _save(d) { localStorage.setItem(_KEY, JSON.stringify(d)); }

// Only a "main" gun (one of the random 5) may be equipped from the loadout.
function _validGun(id) {
  const mains = MainWeapons.getGunIds();
  return mains.includes(id) ? id : mains[0];
}
function _validMelee(id) { return MELEE.some((w) => w.id === id) ? id : DEFAULTS.melee; }

export const Loadout = {
  getGun()   { return _validGun(_load().gun); },
  getMelee() { return _validMelee(_load().melee); },

  setGun(id) {
    const d = _load();
    d.gun = _validGun(id);
    _save(d);
  },
  setMelee(id) {
    const d = _load();
    d.melee = _validMelee(id);
    _save(d);
  },
};
