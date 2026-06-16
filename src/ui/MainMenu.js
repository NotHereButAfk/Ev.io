import { SKINS } from '../player/skins.js';
import { WEAPONS } from '../weapons/weaponDefs.js';
import { WEAPON_SKINS } from '../weapons/WeaponSkins.js';

export class MenuUI {
  constructor() {
    this.mainMenu = document.getElementById('main-menu');
    this.pauseMenu = document.getElementById('pause-menu');
    this.gameoverMenu = document.getElementById('gameover-menu');
    this.nameInput = document.getElementById('player-name');
    this.skinGrid = document.getElementById('skin-grid');
    this.weaponSkinGrid = document.getElementById('weapon-skin-grid');
    this.loadoutList = document.getElementById('loadout-list');
    this.playBtn = document.getElementById('play-btn');
    this.resumeBtn = document.getElementById('resume-btn');
    this.quitBtn = document.getElementById('quit-btn');
    this.restartBtn = document.getElementById('restart-btn');
    this.menuBtn = document.getElementById('menu-btn');
    this.gameoverStats = document.getElementById('gameover-stats');

    this.selectedSkinId = SKINS[0].id;
    this.selectedWeaponSkinId = WEAPON_SKINS[0].id;

    this._buildSkinGrid();
    this._buildWeaponSkinGrid();
    this._buildLoadoutList();

    this.onPlay = null;
    this.onResume = null;
    this.onQuit = null;
    this.onRestart = null;
    this.onBackToMenu = null;

    this.playBtn.addEventListener('click', () => {
      const name = this.nameInput.value.trim() || 'Recruit';
      if (this.onPlay) this.onPlay(name, this.selectedSkinId, this.selectedWeaponSkinId);
    });
    this.resumeBtn.addEventListener('click', () => this.onResume && this.onResume());
    this.quitBtn.addEventListener('click', () => this.onQuit && this.onQuit());
    this.restartBtn.addEventListener('click', () => this.onRestart && this.onRestart());
    this.menuBtn.addEventListener('click', () => this.onBackToMenu && this.onBackToMenu());
  }

  _buildSkinGrid() {
    this.skinGrid.innerHTML = '';
    SKINS.forEach((skin) => {
      const el = document.createElement('div');
      el.className = 'skin-swatch' + (skin.id === this.selectedSkinId ? ' selected' : '');
      el.style.background = `linear-gradient(145deg, #${skin.primary.toString(16).padStart(6, '0')}, #${skin.secondary.toString(16).padStart(6, '0')})`;
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
      el.className = 'skin-swatch' + (skin.id === this.selectedWeaponSkinId ? ' selected' : '');
      el.style.background = `linear-gradient(145deg, #${skin.body.toString(16).padStart(6, '0')}, #${skin.accent.toString(16).padStart(6, '0')})`;
      el.title = skin.name;
      el.addEventListener('click', () => {
        this.selectedWeaponSkinId = skin.id;
        this.weaponSkinGrid.querySelectorAll('.skin-swatch').forEach((s) => s.classList.remove('selected'));
        el.classList.add('selected');
      });
      this.weaponSkinGrid.appendChild(el);
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

  showMain() {
    this.mainMenu.classList.remove('hidden');
  }
  hideMain() {
    this.mainMenu.classList.add('hidden');
  }
  showPause() {
    this.pauseMenu.classList.remove('hidden');
  }
  hidePause() {
    this.pauseMenu.classList.add('hidden');
  }
  showGameOver(stats) {
    this.gameoverStats.innerHTML = `
      <div>KILLS<span>${stats.kills}</span></div>
      <div>SCORE<span>${stats.score}</span></div>
      <div>TIME<span>${stats.time}s</span></div>
    `;
    this.gameoverMenu.classList.remove('hidden');
  }
  hideGameOver() {
    this.gameoverMenu.classList.add('hidden');
  }
}
