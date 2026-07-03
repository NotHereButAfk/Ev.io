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

  // True only if the player has explicitly equipped a skin for this weapon
  // (vs. the implicit default) — used to decide whether to show it skinned.
  hasSkin(weaponId) {
    return !!_load()[weaponId];
  },

  // ── ownership (gun + sword skins) ────────────────────────────────────────
  // The player's owned weapon/sword skin IDs. New accounts start with an
  // empty list, so the inventory only shows Default. Skins get added here
  // through the shop, battle pass, drops, etc.
  ownedSkins() {
    const d = _load();
    return Array.isArray(d.__owned) ? d.__owned : [];
  },
  ownsSkin(skinId) {
    return this.ownedSkins().includes(skinId);
  },
  grantSkin(skinId) {
    const d = _load();
    if (!Array.isArray(d.__owned)) d.__owned = [];
    if (!d.__owned.includes(skinId)) { d.__owned.push(skinId); _save(d); }
  },

  equipSkin(weaponId, skinId) {
    const d = _load();
    d[weaponId] = skinId;
    _save(d);
  },

  // Remove a weapon's skin so it shows its default (raw) look.
  clearSkin(weaponId) {
    const d = _load();
    delete d[weaponId];
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
