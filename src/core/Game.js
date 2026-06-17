import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { World } from '../world/World.js';
import { Player } from '../player/Player.js';
import { WeaponSystem } from '../weapons/WeaponSystem.js';
import { BotManager } from '../entities/BotManager.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { HUD } from '../ui/HUD.js';
import { MenuUI } from '../ui/MainMenu.js';
import { AuthUI } from '../ui/AuthUI.js';
import { UserAccount } from './UserAccount.js';
import { Armory } from './Armory.js';
import { GameSettings } from './GameSettings.js';
import { DeathEffectManager } from '../effects/DeathEffects.js';
import { getMode } from './GameModes.js';
import { getSkin } from '../player/skins.js';
import { buildPreviewCharacter, applySkinToCharacter } from '../player/PreviewCharacter.js';
import { loadArmorType } from '../player/ArmorTypes.js';

const SPAWN_POINT = new THREE.Vector3(0, 0, 8);

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    GameSettings.load();

    this.world        = new World();

    // IBL — makes every MeshStandardMaterial look physically accurate
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.world.scene.environment = pmrem.fromScene(new RoomEnvironment(0.6)).texture;
    pmrem.dispose();
    this.player       = new Player(window.innerWidth / window.innerHeight);
    this.audio        = new AudioManager();
    this.weaponSystem = new WeaponSystem(this.player.camera, this.world.scene, this.audio);
    this.deathEffects = new DeathEffectManager(this.world.scene);
    this.botManager   = new BotManager(this.world, this.world.scene);
    this.input        = new InputManager(canvas);
    this.hud          = new HUD();
    this.menu         = new MenuUI();
    this.authUI       = new AuthUI();

    this.menuCamera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);

    // Cinematic spectator waypoints (pos + lookAt) for the fly-through
    this._camWpts = [
      { p: new THREE.Vector3(-30,  9, -22), t: new THREE.Vector3(  5, 3,   0) },
      { p: new THREE.Vector3( 18,  5, -58), t: new THREE.Vector3( -6, 4,  16) },
      { p: new THREE.Vector3( 62, 15,  24), t: new THREE.Vector3(  0, 4, -10) },
      { p: new THREE.Vector3(-14,  7,  62), t: new THREE.Vector3( 20, 3,   0) },
      { p: new THREE.Vector3(  4, 22,  -3), t: new THREE.Vector3( 42, 1,  40) },
      { p: new THREE.Vector3(-58,  6,  10), t: new THREE.Vector3( 10, 5,   0) },
    ];
    this._camSeg     = 0;
    this._camSegTime = 0;
    this._CAM_SEG_DUR = 7.0; // seconds per transition

    this.selectedSkin      = getSkin('crimson');
    this.selectedArmorType = loadArmorType();
    this.previewCharacter  = buildPreviewCharacter(this.selectedSkin, this.selectedArmorType);
    this.previewCharacter.position.copy(this.world.previewPedestalPos);
    this.previewCharacter.visible = false;
    this.world.scene.add(this.previewCharacter);

    this.state   = 'menu';
    this.kills   = 0;
    this.score   = 0;
    this.playTime = 0;
    this._statsSaved  = true;
    this.currentUsername = null;

    // Game-mode runtime state
    this._mode      = null; // current mode definition object
    this._lives     = Infinity;
    this._wave      = 1;
    this._modeTimer = 0;    // countdown (time-attack)

    this.timer = new THREE.Timer();
    this.timer.connect(document);

    this._applySettings();
    this._wireCallbacks();
    this._wireMenu();
    // Auth is deferred until after the connect sequence

    this.canvas.addEventListener('click', () => {
      this.audio.resume();
      if (this.state === 'paused') this._resume();
    });
    window.addEventListener('resize', () => this._onResize());
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this._pause();
    };

    requestAnimationFrame(() => this._loop());
    this._runConnectSequence();
  }

  // ── Connect sequence ─────────────────────────────────────────────────────────

  _runConnectSequence() {
    const screen   = document.getElementById('connect-screen');
    const statusEl = document.getElementById('connect-status-text');
    const barEl    = document.getElementById('connect-bar');
    const pingEl   = document.getElementById('connect-ping');

    // Fake latency ping display
    setTimeout(() => { pingEl.textContent = Math.floor(28 + Math.random() * 40); }, 400);

    const steps = [
      { text: 'CONNECTING TO SERVER', pct: 20,  ms: 0    },
      { text: 'AUTHENTICATING',       pct: 52,  ms: 900  },
      { text: 'LOADING WORLD',        pct: 80,  ms: 1700 },
      { text: 'READY',                pct: 100, ms: 2400 },
    ];
    steps.forEach(({ text, pct, ms }) => {
      setTimeout(() => {
        statusEl.textContent = text;
        barEl.style.width    = pct + '%';
      }, ms);
    });

    // Fade out connect screen, then show auth (or main menu if already logged in)
    setTimeout(() => {
      screen.classList.add('fade-out');
      setTimeout(() => {
        screen.classList.add('hidden');
        this._initAuth();
      }, 700);
    }, 3000);
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  _initAuth() {
    if (UserAccount.isLoggedIn()) {
      this._onAuth(UserAccount.current());
    } else {
      this.authUI.show(); // was previously visible by default; now we show it explicitly
    }
    this.authUI.onAuth = (username) => {
      this.authUI.hide();
      this._onAuth(username);
    };
  }

  _onAuth(username) {
    this.currentUsername = username;
    this.menu.setUsername(username);
    if (!UserAccount.isGuest()) {
      document.getElementById('player-name').value = UserAccount.getDisplayName(username);
    }
    this.menu.showMain();
  }

  // ── Settings application ────────────────────────────────────────────────────

  _applySettings() {
    this.player.sensitivityMult = GameSettings.get('sensitivity');
    this.player.baseFov         = GameSettings.get('fov');
    this.player.camera.fov      = this.player.baseFov;
    this.player.camera.updateProjectionMatrix();
    const vol = GameSettings.get('volume');
    this.audio.setVolume(vol);
    const q = GameSettings.get('quality');
    const pr = q === 'high' ? Math.min(window.devicePixelRatio, 2)
             : q === 'low'  ? 0.6 : 1;
    this.renderer.setPixelRatio(pr);
  }

  // ── Wire callbacks ──────────────────────────────────────────────────────────

  _wireCallbacks() {
    this.weaponSystem.applyRecoilToPlayer = (amt) => this.player.applyRecoil(amt);
    this.weaponSystem.onHitBot = (bot, dmg) => {
      const killed = bot.takeDamage(dmg);
      this.audio.playHit();
      this.hud.flashHitmarker();
      if (killed) {
        const def     = this.weaponSystem.currentDef;
        const isMelee = def.kind === 'melee';
        const entry   = this.weaponSystem._armoryMap?.get(def.id);
        this.deathEffects.spawn(
          bot.mesh.position,
          entry?.isSword ? null : entry?.skin?.id,
          entry?.isSword ? entry?.skin?.id : null,
          isMelee
        );
        this.kills += 1;
        this.score += 100;
        this.audio.playKill();
        this.hud.addKillFeed(`${this.player.name} eliminated a target  +100`);
      }
    };
  }

  _wireMenu() {
    this.menu.onPlay = (name, skinId, modeId, armorTypeId) => this._startGame(name, skinId, modeId, armorTypeId);
    this.menu.onResume        = () => this._resume();
    this.menu.onQuit          = () => this._quitToMenu();
    this.menu.onRestart       = () => this._restart();
    this.menu.onBackToMenu    = () => this._quitToMenu();
    this.menu.onArmorChanged  = (armorTypeId) => this._rebuildPreviewCharacter(armorTypeId);
    this.menu.onLoadoutOpen   = () => { this.previewCharacter.visible = true; };
    this.menu.onLoadoutClose  = () => { this.previewCharacter.visible = false; };
    this.menu.onArmoryChanged = () => {
      // Re-apply armory skins to live weapon models
      const map = Armory.buildSkinMap(this.weaponSystem.loadout);
      this.weaponSystem.applyArmoryMap(map);
    };
    this.menu.onSettingsSaved = (s) => {
      this.player.sensitivityMult = s.sensitivity;
      this.player.baseFov         = s.fov;
      if (this.state !== 'playing') {
        this.player.camera.fov = s.fov;
        this.player.camera.updateProjectionMatrix();
      }
      this.audio.setVolume(s.volume);
      const pr = s.quality === 'high' ? Math.min(window.devicePixelRatio, 2)
               : s.quality === 'low'  ? 0.6 : 1;
      this.renderer.setPixelRatio(pr);
    };
    this.menu.onLogout = () => {
      UserAccount.logout();
      this.currentUsername = null;
      this.menu.hideMain();
      this.authUI.show();
    };
  }

  // ── Game start / restart ────────────────────────────────────────────────────

  _rebuildPreviewCharacter(armorTypeId) {
    this.selectedArmorType = armorTypeId;
    this.world.scene.remove(this.previewCharacter);
    this.previewCharacter = buildPreviewCharacter(this.selectedSkin, armorTypeId);
    this.previewCharacter.position.copy(this.world.previewPedestalPos);
    this.previewCharacter.visible = true;
    this.world.scene.add(this.previewCharacter);
  }

  _startGame(name, skinId, modeId = 'deathmatch', armorTypeId) {
    this.audio.resume();
    this.selectedSkin = getSkin(skinId);
    applySkinToCharacter(this.previewCharacter, this.selectedSkin);
    this.weaponSystem.setSkin(this.selectedSkin);

    // Apply per-weapon skins from the armory
    const armoryMap = Armory.buildSkinMap(this.weaponSystem.loadout);
    this.weaponSystem.applyArmoryMap(armoryMap);

    this.player.name = name;
    this.player.skin = this.selectedSkin;
    this.player.respawn(SPAWN_POINT);
    this.weaponSystem.resetState(this.player.baseFov);

    // Apply selected game mode
    this._mode    = getMode(modeId);
    this._wave    = 1;
    this._lives   = this._mode.lives === Infinity ? Infinity : this._mode.lives;
    this._modeTimer = this._mode.timeLimit || 0;

    this.botManager.spawnAll(
      this._mode.waves ? 3 : this._mode.botCount,
      this._mode.noRespawn,
      1
    );

    this.kills    = 0;
    this.score    = 0;
    this.playTime = 0;
    this._statsSaved = false;
    this.previewCharacter.visible = false;

    this.menu.hideMain();
    this.menu.hideGameOver();
    this.hud.show();
    this.hud.buildWeaponSlots(this.weaponSystem.getHudInfo().slots, 0);
    document.getElementById('spectate-label').classList.add('hidden');

    // Mode-specific HUD setup
    this._refreshModeHUD();

    this.state = 'playing';
    this.input.requestPointerLock();
  }

  _refreshModeHUD() {
    if (!this._mode) return;
    if (this._mode.timeLimit) {
      const mins = Math.floor(this._modeTimer / 60);
      const secs = Math.floor(this._modeTimer % 60);
      this.hud.setModeHUD(`${mins}:${String(secs).padStart(2, '0')}`, 'TIME REMAINING');
    } else if (this._mode.waves) {
      const livesStr = this._lives === Infinity ? '∞' : '♥'.repeat(Math.max(0, this._lives));
      this.hud.setModeHUD(`WAVE ${this._wave}`, livesStr);
    } else if (this._mode.noRespawn && this._mode.lives <= 1) {
      this.hud.setModeHUD('ELIMINATION', `${this.botManager.bots.filter(b => b.alive).length} REMAINING`);
    } else {
      this.hud.hideModeHUD();
    }
  }

  _saveStats() {
    if (this._statsSaved) return;
    this._statsSaved = true;
    UserAccount.addGameStats(this.currentUsername, this.kills, this.score);
  }

  _resume() {
    this.menu.hidePause();
    this.state = 'playing';
    this.input.requestPointerLock();
  }

  _pause()  {
    this.state = 'paused';
    this.menu.showPause();
  }

  _quitToMenu() {
    if (this.state === 'playing') this._saveStats();
    this.state = 'menu';
    this.menu.hidePause();
    this.menu.hideGameOver();
    this.hud.hide();
    this.hud.hideModeHUD();
    this.input.exitPointerLock();
    this.botManager.clear();
    document.getElementById('spectate-label').classList.remove('hidden');
    this.menu.showMain();
  }

  _restart() {
    this._saveStats();
    this.menu.hideGameOver();
    this._startGame(
      this.player.name,
      this.selectedSkin.id,
      this._mode?.id || 'deathmatch'
    );
  }

  // ── Player damage / death ───────────────────────────────────────────────────

  _onPlayerDamaged(dmg) {
    if (this.player.isDead) return;
    const died = this.player.takeDamage(dmg);
    this.audio.playHurt();
    this.hud.flashDamage();
    if (died) this._onPlayerDeath();
  }

  _onPlayerDeath() {
    if (this._mode?.lives !== Infinity) {
      this._lives = Math.max(0, this._lives - 1);
      if (this._lives > 0 && this._mode?.waves) {
        // Extra life — respawn in place
        setTimeout(() => {
          this.player.respawn(SPAWN_POINT);
          this._refreshModeHUD();
        }, 1500);
        return;
      }
    }
    this._saveStats();
    this.state = 'gameover';
    this.input.exitPointerLock();
    this.hud.hide();
    this.menu.showGameOver(
      { kills: this.kills, score: this.score, time: Math.floor(this.playTime) },
      'YOU DIED'
    );
  }

  // ── Resize ─────────────────────────────────────────────────────────────────

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.player.camera.aspect = w / h;
    this.player.camera.updateProjectionMatrix();
    this.menuCamera.aspect = w / h;
    this.menuCamera.updateProjectionMatrix();
  }

  // ── Update loop ─────────────────────────────────────────────────────────────

  _updatePlaying(dt) {
    this.playTime += dt;
    this.player.update(dt, this.input, this.world);
    this.player.camera.updateMatrixWorld(true);
    this.weaponSystem.update(dt, this.input, this.world, this.botManager, this.player);
    this.deathEffects.update(dt);
    this.botManager.update(dt, this.player, this.player.camera, (dmg) => this._onPlayerDamaged(dmg));
    this.hud.update(this.player, this.weaponSystem.getHudInfo(), this.kills, this.score);
    this.hud.setActiveSlot(this.weaponSystem.currentIndex);

    this._updateModeLogic(dt);
  }

  _updateModeLogic(dt) {
    if (!this._mode || this.state !== 'playing') return;

    // --- TIME ATTACK ---
    if (this._mode.timeLimit > 0) {
      this._modeTimer = Math.max(0, this._modeTimer - dt);
      const mins = Math.floor(this._modeTimer / 60);
      const secs = Math.floor(this._modeTimer % 60);
      this.hud.setModeHUD(`${mins}:${String(secs).padStart(2, '0')}`, 'TIME REMAINING');
      if (this._modeTimer <= 0) {
        this._saveStats();
        this.state = 'gameover';
        this.input.exitPointerLock();
        this.hud.hide();
        this.menu.showGameOver(
          { kills: this.kills, score: this.score, time: Math.floor(this.playTime) },
          'TIME\'S UP'
        );
      }
      return;
    }

    // --- WAVE SURVIVAL ---
    if (this._mode.waves && this.botManager.allDead()) {
      this._wave += 1;
      const count = 3 + (this._wave - 1) * 2;
      const healthMult = 1 + (this._wave - 1) * 0.18;
      this.botManager.spawnAll(count, true, healthMult);
      this.hud.addKillFeed(`— WAVE ${this._wave} — (+${Math.round((healthMult - 1) * 100)}% HP)`);
      this._refreshModeHUD();
      return;
    }

    // --- ELIMINATION ---
    if (this._mode.noRespawn && !this._mode.waves && this.botManager.allDead()) {
      this._saveStats();
      this.state = 'gameover';
      this.input.exitPointerLock();
      this.hud.hide();
      this.menu.showGameOver(
        { kills: this.kills, score: this.score, time: Math.floor(this.playTime) },
        'VICTORY'
      );
      return;
    }

    // Update elimination counter
    if (this._mode.id === 'elimination') {
      const alive = this.botManager.bots.filter((b) => b.alive).length;
      this.hud.setModeHUD('ELIMINATION', `${alive} REMAINING`);
    }
  }

  _updateMenuScene(dt) {
    // Slowly rotate the preview character (only shown on PLAY tab)
    if (this.previewCharacter.visible) {
      this.previewCharacter.rotation.y += dt * 0.6;
    }

    // Cinematic spectator fly-through
    this._camSegTime += dt;
    if (this._camSegTime >= this._CAM_SEG_DUR) {
      this._camSegTime -= this._CAM_SEG_DUR;
      this._camSeg = (this._camSeg + 1) % this._camWpts.length;
    }
    const from = this._camWpts[this._camSeg];
    const to   = this._camWpts[(this._camSeg + 1) % this._camWpts.length];
    const t    = this._camSegTime / this._CAM_SEG_DUR;
    const e    = t * t * (3 - 2 * t); // smoothstep

    this.menuCamera.position.lerpVectors(from.p, to.p, e);
    const lookTarget = new THREE.Vector3().lerpVectors(from.t, to.t, e);
    this.menuCamera.lookAt(lookTarget);
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());

    if (this.state === 'playing') {
      this._updatePlaying(dt);
    } else {
      // Cinematic camera runs for every non-playing state (connecting, auth, menu, paused, gameover)
      this._updateMenuScene(dt);
    }

    const camera = this.state === 'playing' ? this.player.camera : this.menuCamera;
    this.renderer.render(this.world.scene, camera);
    this.input.endFrame();
  }
}
