// Player loadout selection: you bring exactly ONE gun and ONE melee into a
// match. Backed by localStorage so the choice persists between sessions.
import { WEAPONS } from '../weapons/weaponDefs.js';

const _KEY = 'sio_loadout';

export const GUNS  = WEAPONS.filter((w) => w.kind !== 'melee');
export const MELEE = WEAPONS.filter((w) => w.kind === 'melee');

const DEFAULTS = { gun: 'm4', melee: 'knife' };

function _load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(_KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
function _save(d) { localStorage.setItem(_KEY, JSON.stringify(d)); }

function _validGun(id)   { return GUNS.some((w) => w.id === id) ? id : DEFAULTS.gun; }
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
