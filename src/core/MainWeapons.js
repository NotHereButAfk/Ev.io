// Your equippable "main" weapons: a fixed random set of 5 guns + the sword.
// Every OTHER weapon can't be equipped from the loadout — it only spawns on the
// map and is collected mid-match. The random 5 are chosen once and persisted so
// the loadout stays stable between sessions.
import { WEAPONS } from '../weapons/weaponDefs.js';

const _KEY = 'sio_main_guns';
const GUN_IDS = WEAPONS.filter((w) => w.kind !== 'melee').map((w) => w.id);
const SWORD_ID = 'sword';

function _pickFive() {
  const pool = [...GUN_IDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 5);
}

export const MainWeapons = {
  // The 5 equippable main guns (persisted random selection).
  getGunIds() {
    let ids = null;
    try { ids = JSON.parse(localStorage.getItem(_KEY)); } catch { /* ignore */ }
    const valid = Array.isArray(ids) && ids.length === 5 && ids.every((id) => GUN_IDS.includes(id));
    if (!valid) {
      ids = _pickFive();
      localStorage.setItem(_KEY, JSON.stringify(ids));
    }
    return ids;
  },

  // All equippable mains (guns + sword).
  getAllIds() { return [...this.getGunIds(), SWORD_ID]; },

  isMainGun(id) { return this.getGunIds().includes(id); },
  isMain(id)    { return id === SWORD_ID || this.isMainGun(id); },

  // Guns that are NOT mains — these only appear as map pickups.
  getMapGunIds() { return GUN_IDS.filter((id) => !this.isMainGun(id)); },

  // Re-roll the random 5 (if we ever want a button for it).
  reroll() { const ids = _pickFive(); localStorage.setItem(_KEY, JSON.stringify(ids)); return ids; },
};
