// Per-weapon cosmetic skin storage, backed by localStorage.
// Each weapon has an independently equipped skin.
// Skins are a MAIN-weapon feature only (the loadout core guns) — extras and
// melee always show their default look. Enforced here centrally so the UI,
// the viewmodel and the thumbnails all agree.

import { getWeaponSkin } from '../weapons/WeaponSkins.js';
import { getSwordSkin } from '../weapons/SwordSkins.js';
import { getWeapon } from '../weapons/weaponDefs.js';

const _KEY = 'sio_armory';

function _load() {
  try { return JSON.parse(localStorage.getItem(_KEY) || '{}'); }
  catch { return {}; }
}
function _save(d) { localStorage.setItem(_KEY, JSON.stringify(d)); }

export const Armory = {
  // Only the main-category guns can wear skins.
  canSkin(weaponId) {
    return getWeapon(weaponId)?.category === 'main';
  },

  getSkinId(weaponId, isSword = false) {
    // No catalog default any more — an unset weapon simply has no skin (null).
    if (!this.canSkin(weaponId)) return null;
    return _load()[weaponId] || null;
  },

  // True only if the player has explicitly equipped a skin for this weapon
  // (vs. the implicit default) — used to decide whether to show it skinned.
  hasSkin(weaponId) {
    return this.canSkin(weaponId) && !!_load()[weaponId];
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
    if (this.ownedSkins().includes(skinId)) return true;
    // Common finishes are free; epic/legendary/mythic are bought in the
    // Night Market (Shop.buy -> grantSkin).
    const s = getWeaponSkin(skinId) || getSwordSkin(skinId);
    return s?.rarity === 'common';
  },
  grantSkin(skinId) {
    const d = _load();
    if (!Array.isArray(d.__owned)) d.__owned = [];
    if (!d.__owned.includes(skinId)) { d.__owned.push(skinId); _save(d); }
  },

  equipSkin(weaponId, skinId) {
    if (!this.canSkin(weaponId)) return;   // extras/melee stay default
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
      const skinId  = this.canSkin(w.id) ? (d[w.id] || null) : null;
      map.set(w.id, { skin: skinId ? (isSword ? getSwordSkin(skinId) : getWeaponSkin(skinId)) : null, isSword });
    }
    return map;
  },
};
