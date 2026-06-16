import { SKINS } from '../player/skins.js';
import { WEAPONS } from '../weapons/weaponDefs.js';
import { WEAPON_SKINS } from '../weapons/WeaponSkins.js';
import { SWORD_SKINS } from '../weapons/SwordSkins.js';
import { UserAccount } from '../core/UserAccount.js';

function _rank(kills) {
  if (kills >= 100) return 'LEGEND';
  if (kills >= 50)  return 'ELITE';
  if (kills >= 25)  return 'VETERAN';
  if (kills >= 10)  return 'SOLDIER';
  if (kills >= 1)   return 'GRUNT';
  return 'RECRUIT';
}

function _hex(n) { return n.toString(16).padStart(6, '0'); }

export class MenuUI {
  constructor() {
    this.mainMenu     = document.getElementById('main-menu');
    this.pauseMenu    = document.getElementById('pause-menu');
    this.gameoverMenu = document.getElementById('gameover-menu');
    this.nameInput    = document.getElementById('player-name');
    this.skinGrid     = document.getElementById('skin-grid');
    this.weaponSkinGrid = document.getElementById('weapon-skin-grid');
    this.swordSkinGrid  = document.getElementById('sword-skin-grid');
    this.loadoutList  = document.getElementById('loadout-list');
    this.playBtn      = document.getElementById('play-btn');
    this.resumeBtn    = document.getElementById('resume-btn');
    this.quitBtn      = document.getElementById('quit-btn');
    this.restartBtn   = document.getElementById('restart-btn');
    this.menuBtn      = document.getElementById('menu-btn');
    this.gameoverStats = document.getElementById('gameover-stats');

    this.selectedSkinId       = SKINS[0].id;
    this.selectedWeaponSkinId = WEAPON_SKINS[0].id;
    this.selectedSwordSkinId  = SWORD_SKINS[0].id;
    this._currentUsername     = null;

    this._buildSkinGrid();
    this._buildWeaponSkinGrid();
    this._buildSwordSkinGrid();
    this._buildLoadoutList();
    this._buildMenuTabs();

    this.onPlay       = null; // (name, skinId, weaponSkinId, swordSkinId) => void
    this.onResume     = null;
    this.onQuit       = null;
    this.onRestart    = null;
    this.onBackToMenu = null;
    this.onLogout     = null;

    this.playBtn.addEventListener('click', () => {
      const name = this.nameInput.value.trim() || 'Recruit';
      this.onPlay?.(name, this.selectedSkinId, this.selectedWeaponSkinId, this.selectedSwordSkinId);
    });
    this.resumeBtn.addEventListener('click', () => this.onResume?.());
    this.quitBtn.addEventListener('click',   () => this.onQuit?.());
    this.restartBtn.addEventListener('click',() => this.onRestart?.());
    this.menuBtn.addEventListener('click',   () => this.onBackToMenu?.());
    document.getElementById('profile-logout-btn').addEventListener('click', () => this.onLogout?.());
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────

  _buildMenuTabs() {
    document.querySelectorAll('.menu-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.menu-tab').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach((t) => t.classList.add('hidden'));
        btn.classList.add('active');
        const panel = document.getElementById('tab-' + btn.dataset.tab);
        if (panel) {
          panel.classList.remove('hidden');
          if (btn.dataset.tab === 'profile') this._renderProfile();
        }
      });
    });
  }

  // ── Profile tab ───────────────────────────────────────────────────────────

  setUsername(username) {
    this._currentUsername = username;
  }

  _renderProfile() {
    const u       = this._currentUsername;
    const isGuest = !u || u === '__guest__';
    const display = isGuest ? 'GUEST' : UserAccount.getDisplayName(u).toUpperCase();
    const stats   = isGuest ? { kills: 0, score: 0, games: 0 } : UserAccount.getStats(u);

    document.getElementById('profile-username').textContent = display;
    document.getElementById('profile-badge').textContent    = isGuest ? 'GUEST MODE' : _rank(stats.kills);

    // Avatar gradient from current weapon skin
    const ws = WEAPON_SKINS.find((s) => s.id === this.selectedWeaponSkinId) || WEAPON_SKINS[0];
    document.getElementById('profile-avatar').style.background =
      `linear-gradient(135deg, #${_hex(ws.body)}, #${_hex(ws.metal)})`;

    document.getElementById('stat-kills').textContent = isGuest ? '—' : stats.kills;
    document.getElementById('stat-score').textContent = isGuest ? '—' : stats.score;
    document.getElementById('stat-games').textContent = isGuest ? '—' : stats.games;

    // Equipped skins preview
    const ws2 = WEAPON_SKINS.find((s) => s.id === this.selectedWeaponSkinId) || WEAPON_SKINS[0];
    document.getElementById('profile-weapon-skin').style.background =
      `linear-gradient(145deg, #${_hex(ws2.body)}, #${_hex(ws2.accent)})`;
    document.getElementById('profile-weapon-skin-name').textContent = ws2.name;

    const ss = SWORD_SKINS.find((s) => s.id === this.selectedSwordSkinId) || SWORD_SKINS[0];
    document.getElementById('profile-sword-skin').style.background =
      `linear-gradient(145deg, #${_hex(ss.blade)}, #${_hex(ss.guard)})`;
    document.getElementById('profile-sword-skin-name').textContent = ss.name;

    document.getElementById('profile-logout-btn').style.display = isGuest ? 'none' : 'block';
  }

  // ── Skin grids ────────────────────────────────────────────────────────────

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

  _buildWeaponSkinGrid() {
    this.weaponSkinGrid.innerHTML = '';
    WEAPON_SKINS.forEach((skin) => {
      const el = document.createElement('div');
      let cls = 'skin-swatch' + (skin.id === this.selectedWeaponSkinId ? ' selected' : '');
      if (skin.animated) cls += ' animated';
      el.className = cls;
      el.style.background = `linear-gradient(145deg, #${_hex(skin.body)}, #${_hex(skin.accent)})`;
      el.title = skin.name;
      el.addEventListener('click', () => {
        this.selectedWeaponSkinId = skin.id;
        this.weaponSkinGrid.querySelectorAll('.skin-swatch').forEach((s) => s.classList.remove('selected'));
        el.classList.add('selected');
      });
      this.weaponSkinGrid.appendChild(el);
    });
  }

  _buildSwordSkinGrid() {
    this.swordSkinGrid.innerHTML = '';
    SWORD_SKINS.forEach((skin) => {
      const el = document.createElement('div');
      let cls = 'skin-swatch' + (skin.id === this.selectedSwordSkinId ? ' selected' : '');
      if (skin.animated) cls += ' animated';
      el.className = cls;
      el.style.background = `linear-gradient(145deg, #${_hex(skin.blade)}, #${_hex(skin.guard)})`;
      el.title = skin.name;
      el.addEventListener('click', () => {
        this.selectedSwordSkinId = skin.id;
        this.swordSkinGrid.querySelectorAll('.skin-swatch').forEach((s) => s.classList.remove('selected'));
        el.classList.add('selected');
      });
      this.swordSkinGrid.appendChild(el);
    });
  }

  _buildLoadoutList() {
    this.loadoutList.innerHTML = '';
    WEAPONS.forEach((w, i) => {
      const row = document.createElement('div');
      row.className = 'loadout-row';
      const stat = w.kind === 'melee' ? `${w.damage} dmg / swing` : `${w.damage} dmg / ${w.magSize} mag`;
      row.innerHTML = `<span><b>${w.key || i + 1}</b> ${w.name}</span><span>${stat}</span>`;
      this.loadoutList.appendChild(row);
    });
  }

  // ── Visibility helpers ────────────────────────────────────────────────────

  showMain()     { this.mainMenu.classList.remove('hidden'); }
  hideMain()     { this.mainMenu.classList.add('hidden'); }
  showPause()    { this.pauseMenu.classList.remove('hidden'); }
  hidePause()    { this.pauseMenu.classList.add('hidden'); }
  showGameOver(stats) {
    this.gameoverStats.innerHTML = `
      <div>KILLS<span>${stats.kills}</span></div>
      <div>SCORE<span>${stats.score}</span></div>
      <div>TIME<span>${stats.time}s</span></div>
    `;
    this.gameoverMenu.classList.remove('hidden');
  }
  hideGameOver() { this.gameoverMenu.classList.add('hidden'); }
}
