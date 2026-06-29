import { SKINS, getSkin } from '../player/skins.js';
import { ARMOR_TYPES, getArmorType, loadArmorType, saveArmorType } from '../player/ArmorTypes.js';
import { ARMOR_SKINS, RARITY_ORDER, RARITY_COLORS, getArmorSkin } from '../player/ArmorSkins.js';
import { WEAPONS } from '../weapons/weaponDefs.js';
import { WEAPON_SKINS } from '../weapons/WeaponSkins.js';
import { SWORD_SKINS } from '../weapons/SwordSkins.js';
import { UserAccount } from '../core/UserAccount.js';
import { Achievements } from '../core/Achievements.js';
import { Armory } from '../core/Armory.js';
import { Loadout, GUNS, MELEE } from '../core/Loadout.js';
import { MainWeapons } from '../core/MainWeapons.js';
import { Shop } from '../core/Shop.js';
import { describePerk } from '../core/RarityPerks.js';
import { BattlePass, BP_TIERS } from '../core/BattlePass.js';
import { GameSettings, DEFAULTS } from '../core/GameSettings.js';
import { GAME_MODES } from '../core/GameModes.js';
import { WeaponPreviewRenderer } from './WeaponPreviewRenderer.js';
import { ArmorPreviewRenderer } from './ArmorPreviewRenderer.js';
import { warmThumbnails, getThumbnail } from './SkinThumbnails.js';
import { warmWeaponThumbs, getWeaponThumb, renderWeaponSkinned } from './WeaponThumbnails.js';

function _hex(n) { return n.toString(16).padStart(6, '0'); }
function _rank(k) {
  if (k >= 100) return 'LEGEND';
  if (k >= 50)  return 'ELITE';
  if (k >= 25)  return 'VETERAN';
  if (k >= 10)  return 'SOLDIER';
  if (k >= 1)   return 'GRUNT';
  return 'RECRUIT';
}
function _fmt(s) { return s > 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${s}s`; }

// ── ev.io-style inventory: tabs + weapon categorisation + card visuals ───────
// Tabs: Character + one per EQUIPPABLE main weapon (the random 5 guns + sword).
function _invTabs() {
  return [
    { id: 'character', label: 'Character' },
    ...MainWeapons.getAllIds().map((id) => {
      const w = WEAPONS.find((x) => x.id === id);
      return { id, label: w ? w.name : id };
    }),
  ];
}
const ICON_GUN   = '<svg viewBox="0 0 24 24" fill="none" stroke="#eaf2f8" stroke-width="1.5"><path d="M3 8h13l3 3v2h-4l-2 3H8l-1-3H3z"/><path d="M7 13v3"/></svg>';
const ICON_SWORD = '<svg viewBox="0 0 24 24" fill="none" stroke="#eaf2f8" stroke-width="1.5"><path d="M4 20l9-9 3-7 1 1-7 3-9 9z"/><path d="M6 18l-2 2"/><path d="M14 6l4 4"/></svg>';
const ICON_CHAR  = '<svg viewBox="0 0 24 24" fill="none" stroke="#eaf2f8" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M5 21v-1a7 7 0 0114 0v1"/></svg>';
// Achievement category icons (cyan stroke)
const ICON_ACH = {
  kills: '<svg viewBox="0 0 24 24" fill="none" stroke="#5fe9ff" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></svg>',
  games: '<svg viewBox="0 0 24 24" fill="none" stroke="#5fe9ff" stroke-width="1.6"><rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 12h3M8.5 10.5v3"/><circle cx="16" cy="11.5" r="1"/><circle cx="18.5" cy="13.5" r="1"/></svg>',
  score: '<svg viewBox="0 0 24 24" fill="none" stroke="#5fe9ff" stroke-width="1.6"><path d="M12 2l2.9 6 6.6.6-5 4.3 1.5 6.5L12 16.9 5.9 19.4 7.4 12.9l-5-4.3 6.6-.6z"/></svg>',
  kd:    '<svg viewBox="0 0 24 24" fill="none" stroke="#5fe9ff" stroke-width="1.6"><path d="M12 2l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V5z"/><path d="M9 12l2 2 4-4"/></svg>',
};
function _grad(a, b) { return `linear-gradient(150deg, #${_hex(a >>> 0)}, #${_hex(b >>> 0)})`; }
function _darken(hex, f) {
  const r = Math.floor((hex >> 16 & 255) * f), g = Math.floor((hex >> 8 & 255) * f), b = Math.floor((hex & 255) * f);
  return (r << 16 | g << 8 | b) >>> 0;
}

export class MenuUI {
  constructor() {
    // Top-nav elements
    this.topNav      = document.getElementById('top-nav');
    this.centerPlay  = document.getElementById('center-play');

    // Panels
    this._activePanel = null;

    // Inputs / buttons in panels
    this.nameInput     = document.getElementById('player-name');
    this.skinGrid      = document.getElementById('skin-grid');
    this.playBtn       = document.getElementById('play-btn');

    // Pause / game-over
    this.pauseMenu     = document.getElementById('pause-menu');
    this.gameoverMenu  = document.getElementById('gameover-menu');
    this.resumeBtn     = document.getElementById('resume-btn');
    this.quitBtn       = document.getElementById('quit-btn');
    this.restartBtn    = document.getElementById('restart-btn');
    this.menuBtn       = document.getElementById('menu-btn');
    this.gameoverStats = document.getElementById('gameover-stats');

    this.selectedSkinId   = SKINS[0].id;
    this.selectedArmorId  = loadArmorType();
    this.selectedModeId   = GAME_MODES[0].id;
    this._currentUser     = null;
    this._preview         = null;
    this._armorPreview    = null;

    // Callback: called when armor type changes so Game.js can rebuild preview
    this.onArmorChanged = null; // (armorTypeId) => void

    // Armory state
    this._armoryWeaponId   = null;
    this._armoryIsSword    = false;
    this._armoryHoverSkin  = null;
    this._armorySelectedId = null;

    // Callbacks
    this.onPlay               = null; // (name, skinId, modeId) => void
    this.onResume             = null;
    this.onQuit               = null;
    this.onRestart            = null;
    this.onBackToMenu         = null;
    this.onLogout             = null;
    this.onArmoryChanged      = null;
    this.onSettingsSaved      = null;
    this.onArmorSkinEquipped  = null; // (skinId) => void

    this._buildInventory();   // ev.io-style loadout (tabs + cards)
    // Render real weapon-model thumbnails for the inventory cards; refresh the
    // grid once they're ready so the cards show our actual guns.
    warmWeaponThumbs(() => { if (this._activePanel === 'loadout') this._refreshInventory(); });
    this._buildModeCards();
    this._buildSettings();
    this._wireNav();
  }

  // ── Nav wiring ──────────────────────────────────────────────────────────────

  _wireNav() {
    const startGame = (modeId) => {
      const name = this.nameInput.value.trim() || 'Recruit';
      if (modeId) this.selectedModeId = modeId;
      this._closeAllPanels();
      this._closeModeDropdown();
      this.onPlay?.(name, this.selectedSkinId, this.selectedModeId, this.selectedArmorId);
    };

    // Center CLICK TO PLAY — starts last selected mode
    this.playBtn?.addEventListener('click', () => startGame());

    // Modes dropdown toggle
    const modesBtn = document.getElementById('nav-modes-btn');
    const modesDd  = document.getElementById('modes-dropdown');
    modesBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !modesDd.classList.contains('hidden');
      this._closeModeDropdown();
      if (!open) {
        modesDd.classList.remove('hidden');
        modesBtn.classList.add('open');
        this._closeAllPanels();
      }
    });

    // Mode option buttons inside dropdown — select mode and start immediately
    document.querySelectorAll('.mode-option[data-mode]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        startGame(btn.dataset.mode);
      });
    });

    // Profile dropdown toggle (ev.io-style: Inventory / Career / Log out)
    const profBtn = document.getElementById('nav-profile-btn');
    const profDd  = document.getElementById('profile-dropdown');
    profBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !profDd.classList.contains('hidden');
      this._closeModeDropdown();
      this._closeProfileDropdown();
      if (!open) {
        profDd.classList.remove('hidden');
        profBtn.classList.add('open');
        this._closeAllPanels();
      }
    });
    document.getElementById('profile-menu-logout')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._closeProfileDropdown();
      this.onLogout?.();
    });

    // Nav dropdown items (panels)
    document.querySelectorAll('[data-panel]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._closeModeDropdown();
        this._closeProfileDropdown();
        this._togglePanel(btn.dataset.panel);
      });
    });

    // Click anywhere outside closes panels and modes dropdown
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav-modes-wrap')) this._closeModeDropdown();
      if (!e.target.closest('.nav-profile-wrap')) this._closeProfileDropdown();
      if (this._activePanel && !e.target.closest('.nav-panel') && !e.target.closest('[data-panel]')) {
        this._closeAllPanels();
      }
    });

    // Pause / gameover buttons
    this.resumeBtn.addEventListener('click',  () => this.onResume?.());
    this.quitBtn.addEventListener('click',    () => this.onQuit?.());
    this.restartBtn.addEventListener('click', () => this.onRestart?.());
    this.menuBtn.addEventListener('click',    () => this.onBackToMenu?.());
    document.getElementById('profile-logout-btn').addEventListener('click', () => this.onLogout?.());
  }

  _closeModeDropdown() {
    document.getElementById('modes-dropdown')?.classList.add('hidden');
    document.getElementById('nav-modes-btn')?.classList.remove('open');
  }

  _closeProfileDropdown() {
    document.getElementById('profile-dropdown')?.classList.add('hidden');
    document.getElementById('nav-profile-btn')?.classList.remove('open');
  }

  _togglePanel(id) {
    if (this._activePanel === id) {
      this._closeAllPanels();
      return;
    }
    this._closeAllPanels();
    this._activePanel = id;
    document.getElementById('panel-' + id)?.classList.remove('hidden');
    document.querySelector(`[data-panel="${id}"]`)?.classList.add('active');
    // PROFILE dropdown owns Inventory + Career — keep its nav button lit for both
    document.getElementById('nav-profile-btn')
      ?.classList.toggle('active', id === 'loadout' || id === 'profile');

    if (id === 'loadout') {
      this._refreshInventory();
      this._startArmorPreview();
      this.onLoadoutOpen?.();
    }
    if (id === 'profile')     this._renderProfile();
    if (id === 'achievements') this._renderAchievements();
    if (id === 'settings')    this._loadSettings();
    if (id === 'shop')        this._renderShop();
    if (id === 'battlepass')  this._renderBattlePass();
  }

  _closeAllPanels() {
    if (this._activePanel === 'loadout') {
      this._armorPreview?.stop();
      this._weaponPreview?.stop();
      this.onLoadoutClose?.();
    }
    if (this._activePanel === 'profile') {
      this._profilePreview?.stop();
    }
    this._activePanel = null;
    document.querySelectorAll('.nav-panel').forEach((p) => p.classList.add('hidden'));
    document.querySelectorAll('[data-panel]').forEach((b) => b.classList.remove('active'));
    document.getElementById('nav-profile-btn')?.classList.remove('active');
  }

  // ── Player skin grid ───────────────────────────────────────────────────────

  _buildSkinGrid() {
    this.skinGrid.innerHTML = '';
    SKINS.forEach((skin) => {
      const el = document.createElement('div');
      el.className = 'skin-swatch' + (skin.id === this.selectedSkinId ? ' selected' : '');
      el.title = skin.name;

      // Armor preview: two-tone gradient using skin colors
      const swatch = document.createElement('div');
      swatch.className = 'skin-swatch-color';
      swatch.style.background = `linear-gradient(155deg, #${_hex(skin.primary)} 55%, #${_hex(skin.secondary)} 100%)`;
      el.appendChild(swatch);

      // Soldier silhouette SVG (minimal humanoid shape)
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 32 48');
      svg.setAttribute('class', 'skin-swatch-silhouette');
      svg.innerHTML = `
        <ellipse cx="16" cy="7" rx="5" ry="6" fill="rgba(0,0,0,0.45)"/>
        <rect x="9" y="14" width="14" height="14" rx="2" fill="rgba(0,0,0,0.4)"/>
        <rect x="3" y="14" width="5" height="11" rx="2" fill="rgba(0,0,0,0.35)"/>
        <rect x="24" y="14" width="5" height="11" rx="2" fill="rgba(0,0,0,0.35)"/>
        <rect x="9" y="29" width="5" height="13" rx="2" fill="rgba(0,0,0,0.4)"/>
        <rect x="18" y="29" width="5" height="13" rx="2" fill="rgba(0,0,0,0.4)"/>
        <rect x="10" y="11" width="12" height="4" rx="1" fill="rgba(0,207,255,0.55)"/>
      `;
      el.appendChild(svg);

      // Name label
      const name = document.createElement('span');
      name.className = 'skin-swatch-name';
      name.textContent = skin.name.toUpperCase();
      el.appendChild(name);

      el.addEventListener('click', () => {
        this.selectedSkinId = skin.id;
        this.skinGrid.querySelectorAll('.skin-swatch').forEach((s) => s.classList.remove('selected'));
        el.classList.add('selected');
        this._updateArmorPreview();
      });
      this.skinGrid.appendChild(el);
    });
  }

  // ── Armor type grid ────────────────────────────────────────────────────────

  _buildArmorGrid() {
    const grid = document.getElementById('armor-type-grid');
    if (!grid) return;
    grid.innerHTML = '';
    ARMOR_TYPES.forEach((armor) => {
      const card = document.createElement('div');
      card.className = 'armor-card' + (armor.id === this.selectedArmorId ? ' selected' : '');
      card.dataset.armorId = armor.id;
      card.innerHTML = `
        <div class="armor-card-icon">
          <svg viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg">${_armorSVG(armor.id)}</svg>
        </div>
        <div class="armor-card-info">
          <div class="armor-card-name">${armor.name}</div>
          <div class="armor-card-desc">${armor.desc}</div>
        </div>
      `;
      card.addEventListener('click', () => {
        this.selectedArmorId = armor.id;
        saveArmorType(armor.id);
        grid.querySelectorAll('.armor-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        this.onArmorChanged?.(armor.id);
        this._updateArmorPreview();
      });
      grid.appendChild(card);
    });
  }

  // ── Live 3D armor preview ─────────────────────────────────────────────────────

  _startArmorPreview() {
    const canvas = document.getElementById('armor-preview-canvas');
    if (!canvas) return;
    if (!this._armorPreview) this._armorPreview = new ArmorPreviewRenderer(canvas);
    this._updateArmorPreview();
    this._armorPreview.start();
  }

  _updateArmorPreview() {
    if (!this._armorPreview) return;
    const playerSkin = getSkin(this.selectedSkinId);
    const armorSkin  = getArmorSkin(Shop.getEquipped());
    this._armorPreview.loadArmor(playerSkin, this.selectedArmorId, armorSkin);
  }

  // ── ev.io-style inventory (tabs + cards) ─────────────────────────────────────

  _buildInventory() {
    this._invCat = 'character';
    const tabsEl = document.getElementById('inv-tabs');
    if (!tabsEl) return;
    tabsEl.innerHTML = '';
    for (const t of _invTabs()) {
      const b = document.createElement('button');
      b.className = 'inv-tab' + (t.id === this._invCat ? ' active' : '');
      b.dataset.wid = t.id;
      b.textContent = t.label;
      b.addEventListener('click', () => {
        this._invCat = t.id;
        tabsEl.querySelectorAll('.inv-tab').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        this._renderInvGrid();
      });
      tabsEl.appendChild(b);
    }
    this._refreshTabHighlights();
    // Cosmetic header buttons.
    document.getElementById('inv-wallet-btn')?.addEventListener('click', () => {
      const el = document.getElementById('inv-wallet-btn'); el.textContent = '✓ Wallet Linked';
    });
    document.getElementById('inv-account-btn')?.addEventListener('click', () => this._togglePanel('profile'));
    this._renderEquipped();
    this._renderInvGrid();
    this._renderMapWeapons();
    this._refreshInvMeta();
  }

  // Re-sync the inventory each time the panel opens (balance, name, equipped).
  _refreshInventory() {
    const nameI = document.getElementById('player-name');
    if (nameI && this._currentUser && this._currentUser !== '__guest__') {
      nameI.value = UserAccount.getDisplayName(this._currentUser);
    }
    this._renderEquipped();
    this._renderInvGrid();
    this._renderMapWeapons();
    this._refreshInvMeta();
    this._refreshTabHighlights();
  }

  // Section 2: the non-main guns — display only; they spawn on the map in-match.
  _renderMapWeapons() {
    const grid = document.getElementById('inv-map-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const id of MainWeapons.getMapGunIds()) {
      const w = WEAPONS.find((x) => x.id === id);
      if (!w) continue;
      const card = this._makeCard({
        bg: _grad(w.color || 0x223040, _darken(w.color || 0x223040, 0.4)),
        icon: ICON_GUN, thumbSrc: getWeaponThumb(w.id), name: w.name,
      });
      card.classList.add('inv-card-locked');
      const tag = document.createElement('div');
      tag.className = 'inv-card-maptag';
      tag.textContent = 'MAP';
      card.appendChild(tag);
      grid.appendChild(card);
    }
  }

  _refreshInvMeta() {
    const bal = document.getElementById('inv-balance');
    if (bal) bal.textContent = Shop.getCoins().toLocaleString();
    const nw = document.getElementById('inv-networth');
    if (nw) nw.textContent = '0';
  }

  _makeCard({ bg, icon, thumbSrc, name, equipped, onClick }) {
    const card = document.createElement('div');
    card.className = 'inv-card' + (equipped ? ' equipped' : '');
    const thumb = document.createElement('div');
    thumb.className = 'inv-card-thumb';
    thumb.style.background = bg;
    card.appendChild(thumb);
    if (thumbSrc) {
      // Real rendered weapon model on top of the coloured backdrop.
      const img = document.createElement('div');
      img.className = 'inv-card-render';
      img.style.backgroundImage = `url(${thumbSrc})`;
      card.appendChild(img);
    } else if (icon) {
      const ic = document.createElement('div');
      ic.className = 'inv-card-icon';
      ic.innerHTML = icon;
      card.appendChild(ic);
    }
    if (equipped) {
      const badge = document.createElement('div');
      badge.className = 'inv-card-badge';
      badge.textContent = 'EQUIPPED';
      card.appendChild(badge);
    }
    const nm = document.createElement('div');
    nm.className = 'inv-card-name';
    nm.textContent = name;
    card.appendChild(nm);
    if (onClick) card.addEventListener('click', onClick);
    return card;
  }

  _renderEquipped() {
    const el = document.getElementById('inv-equipped');
    if (!el) return;
    el.innerHTML = '';
    const skin  = getSkin(this.selectedSkinId);
    const armor = getArmorType(this.selectedArmorId);
    el.appendChild(this._makeCard({
      bg: _grad(skin.primary, skin.secondary), icon: ICON_CHAR,
      name: armor.name, equipped: true,
    }));
    const gun = WEAPONS.find((w) => w.id === Loadout.getGun());
    if (gun) el.appendChild(this._makeCard({
      bg: _grad(gun.color || 0x223040, _darken(gun.color || 0x223040, 0.4)),
      icon: ICON_GUN, thumbSrc: getWeaponThumb(gun.id), name: gun.name, equipped: true,
    }));
    const melee = WEAPONS.find((w) => w.id === Loadout.getMelee());
    if (melee) el.appendChild(this._makeCard({
      bg: _grad(melee.color || 0x2a2030, _darken(melee.color || 0x2a2030, 0.4)),
      icon: ICON_SWORD, thumbSrc: getWeaponThumb(melee.id), name: melee.name, equipped: true,
    }));
  }

  _renderInvGrid() {
    const grid = document.getElementById('inv-grid');
    if (!grid) return;
    grid.innerHTML = '';
    if (this._invCat === 'character') this._weaponPreview?.stop();

    if (this._invCat === 'character') {
      // Armour-type builds first, then colour skins — all "characters".
      for (const a of ARMOR_TYPES) {
        const equipped = a.id === this.selectedArmorId;
        const c = ARMOR_SKINS?.[0]; void c;
        grid.appendChild(this._makeCard({
          bg: _grad(0x33506e, 0x0c1622), icon: ICON_CHAR, name: a.name, equipped,
          onClick: () => {
            this.selectedArmorId = a.id;
            saveArmorType(a.id);
            this.onArmorChanged?.(a.id);
            this._updateArmorPreview();
            this._renderEquipped();
            this._renderInvGrid();
          },
        }));
      }
      for (const s of SKINS) {
        const equipped = s.id === this.selectedSkinId;
        grid.appendChild(this._makeCard({
          bg: _grad(s.primary, s.secondary), name: s.name, equipped,
          onClick: () => {
            this.selectedSkinId = s.id;
            this._updateArmorPreview();
            this._renderEquipped();
            this._renderInvGrid();
          },
        }));
      }
      return;
    }

    // A single gun's tab is selected — show its detail (model + stats + equip).
    const w = WEAPONS.find((x) => x.id === this._invCat);
    if (w) {
      const detail = this._weaponDetail(w);
      grid.appendChild(detail);
      detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  _weaponDetail(w) {
    const isMelee = w.kind === 'melee';
    const skins   = isMelee ? SWORD_SKINS : WEAPON_SKINS;
    const equippedMain = isMelee ? (Loadout.getMelee() === w.id) : (Loadout.getGun() === w.id);

    const wrap = document.createElement('div');
    wrap.className = 'inv-detail';

    const curSkinId = Armory.hasSkin(w.id) ? Armory.getSkinId(w.id, isMelee) : null;
    const curSkin   = curSkinId ? skins.find((s) => s.id === curSkinId) : null;

    // ── gun render, wearing the selected skin (or raw default) ──
    const stage = document.createElement('div');
    stage.className = 'inv-detail-stage';
    const GRAD = 'radial-gradient(circle at 50% 42%, #5b7a88, #243240 55%, #0e151e)';
    const setStage = (skin) => {
      const src = skin ? renderWeaponSkinned(w, skin) : getWeaponThumb(w.id);
      // Gun image rides on top of the light-centred backdrop so dark guns show.
      stage.style.backgroundImage = src ? `url(${src}), ${GRAD}` : GRAD;
      stage.style.backgroundSize = 'contain, cover';
      stage.style.backgroundRepeat = 'no-repeat, no-repeat';
      stage.style.backgroundPosition = 'center, center';
    };
    setStage(curSkin);
    wrap.appendChild(stage);

    const info = document.createElement('div');
    info.className = 'inv-detail-info';
    const head = document.createElement('div');
    head.className = 'inv-detail-head';
    const nm = document.createElement('div'); nm.className = 'inv-detail-name'; nm.textContent = w.name;
    head.appendChild(nm);
    const eq = document.createElement('span');
    eq.className = 'inv-detail-eq' + (equippedMain ? ' on' : '');
    eq.textContent = equippedMain ? 'EQUIPPED' : 'Pick a skin to equip';
    head.appendChild(eq);
    info.appendChild(head);

    const lbl = document.createElement('div');
    lbl.className = 'inv-detail-skin';
    lbl.textContent = 'SKINS';
    info.appendChild(lbl);

    const skinsGrid = document.createElement('div');
    skinsGrid.className = 'inv-skins-grid';
    info.appendChild(skinsGrid);

    const tiles = [];
    // Selecting a skin equips THIS gun (single main — picking it unselects any
    // other main gun automatically, since the loadout holds exactly one).
    const select = (id) => {
      if (isMelee) Loadout.setMelee(w.id); else Loadout.setGun(w.id);
      if (id) Armory.equipSkin(w.id, id); else Armory.clearSkin(w.id);
      setStage(id ? skins.find((s) => s.id === id) : null);
      eq.textContent = 'EQUIPPED'; eq.classList.add('on');
      tiles.forEach((t) => t.el.classList.toggle('sel', t.id === (id || '__def__')));
      this._renderEquipped();
      this._refreshTabHighlights();
    };

    const defTile = this._skinTile('Default', _grad(w.color || 0x223040, _darken(w.color || 0x223040, 0.4)), null, () => select(null));
    if (!curSkinId) defTile.classList.add('sel');
    skinsGrid.appendChild(defTile);
    tiles.push({ id: '__def__', el: defTile });

    for (const s of skins) {
      const bg = isMelee
        ? _grad(s.blade ?? 0x8090a0, s.guard ?? 0x303840)
        : _grad(s.body ?? 0x556070, s.accent ?? 0x202830);
      const tile = this._skinTile(s.name, bg, RARITY_COLORS?.[s.rarity], () => select(s.id));
      if (s.id === curSkinId) tile.classList.add('sel');
      skinsGrid.appendChild(tile);
      tiles.push({ id: s.id, el: tile });
    }

    wrap.appendChild(info);
    return wrap;
  }

  _skinTile(name, bg, rarityColor, onClick) {
    const el = document.createElement('div');
    el.className = 'inv-skin-tile';
    el.style.background = bg;
    if (rarityColor != null) el.style.borderColor = `#${_hex(rarityColor)}`;
    const lbl = document.createElement('div');
    lbl.className = 'inv-skin-name';
    lbl.textContent = name;
    el.appendChild(lbl);
    el.addEventListener('click', onClick);
    return el;
  }

  // Mark the tabs of the currently-equipped gun + melee.
  _refreshTabHighlights() {
    const g = Loadout.getGun();
    const m = Loadout.getMelee();
    document.querySelectorAll('#inv-tabs .inv-tab').forEach((b) => {
      b.classList.toggle('inv-tab-eq', b.dataset.wid === g || b.dataset.wid === m);
    });
  }

  // ── Loadout pickers (1 gun + 1 melee) ────────────────────────────────────────

  _buildLoadoutPickers() {
    const gunGrid = document.getElementById('loadout-gun-grid');
    if (!gunGrid) return;

    const build = (grid, list, getSel, setSel) => {
      grid.innerHTML = '';
      const selId = getSel();
      list.forEach((w) => {
        const el = document.createElement('div');
        el.className = 'loadout-pick' + (w.id === selId ? ' selected' : '');
        el.dataset.id = w.id;
        const tag = w.throwable ? '<span class="loadout-pick-tag">THROW · 3×</span>' : '';
        el.innerHTML = `<span class="loadout-pick-name">${w.name}</span>${tag}`;
        el.addEventListener('click', () => {
          setSel(w.id);
          grid.querySelectorAll('.loadout-pick').forEach((p) => p.classList.remove('selected'));
          el.classList.add('selected');
        });
        grid.appendChild(el);
      });
    };

    build(gunGrid, GUNS, () => Loadout.getGun(), (id) => Loadout.setGun(id));
    // Melee is always Arc Blade — no picker needed
  }

  // ── Armory ─────────────────────────────────────────────────────────────────

  _initArmory() {
    const list = document.getElementById('armory-weapon-list');
    if (!list.children.length) {
      WEAPONS.forEach((w) => {
        const row = document.createElement('div');
        row.className = 'armory-weapon-row';
        row.dataset.id = w.id;
        const isSword    = w.kind === 'melee';
        const equippedId = Armory.getSkinId(w.id, isSword);
        const skinName   = isSword
          ? (SWORD_SKINS.find((s) => s.id === equippedId)?.name || 'Iron')
          : (WEAPON_SKINS.find((s) => s.id === equippedId)?.name || 'Midnight Black');
        row.innerHTML = `<div class="aw-name">${w.name}</div><div class="aw-skin">${skinName}</div>`;
        row.addEventListener('click', () => this._selectArmoryWeapon(w.id));
        list.appendChild(row);
      });
    }
    if (!this._armoryWeaponId) this._selectArmoryWeapon(WEAPONS[0].id);
    else this._selectArmoryWeapon(this._armoryWeaponId);
  }

  _selectArmoryWeapon(weaponId) {
    this._armoryWeaponId   = weaponId;
    const w = WEAPONS.find((w) => w.id === weaponId);
    if (!w) return;
    this._armoryIsSword    = w.kind === 'melee';
    this._armoryHoverSkin  = null;
    this._armorySelectedId = null;

    document.querySelectorAll('.armory-weapon-row').forEach((r) => {
      r.classList.toggle('active', r.dataset.id === weaponId);
    });

    const skins      = this._armoryIsSword ? SWORD_SKINS : WEAPON_SKINS;
    const equippedId = Armory.getSkinId(weaponId, this._armoryIsSword);
    const grid       = document.getElementById('armory-skin-grid');
    grid.innerHTML   = '';

    const makeSwatch = (skin) => {
      const el = document.createElement('div');
      el.className = 'armory-swatch';
      el.dataset.rarity = skin.rarity || 'common';
      if (skin.animated)          el.classList.add('animated');
      if (skin.id === equippedId) el.classList.add('equipped');

      // Thumbnail image (PBR render) — falls back to gradient if not ready yet
      const thumb = getThumbnail(skin.id, this._armoryIsSword);
      const imgEl = document.createElement('div');
      imgEl.className = 'swatch-thumb';
      if (thumb) {
        imgEl.style.backgroundImage = `url(${thumb})`;
      } else {
        const c1 = this._armoryIsSword ? skin.blade : skin.body;
        const c2 = this._armoryIsSword ? skin.guard : skin.accent;
        imgEl.style.background = `linear-gradient(145deg, #${_hex(c1)}, #${_hex(c2)})`;
      }
      el.appendChild(imgEl);

      // Rarity corner pip
      const pip = document.createElement('span');
      pip.className = 'swatch-rarity-pip';
      pip.style.background = RARITY_COLORS[skin.rarity] || RARITY_COLORS.common;
      el.appendChild(pip);

      // Skin name label
      const nameEl = document.createElement('div');
      nameEl.className = 'swatch-name';
      nameEl.textContent = skin.name.replace(/[🔥⚡👻💀🌊🌸🐉🤖✦❄☣☠🌈💥🔵🌋]/gu, '').trim();
      el.appendChild(nameEl);

      el.addEventListener('mouseenter', () => { this._armoryHoverSkin = skin; this._previewSkin(skin); });
      el.addEventListener('mouseleave', () => {
        const back = this._armorySelectedId
          ? skins.find((s) => s.id === this._armorySelectedId)
          : skins.find((s) => s.id === equippedId);
        if (back) this._previewSkin(back);
      });
      el.addEventListener('click', () => {
        grid.querySelectorAll('.armory-swatch').forEach((s) => s.classList.remove('selected'));
        el.classList.add('selected');
        this._armorySelectedId = skin.id;
        this._previewSkin(skin);
        document.getElementById('armory-equip-btn').disabled = false;
      });
      return el;
    };

    // Group swatches under rarity headers, strongest tier first.
    [...RARITY_ORDER].reverse().forEach((rarity) => {
      const tierSkins = skins.filter((s) => (s.rarity || 'common') === rarity);
      if (!tierSkins.length) return;
      const hdr = document.createElement('div');
      hdr.className = 'armory-rarity-header';
      hdr.style.color = RARITY_COLORS[rarity];
      hdr.innerHTML = `<span class="ar-dot" style="background:${RARITY_COLORS[rarity]}"></span>${rarity.toUpperCase()} <span class="ar-count">${tierSkins.length}</span>`;
      grid.appendChild(hdr);
      tierSkins.forEach((skin) => grid.appendChild(makeSwatch(skin)));
    });

    const equippedSkin = skins.find((s) => s.id === equippedId);
    document.getElementById('armory-equipped-chip').textContent =
      equippedSkin ? `EQUIPPED: ${equippedSkin.name.toUpperCase()}` : '— none —';

    const btn  = document.getElementById('armory-equip-btn');
    btn.disabled = true;
    btn.onclick  = () => this._equipSelected(weaponId, skins);

    this._startPreview(w);
    const defaultSkin = equippedSkin || skins[0];
    if (defaultSkin) this._previewSkin(defaultSkin);
  }

  _previewSkin(skin) {
    if (!this._preview) return;
    this._preview.previewSkin(skin);
    const nameEl = document.getElementById('preview-skin-name');
    nameEl.textContent = skin.name;
    const rar = skin.rarity || 'common';
    nameEl.style.color = RARITY_COLORS[rar];
    const tags = [rar.toUpperCase()];
    if (skin.decal)    tags.push('CUSTOM DESIGN');
    if (skin.animated) tags.push('✦ ANIMATED');
    if (skin.shootSound) tags.push('✦ CUSTOM SFX');
    if (skin.metalness >= 0.85) tags.push('HIGH GLOSS');
    else if (skin.roughness >= 0.7) tags.push('MATTE');
    document.getElementById('preview-skin-tags').textContent = tags.join('  ·  ');
  }

  _equipSelected(weaponId, skins) {
    if (!this._armorySelectedId) return;
    Armory.equipSkin(weaponId, this._armorySelectedId);
    const skin = skins.find((s) => s.id === this._armorySelectedId);
    const row  = document.querySelector(`.armory-weapon-row[data-id="${weaponId}"]`);
    if (row && skin) row.querySelector('.aw-skin').textContent = skin.name;
    document.querySelectorAll('.armory-swatch').forEach((el, i) => {
      el.classList.remove('equipped');
      if (skins[i]?.id === this._armorySelectedId) el.classList.add('equipped');
    });
    document.getElementById('armory-equipped-chip').textContent =
      skin ? `EQUIPPED: ${skin.name.toUpperCase()}` : '';
    document.getElementById('armory-equip-btn').disabled = true;
    this._armorySelectedId = null;
    this.onArmoryChanged?.();
  }

  _startPreview(weaponDef) {
    const canvas = document.getElementById('skin-preview-canvas');
    if (!this._preview) this._preview = new WeaponPreviewRenderer(canvas);
    this._preview.loadWeapon(weaponDef);
    this._preview.start();
  }

  _stopPreview() { this._preview?.stop(); }

  // ── Mode cards ─────────────────────────────────────────────────────────────

  _buildModeCards() {
    const container = document.getElementById('mode-cards');
    GAME_MODES.forEach((mode) => {
      const card = document.createElement('div');
      card.className = 'mode-card' + (mode.id === this.selectedModeId ? ' selected' : '');
      card.style.setProperty('--mode-color', mode.color);
      card.innerHTML = `
        <div class="mode-icon">${mode.icon}</div>
        <div class="mode-body">
          <div class="mode-name">${mode.name}${mode.comingSoon ? ' <span class="mode-soon">SOON</span>' : ''}</div>
          <div class="mode-tag">${mode.tag}</div>
          <div class="mode-desc">${mode.desc}</div>
        </div>`;
      card.addEventListener('click', () => {
        document.querySelectorAll('.mode-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedModeId = mode.id;
      });
      container.appendChild(card);
    });
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  _buildSettings() {
    const sens = document.getElementById('set-sens');
    const fov  = document.getElementById('set-fov');
    const vol  = document.getElementById('set-vol');

    const update = (el, valId, fmt) => {
      const v       = document.getElementById(valId);
      const refresh = () => { v.textContent = fmt(parseFloat(el.value)); };
      el.addEventListener('input', refresh);
      refresh();
    };
    update(sens, 'set-sens-val', (v) => `${(v / 100).toFixed(1)}×`);
    update(fov,  'set-fov-val',  (v) => `${v}°`);
    update(vol,  'set-vol-val',  (v) => `${Math.round(v)}%`);

    // Render-quality buttons (mutually exclusive within their own group).
    document.querySelectorAll('#quality-btns .quality-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#quality-btns .quality-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Invert-look toggle (its own NORMAL/INVERTED pair).
    document.querySelectorAll('#invert-btns .invert-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#invert-btns .invert-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    document.getElementById('settings-save-btn').addEventListener('click', () => {
      const s = {
        sensitivity: parseFloat(sens.value) / 100,
        fov:         parseInt(fov.value),
        volume:      parseFloat(vol.value) / 100,
        quality:     document.querySelector('#quality-btns .quality-btn.active')?.dataset.q || 'medium',
        invertY:     document.querySelector('#invert-btns .invert-btn.active')?.dataset.inv === 'on',
      };
      GameSettings.set('sensitivity', s.sensitivity);
      GameSettings.set('fov',         s.fov);
      GameSettings.set('volume',      s.volume);
      GameSettings.set('quality',     s.quality);
      GameSettings.set('invertY',     s.invertY);
      this.onSettingsSaved?.(s);
      const btn = document.getElementById('settings-save-btn');
      btn.textContent = 'SAVED ✓';
      setTimeout(() => { btn.textContent = 'SAVE SETTINGS'; }, 1400);
    });
  }

  _loadSettings() {
    GameSettings.load();
    const sens = document.getElementById('set-sens');
    const fov  = document.getElementById('set-fov');
    const vol  = document.getElementById('set-vol');
    sens.value = Math.round(GameSettings.get('sensitivity') * 100);
    fov.value  = GameSettings.get('fov');
    vol.value  = Math.round(GameSettings.get('volume') * 100);
    sens.dispatchEvent(new Event('input'));
    fov.dispatchEvent(new Event('input'));
    vol.dispatchEvent(new Event('input'));
    const q = GameSettings.get('quality');
    document.querySelectorAll('#quality-btns .quality-btn').forEach((b) => b.classList.toggle('active', b.dataset.q === q));
    const inv = GameSettings.get('invertY') ? 'on' : 'off';
    document.querySelectorAll('#invert-btns .invert-btn').forEach((b) => b.classList.toggle('active', b.dataset.inv === inv));
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  setUsername(username) {
    this._currentUser = username;
    const display = username === '__guest__' ? 'GUEST' : UserAccount.getDisplayName(username).toUpperCase();
    const el = document.getElementById('nav-username');
    if (el) el.textContent = display;
    this._refreshCoins();
  }

  _refreshCoins() {
    const el = document.getElementById('nav-coins');
    if (el) el.textContent = `\u{1F4B0} ${Shop.getCoins().toLocaleString()}`;
  }

  _renderProfile() {
    const u       = this._currentUser;
    const isGuest = !u || u === '__guest__';
    const name    = isGuest ? 'GUEST' : UserAccount.getDisplayName(u);
    const stats   = isGuest ? { kills: 0, deaths: 0, score: 0, games: 0 } : UserAccount.getStats(u);
    const kills   = stats.kills  || 0;
    const deaths  = stats.deaths || 0;
    const score   = stats.score  || 0;
    const games   = stats.games  || 0;
    const kd      = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);

    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('profile-username', name);
    set('ps-kills', kills);
    set('ps-deaths', deaths);
    set('ps-kd', kd);
    set('ps-rating', Math.max(1, Math.floor(kills / 10) + 1));
    set('ps-scoreweek', 0);
    set('ps-score', score.toLocaleString());
    set('ps-games', games);
    set('ps-survival', '00:00:00');
    set('ps-rank', _rank(kills));
    set('ps-balance', Shop.getCoins().toLocaleString() + 'e');

    const logout = document.getElementById('profile-logout-btn');
    if (logout) logout.style.display = isGuest ? 'none' : 'block';

    this._startProfilePreview();
  }

  // ── Achievements (ev.io-style tiered challenges) ────────────────────────────
  _renderAchievements() {
    const grid = document.getElementById('ach-grid');
    if (!grid) return;
    const list = Achievements.list(this._currentUser);
    const done = list.filter((a) => a.complete).length;
    const setT = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setT('ach-done', done);
    setT('ach-total', list.length);

    grid.innerHTML = '';
    for (const a of list) {
      const card = document.createElement('div');
      card.className = 'ach-card'
        + (a.claimed ? ' ach-claimed' : a.complete ? ' ach-complete' : '');

      const icon = document.createElement('div');
      icon.className = 'ach-icon';
      icon.innerHTML = ICON_ACH[a.icon] || ICON_ACH.kills;
      card.appendChild(icon);

      const body = document.createElement('div');
      body.className = 'ach-body';
      const curLabel = a.isRatio ? a.current.toFixed(1) : Math.floor(a.current).toLocaleString();
      const goalLabel = a.isRatio ? a.goal.toFixed(1) : a.goal.toLocaleString();
      body.innerHTML =
        `<div class="ach-name">${a.name}</div>` +
        `<div class="ach-desc">${a.desc}</div>` +
        `<div class="ach-reward">Reward: <span class="ach-coin">&#9670;</span> ${a.reward.toLocaleString()}</div>`;

      const barWrap = document.createElement('div');
      barWrap.className = 'ach-bar-wrap';
      const bar = document.createElement('div');
      bar.className = 'ach-bar';
      bar.style.width = `${Math.round(a.progress * 100)}%`;
      barWrap.appendChild(bar);
      const prog = document.createElement('div');
      prog.className = 'ach-prog-text';
      prog.textContent = a.claimed ? 'CLAIMED' : `${curLabel} / ${goalLabel}`;
      body.appendChild(barWrap);
      body.appendChild(prog);
      card.appendChild(body);

      if (a.complete && !a.claimed) {
        const btn = document.createElement('button');
        btn.className = 'ach-claim-btn';
        btn.textContent = 'CLAIM';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const res = Achievements.claim(this._currentUser, a.id);
          if (res.ok) {
            this._refreshCoins();
            this._renderAchievements();
          }
        });
        card.appendChild(btn);
      }
      grid.appendChild(card);
    }
  }

  // Dedicated full-body character render on the profile (the equipped soldier).
  _startProfilePreview() {
    const canvas = document.getElementById('profile-char-canvas');
    if (!canvas) return;
    if (!this._profilePreview) this._profilePreview = new ArmorPreviewRenderer(canvas);
    const playerSkin = getSkin(this.selectedSkinId);
    const armorSkin  = getArmorSkin(Shop.getEquipped());
    this._profilePreview.loadArmor(playerSkin, this.selectedArmorId, armorSkin);
    this._profilePreview.start();
  }

  // ── Visibility helpers ─────────────────────────────────────────────────────

  showMain() {
    this.topNav.classList.remove('hidden');
    this.centerPlay.classList.remove('hidden');
  }

  hideMain() {
    this.topNav.classList.add('hidden');
    this.centerPlay.classList.add('hidden');
    this._closeAllPanels();
  }

  showPause()    { this.pauseMenu.classList.remove('hidden'); }
  hidePause()    { this.pauseMenu.classList.add('hidden'); }

  showGameOver(stats, title = 'YOU DIED') {
    document.getElementById('gameover-title').textContent = title;
    this.gameoverStats.innerHTML = `
      <div>KILLS<span>${stats.kills}</span></div>
      <div>SCORE<span>${stats.score}</span></div>
      <div>TIME<span>${_fmt(stats.time)}</span></div>`;
    this.gameoverMenu.classList.remove('hidden');
    this._refreshCoins();
  }
  hideGameOver() { this.gameoverMenu.classList.add('hidden'); }

  // ── Shop ───────────────────────────────────────────────────────────────────

  _renderShop() {
    this._refreshCoins();
    const bal = document.getElementById('shop-coin-balance');
    if (bal) bal.textContent = Shop.getCoins().toLocaleString();

    const authWall  = document.getElementById('shop-auth-wall');
    const content   = document.getElementById('shop-content');
    const root      = document.getElementById('shop-grid-root');
    if (!root) return;

    const isGuest = !this._currentUser || this._currentUser === '__guest__';
    if (isGuest) {
      authWall?.classList.remove('hidden');
      content?.classList.add('hidden');
      return;
    }
    authWall?.classList.add('hidden');
    content?.classList.remove('hidden');

    // Wire filter buttons (once)
    if (!this._shopFilterWired) {
      this._shopFilterWired = true;
      this._shopFilter = 'all';
      document.querySelectorAll('.stp-filter').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.stp-filter').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._shopFilter = btn.dataset.filter;
          this._renderShopGrid(root);
        });
      });
    }
    this._renderShopGrid(root);
  }

  _renderShopGrid(root) {
    root.innerHTML = '';
    const equipped  = Shop.getEquipped();
    const filter    = this._shopFilter || 'all';

    const _hex6 = n => n.toString(16).padStart(6, '0');

    const makeCard = (skin, isArmor) => {
      const rarity   = skin.rarity || 'common';
      const color    = RARITY_COLORS[rarity];
      const owned    = Shop.isOwned(skin.id);
      const isEquip  = equipped === skin.id;

      const card = document.createElement('div');
      card.className = 'shop-skin-card' + (isEquip ? ' equipped' : owned ? ' owned' : '');
      card.dataset.rarity = rarity;

      // Swatch
      const swatch = document.createElement('div');
      swatch.className = 'shop-swatch';
      const inner = document.createElement('div');
      inner.className = 'shop-swatch-inner';
      const c1 = isArmor ? _hex6(skin.primary) : _hex6(skin.body ?? skin.primary ?? 0x2a2a2a);
      const c2 = isArmor ? _hex6(skin.secondary) : _hex6(skin.accent ?? skin.secondary ?? 0x111111);
      inner.style.background = `linear-gradient(145deg,#${c1},#${c2})`;
      if (skin.emissive) {
        const gc = '#' + _hex6(skin.emissive);
        inner.style.boxShadow = `inset 0 0 20px ${gc}55`;
      }
      swatch.appendChild(inner);

      // Rarity ribbon
      const ribbon = document.createElement('span');
      ribbon.className = 'shop-rarity-ribbon';
      ribbon.style.color = color;
      ribbon.style.borderLeft = `2px solid ${color}`;
      ribbon.textContent = rarity.toUpperCase();
      swatch.appendChild(ribbon);

      // Status badge
      if (isEquip || owned) {
        const badge = document.createElement('span');
        badge.className = 'shop-status-badge';
        badge.style.color = isEquip ? '#00cfff' : '#4a8aaa';
        badge.textContent = isEquip ? '✓ EQUIPPED' : 'OWNED';
        swatch.appendChild(badge);
      }
      card.appendChild(swatch);

      // Card body
      const body = document.createElement('div');
      body.className = 'shop-card-body';
      const nameEl = document.createElement('div');
      nameEl.className = 'shop-skin-name';
      nameEl.textContent = skin.name;
      body.appendChild(nameEl);
      const perkEl = document.createElement('div');
      perkEl.className = 'shop-perk-line';
      perkEl.textContent = describePerk(rarity, isArmor);
      body.appendChild(perkEl);
      card.appendChild(body);

      // CTA
      const ctaWrap = document.createElement('div');
      ctaWrap.className = 'shop-card-cta';
      const btn = document.createElement('button');
      btn.className = 'shop-btn';
      if (isEquip) {
        btn.classList.add('shop-btn-equip');
        btn.textContent = 'EQUIPPED';
        btn.disabled = true;
      } else if (owned) {
        btn.classList.add('shop-btn-owned');
        btn.textContent = 'EQUIP';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          Shop.equip(skin.id);
          this.onArmorSkinEquipped?.(skin.id);
          this._renderShop();
        });
      } else {
        btn.classList.add('shop-btn-buy');
        btn.innerHTML = `&#9670; ${skin.price.toLocaleString()} E-COINS`;
        btn.disabled = Shop.getCoins() < skin.price;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const res = Shop.buy(skin.id, skin.price);
          if (res.ok) {
            Shop.equip(skin.id);
            this.onArmorSkinEquipped?.(skin.id);
            this._renderShop();
            this._refreshCoins();
          } else {
            btn.textContent = res.err.toUpperCase();
            setTimeout(() => {
              btn.innerHTML = `&#9670; ${skin.price.toLocaleString()} E-COINS`;
            }, 1500);
          }
        });
      }
      ctaWrap.appendChild(btn);
      card.appendChild(ctaWrap);
      return card;
    };

    // Build combined list based on filter
    const armorItems  = filter !== 'weapon' ? ARMOR_SKINS.map(s => ({ ...s, _isArmor: true })) : [];
    const weaponItems = filter !== 'armor'  ? WEAPON_SKINS.map(s => ({ ...s, _isArmor: false })) : [];
    const allItems = [...armorItems, ...weaponItems];

    // Render by rarity section, highest first
    [...RARITY_ORDER].reverse().forEach(rarity => {
      const tier = allItems.filter(s => (s.rarity || 'common') === rarity);
      if (!tier.length) return;
      const color = RARITY_COLORS[rarity];
      const section = document.createElement('div');
      section.className = 'shop-section';
      const hdr = document.createElement('div');
      hdr.className = 'shop-rarity-header';
      hdr.innerHTML = `<span class="shop-rarity-dot" style="background:${color}"></span>${rarity.toUpperCase()} <span style="color:#2a3a50;margin-left:4px">${tier.length} ITEMS</span>`;
      section.appendChild(hdr);
      const grid = document.createElement('div');
      grid.className = 'shop-skin-grid';
      tier.forEach(s => grid.appendChild(makeCard(s, s._isArmor)));
      section.appendChild(grid);
      root.appendChild(section);
    });
  }

  // ── Battle Pass ────────────────────────────────────────────────────────────

  _renderBattlePass() {
    this._refreshCoins();
    const tier    = BattlePass.getTier();
    const xpIn    = BattlePass.getXPInTier();
    const premium = BattlePass.hasPremium();

    // Header
    document.getElementById('bp-tier-label').textContent = `Tier ${tier} / ${BattlePass.TOTAL_TIERS}`;
    const xpPct = (xpIn / BattlePass.XP_PER_TIER) * 100;
    document.getElementById('bp-xp-bar').style.width = `${xpPct}%`;
    document.getElementById('bp-xp-text').textContent = `${xpIn} / ${BattlePass.XP_PER_TIER} XP`;

    const premBox = document.getElementById('bp-premium-box');
    if (premium) {
      premBox.classList.add('bp-premium-owned');
      document.getElementById('bp-unlock-btn').textContent = 'PREMIUM ACTIVE ✓';
      document.getElementById('bp-unlock-btn').disabled = true;
    } else {
      const unlockBtn = document.getElementById('bp-unlock-btn');
      unlockBtn.disabled = false;
      unlockBtn.textContent = `UNLOCK — \u{1F4B0} ${BattlePass.PREMIUM_COST}`;
      unlockBtn.onclick = () => {
        const res = Shop.buy('__bp_premium__', BattlePass.PREMIUM_COST);
        if (res.ok) {
          BattlePass.unlockPremium();
          this._renderBattlePass();
          this._refreshCoins();
        } else {
          unlockBtn.textContent = res.err.toUpperCase();
          setTimeout(() => this._renderBattlePass(), 1500);
        }
      };
    }

    // Tier track
    const track = document.getElementById('bp-track');
    track.innerHTML = '';

    BP_TIERS.forEach(({ tier: t, free, premium: prem }) => {
      const reached   = tier >= t;
      const col       = document.createElement('div');
      col.className   = 'bp-tier-col' + (reached ? ' reached' : '') + (t === tier ? ' current' : '');

      const numEl     = document.createElement('div');
      numEl.className = 'bp-tier-num';
      numEl.textContent = t;
      col.appendChild(numEl);

      col.appendChild(this._bpRewardCard(t, 'free',    free,  reached));
      col.appendChild(this._bpRewardCard(t, 'premium', prem,  reached && premium));
      track.appendChild(col);
    });

    // scroll to current tier
    const curCol = track.querySelector('.current');
    if (curCol) curCol.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  _bpRewardCard(tier, track, reward, unlocked) {
    const card = document.createElement('div');
    card.className = 'bp-reward-card' + (unlocked ? ' unlocked' : ' locked') + (track === 'premium' ? ' prem-track' : '');

    const claimed = BattlePass.isClaimed(tier, track);
    if (claimed) card.classList.add('claimed');

    if (reward.type === 'skin') {
      const skin = getArmorSkin(reward.id);
      if (skin) {
        card.style.background = `linear-gradient(145deg,#${skin.primary.toString(16).padStart(6,'0')},#${skin.secondary.toString(16).padStart(6,'0')})`;
        if (skin.emissive) card.style.boxShadow = `0 0 10px #${skin.emissive.toString(16).padStart(6,'0')}88`;
        const lbl = document.createElement('div');
        lbl.className = 'bp-reward-label';
        lbl.textContent = skin.name;
        card.appendChild(lbl);
        const rar = document.createElement('div');
        rar.className = 'bp-reward-rarity';
        rar.style.color = RARITY_COLORS[skin.rarity];
        rar.textContent = skin.rarity.toUpperCase();
        card.appendChild(rar);
      }
    } else {
      const coinEl = document.createElement('div');
      coinEl.className = 'bp-reward-coin';
      coinEl.innerHTML = `\u{1F4B0}<br>${reward.amount}`;
      card.appendChild(coinEl);
    }

    if (claimed) {
      const chk = document.createElement('div');
      chk.className = 'bp-claimed-badge';
      chk.textContent = '✓';
      card.appendChild(chk);
    } else if (unlocked) {
      const btn = document.createElement('button');
      btn.className = 'bp-claim-btn';
      btn.textContent = 'CLAIM';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const res = BattlePass.claimReward(tier, track);
        if (res.ok && res.reward.type === 'skin') {
          Shop.unlock(res.reward.id);
          Shop.equip(res.reward.id);
          this.onArmorSkinEquipped?.(res.reward.id);
        } else if (res.ok && res.reward.type === 'coins') {
          Shop.addCoins(res.reward.amount);
          this._refreshCoins();
        }
        this._renderBattlePass();
      });
      card.appendChild(btn);
    }

    return card;
  }
}

// SVG silhouette paths per armor type — used inside armor card icons
function _armorSVG(id) {
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

