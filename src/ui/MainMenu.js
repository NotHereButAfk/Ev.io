import { SKINS, getSkin } from '../player/skins.js';
import { loadArmorType } from '../player/ArmorTypes.js';
import { ARMOR_SKINS, RARITY_ORDER, RARITY_COLORS, getArmorSkin } from '../player/ArmorSkins.js';
import { WEAPON_SKINS } from '../weapons/WeaponSkins.js';
import { SWORD_SKINS } from '../weapons/SwordSkins.js';
import { UserAccount } from '../core/UserAccount.js';
import { Achievements } from '../core/Achievements.js';
import { Shop } from '../core/Shop.js';
import { Armory } from '../core/Armory.js';
import { describePerk } from '../core/RarityPerks.js';
import { BattlePass, BP_TIERS } from '../core/BattlePass.js';
import { GameSettings } from '../core/GameSettings.js';
import { GAME_MODES } from '../core/GameModes.js';
import { ArmorPreviewRenderer } from './ArmorPreviewRenderer.js';
import { InventoryPanel } from './InventoryPanel.js';
import { WEAPONS } from '../weapons/weaponDefs.js';
import { warmWeaponThumbs, renderWeaponSkinned } from './WeaponThumbnails.js';

// Shop card previews use the same weapon-render pipeline as the inventory:
// pick one showcase gun for all weapon-skin cards, and the sword for melee.
const _SHOP_GUN = () => WEAPONS.find((w) => w.id === 'm4') || WEAPONS.find((w) => w.kind !== 'melee');
const _SHOP_SWORD = () => WEAPONS.find((w) => w.id === 'sword');
const _shopThumbCache = new Map();  // `${weaponId}:${skinId}` -> dataURL

const SHOP_CHAR_SVG = `
  <svg viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <ellipse cx="16" cy="7" rx="5" ry="6" fill="rgba(0,0,0,0.55)"/>
    <rect x="9" y="14" width="14" height="14" rx="2" fill="rgba(0,0,0,0.45)"/>
    <rect x="3" y="14" width="5" height="11" rx="2" fill="rgba(0,0,0,0.4)"/>
    <rect x="24" y="14" width="5" height="11" rx="2" fill="rgba(0,0,0,0.4)"/>
    <rect x="9" y="29" width="5" height="13" rx="2" fill="rgba(0,0,0,0.45)"/>
    <rect x="18" y="29" width="5" height="13" rx="2" fill="rgba(0,0,0,0.45)"/>
    <rect x="10" y="11" width="12" height="4" rx="1" fill="rgba(0,207,255,0.6)"/>
  </svg>`;

function _rank(k) {
  if (k >= 100) return 'LEGEND';
  if (k >= 50)  return 'ELITE';
  if (k >= 25)  return 'VETERAN';
  if (k >= 10)  return 'SOLDIER';
  if (k >= 1)   return 'GRUNT';
  return 'RECRUIT';
}
function _fmt(s) { return s > 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${s}s`; }

// Achievement category icons (cyan stroke)
const ICON_ACH = {
  kills: '<svg viewBox="0 0 24 24" fill="none" stroke="#5fe9ff" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></svg>',
  games: '<svg viewBox="0 0 24 24" fill="none" stroke="#5fe9ff" stroke-width="1.6"><rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 12h3M8.5 10.5v3"/><circle cx="16" cy="11.5" r="1"/><circle cx="18.5" cy="13.5" r="1"/></svg>',
  score: '<svg viewBox="0 0 24 24" fill="none" stroke="#5fe9ff" stroke-width="1.6"><path d="M12 2l2.9 6 6.6.6-5 4.3 1.5 6.5L12 16.9 5.9 19.4 7.4 12.9l-5-4.3 6.6-.6z"/></svg>',
  kd:    '<svg viewBox="0 0 24 24" fill="none" stroke="#5fe9ff" stroke-width="1.6"><path d="M12 2l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V5z"/><path d="M9 12l2 2 4-4"/></svg>',
};

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
    this.onLoginRequest       = null; // () => void — open the login page

    this.inventory = new InventoryPanel(this);   // Inventory v3 (loadout hub)
    // Warm the weapon-render pipeline so shop cards can drop in real skinned
    // renders (same pipeline the inventory cards use). Re-render the shop
    // when it's open at warm-up time.
    warmWeaponThumbs(() => { if (this._activePanel === 'shop') this._renderShop(); });
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
      this._closeAllDropdowns();
      this.onPlay?.(name, this.selectedSkinId, this.selectedModeId, this.selectedArmorId);
    };

    // Center CLICK TO PLAY — starts last selected mode
    this.playBtn?.addEventListener('click', () => startGame());

    // Generic dropdown toggles: any .nav-dd-btn opens its `#dd-<data-dd>` menu.
    document.querySelectorAll('.nav-dd-btn').forEach((btn) => {
      const dd = document.getElementById('dd-' + btn.dataset.dd);
      if (!dd) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !dd.classList.contains('hidden');
        this._closeAllDropdowns();
        if (!open) {
          dd.classList.remove('hidden');
          btn.classList.add('open');
          this._closeAllPanels();
        }
      });
    });

    // Mode option buttons — select mode and start immediately (open to guests).
    document.querySelectorAll('.mode-option[data-mode]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._closeAllDropdowns();
        startGame(btn.dataset.mode);
      });
    });

    // Panel-opening buttons. Items marked data-gated require a real account —
    // logged-out / guest users get redirected to the login page instead.
    document.querySelectorAll('[data-panel]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._closeAllDropdowns();
        if (btn.dataset.gated && !this._isRegistered()) {
          this.onLoginRequest?.();
          return;
        }
        this._togglePanel(btn.dataset.panel);
      });
    });

    // Cosmetic wallet button inside the CRYPTO dropdown.
    document.getElementById('crypto-wallet-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.currentTarget.querySelector('.pm-name').textContent = 'WALLET LINKED ✓';
    });

    // Auth control (right-side menu). "login" is a plain link to /login; the
    // logout button clears the session and drops back to spectating.
    document.getElementById('nav-logout-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onLogout?.();
    });

    // Click outside closes any open dropdown / panel. Use composedPath (snapshotted
    // at dispatch) so a click that rebuilds panel content mid-handler — detaching
    // its own target — isn't mistaken for an outside click.
    document.addEventListener('click', (e) => {
      const path = e.composedPath();
      const has = (sel) => path.some((n) => n.nodeType === 1 && n.matches?.(sel));
      if (!has('.nav-dd-wrap')) this._closeAllDropdowns();
      if (this._activePanel && !has('.nav-panel') && !has('[data-panel]')) {
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

  // True only when a real (non-guest) account is signed in.
  _isRegistered() {
    return !!this._currentUser && this._currentUser !== '__guest__';
  }

  _closeAllDropdowns() {
    document.querySelectorAll('.nav-dd').forEach((d) => d.classList.add('hidden'));
    document.querySelectorAll('.nav-dd-btn').forEach((b) => b.classList.remove('open'));
  }

  _togglePanel(id) {
    if (this._activePanel === id) {
      this._closeAllPanels();
      return;
    }
    this._closeAllPanels();
    this._activePanel = id;
    document.getElementById('panel-' + id)?.classList.remove('hidden');
    // Light the owning nav control (a dropdown parent or a direct nav item).
    const opener = document.querySelector(`[data-panel="${id}"]`);
    opener?.classList.add('active');
    opener?.closest('.nav-dd-wrap')?.querySelector('.nav-dd-btn')?.classList.add('nav-dd-active');

    if (id === 'loadout') {
      this.inventory.open();
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
      this.inventory?.close();
      this.onLoadoutClose?.();
    }
    if (this._activePanel === 'profile') {
      this._profilePreview?.stop();
    }
    this._activePanel = null;
    document.querySelectorAll('.nav-panel').forEach((p) => p.classList.add('hidden'));
    document.querySelectorAll('[data-panel]').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.nav-dd-btn').forEach((b) => b.classList.remove('nav-dd-active'));
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

  // Drives the right-side vertical menu. A real account shows its name + coins
  // + logout; a guest or logged-out spectator shows the green "login" link.
  setUsername(username) {
    this._currentUser = username;
    const registered = !!username && username !== '__guest__';

    const nameEl    = document.getElementById('nav-username');
    const loginLink = document.getElementById('nav-login-link');
    const account   = document.getElementById('nav-account');

    if (nameEl) {
      nameEl.textContent = registered ? UserAccount.getDisplayName(username) : 'guest';
    }
    loginLink?.classList.toggle('hidden', registered);
    account?.classList.toggle('hidden', !registered);

    // A guest / logged-out user must not keep an account-only panel open.
    if (!registered && (this._activePanel && this._activePanel !== 'settings')) {
      this._closeAllPanels();
    }
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

  _chrome(show) {
    ['nav-side', 'share-game', 'social-icons'].forEach((id) => {
      document.getElementById(id)?.classList.toggle('hidden', !show);
    });
  }

  showMain() {
    this.topNav.classList.remove('hidden');
    this.centerPlay.classList.remove('hidden');
    this._chrome(true);
  }

  hideMain() {
    this.topNav.classList.add('hidden');
    this.centerPlay.classList.add('hidden');
    this._chrome(false);
    this._closeAllPanels();
  }

  // Esc during a match opens the full nav GUI (Loadout / Shop / Settings /
  // Profile / …) — the same menu as the main screen. No paused box; click any
  // nav item to change loadout, or press Esc again to hide the nav and resume.
  showPause() {
    this.topNav.classList.remove('hidden');
    this._chrome(true);
  }
  hidePause() {
    this._chrome(false);
    this.topNav.classList.add('hidden');
    this._closeAllPanels();
  }

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
    const equippedArmor = Shop.getEquipped();
    const filter        = this._shopFilter || 'all';

    // Every rarity has a default price; armor skins override with their own.
    const RARITY_PRICE = { common: 100, uncommon: 300, rare: 700, epic: 1500, legendary: 3000, mythic: 6000 };
    const priceOf = (skin) => skin.price ?? RARITY_PRICE[skin.rarity || 'common'] ?? 100;

    const _hex6 = n => n.toString(16).padStart(6, '0');

    // Skin cards that need real 3D-rendered previews are queued here and drop
    // in progressively (a few per frame) after the initial render.
    const previewJobs = [];

    // kind: 'armor' | 'weapon' | 'sword'
    const makeCard = (skin, kind) => {
      const rarity  = skin.rarity || 'common';
      const color   = RARITY_COLORS[rarity];
      const price   = priceOf(skin);
      const isArmor = kind === 'armor';
      const owned   = isArmor ? Shop.isOwned(skin.id) : Armory.ownsSkin(skin.id);
      const isEquip = isArmor && equippedArmor === skin.id;

      const card = document.createElement('div');
      card.className = 'shop-skin-card' + (isEquip ? ' equipped' : owned ? ' owned' : '');
      card.dataset.rarity = rarity;

      // Swatch
      const swatch = document.createElement('div');
      swatch.className = 'shop-swatch';
      const inner = document.createElement('div');
      inner.className = 'shop-swatch-inner';
      const c1 = isArmor ? _hex6(skin.primary) : _hex6(skin.body ?? skin.blade ?? 0x2a2a2a);
      const c2 = isArmor ? _hex6(skin.secondary) : _hex6(skin.accent ?? skin.guard ?? 0x111111);
      inner.style.background = `linear-gradient(145deg,#${c1},#${c2})`;
      if (skin.emissive) {
        const gc = '#' + _hex6(skin.emissive);
        inner.style.boxShadow = `inset 0 0 20px ${gc}55`;
      }
      swatch.appendChild(inner);

      // Preview: for armor a themed character silhouette; for weapon/sword a
      // real skinned-model render (dropped in progressively — see below).
      const preview = document.createElement('div');
      preview.className = 'shop-preview';
      if (isArmor) {
        preview.classList.add('shop-preview-char');
        preview.innerHTML = SHOP_CHAR_SVG;
      } else {
        preview.classList.add('shop-preview-weapon');
        const showcase = kind === 'sword' ? _SHOP_SWORD() : _SHOP_GUN();
        if (showcase) {
          const key = `${showcase.id}:${skin.id}`;
          const cached = _shopThumbCache.get(key);
          if (cached) preview.style.backgroundImage = `url(${cached})`;
          else previewJobs.push({ el: preview, gun: showcase, skin, key });
        }
      }
      swatch.appendChild(preview);

      // Rarity ribbon
      const ribbon = document.createElement('span');
      ribbon.className = 'shop-rarity-ribbon';
      ribbon.style.color = color;
      ribbon.style.borderLeft = `2px solid ${color}`;
      ribbon.textContent = rarity.toUpperCase();
      swatch.appendChild(ribbon);

      // Kind badge (WEAPON / SWORD / ARMOR) top-right
      const kindBadge = document.createElement('span');
      kindBadge.className = 'shop-kind-badge';
      kindBadge.textContent = kind.toUpperCase();
      swatch.appendChild(kindBadge);

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
        if (isArmor) {
          btn.classList.add('shop-btn-owned');
          btn.textContent = 'EQUIP';
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            Shop.equip(skin.id);
            this.onArmorSkinEquipped?.(skin.id);
            this._renderShop();
          });
        } else {
          // Weapon/sword skins equip inside the Inventory (they attach to a
          // specific gun there) — the shop just marks them OWNED.
          btn.classList.add('shop-btn-owned');
          btn.textContent = 'IN INVENTORY';
          btn.disabled = true;
        }
      } else {
        btn.classList.add('shop-btn-buy');
        btn.innerHTML = `&#9670; ${price.toLocaleString()} E-COINS`;
        btn.disabled = Shop.getCoins() < price;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const res = Shop.buy(skin.id, price);
          if (res.ok) {
            if (isArmor) {
              Shop.equip(skin.id);
              this.onArmorSkinEquipped?.(skin.id);
            } else {
              // Weapon/sword skin -> grant into the Armory's owned pool so
              // it appears in the matching inventory tab.
              Armory.grantSkin(skin.id);
            }
            this._renderShop();
            this._refreshCoins();
          } else {
            btn.textContent = res.err.toUpperCase();
            setTimeout(() => {
              btn.innerHTML = `&#9670; ${price.toLocaleString()} E-COINS`;
            }, 1500);
          }
        });
      }
      ctaWrap.appendChild(btn);
      card.appendChild(ctaWrap);
      return card;
    };

    // Build combined list based on filter
    const armorItems  = (filter === 'all' || filter === 'armor')  ? ARMOR_SKINS.map(s => ({ ...s, _kind: 'armor'  })) : [];
    const weaponItems = (filter === 'all' || filter === 'weapon') ? WEAPON_SKINS.map(s => ({ ...s, _kind: 'weapon' })) : [];
    const swordItems  = (filter === 'all' || filter === 'sword')  ? SWORD_SKINS.map(s => ({ ...s, _kind: 'sword'  })) : [];
    const allItems = [...armorItems, ...weaponItems, ...swordItems];

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
      tier.forEach(s => grid.appendChild(makeCard(s, s._kind)));
      section.appendChild(grid);
      root.appendChild(section);
    });

    // Progressive skinned-render pump: a few real 3D renders per frame so the
    // shop stays responsive while the previews fill in. Results are cached
    // so revisits are instant.
    this._shopRenderToken = (this._shopRenderToken || 0) + 1;
    const token = this._shopRenderToken;
    const pump = () => {
      if (token !== this._shopRenderToken) return;
      let n = 0;
      while (previewJobs.length && n < 3) {
        const j = previewJobs.shift();
        let src = _shopThumbCache.get(j.key);
        if (!src) {
          try { src = renderWeaponSkinned(j.gun, j.skin); } catch { src = null; }
          if (src) _shopThumbCache.set(j.key, src);
        }
        if (src) j.el.style.backgroundImage = `url(${src})`;
        n++;
      }
      if (previewJobs.length) requestAnimationFrame(pump);
    };
    if (previewJobs.length) requestAnimationFrame(pump);
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
