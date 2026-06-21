// Per-weapon cosmetic skin storage, backed by localStorage.
// Each weapon has an independently equipped skin.

import { WEAPON_SKINS, getWeaponSkin } from '../weapons/WeaponSkins.js';
import { SWORD_SKINS, getSwordSkin } from '../weapons/SwordSkins.js';

const _KEY = 'sio_armory';

function _load() {
  try { return JSON.parse(localStorage.getItem(_KEY) || '{}'); }
  catch { return {}; }
}
function _save(d) { localStorage.setItem(_KEY, JSON.stringify(d)); }

export const Armory = {
  getSkinId(weaponId, isSword = false) {
    return _load()[weaponId] || (isSword ? SWORD_SKINS[0].id : WEAPON_SKINS[0].id);
  },

  equipSkin(weaponId, skinId) {
    const d = _load();
    d[weaponId] = skinId;
    _save(d);
  },

  // Returns Map<weaponId, { skin, isSword }>  for all weapons in loadout
  buildSkinMap(weapons) {
    const d = _load();
    const map = new Map();
    for (const w of weapons) {
      const isSword = w.kind === 'melee';
      const skinId  = d[w.id] || (isSword ? SWORD_SKINS[0].id : WEAPON_SKINS[0].id);
      map.set(w.id, { skin: isSword ? getSwordSkin(skinId) : getWeaponSkin(skinId), isSword });
    }
    return map;
  },
};
