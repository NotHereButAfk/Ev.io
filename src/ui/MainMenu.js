import { SKINS } from '../player/skins.js';
import { WEAPONS } from '../weapons/weaponDefs.js';
import { WEAPON_SKINS } from '../weapons/WeaponSkins.js';
import { SWORD_SKINS } from '../weapons/SwordSkins.js';
import { UserAccount } from '../core/UserAccount.js';
import { Armory } from '../core/Armory.js';
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

    this.selectedSkinId = SKINS[0].id;
    this.selectedModeId = GAME_MODES[0].id;
    this._currentUser   = null;
    this._preview       = null;

    // Armory state
    this._armoryWeaponId   = null;
    this._armoryIsSword    = false;
    this._armoryHoverSkin  = null;
    this._armorySelectedId = null;

    // Callbacks
    this.onPlay          = null; // (name, skinId, modeId) => void
    this.onResume        = null;
    this.onQuit          = null;
    this.onRestart       = null;
    this.onBackToMenu    = null;
    this.onLogout        = null;
    this.onArmoryChanged = null;
    this.onSettingsSaved = null;

    warmThumbnails(); // kick off async thumbnail generation immediately
    this._buildSkinGrid();
    this._buildModeCards();
    this._buildSettings();
    this._wireNav();
  }

  // ── Nav wiring ──────────────────────────────────────────────────────────────

  _wireNav() {
    // PUBLIC GAME button and center CLICK TO PLAY both start the game
    const startGame = () => {
      const name = this.nameInput.value.trim() || 'Recruit';
      this._closeAllPanels();
      this.onPlay?.(name, this.selectedSkinId, this.selectedModeId);
    };
    document.getElementById('nav-public-btn')?.addEventListener('click', startGame);
    this.playBtn?.addEventListener('click', startGame);

    // Nav dropdown items
    document.querySelectorAll('[data-panel]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._togglePanel(btn.dataset.panel);
      });
    });

    // Click anywhere outside a panel closes it
    document.addEventListener('click', (e) => {
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

  _togglePanel(id) {
    if (this._activePanel === id) {
      this._closeAllPanels();
      return;
    }
    this._closeAllPanels();
    this._activePanel = id;
    document.getElementById('panel-' + id)?.classList.remove('hidden');
    document.querySelector(`[data-panel="${id}"]`)?.classList.add('active');

    if (id === 'loadout')  this._initArmory();
    if (id === 'profile')  this._renderProfile();
    if (id === 'settings') this._loadSettings();
  }

  _closeAllPanels() {
    if (this._activePanel === 'loadout') this._stopPreview();
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
      el.style.background = `linear-gradient(145deg, #${_hex(skin.primary)}, #${_hex(skin.secondary)})`;
      el.title = skin.name;
      el.addEventListener('click', () => {
        this.selectedSkinId = skin.id;
        this.skinGrid.querySelectorAll('.skin-swatch').forEach((s) => s.classList.remove('selected'));
        el.classList.add('selected');
      });
      this.skinGrid.appendChild(el);
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

    skins.forEach((skin) => {
      const el = document.createElement('div');
      el.className = 'armory-swatch';
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

      // Skin name label
      const nameEl = document.createElement('div');
      nameEl.className = 'swatch-name';
      nameEl.textContent = skin.name.replace(/[🔥⚡👻💀🌊]/u, '').trim();
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
      grid.appendChild(el);
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
    document.getElementById('preview-skin-name').textContent = skin.name;
    const tags = [];
    if (skin.animated) tags.push('✦ ANIMATED');
    if (skin.metalness >= 0.85) tags.push('HIGH GLOSS');
    else if (skin.roughness >= 0.7) tags.push('MATTE');
    tags.push(`METAL ${Math.round((skin.metalness ?? 0) * 100)}%`);
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
  }
  hideGameOver() { this.gameoverMenu.classList.add('hidden'); }
}
