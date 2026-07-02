import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from '../world/World.js';
import { Player } from '../player/Player.js';
import { WeaponSystem } from '../weapons/WeaponSystem.js';
import { BotManager } from '../entities/BotManager.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { HUD } from '../ui/HUD.js';
import { DamageNumbers } from '../ui/DamageNumbers.js';
import { Nameplates } from '../ui/Nameplates.js';
import { MenuUI } from '../ui/MainMenu.js';
import { AuthUI } from '../ui/AuthUI.js';
import { UserAccount } from './UserAccount.js';
import { Armory } from './Armory.js';
import { GameSettings } from './GameSettings.js';
import { DeathEffectManager } from '../effects/DeathEffects.js';
import { getMode } from './GameModes.js';
import { getSkin } from '../player/skins.js';
import { buildPreviewCharacter, applySkinToCharacter, rigCharacterLimbs } from '../player/PreviewCharacter.js';
import { loadArmorType } from '../player/ArmorTypes.js';
import { GrenadeSystem } from '../weapons/GrenadeSystem.js';
import { Shop } from './Shop.js';
import { Loadout } from './Loadout.js';
import { BattlePass } from './BattlePass.js';
import { getArmorSkin, ARMOR_SKINS } from '../player/ArmorSkins.js';
import { WEAPON_SKINS } from '../weapons/WeaponSkins.js';
import { SWORD_SKINS } from '../weapons/SwordSkins.js';
import { MobileControls } from '../ui/MobileControls.js';
import { KILL_MULT_BONUS, GUN_PERKS, ARMOR_PERKS } from './RarityPerks.js';
import { ZombieManager } from '../entities/ZombieManager.js';
import { SurvivalManager } from './SurvivalManager.js';
import { DeathmatchManager } from './DeathmatchManager.js';
import { ServerSim } from './ServerSim.js';
import { preloadZombieModel } from '../entities/Zombie.js';
import { preloadPlayerModel, preloadSpartanModel } from '../player/PreviewCharacter.js';
import { preloadHumanSoldier } from '../player/HumanSoldier.js';
import { preloadWeaponModels } from '../weapons/WeaponModels.js';
import { PickupSystem } from '../world/PickupSystem.js';

const SPAWN_POINT = new THREE.Vector3(0, 0, 8);

// The arena is an always-on server with a fixed capacity. You take one slot;
// the rest are filled with bots and simulated remote players (see ServerSim).
const MAX_PLAYERS = 8;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    GameSettings.load();
    const _q = GameSettings.get('quality');
    // Quality-aware renderer: MSAA + full pixel ratio + shadows only on 'high',
    // and request the discrete GPU (helps a lot on dual-GPU laptops).
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: _q === 'high',
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = false; // sky-only lighting: no shadow casters
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(_q === 'high' ? Math.min(window.devicePixelRatio, 2) : _q === 'low' ? 0.6 : 1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.78;

    // Kick off model fetches immediately so they're ready before first use.
    // The real rigged human soldier is preferred; both callbacks swap the
    // preview to the best available model once it finishes loading.
    const swapPreview = () => {
      const wasVisible = this.previewCharacter?.visible ?? false;
      this._rebuildPreviewCharacter();
      this.previewCharacter.visible = wasVisible;
    };
    preloadHumanSoldier(swapPreview);
    preloadPlayerModel(swapPreview);
    preloadSpartanModel(swapPreview);
    preloadWeaponModels();

    this.world        = new World();

    // IBL — makes every MeshStandardMaterial look physically accurate
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.world.scene.environment = pmrem.fromScene(new RoomEnvironment(0.35)).texture;
    this.world.scene.environmentIntensity = 0.5; // keep IBL from washing surfaces to white
    pmrem.dispose();

    // ── HDR bloom post-processing ──────────────────────────────────────────
    // Makes every emissive surface — neon signs, lit windows, glowing weapon
    // skins, muzzle flashes, lamps — bleed light for a cinematic glow.
    this._buildPostFX();
    this.player       = new Player(window.innerWidth / window.innerHeight);
    this.audio        = new AudioManager();
    this.player.audio = this.audio;
    this.player.onTeleport = () => {
      this.audio.playTeleport();
      this.hud.flashTeleport();
    };
    this.weaponSystem = new WeaponSystem(this.player.camera, this.world.scene, this.audio);
    // The first-person viewmodel (gun, arm, muzzle flash, viewmodel lights) is
    // parented to the player camera. Three.js only renders objects reachable
    // from the scene root, so the camera itself must live in the scene.
    this.world.scene.add(this.player.camera);
    this.deathEffects = new DeathEffectManager(this.world.scene);
    this.botManager      = new BotManager(this.world, this.world.scene);
    this.zombieManager   = new ZombieManager(this.world, this.world.scene, this.audio);
    preloadZombieModel();   // start fetching zombie.glb during the 60s grace period
    this.survivalManager = new SurvivalManager();
    this.dmManager       = new DeathmatchManager();
    this.serverSim       = null; // built once the HUD exists (see below)
    this._activeManager  = this.botManager;  // switches between botManager / zombieManager
    this._isSurvival     = false;
    this._isDM           = false;
    this._playerDowned   = false;
    this._pendingCoins   = 0;   // fractional coin accumulator for survival
    this.input        = new InputManager(canvas);
    this.mobileControls = this.input.isMobile
      ? new MobileControls(this.input, { onMenu: () => this._openMenu() })
      : null;
    this.hud            = new HUD();
    this.damageNumbers  = new DamageNumbers();
    this.nameplates     = new Nameplates();
    this.serverSim      = new ServerSim({ maxPlayers: MAX_PLAYERS, botManager: this.botManager, hud: this.hud });
    this._scopeOverlay  = document.getElementById('scope-overlay');
    this._hudCrosshair  = document.getElementById('crosshair');
    this._menuOpen      = false; // in-match menu overlay (the match keeps running)
    this.grenadeSystem  = new GrenadeSystem(this.world.scene);
    this.pickupSystem = null; // created on first play, cleared on restart
    this.menu           = new MenuUI();
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

    this.selectedSkin      = getSkin('spartan');
    this.selectedArmorType = loadArmorType();
    this.selectedArmorSkin = getArmorSkin(Shop.getEquipped());
    this.previewCharacter  = buildPreviewCharacter(this.selectedSkin, this.selectedArmorType, this.selectedArmorSkin);
    this.previewCharacter.position.copy(this.world.previewPedestalPos);
    this.previewCharacter.visible = false;
    this.world.scene.add(this.previewCharacter);

    this.state   = 'menu';
    this.kills   = 0;
    this.score   = 0;
    this.deaths  = 0;
    this._sbShown = false;   // in-game scoreboard (hold TAB)
    this._sbStats = {};      // stable per-match bot scores
    this._sbRefreshT = 0;
    this.playTime = 0;
    this._statsSaved  = true;
    this.currentUsername = null;

    // Game-mode runtime state
    this._mode      = null; // current mode definition object
    this._lives     = Infinity;
    this._wave      = 1;
    this._modeTimer = 0;    // countdown (time-attack)
    this._lbTimer   = 0;    // post-match leaderboard countdown

    this.timer = new THREE.Timer();
    this.timer.connect(document);

    this._applySettings();
    this._wireCallbacks();
    this._wireMenu();
    // Auth is deferred until after the connect sequence

    this.canvas.addEventListener('click', () => {
      this.audio.resume();
      if (this._menuOpen) this._resume();
    });
    window.addEventListener('resize', () => this._onResize());
    this.input.onLockChange = (locked) => {
      // Losing pointer lock (e.g. pressing ESC) opens the in-match menu, but the
      // match keeps simulating in the background — this is a multiplayer game.
      if (!locked && this.state === 'playing' && !this._menuOpen) this._openMenu();
    };

    this._rafId = requestAnimationFrame(() => this._loop());
    this._runConnectSequence();
  }

  // Release all global event listeners and cancel the render loop.
  dispose() {
    cancelAnimationFrame(this._rafId);
    this.input.dispose();
    this.renderer.dispose();
    this.botManager.clear();
    this.zombieManager.clear();
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
    this.authUI.onAuth = (username) => {
      this.authUI.hide();
      this._onAuth(username);
    };
    // Dismissing the login page (Play / Info) returns to the spectating menu.
    this.authUI.onClose = () => {
      this.authUI.hide();
      if (!this.menu.topNav.classList.contains('hidden')) return; // menu already up
      this._onAuth(UserAccount.current());
    };
    // ev.io-style: land on the main menu immediately (spectating). Registered
    // accounts resume signed in; everyone else browses logged out until they
    // open the login page from the nav or a gated page.
    this._onAuth(UserAccount.isLoggedIn() ? UserAccount.current() : null);
  }

  _onAuth(username) {
    this.currentUsername = username;
    this.menu.setUsername(username);
    if (username && !UserAccount.isGuest()) {
      document.getElementById('player-name').value = UserAccount.getDisplayName(username);
    }
    this.menu.showMain();
  }

  // ── Settings application ────────────────────────────────────────────────────

  _applySettings() {
    this.player.sensitivityMult = GameSettings.get('sensitivity');
    this.player.invertY         = GameSettings.get('invertY');
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

    this.grenadeSystem.onExplode = (point, radius, damage) => {
      for (const enemy of this._activeManager.bots) {
        if (!enemy.alive) continue;
        const d = enemy.position.distanceTo(point);
        if (d <= radius) {
          const f = THREE.MathUtils.lerp(1, 0.1, THREE.MathUtils.clamp(d / radius, 0, 1));
          const killed = enemy.takeDamage(damage * f);
          this.hud.flashHitmarker();
          if (killed) {
            this.deathEffects.spawn(enemy.mesh.position, null, null, false);
            this._onEnemyKilled(enemy, null);
          }
        }
      }
    };

    this.weaponSystem.onHitBot = (enemy, dmg, point, meta) => {
      const killed = enemy.takeDamage(dmg);
      this.audio.playHit();
      this.hud.flashHitmarker(meta?.headshot);
      this.damageNumbers.spawn(this.player.camera, point, dmg, { headshot: meta?.headshot, killed });
      if (meta?.headshot) this.hud.showHeadshotFlair?.();
      if (killed) {
        const def     = this.weaponSystem.currentDef;
        const isMelee = def.kind === 'melee';
        const entry   = this.weaponSystem._armoryMap?.get(def.id);
        this.deathEffects.spawn(
          enemy.mesh.position,
          entry?.isSword ? null : entry?.skin?.id,
          entry?.isSword ? entry?.skin?.id : null,
          isMelee
        );
        this.audio.playKill();
        const skinMult = this._computeSkinKillMult();
        const baseMult = meta?.rewardMult || 1;
        this._onEnemyKilled(enemy, entry, baseMult * skinMult, meta?.headshot);
      }
    };
  }

  _computeSkinKillMult() {
    const bonus = (skinList, id) => {
      const s = skinList.find(s => s.id === id);
      return KILL_MULT_BONUS[s?.rarity] ?? 0;
    };
    const gunId    = Loadout.getGun();
    const meleeId  = Loadout.getMelee();
    const armorId  = Shop.getEquipped();
    const gunBonus   = bonus(WEAPON_SKINS, Armory.getSkinId(gunId,   false));
    const meleeBonus = bonus(SWORD_SKINS,  Armory.getSkinId(meleeId, true));
    const armorBonus = bonus(ARMOR_SKINS,  armorId);
    return Math.min(5.0, 1.0 + gunBonus + meleeBonus + armorBonus);
  }

  _onEnemyKilled(enemy, weaponEntry, rewardMult = 1, headshot = false) {
    this.kills++;
    const hsTag    = headshot  ? '  🎯 HEADSHOT!' : '';
    const knifeTag = rewardMult > 1 ? `  🔪 KNIFE THROW x${rewardMult.toFixed(1)}!` : '';

    if (this._isSurvival) {
      const coins = this.survivalManager.zombieKillReward() * rewardMult * this.survivalManager.waveBonus();
      this.score += 50 * rewardMult;
      this._pendingCoins += coins;
      if (this._pendingCoins >= 1) {
        Shop.addCoins(Math.floor(this._pendingCoins));
        this._pendingCoins -= Math.floor(this._pendingCoins);
      }
      BattlePass.addXP(10 * rewardMult);
      this.hud.showCoinEarn(coins);
      this.hud.addKillFeed(`ZOMBIE DOWN!  💰+${coins}${hsTag}${knifeTag}`);
    } else if (this._isDM) {
      const { coins, streak } = this.dmManager.onKill();
      const reward = coins * rewardMult;
      this.score += 100 * rewardMult;
      Shop.addCoins(Math.round(reward));
      BattlePass.addXP(25 * rewardMult);
      this._refreshNavCoins();
      this.hud.showCoinEarn(reward);
      if (streak >= 2) {
        this.hud.showStreak(streak, reward.toFixed(1));
        this.hud.addKillFeed(`ELIMINATED — 🔥 x${streak} STREAK  💰+${reward.toFixed(1)}${hsTag}${knifeTag}`);
      } else {
        this.hud.addKillFeed(`ELIMINATED  💰+${reward.toFixed(1)}${knifeTag}`);
      }
    } else {
      this.score += 100 * rewardMult;
      Shop.addCoins(10 * rewardMult);
      BattlePass.addXP(25 * rewardMult);
      this.hud.showCoinEarn(10 * rewardMult);
      this.hud.addKillFeed(`${this.player.name} eliminated a target  +${100 * rewardMult}  💰+${10 * rewardMult}${hsTag}${knifeTag}`);
    }
  }

  _refreshNavCoins() {
    const el = document.getElementById('nav-coins');
    if (el) el.textContent = `💰 ${Shop.getCoins()}`;
  }

  _wireMenu() {
    this.menu.onPlay = (name, skinId, modeId, armorTypeId) => this._startGame(name, skinId, modeId, armorTypeId);
    this.menu.onResume        = () => this._resume();
    this.menu.onQuit          = () => this._quitToMenu();
    this.menu.onRestart       = () => this._restart();
    this.menu.onBackToMenu    = () => this._quitToMenu();
    this.menu.onArmorChanged  = (armorTypeId) => this._rebuildPreviewCharacter(armorTypeId, undefined);
    this.menu.onArmorSkinEquipped = (skinId)  => this._rebuildPreviewCharacter(undefined, skinId);
    this.menu.onLoadoutOpen   = () => { this.previewCharacter.visible = true; };
    this.menu.onLoadoutClose  = () => { this.previewCharacter.visible = false; };
    this.menu.onArmoryChanged = () => {
      // Re-apply armory skins to live weapon models
      const map = Armory.buildSkinMap(this.weaponSystem.allWeapons);
      this.weaponSystem.applyArmoryMap(map);
    };
    this.menu.onSettingsSaved = (s) => {
      this.player.sensitivityMult = s.sensitivity;
      this.player.invertY         = s.invertY;
      this.player.baseFov         = s.fov;
      if (this.state !== 'playing') {
        this.player.camera.fov = s.fov;
        this.player.camera.updateProjectionMatrix();
      }
      this.audio.setVolume(s.volume);
      const pr = s.quality === 'high' ? Math.min(window.devicePixelRatio, 2)
               : s.quality === 'low'  ? 0.6 : 1;
      this.renderer.setPixelRatio(pr);
      // Apply the heavy toggles live so a quality drop gives immediate relief
      // (bloom + shadows). The decorative light budget is baked at world build,
      // so the lighting part of the change takes full effect on the next reload.
      this._bloomEnabled = s.quality !== 'low';
      // shadows stay off — sky-only lighting has no shadow casters.
    };
    this.menu.onLoginRequest = () => this.authUI.show('login');
    this.menu.onLogout = () => {
      UserAccount.logout();
      // Stay on the main menu, now as a logged-out spectator.
      this._onAuth(null);
    };
  }

  // ── Game start / restart ────────────────────────────────────────────────────

  _rebuildPreviewCharacter(armorTypeId, armorSkinId) {
    if (armorTypeId !== undefined) this.selectedArmorType = armorTypeId;
    if (armorSkinId !== undefined) this.selectedArmorSkin = getArmorSkin(armorSkinId);
    this.world.scene.remove(this.previewCharacter);
    this.previewCharacter = buildPreviewCharacter(this.selectedSkin, this.selectedArmorType, this.selectedArmorSkin);
    this.previewCharacter.position.copy(this.world.previewPedestalPos);
    this.previewCharacter.visible = true;
    this.world.scene.add(this.previewCharacter);
  }

  _startGame(name, skinId, modeId = 'deathmatch', armorTypeId) {
    this.audio.resume();
    this.selectedSkin      = getSkin(skinId);
    this.selectedArmorSkin = getArmorSkin(Shop.getEquipped());
    applySkinToCharacter(this.previewCharacter, this.selectedSkin, this.selectedArmorSkin);
    this.weaponSystem.setSkin(this.selectedSkin);

    // Equip exactly the chosen gun + melee for this match.
    this.weaponSystem.setLoadout(Loadout.getGun(), Loadout.getMelee());

    const armoryMap = Armory.buildSkinMap(this.weaponSystem.allWeapons);
    this.weaponSystem.applyArmoryMap(armoryMap);

    this.player.name = name;
    this.player.skin = this.selectedSkin;
    this.player.setMaxShield(this.selectedArmorSkin?.shield || 0);
    this.player.respawn(SPAWN_POINT);
    this.weaponSystem.resetState(this.player.baseFov);
    this.grenadeSystem.reset();

    this._mode    = getMode(modeId);
    this.kills    = 0;
    this.score    = 0;
    this.deaths   = 0;
    this._sbStats = {};
    this.playTime = 0;
    this._statsSaved   = false;
    this._pendingCoins = 0;
    this._playerDowned = false;

    // Mode-specific setup
    this._isDM       = ['deathmatch', 'teamslayer', 'ctf', 'koth'].includes(modeId);
    this._isSurvival = modeId === 'survival';

    this.hud.hideDMTimer();
    this.hud.hideDowned();
    this.hud.hideModeHUD();
    this.hud.hideWaveBonus();   // only survival shows it
    this.nameplates.clear();
    this.waveBanner?.classList?.add('hidden');
    this._showMapLoading(modeId);

    if (this._isDM) {
      this._activeManager = this.botManager;
      this.zombieManager.clear();
      this.dmManager.reset();
      this._modeTimer = 480; // 8 minutes
      // Fill the 8-slot server: you + (MAX_PLAYERS - 1) bots. The server sim
      // then swaps bots for simulated remote players as they come and go.
      this.botManager.spawnAll(MAX_PLAYERS - 1, false, 1);
      this.serverSim.start(false, 1);
      this.hud.showServerPop(true);
      // (re)create pickup system for fresh match
      this.pickupSystem?.dispose();
      this.pickupSystem = new PickupSystem(this.world.scene);
      this.hud.showDMTimer('8:00');
    } else if (this._isSurvival) {
      this._activeManager = this.zombieManager;
      this.botManager.clear();
      this.zombieManager.clear();
      this.survivalManager.reset();
      this._modeTimer = 0;
      this.serverSim.stop();
      this.hud.showServerPop(false);
      this._wireSurvivalCallbacks();
      this.hud.setModeHUD('GRACE PERIOD', '1:00 REMAINING');
    } else {
      // Legacy modes (kept for compatibility)
      this._activeManager = this.botManager;
      this.zombieManager.clear();
      this.serverSim.stop();
      this.hud.showServerPop(false);
      this._modeTimer = this._mode.timeLimit || 0;
      this._lives     = this._mode.lives === Infinity ? Infinity : this._mode.lives;
      this._wave      = 1;
      this.botManager.spawnAll(
        this._mode.waves ? 3 : this._mode.botCount,
        this._mode.noRespawn, 1
      );
      // (re)create pickup system for fresh match
      this.pickupSystem?.dispose();
      this.pickupSystem = new PickupSystem(this.world.scene);
      this._refreshModeHUD();
    }

    this.previewCharacter.visible = false;
    this.menu.hideMain();
    this.menu.hideGameOver();
    this.hud.show();
    this.hud.buildWeaponSlots(this.weaponSystem.getHudInfo().slots, 0);

    // Build a third-person body mesh matching the player's current loadout,
    // then rig its limbs so it can walk/run in third person.
    if (this._playerBody) this.world.scene.remove(this._playerBody);
    this._playerBody = buildPreviewCharacter(
      this.selectedSkin, armorTypeId || this.selectedArmorType || 'assault', this.selectedArmorSkin
    );
    // The human soldier animates via its own skeleton; only the procedural
    // block character needs the limb-pivot rig.
    if (!this._playerBody.userData?.isHuman) rigCharacterLimbs(this._playerBody);
    this._playerBody.visible = false;
    this.world.scene.add(this._playerBody);

    this.state = 'playing';
    this.player._camDist = 0;  // always start in FPS on new game
    this.input.requestPointerLock();
    this.mobileControls?.show();
    this.audio.startAmbientCity();
  }

  _wireSurvivalCallbacks() {
    const sm = this.survivalManager;

    sm.onGraceEnd = () => {
      this.hud.addKillFeed('⚠ GRACE PERIOD OVER — FIRST WAVE INCOMING!');
    };

    sm.onWaveStart = (wave, count, hpMult, speedMult, armedRatio = 0) => {
      this.zombieManager.spawnWave(count, hpMult, speedMult, wave, armedRatio);
      const bonus      = Math.round((hpMult - 1) * 100);
      const armedCount = Math.round(count * armedRatio);
      let   threat     = '';
      if (armedRatio >= 0.60) threat = ' ⚠ HEAVILY ARMED';
      else if (armedRatio > 0) threat = ` — ${armedCount} ARMED`;
      this.hud.showWaveBanner(`WAVE ${wave} — ${count} ZOMBIES${threat}`);
      this.hud.addKillFeed(`— WAVE ${wave}: ${count} zombies${bonus > 0 ? ` (+${bonus}% HP)` : ''}${armedCount > 0 ? ` | ${armedCount} carry guns!` : ''}`);
    };

    sm.onWaveClear = (wave) => {
      this.hud.showWaveBanner(`WAVE ${wave} CLEARED!`);
      this.hud.addKillFeed(`WAVE ${wave} SURVIVED! Next wave in ${Math.round(sm.betweenTimer || 12)}s`);
    };

    sm.onRevive = () => {
      this._playerDowned = false;
      this.hud.hideDowned();
      this.player.respawn(SPAWN_POINT);
      this.player.health = 50;
      this.player.shield = Math.min(this.player.maxShield, this.player.maxShield * 0.3);
      this.hud.addKillFeed('REVIVED BY TEAMMATE — 50 HP');
      this.hud.flashDamage();
    };

    sm.onGameOver = () => {
      this._playerDowned = false;
      this.hud.hideDowned();
      this.hud.hideWaveBonus();
      sm.recordBest();
      this._endGame('GAME OVER', `SURVIVED ${sm.wave} WAVES · ${this._fmtHMS(sm.elapsed)}`);
    };
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

  // Format seconds as HH:MM:SS (survival best-time display).
  _fmtHMS(secs) {
    secs = Math.max(0, Math.floor(secs));
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  // Live scoreboard rows (you + opponents). Bot scores are seeded once per match
  // so they stay stable while you hold TAB. Survival shows just you (vs. zombies).
  _buildScoreboardRows() {
    const rows = [{ name: this.player.name || 'You', kills: this.kills, score: this.score, isYou: true }];
    if (!this._isSurvival) {
      for (const bot of (this.botManager?.bots || [])) {
        const key = bot.displayName || 'Spartan';
        if (this._sbStats[key] == null) {
          const k = Math.floor(Math.random() * 9);
          this._sbStats[key] = { kills: k, score: k * 100 };
        }
        rows.push({ name: key, kills: this._sbStats[key].kills, score: this._sbStats[key].score, isYou: false });
      }
    }
    rows.sort((a, b) => b.kills - a.kills || b.score - a.score);
    return rows;
  }

  // ── Post-match leaderboard ───────────────────────────────────────────────────

  _showLeaderboard() {
    this.serverSim?.stop();
    this._saveStats();
    this._menuOpen = false;
    if (this._scopeOverlay) this._scopeOverlay.classList.remove('active');
    if (this._hudCrosshair) this._hudCrosshair.classList.remove('hidden');

    // Build leaderboard: player + all current bots with generated kill stats.
    const kd = (k, d) => (d > 0 ? (k / d).toFixed(1) : k.toFixed(1));
    const rows = [{
      name:    this.player.name,
      score:   this.score,
      assists: Math.floor(this.kills * 0.4),
      kills:   this.kills,
      deaths:  this.deaths,
      kd:      kd(this.kills, this.deaths),
      isYou:   true,
    }];
    for (const bot of this.botManager.bots) {
      const k = 3 + Math.floor(Math.random() * 14); // 3–16 kills
      const d = 1 + Math.floor(Math.random() * 9);  // 1–9 deaths
      const a = Math.floor(Math.random() * 6);
      rows.push({ name: bot.displayName, score: k * 100, assists: a, kills: k, deaths: d, kd: kd(k, d), isYou: false });
    }
    rows.sort((a, b) => b.kills - a.kills || b.score - a.score);
    const earnedCoins = Math.max(0, this.kills) * 10 + 100; // 10/kill + 100 match bonus

    this.state    = 'leaderboard';
    this._lbTimer = 10;
    this.input.exitPointerLock();
    this.mobileControls?.hide();
    this.hud.hide();         // hide crosshair / ammo / health
    this.hud.hideDMTimer();
    this.hud.hideScoreboard(); this._sbShown = false;
    this.hud.hideLeaderboard(); // reset in case it was shown before
    this.hud.showLeaderboard(rows, this.player.name, earnedCoins);
    this.hud.updateLeaderboardCountdown(10, 10);
  }

  _updateLeaderboard(dt) {
    // Bots and cinematic camera keep running during the scoreboard
    this._activeManager.update(dt, this.player, this.player.camera, () => {});
    this.deathEffects.update(dt);
    this._updateMenuScene(dt);

    this._lbTimer -= dt;
    const secsLeft = Math.max(0, Math.ceil(this._lbTimer));
    this.hud.updateLeaderboardCountdown(secsLeft, 10);

    if (this._lbTimer <= 0) {
      this._lbTimer = Infinity; // guard against multiple triggers
      this.hud.hideLeaderboard();
      this._restart();
    }
  }

  _saveStats() {
    if (this._statsSaved) return;
    this._statsSaved = true;
    UserAccount.addGameStats(this.currentUsername, this.kills, this.score);
    Shop.addCoins(100);
    BattlePass.addXP(100);
  }

  _resume() {
    this.menu.hidePause();
    this._menuOpen = false;
    this.input.requestPointerLock();
    this.mobileControls?.show();
  }

  // ESC during a match opens the menu as an overlay. The state stays 'playing'
  // so zombies/bots/timers keep running — you can't freeze a multiplayer match.
  // ev.io-style map loading card: map name / region / mode / players / TIP,
  // shown over the fly-through for a beat as the match starts, then fades.
  _showMapLoading(modeId) {
    const el = document.getElementById('map-loading');
    if (!el) return;
    const TIPS = [
      'TIP: press Q to blink-teleport forward',
      'TIP: hold TAB to check the scoreboard mid-match',
      'TIP: F throws a frag grenade, E throws smoke',
      'TIP: headshots deal bonus damage — aim high',
      'TIP: grav-lifts by the plaza launch you onto the rooftops',
      'TIP: rarer skins earn more coins per kill',
    ];
    const modeNames = {
      deathmatch: 'Deathmatch', teamslayer: 'Team Slayer', ctf: 'Capture the Flag',
      koth: 'King of the Hill', survival: 'Firefight',
    };
    const mode = document.getElementById('ml-mode');
    if (mode) mode.textContent = modeNames[modeId] || 'Deathmatch';
    const players = document.getElementById('ml-players');
    if (players) players.textContent = `${MAX_PLAYERS} players`;
    const tip = document.getElementById('ml-tip');
    if (tip) tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];

    clearTimeout(this._mlTimer1); clearTimeout(this._mlTimer2);
    el.classList.remove('hidden', 'ml-fade');
    this._mlTimer1 = setTimeout(() => el.classList.add('ml-fade'), 2600);
    this._mlTimer2 = setTimeout(() => el.classList.add('hidden'), 3300);
  }

  _hideMapLoading() {
    clearTimeout(this._mlTimer1); clearTimeout(this._mlTimer2);
    document.getElementById('map-loading')?.classList.add('hidden');
  }

  _openMenu() {
    this._menuOpen = true;
    this.mobileControls?.hide();
    this.menu.showPause();
  }

  _quitToMenu() {
    if (this.state === 'playing' || this.state === 'leaderboard') this._saveStats();
    this._lbTimer = Infinity; // cancel any pending auto-restart
    this._hideMapLoading();
    this.hud.hideLeaderboard();
    this.audio.stopAmbientCity();
    this.serverSim?.stop();
    this.hud.showServerPop(false);
    this._menuOpen = false;
    if (this._scopeOverlay) this._scopeOverlay.classList.remove('active');
    if (this._hudCrosshair) this._hudCrosshair.classList.remove('hidden');
    if (this._playerBody) { this.world.scene.remove(this._playerBody); this._playerBody = null; }
    if (this.weaponSystem.weaponMount) this.weaponSystem.weaponMount.visible = true;
    this.state = 'menu';
    this.mobileControls?.hide();
    this.menu.hidePause();
    this.menu.hideGameOver();
    this.hud.hide();
    this.hud.hideModeHUD();
    this.hud.hideDMTimer();
    this.hud.hideDowned();
    this.input.exitPointerLock();
    this.botManager.clear();
    this.zombieManager.clear();
    this.pickupSystem?.dispose();
    this.pickupSystem = null;
    this._playerDowned = false;
    this.menu.showMain();
  }

  _restart() {
    this._saveStats();
    this.hud.hideLeaderboard();
    this.menu.hideGameOver();
    this._startGame(
      this.player.name,
      this.selectedSkin.id,
      this._mode?.id || 'deathmatch'
    );
  }

  // ── Player damage / death ───────────────────────────────────────────────────

  _onPlayerDamaged(dmg) {
    if (this.player.isDead || this._playerDowned) return;
    const died = this.player.takeDamage(dmg);
    this.audio.playHurt();
    this.hud.flashDamage();
    if (died) this._onPlayerDeath();
  }

  _onPlayerDeath() {
    this.deaths++;
    // Survival: enter downed state instead of immediate death
    if (this._isSurvival) {
      if (this._playerDowned) return; // already downed
      this._playerDowned = true;
      this.survivalManager.playerDowned();
      // survivalManager.onGameOver fires if no revives remain
      return;
    }

    // Deathmatch: respawn immediately (infinite lives)
    if (this._isDM) {
      setTimeout(() => {
        this.player.respawn(SPAWN_POINT);
        this.player.setMaxShield(this.selectedArmorSkin?.shield || 0);
        this.hud.addKillFeed('RESPAWNING...');
      }, 1200);
      return;
    }

    // Legacy modes
    if (this._mode?.lives !== Infinity) {
      this._lives = Math.max(0, this._lives - 1);
      if (this._lives > 0 && this._mode?.waves) {
        setTimeout(() => {
          this.player.respawn(SPAWN_POINT);
          this._refreshModeHUD();
        }, 1500);
        return;
      }
    }
    this._endGame('YOU DIED');
  }

  _endGame(title, subtitle = '') {
    this._saveStats();
    this._menuOpen = false;
    if (this._scopeOverlay) this._scopeOverlay.classList.remove('active');
    if (this._hudCrosshair) this._hudCrosshair.classList.remove('hidden');
    this.state = 'gameover';
    this.input.exitPointerLock();
    this.hud.hide();
    this.hud.hideDMTimer();
    this.hud.hideDowned();
    this.menu.showGameOver(
      { kills: this.kills, score: this.score, time: Math.floor(this.playTime) },
      subtitle ? `${title} — ${subtitle}` : title
    );
  }

  // ── Post-processing (bloom) ──────────────────────────────────────────────

  _buildPostFX() {
    const w = window.innerWidth, h = window.innerHeight;
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.composer.setSize(w, h);

    // RenderPass camera is swapped each frame between player/menu cameras.
    this.renderPass = new RenderPass(this.world.scene, this.menuCamera);
    this.composer.addPass(this.renderPass);

    // Selective glow: a higher threshold + lower strength keeps the arena clean
    // and readable (ev.io-style) — only the brightest neon blooms, instead of
    // the whole scene washing out to white.
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.14,   // strength — subtle; clean arena, not a neon glow-fest
      0.4,    // radius
      1.05    // threshold — only emissive accents bloom, not lit surfaces
    );
    this.composer.addPass(this.bloomPass);

    // OutputPass applies the renderer's tone mapping + sRGB after bloom.
    this.composer.addPass(new OutputPass());

    // Bloom on by default; disabled on the 'low' quality preset for performance.
    this._bloomEnabled = GameSettings.get('quality') !== 'low';
  }

  // ── Resize ─────────────────────────────────────────────────────────────────

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.bloomPass?.setSize(w, h);
    this.player.camera.aspect = w / h;
    this.player.camera.updateProjectionMatrix();
    this.menuCamera.aspect = w / h;
    this.menuCamera.updateProjectionMatrix();
  }

  // ── Update loop ─────────────────────────────────────────────────────────────

  _updatePlaying(dt) {
    this.playTime += dt;

    // While the in-match menu is open the local player stops responding to
    // input, but the world (zombies, bots, timers) keeps simulating — there is
    // no pausing in a multiplayer match.
    const menuOpen = this._menuOpen;

    if (!menuOpen) {
      this.player.update(dt, this.input, this.world);
    }
    this.player.camera.updateMatrixWorld(true);

    // Animate the living sci-fi city (flying traffic, pulsing energy).
    this.world.update(dt);

    // Sync third-person body mesh and hide/show viewmodel
    const inTPS = this.player._camDist > 0;
    if (this._playerBody) {
      this._playerBody.visible = inTPS;
      if (inTPS) {
        this._playerBody.position.copy(this.player.position);
        this._playerBody.rotation.y = this.player.yaw + Math.PI; // face same direction as camera
        this._animatePlayerBody(dt);
      }
    }
    if (this.weaponSystem.weaponMount) this.weaponSystem.weaponMount.visible = !inTPS;

    // While downed in survival, or while the menu is open, block weapon use.
    if (!this._playerDowned && !menuOpen) {
      this.weaponSystem.update(dt, this.input, this.world, this._activeManager, this.player);
    }
    this.deathEffects.update(dt);
    this._activeManager.update(dt, this.player, this.player.camera, (dmg) => this._onPlayerDamaged(dmg), this.world);
    this.pickupSystem?.update(dt, this.player, this.weaponSystem, this.hud);

    // grenade input  F = frag  E = smoke (ignored while the menu is open)
    if (!menuOpen && this.input.consumeJustPressed('KeyF')) {
      this.grenadeSystem.throwFrag(this.player.camera);
      this.hud.updateGrenades(this.grenadeSystem.frags, this.grenadeSystem.smokes);
    }
    if (!menuOpen && this.input.consumeJustPressed('KeyE')) {
      this.grenadeSystem.throwSmoke(this.player.camera);
      this.hud.updateGrenades(this.grenadeSystem.frags, this.grenadeSystem.smokes);
    }
    this.grenadeSystem.update(dt, this.player);

    this.hud.update(this.player, this.weaponSystem.getHudInfo(), this.kills, this.score);
    this.hud.updateGrenades(this.grenadeSystem.frags, this.grenadeSystem.smokes);
    this.hud.setActiveSlot(this.weaponSystem.currentIndex);

    // Enemy nameplates (name + health bar) over living opponents.
    if (!menuOpen && this.botManager?.bots?.length) {
      this.nameplates.container.style.display = '';
      this.nameplates.update(this.player.camera, this.botManager.bots);
    } else {
      this.nameplates.container.style.display = 'none';
    }

    // In-game scoreboard — hold TAB to view live scores
    const sbDown = !menuOpen && this.input.isDown('Tab');
    if (sbDown) {
      this._sbRefreshT -= dt;
      if (!this._sbShown || this._sbRefreshT <= 0) {
        this.hud.showScoreboard(this._buildScoreboardRows(), this._mode?.name || '');
        this._sbRefreshT = 0.4;
      }
      this._sbShown = true;
    } else if (this._sbShown) {
      this.hud.hideScoreboard();
      this._sbShown = false;
    }
    this.hud.updateTeleport(1 - this.player.teleportCooldown / this.player.teleportMaxCooldown);

    // Scope overlay — shown when ADS on a scoped weapon (hidden while menu open)
    if (this._scopeOverlay) {
      const showScope = !menuOpen && !!this.weaponSystem.currentDef.scoped && this.weaponSystem.scopeT > 0.5;
      this._scopeOverlay.classList.toggle('active', showScope);
      if (this._hudCrosshair) this._hudCrosshair.classList.toggle('hidden', showScope);
    }

    this._updateModeLogic(dt);
  }

  // Drive the third-person body's walk cycle: swing the rigged arm/leg pivots
  // when moving, gentle breathing sway when standing still.
  _animatePlayerBody(dt) {
    const p = this.player;
    const speed = Math.hypot(p.velocity.x, p.velocity.z);

    // Real human soldier: drive its skeletal Idle/Walk/Run clips.
    const ud = this._playerBody?.userData;
    if (ud?.isHuman) {
      if (ud.setLocomotion) ud.setLocomotion(speed, p.onGround, p.isSprinting);
      else ud.setMotion(speed > 0.6 && p.onGround ? (speed > 6.5 ? 'run' : 'walk') : 'idle');
      ud.mixer.update(dt);
      ud.armorTick?.(dt);
      return;
    }

    const rig = ud?.rig;
    if (!rig) return;
    const moving = speed > 0.6 && p.onGround;
    if (moving) {
      const swing = Math.sin(p.bobTime) * (p.isSprinting ? 0.85 : 0.55);
      rig.legL.rotation.x =  swing;
      rig.legR.rotation.x = -swing;
      rig.armL.rotation.x = -swing * 0.7;
      rig.armR.rotation.x =  swing * 0.7;
    } else {
      // idle breathing — tiny arm sway, legs return to neutral
      const breathe = Math.sin(this.playTime * 1.6) * 0.04;
      rig.armL.rotation.x += (breathe - rig.armL.rotation.x) * Math.min(1, dt * 4);
      rig.armR.rotation.x += (breathe - rig.armR.rotation.x) * Math.min(1, dt * 4);
      rig.legL.rotation.x += (0 - rig.legL.rotation.x) * Math.min(1, dt * 6);
      rig.legR.rotation.x += (0 - rig.legR.rotation.x) * Math.min(1, dt * 6);
    }
  }

  _updateModeLogic(dt) {
    if (!this._mode || this.state !== 'playing') return;

    // ─── DEATHMATCH ─────────────────────────────────────────────────────────────
    if (this._isDM) {
      this.dmManager.update(dt);
      this.serverSim.update(dt); // simulate the live 24/7 server roster
      this._modeTimer = Math.max(0, this._modeTimer - dt);
      const mins = Math.floor(this._modeTimer / 60);
      const secs = Math.floor(this._modeTimer % 60);
      this.hud.showDMTimer(`${mins}:${String(secs).padStart(2, '0')}`, this._modeTimer <= 30);
      if (this._modeTimer <= 0) {
        this._showLeaderboard();
      }
      return;
    }

    // ─── SURVIVAL ───────────────────────────────────────────────────────────────
    if (this._isSurvival) {
      const sm = this.survivalManager;
      sm.update(dt, this.zombieManager.allDead());

      // Downed HUD
      if (this._playerDowned && sm.isDowned) {
        this.hud.showDowned(sm.downedTimer, sm.AUTO_REVIVE_TIME);
      } else if (!sm.isDowned && this._playerDowned) {
        // revive callback already fired; make sure overlay hides
        this._playerDowned = false;
        this.hud.hideDowned();
      }

      // Mode info panel (ev.io-style 3-line wave HUD)
      const alive = this.zombieManager.zombies.filter((z) => z.alive).length;
      const best  = `YOUR BEST TIME: ${this._fmtHMS(sm.bestTime())}`;
      const mmss  = (t) => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };
      if (sm.graceActive) {
        this.hud.setModeHUD(`WAVE 1 SPAWNS IN ${mmss(sm.graceTimer)}`, `${alive} BOTS ALIVE`, best);
      } else if (sm.betweenWave) {
        this.hud.setModeHUD(`WAVE ${sm.wave + 1} SPAWNS IN ${mmss(sm.betweenTimer)}`, `${alive} BOTS ALIVE`, best);
      } else {
        this.hud.setModeHUD(`WAVE ${sm.wave}`, `${alive} BOTS ALIVE`, best);
      }
      this.hud.setWaveBonus(sm.waveBonus());
      return;
    }

    // ─── LEGACY MODES ───────────────────────────────────────────────────────────
    if (this._mode.timeLimit > 0) {
      this._modeTimer = Math.max(0, this._modeTimer - dt);
      const mins = Math.floor(this._modeTimer / 60);
      const secs = Math.floor(this._modeTimer % 60);
      this.hud.setModeHUD(`${mins}:${String(secs).padStart(2, '0')}`, 'TIME REMAINING');
      if (this._modeTimer <= 0) this._endGame("TIME'S UP");
      return;
    }
    if (this._mode.waves && this.botManager.allDead()) {
      this._wave += 1;
      const count = 3 + (this._wave - 1) * 2;
      const hm = 1 + (this._wave - 1) * 0.18;
      this.botManager.spawnAll(count, true, hm);
      this.hud.addKillFeed(`— WAVE ${this._wave} — (+${Math.round((hm - 1) * 100)}% HP)`);
      this._refreshModeHUD();
      return;
    }
    if (this._mode.noRespawn && !this._mode.waves && this.botManager.allDead()) {
      this._endGame('VICTORY');
      return;
    }
    if (this._mode.id === 'elimination') {
      const alive = this.botManager.bots.filter(b => b.alive).length;
      this.hud.setModeHUD('ELIMINATION', `${alive} REMAINING`);
    }
  }

  _updateMenuScene(dt) {
    // Slowly rotate the preview character (only shown on PLAY tab)
    if (this.previewCharacter.visible) {
      this.previewCharacter.rotation.y += dt * 0.6;
    }
    // Tick the human soldier's idle animation whenever it's on screen.
    const pud = this.previewCharacter?.userData;
    if (pud?.isHuman) { pud.setMotion('idle'); pud.mixer.update(dt); pud.armorTick?.(dt); }

    // Keep the city alive behind the menu fly-through (flying traffic, pulse).
    this.world.update(dt);

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
    this._rafId = requestAnimationFrame(() => this._loop());
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());

    if (this.state === 'playing') {
      this._updatePlaying(dt);
    } else if (this.state === 'leaderboard') {
      this._updateLeaderboard(dt);
    } else {
      // Cinematic camera runs for every non-playing state (connecting, auth, menu, paused, gameover)
      this._updateMenuScene(dt);
    }

    const camera = this.state === 'playing' ? this.player.camera : this.menuCamera;
    if (this._bloomEnabled && this.composer) {
      this.renderPass.camera = camera;
      this.composer.render();
    } else {
      this.renderer.render(this.world.scene, camera);
    }
    this.input.endFrame();
  }
}
