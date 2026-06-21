import { SKINS } from '../player/skins.js';
import { ARMOR_TYPES, loadArmorType, saveArmorType } from '../player/ArmorTypes.js';
import { ARMOR_SKINS, RARITY_ORDER, RARITY_COLORS, getArmorSkin } from '../player/ArmorSkins.js';
import { WEAPONS } from '../weapons/weaponDefs.js';
import { WEAPON_SKINS } from '../weapons/WeaponSkins.js';
import { SWORD_SKINS } from '../weapons/SwordSkins.js';
import { UserAccount } from '../core/UserAccount.js';
import { Armory } from '../core/Armory.js';
import { Shop } from '../core/Shop.js';
import { BattlePass, BP_TIERS } from '../core/BattlePass.js';
import { GameSettings, DEFAULTS } from '../core/GameSettings.js';
import { GAME_MODES } from '../core/GameModes.js';
import { WeaponPreviewRenderer } from './WeaponPreviewRenderer.js';
import { warmThumbnails, getThumbnail } from './SkinThumbnails.js';

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

    warmThumbnails(); // kick off async thumbnail generation immediately
    this._buildSkinGrid();
    this._buildArmorGrid();
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

    // Nav dropdown items (panels)
    document.querySelectorAll('[data-panel]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._closeModeDropdown();
        this._togglePanel(btn.dataset.panel);
      });
    });

    // Click anywhere outside closes panels and modes dropdown
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav-modes-wrap')) this._closeModeDropdown();
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

  _togglePanel(id) {
    if (this._activePanel === id) {
      this._closeAllPanels();
      return;
    }
    this._closeAllPanels();
    this._activePanel = id;
    document.getElementById('panel-' + id)?.classList.remove('hidden');
    document.querySelector(`[data-panel="${id}"]`)?.classList.add('active');

    if (id === 'loadout') {
      this._initArmory();
      this.onLoadoutOpen?.();
    }
    if (id === 'profile')     this._renderProfile();
    if (id === 'settings')    this._loadSettings();
    if (id === 'shop')        this._renderShop();
    if (id === 'battlepass')  this._renderBattlePass();
  }

  _closeAllPanels() {
    if (this._activePanel === 'loadout') {
      this._stopPreview();
      this.onLoadoutClose?.();
    }
    this._activePanel = null;
    document.querySelectorAll('.nav-panel').forEach((p) => p.classList.add('hidden'));
    document.querySelectorAll('[data-panel]').forEach((b) => b.classList.remove('active'));
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
      });
      grid.appendChild(card);
    });
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
          <div class="mode-name">${mode.name}</div>
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

    document.querySelectorAll('.quality-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.quality-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    document.getElementById('settings-save-btn').addEventListener('click', () => {
      const s = {
        sensitivity: parseFloat(sens.value) / 100,
        fov:         parseInt(fov.value),
        volume:      parseFloat(vol.value) / 100,
        quality:     document.querySelector('.quality-btn.active')?.dataset.q || 'medium',
      };
      GameSettings.set('sensitivity', s.sensitivity);
      GameSettings.set('fov',         s.fov);
      GameSettings.set('volume',      s.volume);
      GameSettings.set('quality',     s.quality);
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
    document.querySelectorAll('.quality-btn').forEach((b) => b.classList.toggle('active', b.dataset.q === q));
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
    document.getElementById('profile-username').textContent = isGuest ? 'GUEST' : UserAccount.getDisplayName(u).toUpperCase();
    const stats = isGuest ? { kills: 0, score: 0, games: 0 } : UserAccount.getStats(u);
    document.getElementById('profile-badge').textContent  = isGuest ? 'GUEST MODE' : _rank(stats.kills);
    document.getElementById('stat-kills').textContent     = isGuest ? '—' : stats.kills;
    document.getElementById('stat-score').textContent     = isGuest ? '—' : stats.score;
    document.getElementById('stat-games').textContent     = isGuest ? '—' : stats.games;

    const firstGunSkinId = Armory.getSkinId(WEAPONS.find((w) => w.kind !== 'melee')?.id || WEAPONS[0].id, false);
    const ws = WEAPON_SKINS.find((s) => s.id === firstGunSkinId) || WEAPON_SKINS[0];
    document.getElementById('profile-avatar').style.background =
      `linear-gradient(135deg, #${_hex(ws.body)}, #${_hex(ws.metal)})`;

    const gunWep   = WEAPONS.find((w) => w.kind !== 'melee');
    const swordWep = WEAPONS.find((w) => w.kind === 'melee');
    const gsId     = gunWep   ? Armory.getSkinId(gunWep.id,   false) : null;
    const ssId     = swordWep ? Armory.getSkinId(swordWep.id, true)  : null;
    const gs = WEAPON_SKINS.find((s) => s.id === gsId)  || WEAPON_SKINS[0];
    const ss = SWORD_SKINS.find((s) => s.id === ssId)   || SWORD_SKINS[0];

    document.getElementById('profile-weapon-skin').style.background =
      `linear-gradient(145deg, #${_hex(gs.body)}, #${_hex(gs.accent)})`;
    document.getElementById('profile-weapon-skin-name').textContent = gs.name;
    document.getElementById('profile-sword-skin').style.background =
      `linear-gradient(145deg, #${_hex(ss.blade)}, #${_hex(ss.guard)})`;
    document.getElementById('profile-sword-skin-name').textContent = ss.name;
    document.getElementById('profile-logout-btn').style.display = isGuest ? 'none' : 'block';
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
    const root = document.getElementById('shop-grid-root');
    const bal  = document.getElementById('shop-coin-balance');
    if (!root) return;
    if (bal) bal.textContent = Shop.getCoins().toLocaleString();

    root.innerHTML = '';
    const equipped = Shop.getEquipped();

    RARITY_ORDER.forEach(rarity => {
      const skins = ARMOR_SKINS.filter(s => s.rarity === rarity);
      if (!skins.length) return; // skip tiers with no armor (e.g. uncommon/mythic)
      const color = RARITY_COLORS[rarity];

      const section = document.createElement('div');
      section.className = 'shop-section';

      const hdr = document.createElement('div');
      hdr.className = 'shop-rarity-header';
      hdr.innerHTML = `<span class="shop-rarity-dot" style="background:${color}"></span>${rarity.toUpperCase()}`;
      section.appendChild(hdr);

      const grid = document.createElement('div');
      grid.className = 'shop-skin-grid';

      skins.forEach(skin => {
        const owned    = Shop.isOwned(skin.id);
        const isEquip  = equipped === skin.id;
        const card     = document.createElement('div');
        card.className = 'shop-skin-card' + (isEquip ? ' equipped' : '');

        const swatch = document.createElement('div');
        swatch.className = 'shop-swatch';
        swatch.style.background = `linear-gradient(145deg,#${skin.primary.toString(16).padStart(6,'0')},#${skin.secondary.toString(16).padStart(6,'0')})`;
        if (skin.emissive) {
          const glowColor = '#' + skin.emissive.toString(16).padStart(6,'0');
          swatch.style.boxShadow = `0 0 14px ${glowColor}88`;
        }
        card.appendChild(swatch);

        const info = document.createElement('div');
        info.className = 'shop-skin-info';
        info.innerHTML = `<div class="shop-skin-name">${skin.name}</div>
          <div class="shop-rarity-tag" style="color:${color}">${rarity.toUpperCase()}</div>`;
        card.appendChild(info);

        const btn = document.createElement('button');
        if (isEquip) {
          btn.className = 'shop-btn shop-btn-equip';
          btn.textContent = 'EQUIPPED';
        } else if (owned) {
          btn.className = 'shop-btn shop-btn-owned';
          btn.textContent = 'EQUIP';
          btn.addEventListener('click', () => {
            Shop.equip(skin.id);
            this.onArmorSkinEquipped?.(skin.id);
            this._renderShop();
          });
        } else {
          btn.className = 'shop-btn shop-btn-buy';
          btn.textContent = `\u{1F4B0} ${skin.price.toLocaleString()}`;
          const enough = Shop.getCoins() >= skin.price;
          if (!enough) btn.classList.add('shop-btn-disabled');
          btn.addEventListener('click', () => {
            const res = Shop.buy(skin.id, skin.price);
            if (res.ok) {
              this.onArmorSkinEquipped?.(skin.id);
              Shop.equip(skin.id);
              this._renderShop();
              this._refreshCoins();
            } else {
              btn.textContent = res.err.toUpperCase();
              setTimeout(() => { btn.textContent = `\u{1F4B0} ${skin.price.toLocaleString()}`; }, 1500);
            }
          });
        }
        card.appendChild(btn);
        grid.appendChild(card);
      });

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

