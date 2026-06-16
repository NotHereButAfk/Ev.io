import * as THREE from 'three';
import { World } from '../world/World.js';
import { Player } from '../player/Player.js';
import { WeaponSystem } from '../weapons/WeaponSystem.js';
import { BotManager } from '../entities/BotManager.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { HUD } from '../ui/HUD.js';
import { MenuUI } from '../ui/MainMenu.js';
import { getSkin } from '../player/skins.js';
import { getWeaponSkin } from '../weapons/WeaponSkins.js';
import { buildPreviewCharacter, applySkinToCharacter } from '../player/PreviewCharacter.js';

const SPAWN_POINT = new THREE.Vector3(0, 0, 8);

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.world = new World();
    this.player = new Player(window.innerWidth / window.innerHeight);
    this.audio = new AudioManager();
    this.weaponSystem = new WeaponSystem(this.player.camera, this.world.scene, this.audio);
    this.botManager = new BotManager(this.world, this.world.scene);
    this.input = new InputManager(canvas);
    this.hud = new HUD();
    this.menu = new MenuUI();

    this.menuCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    this.menuTime = 0;

    this.selectedSkin = getSkin('crimson');
    this.selectedWeaponSkin = getWeaponSkin('midnight');
    this.previewCharacter = buildPreviewCharacter(this.selectedSkin);
    this.previewCharacter.position.copy(this.world.previewPedestalPos);
    this.world.scene.add(this.previewCharacter);

    this.state = 'menu';
    this.kills = 0;
    this.score = 0;
    this.playTime = 0;

    this.timer = new THREE.Timer();
    this.timer.connect(document);

    this._wireCallbacks();
    this._wireMenu();

    this.canvas.addEventListener('click', () => {
      this.audio.resume();
      if (this.state === 'paused') this._resume();
    });
    window.addEventListener('resize', () => this._onResize());

    // react to actual lock-loss events instead of polling pointerLocked every
    // frame, which would race the async grant right after requestPointerLock().
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this._pause();
    };

    requestAnimationFrame(() => this._loop());
  }

  _wireCallbacks() {
    this.weaponSystem.applyRecoilToPlayer = (amt) => this.player.applyRecoil(amt);
    this.weaponSystem.onHitBot = (bot, dmg) => {
      const killed = bot.takeDamage(dmg);
      this.audio.playHit();
      this.hud.flashHitmarker();
      if (killed) {
        this.kills += 1;
        this.score += 100;
        this.audio.playKill();
        this.hud.addKillFeed(`${this.player.name} eliminated a target  +100`);
      }
    };
  }

  _wireMenu() {
    this.menu.onPlay = (name, skinId, weaponSkinId) => this._startGame(name, skinId, weaponSkinId);
    this.menu.onResume = () => this._resume();
    this.menu.onQuit = () => this._quitToMenu();
    this.menu.onRestart = () => this._restart();
    this.menu.onBackToMenu = () => this._quitToMenu();
  }

  _startGame(name, skinId, weaponSkinId) {
    this.audio.resume();
    this.selectedSkin = getSkin(skinId);
    if (weaponSkinId) this.selectedWeaponSkin = getWeaponSkin(weaponSkinId);
    applySkinToCharacter(this.previewCharacter, this.selectedSkin);
    this.weaponSystem.setSkin(this.selectedSkin);
    this.weaponSystem.setWeaponSkin(this.selectedWeaponSkin);
    this.player.name = name;
    this.player.skin = this.selectedSkin;
    this.player.respawn(SPAWN_POINT);
    this.weaponSystem.resetState(this.player.baseFov);
    this.botManager.spawnAll();
    this.kills = 0;
    this.score = 0;
    this.playTime = 0;
    this.previewCharacter.visible = false;

    this.menu.hideMain();
    this.menu.hideGameOver();
    this.hud.show();
    this.hud.buildWeaponSlots(this.weaponSystem.getHudInfo().slots, 0);

    this.state = 'playing';
    this.input.requestPointerLock();
  }

  _resume() {
    this.menu.hidePause();
    this.state = 'playing';
    this.input.requestPointerLock();
  }

  _pause() {
    this.state = 'paused';
    this.menu.showPause();
  }

  _quitToMenu() {
    this.state = 'menu';
    this.menu.hidePause();
    this.menu.hideGameOver();
    this.hud.hide();
    this.input.exitPointerLock();
    this.botManager.clear();
    this.previewCharacter.visible = true;
  }

  _restart() {
    this.menu.hideGameOver();
    this._startGame(this.player.name, this.selectedSkin.id);
  }

  _onPlayerDamaged(dmg) {
    if (this.player.isDead) return;
    const died = this.player.takeDamage(dmg);
    this.audio.playHurt();
    this.hud.flashDamage();
    if (died) this._onPlayerDeath();
  }

  _onPlayerDeath() {
    this.state = 'gameover';
    this.input.exitPointerLock();
    this.hud.hide();
    this.menu.showGameOver({ kills: this.kills, score: this.score, time: Math.floor(this.playTime) });
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.player.camera.aspect = w / h;
    this.player.camera.updateProjectionMatrix();
    this.menuCamera.aspect = w / h;
    this.menuCamera.updateProjectionMatrix();
  }

  _updatePlaying(dt) {
    this.playTime += dt;
    this.player.update(dt, this.input, this.world);
    // the camera lives outside the scene graph, so its matrixWorld is only
    // refreshed by the renderer; weapon raycasts need it up to date *now*.
    this.player.camera.updateMatrixWorld(true);
    this.weaponSystem.update(dt, this.input, this.world, this.botManager, this.player);
    this.botManager.update(dt, this.player, this.player.camera, (dmg) => this._onPlayerDamaged(dmg));
    this.hud.update(this.player, this.weaponSystem.getHudInfo(), this.kills, this.score);
    this.hud.setActiveSlot(this.weaponSystem.currentIndex);
  }

  _updateMenuScene(dt) {
    this.menuTime += dt;
    this.previewCharacter.rotation.y += dt * 0.6;
    const r = 4;
    const p = this.world.previewPedestalPos;
    this.menuCamera.position.set(p.x + Math.sin(this.menuTime * 0.3) * r, p.y + 1.6, p.z + Math.cos(this.menuTime * 0.3) * r);
    this.menuCamera.lookAt(p.x, p.y + 1.05, p.z);
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());

    if (this.state === 'playing') {
      this._updatePlaying(dt);
    } else if (this.state === 'menu') {
      this._updateMenuScene(dt);
    }

    const camera = this.state === 'menu' ? this.menuCamera : this.player.camera;
    this.renderer.render(this.world.scene, camera);

    this.input.endFrame();
  }
}
