/**
 * INVENTORY (ev.io-style) — simple tabs + card grid.
 *
 * Tabs: Character + 5 main weapons + Sword. Each tab shows a "Default" card
 * (base look) plus every skin for that item. Only ONE gun can be your main
 * weapon at a time — clicking any gun card (Default or a skin) sets that gun
 * as main and applies its skin. The EQUIPPED row shows the current character
 * skin + main weapon card.
 */
import { SKINS, getSkin } from '../player/skins.js';
import { ARMOR_SKINS, RARITY_COLORS, getArmorSkin } from '../player/ArmorSkins.js';
import { WEAPONS } from '../weapons/weaponDefs.js';
import { WEAPON_SKINS } from '../weapons/WeaponSkins.js';
import { SWORD_SKINS } from '../weapons/SwordSkins.js';
import { Armory } from '../core/Armory.js';
import { Loadout } from '../core/Loadout.js';
import { Shop } from '../core/Shop.js';
import { UserAccount } from '../core/UserAccount.js';
import { warmWeaponThumbs, getWeaponThumb, renderWeaponSkinned } from './WeaponThumbnails.js';

// The 5 main-weapon slots offered in the inventory (with ev.io-style labels).
// If the saved loadout points to a gun that isn't here, we snap it to the
// first entry when the panel opens so EQUIPPED matches an actual tab.
export const MAIN_GUNS = [
  { id: 'm4',            label: 'Auto Rifle' },
  { id: 'magnum',        label: 'Hand Cannon' },
  { id: 'battlerifle',   label: 'Burst Rifle' },
  { id: 'energyshotgun', label: 'Sweeper' },
  { id: 'plasmarifle',   label: 'Laser Rifle' },
];
const MAIN_GUN_IDS = new Set(MAIN_GUNS.map((g) => g.id));

const TABS = [
  { id: 'character', label: 'Character' },
  ...MAIN_GUNS,
  { id: 'sword',     label: 'Sword' },
];

// ── helpers ──────────────────────────────────────────────────────────────────
const CHAR_SVG = `
  <svg viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <ellipse cx="16" cy="7" rx="5" ry="6" fill="rgba(0,0,0,0.55)"/>
    <rect x="9" y="14" width="14" height="14" rx="2" fill="rgba(0,0,0,0.45)"/>
    <rect x="3" y="14" width="5" height="11" rx="2" fill="rgba(0,0,0,0.4)"/>
    <rect x="24" y="14" width="5" height="11" rx="2" fill="rgba(0,0,0,0.4)"/>
    <rect x="9" y="29" width="5" height="13" rx="2" fill="rgba(0,0,0,0.45)"/>
    <rect x="18" y="29" width="5" height="13" rx="2" fill="rgba(0,0,0,0.45)"/>
    <rect x="10" y="11" width="12" height="4" rx="1" fill="rgba(0,207,255,0.6)"/>
  </svg>`;

function _hex(n) { return n.toString(16).padStart(6, '0'); }
function _grad(a, b) { return `linear-gradient(155deg, #${_hex(a >>> 0)}, #${_hex(b >>> 0)})`; }
function _darken(hex, f) {
  const r = Math.floor((hex >> 16 & 255) * f), g = Math.floor((hex >> 8 & 255) * f), b = Math.floor((hex & 255) * f);
  return (r << 16 | g << 8 | b) >>> 0;
}
function _clean(s) { return String(s || '').replace(/[^\x00-\x7F]+/g, '').trim() || String(s || ''); }

// Static skinned-weapon renders (dataURLs) keyed `${weaponId}:${skinId}`,
// cached so each card only pays its 3D render cost once per session.
const _thumbCache = new Map();

export class InventoryPanel {
  constructor(host) {
    this.host = host;
    this._tab = 'character';        // which tab is active
    this._renderToken = 0;          // cancels in-flight thumb pumps
    this._open = false;

    // Real skinned thumbnails; refresh once they're ready.
    warmWeaponThumbs(() => { if (this._open) this._renderGrid(); });

    document.getElementById('inv-close-btn')?.addEventListener('click', () => {
      this.host._closeAllPanels();
    });
  }

  open() {
    this._open = true;
    // Sync display name into the header.
    const nameEl = document.getElementById('inv-username');
    const u = this.host._currentUser;
    if (nameEl) {
      nameEl.textContent = (u && u !== '__guest__') ? UserAccount.getDisplayName(u) : (u === '__guest__' ? 'guest' : 'Recruit');
    }
    // If the saved loadout points to a gun outside the 5 main slots, snap to
    // the first main gun so EQUIPPED always matches an available tab.
    if (!MAIN_GUN_IDS.has(Loadout.getGun())) Loadout.setGun(MAIN_GUNS[0].id);

    this._renderMeta();
    this._renderTabs();
    this._renderEquipped();
    this._renderGrid();
  }

  close() {
    this._open = false;
    this._renderToken++;
  }

  refreshAll() { if (this._open) this.open(); }

  // ── header meta ────────────────────────────────────────────────────────────

  _renderMeta() {
    const bal = document.getElementById('inv-balance');
    if (bal) bal.textContent = Shop.getCoins().toLocaleString();
    const nw = document.getElementById('inv-networth');
    if (nw) {
      const owned = ARMOR_SKINS.filter((s) => Shop.isOwned(s.id));
      nw.textContent = owned.reduce((t, s) => t + (s.price || 0), 0).toLocaleString();
    }
  }

  // ── tab strip ──────────────────────────────────────────────────────────────

  _renderTabs() {
    const tabs = document.getElementById('inv-tabs');
    if (!tabs) return;
    tabs.innerHTML = '';
    for (const t of TABS) {
      const b = document.createElement('button');
      b.className = 'inv-tab' + (t.id === this._tab ? ' active' : '');
      b.textContent = t.label;
      b.addEventListener('click', () => {
        if (this._tab === t.id) return;
        this._tab = t.id;
        tabs.querySelectorAll('.inv-tab').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        this._renderGrid();
      });
      tabs.appendChild(b);
    }
  }

  // ── EQUIPPED row (character + main weapon) ─────────────────────────────────

  _renderEquipped() {
    const row = document.getElementById('inv-equipped');
    if (!row) return;
    row.innerHTML = '';

    // Character card — shows the equipped armor finish (or Default look).
    const armorSkinId = Shop.getEquipped();
    const armorSkin   = getArmorSkin(armorSkinId);
    const playerSkin  = getSkin(this.host.selectedSkinId);
    if (armorSkin) {
      row.appendChild(this._characterCard(armorSkin, /*equipped=*/true));
    } else {
      row.appendChild(this._defaultCharacterCard(playerSkin, /*equipped=*/true));
    }

    // Main weapon card — the currently equipped gun + its skin.
    const gunId  = Loadout.getGun();
    const gunDef = WEAPONS.find((w) => w.id === gunId);
    if (gunDef) {
      const skinId = Armory.hasSkin(gunId) ? Armory.getSkinId(gunId, false) : null;
      const skin   = skinId ? WEAPON_SKINS.find((s) => s.id === skinId) : null;
      row.appendChild(this._weaponCard(gunDef, skin, /*equipped=*/true));
    }
  }

  // ── main grid (Default + skin cards for the active tab) ────────────────────

  _renderGrid() {
    const grid = document.getElementById('inv-grid');
    if (!grid) return;
    grid.innerHTML = '';
    this._renderToken++;
    const token = this._renderToken;

    if (this._tab === 'character') {
      this._renderCharacterGrid(grid);
      return;
    }
    const gun = WEAPONS.find((w) => w.id === this._tab);
    if (!gun) return;
    const isMelee = gun.kind === 'melee';

    // Default card — the raw weapon with no skin.
    grid.appendChild(this._weaponCard(gun, null, this._isEquipped(gun.id, null), () => {
      this._equipWeapon(gun, null);
    }));

    // Every skin card. Real skinned renders drop in progressively.
    const skins = isMelee ? SWORD_SKINS : WEAPON_SKINS;
    const jobs = [];
    for (const s of skins) {
      const card = this._weaponCard(gun, s, this._isEquipped(gun.id, s.id), () => {
        this._equipWeapon(gun, s.id);
      });
      grid.appendChild(card);
      const img = card.querySelector('.inv-card-img');
      if (img) jobs.push({ img, gun, skin: s });
    }
    this._pumpThumbs(token, jobs);
  }

  _renderCharacterGrid(grid) {
    // Default (no armor finish) — shows base soldier.
    const playerSkin = getSkin(this.host.selectedSkinId);
    grid.appendChild(
      this._defaultCharacterCard(playerSkin, !Shop.getEquipped(), () => this._equipCharacter(null))
    );
    // One card per armor finish (owned or not; equipping locked ones opens the shop).
    for (const s of ARMOR_SKINS) {
      grid.appendChild(this._characterCard(s, Shop.getEquipped() === s.id, () => this._equipCharacter(s)));
    }
  }

  // ── equip actions ──────────────────────────────────────────────────────────

  _equipWeapon(gun, skinId) {
    if (gun.kind === 'melee') {
      Loadout.setMelee(gun.id);
    } else {
      Loadout.setGun(gun.id); // this becomes the player's main
    }
    if (skinId) Armory.equipSkin(gun.id, skinId);
    else Armory.clearSkin(gun.id);
    this.host.onArmoryChanged?.();
    this._renderEquipped();
    this._renderGrid();
  }

  _equipCharacter(skin) {
    if (!skin) {
      Shop.unequip();
      this.host.onArmorSkinEquipped?.(null);
    } else {
      if (!Shop.isOwned(skin.id)) { this.host._togglePanel('shop'); return; }
      Shop.equip(skin.id);
      this.host.onArmorSkinEquipped?.(skin.id);
    }
    this.host._updateArmorPreview();
    this._renderEquipped();
    this._renderGrid();
  }

  _isEquipped(weaponId, skinId) {
    const isMelee = WEAPONS.find((w) => w.id === weaponId)?.kind === 'melee';
    const curMain = isMelee ? Loadout.getMelee() : Loadout.getGun();
    if (curMain !== weaponId) return false;
    const curSkin = Armory.hasSkin(weaponId) ? Armory.getSkinId(weaponId, isMelee) : null;
    return curSkin === (skinId ?? null);
  }

  // ── card builders ──────────────────────────────────────────────────────────

  _cardBase({ bg, rarity, equipped, name, onClick }) {
    const card = document.createElement('div');
    card.className = 'inv-item' + (equipped ? ' equipped' : '');
    if (rarity) card.dataset.rarity = rarity;
    card.style.background = bg;
    if (rarity && RARITY_COLORS[rarity]) card.style.setProperty('--rar', RARITY_COLORS[rarity]);

    const nm = document.createElement('div');
    nm.className = 'inv-item-name';
    nm.textContent = name;
    card.appendChild(nm);
    if (onClick) card.addEventListener('click', onClick);
    return card;
  }

  _weaponCard(gun, skin, equipped, onClick) {
    const isMelee = gun.kind === 'melee';
    const bg = skin
      ? (isMelee ? _grad(skin.blade ?? 0x8090a0, skin.guard ?? 0x303840)
                 : _grad(skin.body  ?? 0x556070, skin.accent ?? 0x202830))
      : _grad(gun.color || 0x2a3040, _darken(gun.color || 0x2a3040, 0.4));
    const card = this._cardBase({
      bg, rarity: skin?.rarity, equipped, onClick,
      name: skin ? _clean(skin.name) : 'Default',
    });
    const img = document.createElement('div');
    img.className = 'inv-card-img';
    const cachedKey = skin ? `${gun.id}:${skin.id}` : `${gun.id}:__def__`;
    const cached = _thumbCache.get(cachedKey);
    const fallback = getWeaponThumb(gun.id);
    if (cached) img.style.backgroundImage = `url(${cached})`;
    else if (!skin && fallback) img.style.backgroundImage = `url(${fallback})`;
    else if (fallback) img.style.backgroundImage = `url(${fallback})`;
    card.insertBefore(img, card.firstChild);
    return card;
  }

  _characterCard(armorSkin, equipped, onClick) {
    const owned = Shop.isOwned(armorSkin.id);
    const bg = _grad(armorSkin.primary, armorSkin.secondary);
    const card = this._cardBase({
      bg, rarity: armorSkin.rarity, equipped, onClick,
      name: _clean(armorSkin.name),
    });
    const fig = document.createElement('div');
    fig.className = 'inv-card-fig';
    fig.innerHTML = CHAR_SVG;
    card.insertBefore(fig, card.firstChild);
    if (!owned) {
      const lock = document.createElement('div');
      lock.className = 'inv-card-lock';
      lock.textContent = `🔒 ◆ ${armorSkin.price.toLocaleString()}`;
      card.appendChild(lock);
      card.classList.add('locked');
    }
    return card;
  }

  _defaultCharacterCard(playerSkin, equipped, onClick) {
    const bg = _grad(playerSkin.primary, playerSkin.secondary);
    const card = this._cardBase({
      bg, rarity: null, equipped, onClick,
      name: 'Default',
    });
    const fig = document.createElement('div');
    fig.className = 'inv-card-fig';
    fig.innerHTML = CHAR_SVG;
    card.insertBefore(fig, card.firstChild);
    return card;
  }

  // Progressive real-render pipeline: a few skinned renders per frame, cached.
  _pumpThumbs(token, jobs) {
    const pump = () => {
      if (token !== this._renderToken) return;
      let n = 0;
      while (jobs.length && n < 3) {
        const j = jobs.shift();
        const key = `${j.gun.id}:${j.skin.id}`;
        let src = _thumbCache.get(key);
        if (!src) {
          try { src = renderWeaponSkinned(j.gun, j.skin); } catch { src = null; }
          if (src) _thumbCache.set(key, src);
        }
        if (src) j.img.style.backgroundImage = `url(${src})`;
        n++;
      }
      if (jobs.length) requestAnimationFrame(pump);
    };
    if (jobs.length) requestAnimationFrame(pump);
  }
}
