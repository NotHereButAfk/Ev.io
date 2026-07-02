/**
 * INVENTORY v3 — the full loadout hub.
 *
 * Two-pane layout: a categorised weapon sidebar (sidearms / rifles / smgs /
 * shotguns / heavy / snipers / melee + the operative) and a main column with
 * a live rotating 3D inspector, weapon stat bars, and the skin grid.
 *
 * Features on top of v2:
 *   • hover any card → live skinned 3D preview + rarity perks + stat sheet
 *   • favorites (★, persisted), sort (tier ↑/↓, A–Z), search, rarity chips,
 *     animated-only filter
 *   • loadout presets — save/apply/clear 3 full snapshots (gun + skins +
 *     armor + colorway), plus a one-click randomizer
 *   • equipped-perk summary chips (damage / HP / kill-coin multiplier)
 *   • real networth (owned armor finishes) + collection line
 *   • character view: armor class, colorways, and shop armor finishes with
 *     owned/equip/price states — all previewed live on the turntable
 */
import { SKINS, getSkin } from '../player/skins.js';
import { ARMOR_TYPES, getArmorType, saveArmorType } from '../player/ArmorTypes.js';
import { ARMOR_SKINS, getArmorSkin } from '../player/ArmorSkins.js';
import { RARITY_COLORS, rarityRank } from '../core/Rarity.js';
import { WEAPONS } from '../weapons/weaponDefs.js';
import { WEAPON_SKINS } from '../weapons/WeaponSkins.js';
import { SWORD_SKINS } from '../weapons/SwordSkins.js';
import { Armory } from '../core/Armory.js';
import { Loadout, GUNS } from '../core/Loadout.js';
import { Shop } from '../core/Shop.js';
import { UserAccount } from '../core/UserAccount.js';
import { GUN_PERKS, ARMOR_PERKS, KILL_MULT_BONUS, describePerk } from '../core/RarityPerks.js';
import { ArmorPreviewRenderer } from './ArmorPreviewRenderer.js';
import { warmWeaponThumbs, getWeaponThumb, renderWeaponSkinned } from './WeaponThumbnails.js';

// ── helpers ──────────────────────────────────────────────────────────────────
function _hex(n) { return n.toString(16).padStart(6, '0'); }
function _grad(a, b) { return `linear-gradient(150deg, #${_hex(a >>> 0)}, #${_hex(b >>> 0)})`; }
function _darken(hex, f) {
  const r = Math.floor((hex >> 16 & 255) * f), g = Math.floor((hex >> 8 & 255) * f), b = Math.floor((hex & 255) * f);
  return (r << 16 | g << 8 | b) >>> 0;
}
function _clean(s) { return String(s).replace(/[^\x00-\x7F]+/g, '').trim() || String(s); }
function _esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Sidebar weapon groups. Ids are validated against WEAPONS at build time and
// any gun missing from the map lands in OTHER so new weapons never vanish.
const CATEGORY_MAP = [
  { label: 'SIDEARMS', ids: ['sidearm', 'magnum'] },
  { label: 'RIFLES',   ids: ['m4', 'm16', 'rifle', 'battlerifle', 'dmr'] },
  { label: 'SMGS',     ids: ['uzi', 'needler', 'plasmarifle'] },
  { label: 'SHOTGUNS', ids: ['levershotgun', 'energyshotgun'] },
  { label: 'HEAVY',    ids: ['lmg', 'rpg', 'fuelrod', 'concussion'] },
  { label: 'SNIPERS',  ids: ['boltsniper'] },
  { label: 'MELEE',    ids: ['sword'] },
];

const RARITY_CHIP_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

const ICON_CHAR = '<svg viewBox="0 0 24 24" fill="none" stroke="#eaf2f8" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M5 21v-1a7 7 0 0114 0v1"/></svg>';
const STAR_ON  = '★';
const STAR_OFF = '☆';

// localStorage keys
const FAV_KEY    = 'kyx_inv_favs';
const PRESET_KEY = 'kyx_inv_presets';
const SORT_KEY   = 'kyx_inv_sort';

function _loadFavs()   { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch { return new Set(); } }
function _saveFavs(f)  { localStorage.setItem(FAV_KEY, JSON.stringify([...f])); }
function _loadPresets(){ try { const a = JSON.parse(localStorage.getItem(PRESET_KEY) || '[]'); return [a[0] || null, a[1] || null, a[2] || null]; } catch { return [null, null, null]; } }
function _savePresets(p) { localStorage.setItem(PRESET_KEY, JSON.stringify(p)); }

// Cache of real skinned-weapon renders (dataURLs) keyed `${weaponId}:${skinId}`
// so each card only ever pays its 3D render cost once per session.
const _thumbCache = new Map();

// Stat ceilings for normalising the hero bar widths (computed once).
function _statMaxes() {
  const guns = WEAPONS.filter((w) => w.kind !== 'melee');
  const melee = WEAPONS.filter((w) => w.kind === 'melee');
  const m = (list, fn) => Math.max(...list.map(fn));
  return {
    gun: {
      dmg:   m(guns, (w) => w.damage * (w.pellets || 1)),
      dps:   m(guns, (w) => (w.damage * (w.pellets || 1)) / w.fireRate),
      rps:   m(guns, (w) => 1 / w.fireRate),
      range: m(guns, (w) => w.range),
      mag:   m(guns, (w) => w.magSize),
    },
    melee: {
      dmg:   m(melee, (w) => w.damage),
      rps:   m(melee, (w) => 1 / w.fireRate),
      range: m(melee, (w) => w.range),
    },
  };
}
const MAXES = _statMaxes();

export class InventoryPanel {
  constructor(host) {
    this.host = host;                 // MenuUI — selections, previews, callbacks
    this._view = null;                // 'character' | weaponId
    this._selSkinId = null;           // selected skin in current weapon view (null = default)
    this._favs = _loadFavs();
    this._presets = _loadPresets();
    this._sort = localStorage.getItem(SORT_KEY) || 'tierdesc';
    this._filter = { q: '', rarity: 'all', favOnly: false, animOnly: false };
    this._charStage = null;
    this._cards = [];                 // live grid entries for filtering/badges
    this._renderToken = 0;            // cancels in-flight thumb pumps
    this._open = false;

    // Render real weapon-model thumbnails; refresh once they're ready.
    warmWeaponThumbs(() => { if (this._open) this.refreshAll(); });

    document.getElementById('inv-wallet-btn')?.addEventListener('click', () => {
      const el = document.getElementById('inv-wallet-btn');
      if (el) el.textContent = '✓ Wallet Linked';
    });
    document.getElementById('inv-account-btn')?.addEventListener('click', () => this.host._togglePanel('profile'));

    // "/" jumps to the skin search while the inventory is open.
    document.addEventListener('keydown', (e) => {
      if (!this._open || e.key !== '/') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const s = document.querySelector('#inv3-toolbar .inv-skin-search');
      if (s) { e.preventDefault(); s.focus(); }
    });
  }

  // ── lifecycle ───────────────────────────────────────────────────────────────

  open() {
    this._open = true;
    const nameI = document.getElementById('player-name');
    const u = this.host._currentUser;
    if (nameI && u && u !== '__guest__') nameI.value = UserAccount.getDisplayName(u);
    if (!this._view) this._view = Loadout.getGun();
    this.refreshAll();
  }

  close() {
    this._open = false;
    this._renderToken++;
    this._charStage?.stop();
  }

  refreshAll() {
    if (!document.getElementById('inv3-side')) return;
    this._renderMeta();
    this._renderPerkChips();
    this._renderPresetBar();
    this._renderSide();
    this._renderView();
  }

  // ── header: balance / networth / collection + perk summary ────────────────

  _renderMeta() {
    const bal = document.getElementById('inv-balance');
    if (bal) bal.textContent = Shop.getCoins().toLocaleString();
    const owned = ARMOR_SKINS.filter((s) => Shop.isOwned(s.id));
    const nw = document.getElementById('inv-networth');
    if (nw) nw.textContent = owned.reduce((t, s) => t + (s.price || 0), 0).toLocaleString();
    const col = document.getElementById('inv-collection');
    if (col) col.textContent =
      `${owned.length}/${ARMOR_SKINS.length} finishes · ${WEAPON_SKINS.length + SWORD_SKINS.length} skins`;
  }

  _equippedRarities() {
    const gunId = Loadout.getGun(), meleeId = Loadout.getMelee();
    const gunSkin   = Armory.hasSkin(gunId)   ? WEAPON_SKINS.find((s) => s.id === Armory.getSkinId(gunId)) : null;
    const meleeSkin = Armory.hasSkin(meleeId) ? SWORD_SKINS.find((s) => s.id === Armory.getSkinId(meleeId, true)) : null;
    const armorSkin = getArmorSkin(Shop.getEquipped());
    return {
      gun:   gunSkin?.rarity   || 'common',
      melee: meleeSkin?.rarity || 'common',
      armor: armorSkin?.rarity || 'common',
    };
  }

  _renderPerkChips() {
    const el = document.getElementById('inv3-perks');
    if (!el) return;
    const r = this._equippedRarities();
    const gp = GUN_PERKS[r.gun] || GUN_PERKS.common;
    const ap = ARMOR_PERKS[r.armor] || ARMOR_PERKS.common;
    const mult = Math.min(5,
      1 + (KILL_MULT_BONUS[r.gun] || 0) + (KILL_MULT_BONUS[r.melee] || 0) + (KILL_MULT_BONUS[r.armor] || 0));
    const chips = [];
    if (gp.damageBonus) chips.push(`⚔ +${Math.round(gp.damageBonus * 100)}% DMG`);
    if (ap.healthBonus) chips.push(`♥ +${ap.healthBonus} HP`);
    if (ap.shieldBonus) chips.push(`🛡 +${ap.shieldBonus} SHIELD`);
    chips.push(`◆ ${mult.toFixed(2)}× COINS`);
    el.innerHTML = '<div class="inv3-perks-label">LOADOUT PERKS</div>'
      + chips.map((c) => `<span class="inv3-perk-chip">${c}</span>`).join('');
  }

  // ── presets + randomizer ────────────────────────────────────────────────────

  _snapshot() {
    const gun = Loadout.getGun(), melee = Loadout.getMelee();
    return {
      gun,
      gunSkin:   Armory.hasSkin(gun)   ? Armory.getSkinId(gun) : null,
      meleeSkin: Armory.hasSkin(melee) ? Armory.getSkinId(melee, true) : null,
      armorType: this.host.selectedArmorId,
      playerSkin: this.host.selectedSkinId,
      armorSkin: Shop.getEquipped() || null,
    };
  }

  _applySnapshot(p) {
    Loadout.setGun(p.gun);
    if (p.gunSkin) Armory.equipSkin(p.gun, p.gunSkin); else Armory.clearSkin(p.gun);
    const melee = Loadout.getMelee();
    if (p.meleeSkin) Armory.equipSkin(melee, p.meleeSkin); else Armory.clearSkin(melee);
    if (p.armorType) {
      this.host.selectedArmorId = p.armorType;
      saveArmorType(p.armorType);
      this.host.onArmorChanged?.(p.armorType);
    }
    if (p.playerSkin) this.host.selectedSkinId = p.playerSkin;
    if (p.armorSkin && Shop.isOwned(p.armorSkin)) {
      Shop.equip(p.armorSkin);
      this.host.onArmorSkinEquipped?.(p.armorSkin);
    } else if (!p.armorSkin) {
      Shop.unequip();
      this.host.onArmorSkinEquipped?.(null);
    }
    this.host._updateArmorPreview();
    this.host.onArmoryChanged?.();
  }

  _presetLabel(p) {
    const w = WEAPONS.find((x) => x.id === p.gun);
    const s = p.gunSkin ? WEAPON_SKINS.find((x) => x.id === p.gunSkin) : null;
    return `${w ? w.name : p.gun} · ${s ? _clean(s.name) : 'Default'}`;
  }

  _renderPresetBar() {
    const bar = document.getElementById('inv3-loadoutbar');
    if (!bar) return;
    bar.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'inv3-bar-label';
    label.textContent = 'LOADOUTS';
    bar.appendChild(label);

    this._presets.forEach((p, i) => {
      const chip = document.createElement('div');
      chip.className = 'inv3-preset' + (p ? '' : ' empty');
      const main = document.createElement('button');
      main.className = 'inv3-preset-main';
      if (p) {
        main.innerHTML = `<span class="inv3-preset-slot">${'ABC'[i]}</span>${_esc(this._presetLabel(p))}`;
        main.title = 'Apply this loadout';
        main.addEventListener('click', () => {
          this._applySnapshot(p);
          this._view = p.gun;
          this.refreshAll();
          main.classList.add('applied');
          const t = main.querySelector('.inv3-preset-slot');
          if (t) t.textContent = '✓';
          setTimeout(() => this._renderPresetBar(), 900);
        });
      } else {
        main.innerHTML = `<span class="inv3-preset-slot">${'ABC'[i]}</span>+ SAVE SLOT`;
        main.title = 'Save your current loadout here';
        main.addEventListener('click', () => {
          this._presets[i] = this._snapshot();
          _savePresets(this._presets);
          this._renderPresetBar();
        });
      }
      chip.appendChild(main);
      if (p) {
        const save = document.createElement('button');
        save.className = 'inv3-preset-io';
        save.textContent = '⟳';
        save.title = 'Overwrite with current loadout';
        save.addEventListener('click', () => {
          this._presets[i] = this._snapshot();
          _savePresets(this._presets);
          this._renderPresetBar();
        });
        chip.appendChild(save);
        const del = document.createElement('button');
        del.className = 'inv3-preset-io';
        del.textContent = '✕';
        del.title = 'Clear this slot';
        del.addEventListener('click', () => {
          this._presets[i] = null;
          _savePresets(this._presets);
          this._renderPresetBar();
        });
        chip.appendChild(del);
      }
      bar.appendChild(chip);
    });

    const dice = document.createElement('button');
    dice.className = 'inv3-dice';
    dice.innerHTML = '⚄ RANDOMIZE';
    dice.title = 'Random gun, skins, colorway and armor';
    dice.addEventListener('click', () => this._randomLoadout());
    bar.appendChild(dice);
  }

  _randomLoadout() {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const owned = ARMOR_SKINS.filter((s) => Shop.isOwned(s.id));
    const snap = {
      gun: pick(GUNS).id,
      gunSkin: pick(WEAPON_SKINS).id,
      meleeSkin: pick(SWORD_SKINS).id,
      armorType: pick(ARMOR_TYPES).id,
      playerSkin: pick(SKINS).id,
      armorSkin: owned.length ? pick([...owned.map((s) => s.id), null]) : null,
    };
    this._applySnapshot(snap);
    this._view = snap.gun;
    this.refreshAll();
  }

  // ── sidebar ────────────────────────────────────────────────────────────────

  _renderSide() {
    const side = document.getElementById('inv3-side');
    if (!side) return;
    side.innerHTML = '';

    const mkLabel = (t) => {
      const l = document.createElement('div');
      l.className = 'inv3-cat-label';
      l.textContent = t;
      side.appendChild(l);
    };

    // Operative (character) entry
    mkLabel('OPERATIVE');
    const armor = getArmorType(this.host.selectedArmorId);
    const skin = getSkin(this.host.selectedSkinId);
    side.appendChild(this._sideRow({
      view: 'character', name: 'CHARACTER',
      sub: `${armor.name} · ${skin.name}`, subColor: null,
      iconHTML: ICON_CHAR, equipped: false,
    }));

    const gunId = Loadout.getGun(), meleeId = Loadout.getMelee();
    const placed = new Set(['character']);
    const addWeaponRow = (w) => {
      const isMelee = w.kind === 'melee';
      const has = Armory.hasSkin(w.id);
      const skins = isMelee ? SWORD_SKINS : WEAPON_SKINS;
      const sk = has ? skins.find((s) => s.id === Armory.getSkinId(w.id, isMelee)) : null;
      side.appendChild(this._sideRow({
        view: w.id, name: w.name,
        sub: sk ? _clean(sk.name) : 'Default',
        subColor: sk ? RARITY_COLORS[sk.rarity || 'common'] : null,
        thumb: getWeaponThumb(w.id),
        equipped: isMelee ? meleeId === w.id : gunId === w.id,
      }));
      placed.add(w.id);
    };

    for (const cat of CATEGORY_MAP) {
      const ws = cat.ids.map((id) => WEAPONS.find((w) => w.id === id)).filter(Boolean);
      if (!ws.length) continue;
      mkLabel(cat.label);
      ws.forEach(addWeaponRow);
    }
    // Anything not mapped (future guns) still shows up.
    const leftovers = WEAPONS.filter((w) => !placed.has(w.id) && (w.kind !== 'melee' || w.id === 'sword'));
    if (leftovers.length) {
      mkLabel('OTHER');
      leftovers.forEach(addWeaponRow);
    }
  }

  _sideRow({ view, name, sub, subColor, thumb, iconHTML, equipped }) {
    const row = document.createElement('div');
    row.className = 'inv3-wrow' + (view === this._view ? ' active' : '');
    const th = document.createElement('div');
    th.className = 'inv3-wrow-thumb';
    if (thumb) th.style.backgroundImage = `url(${thumb})`;
    else if (iconHTML) th.innerHTML = iconHTML;
    row.appendChild(th);
    const body = document.createElement('div');
    body.className = 'inv3-wrow-body';
    const nm = document.createElement('div');
    nm.className = 'inv3-wrow-name';
    nm.textContent = name;
    body.appendChild(nm);
    const sb = document.createElement('div');
    sb.className = 'inv3-wrow-sub';
    sb.textContent = sub;
    if (subColor) sb.style.color = subColor;
    body.appendChild(sb);
    row.appendChild(body);
    if (equipped) {
      const dot = document.createElement('span');
      dot.className = 'inv3-wrow-eq';
      dot.title = 'Equipped';
      row.appendChild(dot);
    }
    row.addEventListener('click', () => {
      if (this._view === view) return;
      this._view = view;
      this._renderSide();
      this._renderView();
    });
    return row;
  }

  // ── main view dispatch ─────────────────────────────────────────────────────

  _renderView() {
    this._renderToken++;
    this._cards = [];
    if (this._view === 'character') this._renderCharacterView();
    else {
      const w = WEAPONS.find((x) => x.id === this._view) || WEAPONS.find((x) => x.id === Loadout.getGun());
      if (w) this._renderWeaponView(w);
    }
  }

  _showStage(kind) {
    document.getElementById('inv3-weapon-img')?.classList.toggle('hidden', kind !== 'weapon');
    document.getElementById('inv3-char-canvas')?.classList.toggle('hidden', kind !== 'char');
    if (kind !== 'char') this._charStage?.stop();
  }

  // ── weapon view ────────────────────────────────────────────────────────────

  _skinsFor(w) { return w.kind === 'melee' ? SWORD_SKINS : WEAPON_SKINS; }
  _skinById(w, id) { return id ? this._skinsFor(w).find((s) => s.id === id) || null : null; }

  _renderWeaponView(w) {
    const isMelee = w.kind === 'melee';
    this._selSkinId = Armory.hasSkin(w.id) ? Armory.getSkinId(w.id, isMelee) : null;

    this._showStage('weapon');
    this._stageShow(w, this._skinById(w, this._selSkinId));
    this._renderHero(w, this._skinById(w, this._selSkinId));
    this._renderToolbar(w);
    this._renderGrid(w);
  }

  // Show the weapon (optionally wearing `skin`) as a large static render — the
  // same proven pipeline the cards use, cached so it's instant on revisits.
  _stageShow(w, skin) {
    const el = document.getElementById('inv3-weapon-img');
    if (!el) return;
    const key = `${w.id}:${skin?.id || '__def__'}`;
    let src = _thumbCache.get(key);
    if (!src) {
      try { src = renderWeaponSkinned(w, skin || null); } catch { src = null; }
      if (src) _thumbCache.set(key, src);
    }
    el.style.backgroundImage = src ? `url(${src})` : (getWeaponThumb(w.id) ? `url(${getWeaponThumb(w.id)})` : 'none');
  }

  _favKey(w, skinId) { return `${w.id}:${skinId || '__def__'}`; }

  _renderHero(w, skin) {
    const el = document.getElementById('inv3-hero-info');
    if (!el) return;
    const isMelee = w.kind === 'melee';
    const rarity = skin?.rarity || 'common';
    const rc = RARITY_COLORS[rarity];
    const stage = document.getElementById('inv3-stage');
    if (stage) stage.style.setProperty('--rar', rc);

    const tags = [];
    if (skin?.decal)      tags.push('CUSTOM DESIGN');
    if (skin?.animated)   tags.push('✦ ANIMATED');
    if (skin?.shootSound) tags.push('♪ CUSTOM SFX');
    if ((skin?.metalness ?? 0) >= 0.85) tags.push('HIGH GLOSS');
    if (skin?.fireEmbers) tags.push('EMBER TRAIL');

    const perk = describePerk(rarity, false);
    const dmg = w.damage * (w.pellets || 1);
    const stk = Math.max(1, Math.ceil(100 / dmg));
    const ttk = ((stk - 1) * w.fireRate).toFixed(2);

    const bar = (label, val, max, text) => `
      <div class="inv3-stat">
        <span class="k">${label}</span>
        <span class="inv3-bar-bg"><span class="inv3-bar-fg" style="width:${Math.min(100, Math.round((val / max) * 100))}%"></span></span>
        <span class="v">${text}</span>
      </div>`;

    let statsHTML;
    let chipsHTML;
    if (isMelee) {
      const m = MAXES.melee;
      statsHTML =
        bar('DAMAGE', w.damage, m.dmg, w.damage) +
        bar('SWING RATE', 1 / w.fireRate, m.rps, `${(1 / w.fireRate).toFixed(1)}/s`) +
        bar('REACH', w.range, m.range, `${w.range}m`);
      chipsHTML = `<span class="inv3-chip">ARC ${w.arc}</span><span class="inv3-chip">KEY ${w.key}</span>`;
    } else {
      const m = MAXES.gun;
      const dps = dmg / w.fireRate;
      const dmgText = (w.pellets || 1) > 1 ? `${w.damage}×${w.pellets}` : `${w.damage}`;
      statsHTML =
        bar('DAMAGE', dmg, m.dmg, dmgText) +
        bar('DPS', dps, m.dps, Math.round(dps)) +
        bar('FIRE RATE', 1 / w.fireRate, m.rps, `${(1 / w.fireRate).toFixed(1)}/s`) +
        bar('RANGE', w.range, m.range, `${w.range}m`) +
        bar('MAGAZINE', w.magSize, m.mag, `${w.magSize}+${w.reserveMax}`);
      chipsHTML =
        `<span class="inv3-chip">${w.automatic ? 'AUTO' : 'SEMI'}</span>` +
        `<span class="inv3-chip">RELOAD ${w.reloadTime}s</span>` +
        `<span class="inv3-chip">TTK ${ttk}s</span>` +
        (w.kind === 'rocket' ? '<span class="inv3-chip">SPLASH</span>' : '') +
        (w.scoped ? '<span class="inv3-chip">SCOPED</span>' : '') +
        `<span class="inv3-chip">KEY ${w.key}</span>`;
    }

    el.innerHTML = `
      <div class="inv3-skin-title">
        <span class="inv3-skin-name" style="color:${rc}">${_esc(skin ? _clean(skin.name) : 'Default')}</span>
        <span class="inv3-pill" style="--rar:${rc}">${rarity.toUpperCase()}</span>
      </div>
      ${tags.length ? `<div class="inv3-tags">${tags.map((t) => `<span class="inv3-tag">${t}</span>`).join('')}</div>` : ''}
      <div class="inv3-perkline">${perk}</div>
      <div class="inv3-wname">${_esc(w.name)} <span class="inv3-wkind">${isMelee ? 'MELEE' : w.kind === 'rocket' ? 'EXPLOSIVE' : 'HITSCAN'}</span></div>
      <div class="inv3-stats">${statsHTML}</div>
      <div class="inv3-chips">${chipsHTML}</div>
      <div class="inv3-actions-row">
        <button class="inv-equip-btn inv3-equip"></button>
        <button class="inv3-fav-btn" title="Favorite"></button>
      </div>`;

    const equippedThis = isMelee ? Loadout.getMelee() === w.id : Loadout.getGun() === w.id;
    const curId = Armory.hasSkin(w.id) ? Armory.getSkinId(w.id, isMelee) : null;
    const isEq = equippedThis && curId === (skin?.id ?? null);
    const btn = el.querySelector('.inv3-equip');
    btn.textContent = isEq ? 'EQUIPPED ✓' : 'EQUIP';
    btn.classList.toggle('equipped', isEq);
    btn.disabled = isEq;
    btn.addEventListener('click', () => this._equip(w, skin?.id ?? null));

    const fav = el.querySelector('.inv3-fav-btn');
    const key = this._favKey(w, skin?.id);
    const paint = () => {
      fav.textContent = this._favs.has(key) ? STAR_ON : STAR_OFF;
      fav.classList.toggle('on', this._favs.has(key));
    };
    paint();
    fav.addEventListener('click', () => { this._toggleFav(key); paint(); });
  }

  _toggleFav(key) {
    if (this._favs.has(key)) this._favs.delete(key); else this._favs.add(key);
    _saveFavs(this._favs);
    // repaint the matching card star + refilter if fav-only is active
    const c = this._cards.find((x) => x.favKey === key);
    if (c) {
      const st = c.el.querySelector('.inv3-card-fav');
      if (st) {
        st.textContent = this._favs.has(key) ? STAR_ON : STAR_OFF;
        st.classList.toggle('on', this._favs.has(key));
      }
    }
    if (this._filter.favOnly) this._applyFilter();
  }

  _equip(w, skinId) {
    const isMelee = w.kind === 'melee';
    if (isMelee) Loadout.setMelee(w.id); else Loadout.setGun(w.id);
    if (skinId) Armory.equipSkin(w.id, skinId); else Armory.clearSkin(w.id);
    this._selSkinId = skinId;
    this.host.onArmoryChanged?.();
    // refresh equip badges in place
    for (const c of this._cards) c.el.classList.toggle('equipped', c.id === (skinId || '__def__'));
    this._renderSide();
    this._renderPerkChips();
    this._renderHero(w, this._skinById(w, skinId));
  }

  // ── toolbar (search / chips / sort / count) ────────────────────────────────

  _renderToolbar(w) {
    const bar = document.getElementById('inv3-toolbar');
    if (!bar) return;
    bar.innerHTML = '';
    bar.classList.remove('hidden');
    const skins = this._skinsFor(w);

    const search = document.createElement('input');
    search.className = 'inv-skin-search';
    search.type = 'text';
    search.placeholder = `Search ${skins.length + 1} skins…  ( / )`;
    search.value = this._filter.q;
    search.addEventListener('input', () => { this._filter.q = search.value.trim().toLowerCase(); this._applyFilter(); });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; this._filter.q = ''; this._applyFilter(); }
    });
    bar.appendChild(search);

    const chipRow = document.createElement('div');
    chipRow.className = 'inv-chiprow';
    bar.appendChild(chipRow);

    const rarChips = [];
    const mkRarChip = (id, label, color) => {
      const c = document.createElement('button');
      c.className = 'inv-chip' + (this._filter.rarity === id ? ' active' : '');
      c.textContent = label;
      if (color) c.style.setProperty('--chip', color);
      c.addEventListener('click', () => {
        this._filter.rarity = id;
        rarChips.forEach((x) => x.el.classList.toggle('active', x.id === id));
        this._applyFilter();
      });
      chipRow.appendChild(c);
      rarChips.push({ id, el: c });
    };
    mkRarChip('all', 'ALL', null);
    for (const r of RARITY_CHIP_ORDER.filter((r) => skins.some((s) => (s.rarity || 'common') === r))) {
      mkRarChip(r, r.toUpperCase(), RARITY_COLORS[r]);
    }

    const mkToggle = (label, prop, chipColor) => {
      const c = document.createElement('button');
      c.className = 'inv-chip inv3-togglechip' + (this._filter[prop] ? ' active' : '');
      c.textContent = label;
      if (chipColor) c.style.setProperty('--chip', chipColor);
      c.addEventListener('click', () => {
        this._filter[prop] = !this._filter[prop];
        c.classList.toggle('active', this._filter[prop]);
        this._applyFilter();
      });
      chipRow.appendChild(c);
    };
    mkToggle('★ FAVS', 'favOnly', '#ffd23b');
    mkToggle('✦ ANIMATED', 'animOnly', '#5fe9ff');

    const sort = document.createElement('select');
    sort.className = 'inv3-sort';
    sort.innerHTML = `
      <option value="tierdesc">TIER ▼</option>
      <option value="tierasc">TIER ▲</option>
      <option value="az">A–Z</option>`;
    sort.value = this._sort;
    sort.addEventListener('change', () => {
      this._sort = sort.value;
      localStorage.setItem(SORT_KEY, this._sort);
      this._renderGrid(w);
    });
    bar.appendChild(sort);

    const count = document.createElement('span');
    count.className = 'inv-skin-count';
    count.id = 'inv3-count';
    bar.appendChild(count);
  }

  _applyFilter() {
    let shown = 0;
    const f = this._filter;
    for (const c of this._cards) {
      const okQ = !f.q || c.name.includes(f.q);
      const okR = f.rarity === 'all' || c.rarity === f.rarity;
      const okF = !f.favOnly || this._favs.has(c.favKey);
      const okA = !f.animOnly || c.animated;
      const on = okQ && okR && okF && okA;
      c.el.style.display = on ? '' : 'none';
      if (on) shown++;
    }
    const count = document.getElementById('inv3-count');
    if (count) count.textContent = `${shown} / ${this._cards.length}`;
  }

  // ── skin grid ──────────────────────────────────────────────────────────────

  _sortedSkins(w) {
    const skins = this._skinsFor(w);
    const rank = (s) => rarityRank(s.rarity || 'common');
    const withIdx = skins.map((s, i) => [s, i]);
    const byMode = {
      tierdesc: (a, b) => (rank(b[0]) - rank(a[0])) || (a[1] - b[1]),
      tierasc:  (a, b) => (rank(a[0]) - rank(b[0])) || (a[1] - b[1]),
      az:       (a, b) => _clean(a[0].name).localeCompare(_clean(b[0].name)),
    }[this._sort] || ((a, b) => a[1] - b[1]);
    withIdx.sort(byMode);
    // favorites bubble to the front, keeping the chosen order within each half
    const fav = [], rest = [];
    for (const [s] of withIdx) {
      (this._favs.has(this._favKey(w, s.id)) ? fav : rest).push(s);
    }
    return [...fav, ...rest];
  }

  _renderGrid(w) {
    const grid = document.getElementById('inv3-grid');
    if (!grid) return;
    grid.innerHTML = '';
    this._cards = [];
    const isMelee = w.kind === 'melee';
    const equippedThis = isMelee ? Loadout.getMelee() === w.id : Loadout.getGun() === w.id;
    const curId = Armory.hasSkin(w.id) ? Armory.getSkinId(w.id, isMelee) : null;
    const sil = getWeaponThumb(w.id);
    const jobs = [];
    let idx = 0;

    const addCard = (skin) => {
      const id = skin?.id || '__def__';
      const rarity = skin?.rarity || 'common';
      const bg = skin
        ? (isMelee ? _grad(skin.blade ?? 0x8090a0, skin.guard ?? 0x303840)
                   : _grad(skin.body ?? 0x556070, skin.accent ?? 0x202830))
        : _grad(w.color || 0x223040, _darken(w.color || 0x223040, 0.4));
      const card = document.createElement('div');
      card.className = 'inv-skin-card' + (equippedThis && (skin?.id ?? null) === curId ? ' equipped' : '');
      card.dataset.rarity = rarity;
      card.style.animationDelay = `${Math.min(idx * 14, 420)}ms`;
      idx++;

      const swatch = document.createElement('div');
      swatch.className = 'inv-skin-card-bg';
      swatch.style.background = bg;
      card.appendChild(swatch);
      if (rarityRank(rarity) >= 4) {   // legendary & mythic get a shine sweep
        const shine = document.createElement('div');
        shine.className = 'inv3-shine';
        card.appendChild(shine);
      }
      if (sil) {
        const im = document.createElement('div');
        im.className = 'inv-skin-card-sil';
        im.style.backgroundImage = `url(${sil})`;
        card.appendChild(im);
        if (skin) jobs.push({ im, skin });
      }
      const rl = document.createElement('div');
      rl.className = 'inv-skin-rarity';
      rl.textContent = rarity.toUpperCase() + (skin?.animated ? ' ✦' : '') + (skin?.shootSound ? ' ♪' : '');
      rl.style.color = RARITY_COLORS[rarity];
      card.appendChild(rl);

      const badge = document.createElement('div');
      badge.className = 'inv-skin-eqbadge';
      badge.textContent = 'EQUIPPED';
      card.appendChild(badge);

      const favKey = this._favKey(w, skin?.id);
      const star = document.createElement('button');
      star.className = 'inv3-card-fav' + (this._favs.has(favKey) ? ' on' : '');
      star.textContent = this._favs.has(favKey) ? STAR_ON : STAR_OFF;
      star.title = 'Favorite';
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleFav(favKey);
        star.textContent = this._favs.has(favKey) ? STAR_ON : STAR_OFF;
        star.classList.toggle('on', this._favs.has(favKey));
        if (this._view === w.id && this._selSkinId === (skin?.id ?? null)) {
          this._renderHero(w, skin);   // sync the hero star
        }
      });
      card.appendChild(star);

      const nm = document.createElement('div');
      nm.className = 'inv-skin-card-name';
      nm.textContent = skin ? _clean(skin.name) : 'Default';
      card.appendChild(nm);

      card.addEventListener('mouseenter', () => {
        this._stageShow(w, skin);
        this._renderHero(w, skin);
      });
      card.addEventListener('mouseleave', () => {
        const back = this._skinById(w, this._selSkinId);
        this._stageShow(w, back);
        this._renderHero(w, back);
      });
      card.addEventListener('click', () => {
        this._equip(w, skin?.id ?? null);
        this._stageShow(w, skin);
      });

      grid.appendChild(card);
      this._cards.push({
        id, el: card, favKey,
        name: (skin ? skin.name : 'default').toLowerCase(),
        rarity, animated: !!skin?.animated,
      });
    };

    addCard(null);                        // default look always leads
    for (const s of this._sortedSkins(w)) addCard(s);
    this._applyFilter();
    this._pumpThumbs(w, jobs);
  }

  // Progressive real-render pipeline: a few skinned renders per frame so the
  // panel stays responsive; results are cached for instant revisits.
  _pumpThumbs(w, jobs) {
    this._renderToken++;
    const token = this._renderToken;
    const pump = () => {
      if (token !== this._renderToken) return;   // view switched — abandon
      let n = 0;
      while (jobs.length && n < 3) {
        const job = jobs.shift();
        const key = `${w.id}:${job.skin.id}`;
        let src = _thumbCache.get(key);
        if (!src) {
          try { src = renderWeaponSkinned(w, job.skin); } catch { src = null; }
          if (src) _thumbCache.set(key, src);
        }
        if (src) {
          job.im.style.backgroundImage = `url(${src})`;
          job.im.classList.add('ready');
        }
        n++;
      }
      if (jobs.length) requestAnimationFrame(pump);
    };
    if (jobs.length) requestAnimationFrame(pump);
  }

  // ── character view ─────────────────────────────────────────────────────────

  _renderCharacterView() {
    this._showStage('char');
    const canvas = document.getElementById('inv3-char-canvas');
    if (canvas && !this._charStage) this._charStage = new ArmorPreviewRenderer(canvas);
    this._charPreview();
    this._charStage?.start();

    document.getElementById('inv3-toolbar')?.classList.add('hidden');
    this._renderCharHero();
    this._renderCharGrid();
  }

  _charPreview(playerSkin, armorTypeId, armorSkin) {
    if (!this._charStage) return;
    this._charStage.loadArmor(
      playerSkin ?? getSkin(this.host.selectedSkinId),
      armorTypeId ?? this.host.selectedArmorId,
      armorSkin !== undefined ? armorSkin : getArmorSkin(Shop.getEquipped()),
    );
  }

  _renderCharHero(hover) {
    const el = document.getElementById('inv3-hero-info');
    if (!el) return;
    const armor = getArmorType(hover?.armorTypeId ?? this.host.selectedArmorId);
    const skin = getSkin(hover?.playerSkinId ?? this.host.selectedSkinId);
    const finish = hover && 'armorSkin' in hover ? hover.armorSkin : getArmorSkin(Shop.getEquipped());
    const rarity = finish?.rarity || 'common';
    const rc = RARITY_COLORS[rarity];
    const stage = document.getElementById('inv3-stage');
    if (stage) stage.style.setProperty('--rar', rc);
    const ap = ARMOR_PERKS[rarity] || ARMOR_PERKS.common;
    const hp = 100 + (ap.healthBonus || 0);
    const shield = (finish?.shield || 0) + (ap.shieldBonus || 0);

    const bar = (label, val, max, text, color) => `
      <div class="inv3-stat">
        <span class="k">${label}</span>
        <span class="inv3-bar-bg"><span class="inv3-bar-fg" style="width:${Math.min(100, Math.round((val / max) * 100))}%${color ? `;background:${color}` : ''}"></span></span>
        <span class="v">${text}</span>
      </div>`;

    el.innerHTML = `
      <div class="inv3-skin-title">
        <span class="inv3-skin-name" style="color:${rc}">${_esc(finish ? _clean(finish.name) : 'No Finish')}</span>
        <span class="inv3-pill" style="--rar:${rc}">${rarity.toUpperCase()}</span>
      </div>
      <div class="inv3-perkline">${describePerk(rarity, true)}</div>
      <div class="inv3-wname">${_esc(armor.name)} CLASS <span class="inv3-wkind">${_esc(skin.name).toUpperCase()} COLORWAY</span></div>
      <div class="inv3-chardesc">${_esc(armor.desc)}</div>
      <div class="inv3-stats">
        ${bar('HEALTH', hp, 175, hp, 'linear-gradient(90deg,#42e07a,#a4f0b8)')}
        ${bar('SHIELD', shield, 150, shield, 'linear-gradient(90deg,#2f93dd,#7fd8ff)')}
      </div>
      <div class="inv3-chips">
        <span class="inv3-chip">CLASS ${_esc(armor.name)}</span>
        <span class="inv3-chip">COLOR ${_esc(skin.name).toUpperCase()}</span>
        ${finish ? `<span class="inv3-chip">FINISH ${_esc(_clean(finish.name)).toUpperCase()}</span>` : ''}
      </div>`;
  }

  _renderCharGrid() {
    const grid = document.getElementById('inv3-grid');
    if (!grid) return;
    grid.innerHTML = '';
    this._cards = [];
    let idx = 0;

    const label = (t) => {
      const l = document.createElement('div');
      l.className = 'inv3-gridlabel';
      l.textContent = t;
      grid.appendChild(l);
    };
    const mkCard = ({ bg, html, name, rarity, equipped, sub, dim, onClick, onHover, onLeave }) => {
      const card = document.createElement('div');
      card.className = 'inv-skin-card' + (equipped ? ' equipped' : '') + (dim ? ' inv3-locked' : '');
      card.dataset.rarity = rarity || 'common';
      card.style.animationDelay = `${Math.min(idx * 14, 420)}ms`;
      idx++;
      const swatch = document.createElement('div');
      swatch.className = 'inv-skin-card-bg';
      swatch.style.background = bg;
      card.appendChild(swatch);
      if (html) {
        const ic = document.createElement('div');
        ic.className = 'inv3-card-icon';
        ic.innerHTML = html;
        card.appendChild(ic);
      }
      if (rarity) {
        const rl = document.createElement('div');
        rl.className = 'inv-skin-rarity';
        rl.textContent = rarity.toUpperCase();
        rl.style.color = RARITY_COLORS[rarity];
        card.appendChild(rl);
      }
      const badge = document.createElement('div');
      badge.className = 'inv-skin-eqbadge';
      badge.textContent = 'EQUIPPED';
      card.appendChild(badge);
      if (sub) {
        const s = document.createElement('div');
        s.className = 'inv3-card-sub';
        s.innerHTML = sub;
        card.appendChild(s);
      }
      const nm = document.createElement('div');
      nm.className = 'inv-skin-card-name';
      nm.textContent = name;
      card.appendChild(nm);
      if (onClick) card.addEventListener('click', onClick);
      if (onHover) card.addEventListener('mouseenter', onHover);
      if (onLeave) card.addEventListener('mouseleave', onLeave);
      grid.appendChild(card);
      return card;
    };
    const restore = () => { this._charPreview(); this._renderCharHero(); };

    // ── armor class ──
    label('ARMOR CLASS');
    for (const a of ARMOR_TYPES) {
      mkCard({
        bg: _grad(0x33506e, 0x0c1622),
        html: `<svg viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg">${armorClassSVG(a.id)}</svg>`,
        name: a.name,
        equipped: a.id === this.host.selectedArmorId,
        onClick: () => {
          this.host.selectedArmorId = a.id;
          saveArmorType(a.id);
          this.host.onArmorChanged?.(a.id);
          this.host._updateArmorPreview();
          restore();
          this._renderSide();
          this._renderCharGrid();
        },
        onHover: () => { this._charPreview(undefined, a.id); this._renderCharHero({ armorTypeId: a.id }); },
        onLeave: restore,
      });
    }

    // ── colorways ──
    label('COLORWAYS');
    for (const s of SKINS) {
      mkCard({
        bg: _grad(s.primary, s.secondary),
        name: s.name,
        equipped: s.id === this.host.selectedSkinId,
        onClick: () => {
          this.host.selectedSkinId = s.id;
          this.host._updateArmorPreview();
          restore();
          this._renderSide();
          this._renderCharGrid();
        },
        onHover: () => { this._charPreview(s); this._renderCharHero({ playerSkinId: s.id }); },
        onLeave: restore,
      });
    }

    // ── armor finishes (shop skins: owned → equip, locked → price) ──
    label('ARMOR FINISHES');
    const equippedFinish = Shop.getEquipped();
    mkCard({
      bg: _grad(0x2a3442, 0x101820),
      name: 'No Finish',
      rarity: 'common',
      equipped: !equippedFinish,
      onClick: () => {
        Shop.unequip();
        this.host.onArmorSkinEquipped?.(null);
        this.host._updateArmorPreview();
        restore();
        this._renderCharGrid();
        this._renderPerkChips();
      },
      onHover: () => { this._charPreview(undefined, undefined, null); this._renderCharHero({ armorSkin: null }); },
      onLeave: restore,
    });
    for (const f of ARMOR_SKINS) {
      const owned = Shop.isOwned(f.id);
      const isEq = equippedFinish === f.id;
      mkCard({
        bg: _grad(f.primary, f.secondary),
        name: _clean(f.name),
        rarity: f.rarity || 'common',
        equipped: isEq,
        dim: !owned,
        sub: owned ? '' : `<span class="inv3-lock">🔒</span> ◆ ${f.price.toLocaleString()}`,
        onClick: () => {
          if (!owned) { this.host._togglePanel('shop'); return; }
          Shop.equip(f.id);
          this.host.onArmorSkinEquipped?.(f.id);
          this.host._updateArmorPreview();
          restore();
          this._renderCharGrid();
          this._renderPerkChips();
        },
        onHover: () => { this._charPreview(undefined, undefined, f); this._renderCharHero({ armorSkin: f }); },
        onLeave: restore,
      });
    }

    const count = document.getElementById('inv3-count');
    if (count) count.textContent = '';
  }
}

// SVG silhouette paths per armor type — used inside the armor class cards.
export function armorClassSVG(id) {
  const fill = 'rgba(0,207,255,0.7)';
  const dark = 'rgba(0,0,0,0.5)';
  switch (id) {
    case 'assault': return `
      <ellipse cx="16" cy="6.5" rx="5" ry="5.5" fill="${dark}"/>
      <rect x="8" y="10" width="16" height="3" rx="1" fill="${fill}"/>
      <rect x="9" y="13" width="14" height="14" rx="2" fill="${dark}"/>
      <rect x="5" y="11" width="3.5" height="12" rx="1" fill="${dark}"/>
      <rect x="23.5" y="11" width="3.5" height="12" rx="1" fill="${dark}"/>
      <rect x="9.5" y="28" width="5.5" height="14" rx="2" fill="${dark}"/>
      <rect x="17" y="28" width="5.5" height="14" rx="2" fill="${dark}"/>
      <rect x="10" y="11" width="12" height="3" rx="1" fill="${fill}"/>
      <rect x="13" y="8" width="6" height="3" rx="1" fill="${fill}"/>`;
    case 'recon': return `
      <ellipse cx="16" cy="7" rx="4.5" ry="5" fill="${dark}"/>
      <rect x="12" y="11" width="8" height="2.5" rx="1" fill="${fill}"/>
      <rect x="10.5" y="13.5" width="11" height="12" rx="2" fill="${dark}"/>
      <rect x="6" y="12" width="4" height="10" rx="1.5" fill="${dark}"/>
      <rect x="22" y="12" width="4" height="10" rx="1.5" fill="${dark}"/>
      <rect x="11" y="26.5" width="4.5" height="13.5" rx="2" fill="${dark}"/>
      <rect x="16.5" y="26.5" width="4.5" height="13.5" rx="2" fill="${dark}"/>
      <rect x="12.5" y="12" width="7" height="2" rx="1" fill="${fill}"/>`;
    case 'heavy': return `
      <ellipse cx="16" cy="6" rx="6" ry="6" fill="${dark}"/>
      <rect x="7" y="9.5" width="18" height="3.5" rx="1" fill="${fill}"/>
      <rect x="7.5" y="13" width="17" height="15" rx="2" fill="${dark}"/>
      <rect x="3" y="10" width="4.5" height="14" rx="1.5" fill="${dark}"/>
      <rect x="24.5" y="10" width="4.5" height="14" rx="1.5" fill="${dark}"/>
      <rect x="8.5" y="29" width="6" height="13" rx="2" fill="${dark}"/>
      <rect x="17.5" y="29" width="6" height="13" rx="2" fill="${dark}"/>
      <rect x="8" y="10" width="16" height="3" rx="1" fill="${fill}"/>
      <rect x="12" y="7" width="8" height="3" rx="1" fill="${fill}"/>
      <rect x="7.5" y="29" width="7" height="2" rx="1" fill="${fill}"/>
      <rect x="17.5" y="29" width="7" height="2" rx="1" fill="${fill}"/>`;
    case 'stealth': return `
      <ellipse cx="16" cy="7" rx="4" ry="5" fill="${dark}"/>
      <rect x="13" y="11" width="6" height="2" rx="1" fill="${fill}"/>
      <rect x="11.5" y="13" width="9" height="13" rx="2" fill="${dark}"/>
      <rect x="7.5" y="13" width="3.5" height="9" rx="1.5" fill="${dark}"/>
      <rect x="21" y="13" width="3.5" height="9" rx="1.5" fill="${dark}"/>
      <rect x="12" y="27" width="4" height="15" rx="2" fill="${dark}"/>
      <rect x="16" y="27" width="4" height="15" rx="2" fill="${dark}"/>
      <rect x="13" y="11.5" width="6" height="1.5" rx="0.75" fill="${fill}"/>`;
    default: return '';
  }
}
