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
import { UserAccount } from './UserAccount.js';
import { Armory } from './Armory.js';
import { GameSettings } from './GameSettings.js';
import { DeathEffectManager } from '../effects/DeathEffects.js';
import { getMode } from './GameModes.js';
import { getSkin } from '../player/skins.js';
import {
  buildPreviewCharacter,
  applySkinToCharacter,
  resolveViewmodelPalette,
  rigCharacterLimbs,
} from '../player/PreviewCharacter.js';
import { applyRifleCarry, restRifleTransform } from '../player/RifleCarry.js';
import { applyWalkCycle, triggerHop } from '../player/Locomotion.js';
import { triggerAction, tickActions, applyMeleeCarry } from '../player/Actions.js';
import { loadArmorType } from '../player/ArmorTypes.js';
import { cameraYawToBodyYaw } from '../player/Facing.js';
import { GrenadeSystem } from '../weapons/GrenadeSystem.js';
import { Shop } from './Shop.js';
import { Loadout } from './Loadout.js';
import { BattlePass } from './BattlePass.js';
import { getArmorSkin, ARMOR_SKINS } from '../player/ArmorSkins.js';
import { WEAPON_SKINS } from '../weapons/WeaponSkins.js';
import { MoveBridge, moveSimEnabled } from '../sim/MoveBridge.js';
import { AuthNetBridge, authNetTarget } from '../net/AuthNetBridge.js';
import { SWORD_SKINS } from '../weapons/SwordSkins.js';
import { MobileControls } from '../ui/MobileControls.js';
import { KILL_MULT_BONUS } from './RarityPerks.js';
import { ZombieManager } from '../entities/ZombieManager.js';
import { SurvivalManager } from './SurvivalManager.js';
import { DeathmatchManager } from './DeathmatchManager.js';
import { ServerSim } from './ServerSim.js';
import { NetClient } from './NetClient.js';
import { preloadZombieModel } from '../entities/Zombie.js';
import { preloadPlayerModel, preloadSpartanModel } from '../player/PreviewCharacter.js';
import { preloadHumanSoldier } from '../player/HumanSoldier.js';
import { preloadWeaponModels, buildWeaponModel, onWeaponModelsReady } from '../weapons/WeaponModels.js';
import { PickupSystem } from '../world/PickupSystem.js';
import { getImportedMap, nextImportedMapId } from '../world/MapRegistry.js';
import { countLocalMatchPlayers } from './Population.js';

// Seconds between dying and coming back. The respawn is automatic — the menu
// that opens on death is just something to look at while you wait.
const RESPAWN_DELAY = 3;

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
      if (this._menuBotsActive) {
        this._clearMenuBots();
        this._spawnMenuBots();
      }
    };
    this._bootHumanReady = new Promise((resolve) => {
      preloadHumanSoldier(() => { swapPreview(); resolve(); });
      setTimeout(resolve, 5000); // degraded startup if the optional model CDN stalls
    });
    preloadPlayerModel(swapPreview);
    preloadSpartanModel(swapPreview);
    this._bootWeaponsReady = new Promise((resolve) => {
      onWeaponModelsReady(resolve);
      preloadWeaponModels();
      setTimeout(resolve, 5000);
    });

    const requestedMapId = new URLSearchParams(window.location.search).get('map');
    this._initialMapId = getImportedMap(requestedMapId).id;
    this.world        = new World(this._initialMapId);

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
    this._listenPos   = new THREE.Vector3();   // scratch for the audio listener
    this._listenFwd   = new THREE.Vector3();
    this._listenUp    = new THREE.Vector3();
    this.player.audio = this.audio;
    this.player.onTeleport = () => {
      this.audio.playTeleport();
      this.hud.flashTeleport();
      // Blink covers 22m between one frame and the next, and the pads put you
      // down grounded — either way nothing in the gait has cause to react, so
      // the body would just slide to the far end. Play the jump arc over it.
      triggerHop(this._playerBody?.userData?.rig);
      this._playerBody?.userData?.triggerTeleport?.();
    };
    this.weaponSystem = new WeaponSystem(this.player.camera, this.world.scene, this.audio);
    // Hide FPS viewmodel during menu — it floats in the scene otherwise.
    if (this.weaponSystem.weaponMount) this.weaponSystem.weaponMount.visible = false;
    // The first-person viewmodel (gun, arm, muzzle flash, viewmodel lights) is
    // parented to the player camera. Three.js only renders objects reachable
    // from the scene root, so the camera itself must live in the scene.
    this.world.scene.add(this.player.camera);
    this.deathEffects = new DeathEffectManager(this.world.scene);
    this.botManager      = new BotManager(this.world, this.world.scene, this.audio);
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

    // Optional shared match-state relay (see src/core/NetClient.js and
    // /server) — when configured (VITE_WS_URL) and reachable, deathmatch's
    // countdown timer and roster are shared across everyone's browser, so
    // joining mid-match shows the real elapsed time and real other players.
    // With no URL, or if it's unreachable, this is a no-op and the game
    // falls back to ServerSim's local-only simulation.
    this.net       = new NetClient(import.meta.env.VITE_WS_URL || '');
    this._netSlots = new Map(); // net player id -> Bot instance representing them
    this._netDriven = false;    // true for the duration of a match started while net was connected
    this.net.onState = (matchStart, durationMs, roster, mapId) => this._onNetState(
      matchStart, durationMs, roster, mapId,
    );
    this.net.onKillFeed = (name) => {
      if (this._isDM && this.state === 'playing') this.hud.addKillFeed(`${name} eliminated a target`);
    };
    this.net.onJoined = (name) => {
      if (this._isDM && this.state === 'playing') this.hud.showJoinNotification(`▶  ${name}  joined the match`);
    };
    this.net.onLeft = (name) => {
      if (this._isDM && this.state === 'playing') this.hud.showJoinNotification(`◀  ${name}  left the match`, true);
    };
    this.net.connect();

    this._scopeOverlay  = document.getElementById('scope-overlay');
    this._hudCrosshair  = document.getElementById('crosshair');
    this._menuOpen      = false; // in-match menu overlay (the match keeps running)
    this.grenadeSystem  = new GrenadeSystem(this.world.scene);
    this.pickupSystem = null; // created on first play, cleared on restart
    this.menu           = new MenuUI();

    this.menuCamera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);

    // Cinematic spectator waypoints (pos + lookAt) for the fly-through
    this._camWpts = [
      { p: new THREE.Vector3(-14,  6,  50), t: new THREE.Vector3(  0, 10, -36) },
      { p: new THREE.Vector3( 30,  7,  46), t: new THREE.Vector3( 10, 12, -10) },
      { p: new THREE.Vector3( 34, 10, -44), t: new THREE.Vector3(  0,  8, -53) },
      { p: new THREE.Vector3(-15,  7, -45), t: new THREE.Vector3(-30, 15, -12) },
      { p: new THREE.Vector3(-15,  7,  36), t: new THREE.Vector3(-38, 20, -14) },
      { p: new THREE.Vector3(  0, 25,  50), t: new THREE.Vector3( 15, 15, -10) },
    ];
    this._camRoutes = [this._camWpts];
    this._camRouteIndex = 0;
    this._camSeg     = 0;
    this._camSegTime = 0;
    this._CAM_SEG_DUR = 7.0; // seconds per transition
    this._camTravelTime = 0;
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._rebuildSpectatorCurves();

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
    this.matchStats = this._newMatchStats();
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

  // ev.io-style boot flow: pulsating logo → map-loading card (map name) → GUI.
  async _runConnectSequence() {
    const screen = document.getElementById('connect-screen');
    const bar = document.getElementById('boot-progress');
    const phase = document.getElementById('boot-phase');
    const detail = document.getElementById('boot-detail');
    const percent = document.getElementById('boot-percent');
    const setBoot = (value, title, copy) => {
      if (bar) bar.style.width = `${value}%`;
      if (phase) phase.textContent = title;
      if (detail) detail.textContent = copy;
      if (percent) percent.textContent = `${value}%`;
    };
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const minimumDisplay = delay(1050);

    setBoot(12, 'INITIALIZING ARENA', 'Renderer online');
    await delay(120);
    const bootMap = getImportedMap(this.world.currentMapId || this._initialMapId);
    setBoot(30, `STREAMING ${bootMap.name.toUpperCase()}`, 'Loading imported map geometry');
    await Promise.allSettled([Promise.resolve(this.world.ready), delay(350)]);
    setBoot(68, 'PREPARING COMBAT', 'Building navigation and collision');
    await Promise.allSettled([this._bootHumanReady, this._bootWeaponsReady]);
    setBoot(92, 'SYNCING LOADOUT', 'Soldier rig and weapon models ready');
    await minimumDisplay;
    setBoot(100, 'DEPLOYMENT READY', `Entering ${bootMap.region}`);
    await delay(260);

    screen.classList.add('fade-out');
    await delay(700);
    screen.classList.add('hidden');
    this._runMapIntro();
  }

  // Show the Daytime Rook loading card over the fly-through,
  // then reveal the main menu GUI.
  async _runMapIntro() {
    const el = document.getElementById('map-loading');
    if (el) {
      const definition = getImportedMap(this.world.currentMapId);
      const name = el.querySelector('.ml-name');
      if (name) name.textContent = definition.name.toUpperCase();
      const region  = document.getElementById('ml-region');
      const mode    = document.getElementById('ml-mode');
      const players = document.getElementById('ml-players');
      const tip     = document.getElementById('ml-tip');
      if (region)  region.textContent  = definition.region;
      if (mode)    mode.textContent     = 'Loading map…';
      if (players) players.textContent  = 'Spectating';
      if (tip)     tip.textContent      = 'TIP: press PLAY to drop into the match';
      el.classList.remove('hidden', 'ml-fade');
    }

    try {
      const map = await this.world.ready;
      const mode = document.getElementById('ml-mode');
      if (mode) mode.textContent = 'Map ready';
      this.previewCharacter.position.copy(this.world.previewPedestalPos);
      this._configureMapCamera(map);
    } catch (error) {
      console.error('[map] imported map failed to load', error);
      const mode = document.getElementById('ml-mode');
      if (mode) mode.textContent = 'Map load failed';
      return;
    }

    if (el) {
      clearTimeout(this._mlTimer1); clearTimeout(this._mlTimer2);
      this._mlTimer1 = setTimeout(() => el.classList.add('ml-fade'), 650);
      this._mlTimer2 = setTimeout(() => el.classList.add('hidden'), 1200);
    }
    this._initAuth();
  }

  _configureMapCamera(map) {
    if (map.spectatorRoutes?.length) {
      this._camRoutes = map.spectatorRoutes.filter((route) => route.length >= 4);
      this._camRouteIndex = 0;
      this._camWpts = this._camRoutes[0];
      this._camTravelTime = 0;
      this._rebuildSpectatorCurves();
      this.menuCamera.far = 600;
      this.menuCamera.updateProjectionMatrix();
      return;
    }
    // Use the authored playable bounds. Imported maps also contain enormous
    // decorative sky/fog meshes and off-map collision shells; including those
    // would push the camera kilometres away from the actual arena.
    const bounds = map.bounds;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const pad = Math.max(18, Math.min(size.x, size.z) * 0.08);
    const height = Math.max(30, bounds.max.y + 18);
    // Every control point must clear the tallest rendered mesh. Lowering this
    // as a ratio of total height put the camera underneath tall map towers.
    const lowHeight = Math.max(24, bounds.max.y + 10);
    const tx = Math.max(12, size.x * 0.18);
    const tz = Math.max(12, size.z * 0.18);
    const targetY = THREE.MathUtils.clamp(12, bounds.min.y + 6, bounds.max.y - 5);
    // Imported EV maps used to override this with three points packed into a
    // two-metre lane. These perimeter points cover every side of the arena and
    // stay above authored geometry, so the spectator really tours the map.
    this._camWpts = [
      { p: new THREE.Vector3(center.x - tx, height, bounds.max.z + pad), t: new THREE.Vector3(center.x - tx, targetY, center.z + tz) },
      { p: new THREE.Vector3(bounds.max.x + pad, lowHeight, center.z + tz), t: new THREE.Vector3(center.x + tx, targetY, center.z + tz) },
      { p: new THREE.Vector3(bounds.max.x + pad, height, center.z - tz), t: new THREE.Vector3(center.x + tx, targetY, center.z - tz) },
      { p: new THREE.Vector3(center.x + tx, lowHeight, bounds.min.z - pad), t: new THREE.Vector3(center.x + tx, targetY, center.z - tz) },
      { p: new THREE.Vector3(center.x - tx, height, bounds.min.z - pad), t: new THREE.Vector3(center.x - tx, targetY, center.z - tz) },
      { p: new THREE.Vector3(bounds.min.x - pad, lowHeight, center.z - tz), t: new THREE.Vector3(center.x - tx, targetY, center.z - tz) },
      { p: new THREE.Vector3(bounds.min.x - pad, height, center.z + tz), t: new THREE.Vector3(center.x - tx, targetY, center.z + tz) },
      { p: new THREE.Vector3(center.x, lowHeight, bounds.max.z + pad), t: new THREE.Vector3(center.x, targetY, center.z) },
    ];
    this._camRoutes = [this._camWpts];
    this._camRouteIndex = 0;
    this._camSeg = 0;
    this._camSegTime = 0;
    this._camTravelTime = 0;
    this._rebuildSpectatorCurves();
    this.menuCamera.far = Math.max(600, Math.max(size.x, size.z) * 4);
    this.menuCamera.updateProjectionMatrix();
  }

  _rebuildSpectatorCurves() {
    const closed = this._camRoutes?.length === 1;
    this._camPath = new THREE.CatmullRomCurve3(
      this._camWpts.map((w) => w.p.clone()), closed, 'centripetal', 0.5,
    );
    this._camLookPath = new THREE.CatmullRomCurve3(
      this._camWpts.map((w) => w.t.clone()), closed, 'centripetal', 0.5,
    );
    this._camCycleDuration = closed ? Math.max(54, this._camPath.getLength() / 6.5) : 7;
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  _initAuth() {
    // ev.io-style: land on the main menu immediately (spectating). Registered
    // accounts resume signed in; login/register happen on their own /login and
    // /register pages, which set the session and bounce back here.
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

    // accessibility → runtime (visuals are CSS-driven; these are the 3D + audio bits)
    const rm = GameSettings.get('reduceMotion');
    this.player.reduceMotion = rm;
    if (this.hud) {
      this.hud.reduceMotion  = rm;
      this.hud.reduceFlashes = GameSettings.get('reduceFlashes');
      this.hud.hitSound      = GameSettings.get('hitSound');
    }
  }

  // ── Wire callbacks ──────────────────────────────────────────────────────────

  _newMatchStats() {
    return {
      shotsFired: 0,
      hits: 0,
      headshots: 0,
      damageDealt: 0,
      currentStreak: 0,
      bestStreak: 0,
    };
  }

  _wireCallbacks() {
    this.weaponSystem.onShoot = (def) => {
      // Count PELLETS, not trigger pulls: onHitBot fires once per pellet, so a
      // shotgun (pellets: 8) otherwise scores 8 hits against 1 shot.
      if (def?.kind !== 'melee') this.matchStats.shotsFired += (def?.pellets || 1);
    };
    this.weaponSystem.applyRecoilToPlayer = (amt) => {
      this.player.applyRecoil(amt);
      // Fire recoil kick on the third-person body model.
      this._playerBody?.userData?.triggerFire?.(Math.min(2, amt * 20));
      // Shooting shoulders the rifle: hold the aim pose for a beat after the
      // last shot, and kick the gun back.
      this._tpsAimHold = 1.1;
      this._tpsGunKick = 1;
    };

    this.grenadeSystem.onExplode = (point, radius, damage) => {
      for (const enemy of this._activeManager.bots) {
        if (!enemy.alive) continue;
        const d = enemy.position.distanceTo(point);
        if (d <= radius) {
          const f = THREE.MathUtils.lerp(1, 0.1, THREE.MathUtils.clamp(d / radius, 0, 1));
          const dealt = Math.min(enemy.health, damage * f);
          const killed = enemy.takeDamage(damage * f);
          this.matchStats.damageDealt += dealt;
          this.hud.flashHitmarker();
          if (killed) {
            this.deathEffects.spawn(enemy.mesh.position, null, null, false);
            this._onEnemyKilled(enemy, null);
          }
        }
      }
    };

    this.weaponSystem.onHitBot = (enemy, dmg, point, meta) => {
      const dealt = Math.min(enemy.health, dmg);
      const killed = enemy.takeDamage(dmg);
      // Accuracy is about aimed rounds. Melee swings, thrown knives and rocket
      // splash all reach this callback too, and none of them fires onShoot —
      // counting them made every one of those a free hit with no shot behind it.
      if (meta?.hitscan) {
        this.matchStats.hits++;
        if (meta?.headshot) this.matchStats.headshots++;
      }
      this.matchStats.damageDealt += dealt;
      if (this.hud.hitSound !== false) this.audio.playHit();   // accessibility toggle
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
    this.hud.showKillConfirm(headshot, 100 * rewardMult);
    this.matchStats.currentStreak++;
    this.matchStats.bestStreak = Math.max(this.matchStats.bestStreak, this.matchStats.currentStreak);
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
      if (this._netDriven) this.net.sendKill(); // report to the shared 24/7 roster
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
      // accessibility toggles apply live
      const rm = GameSettings.get('reduceMotion');
      this.player.reduceMotion = rm;
      this.hud.reduceMotion    = rm;
      this.hud.reduceFlashes   = GameSettings.get('reduceFlashes');
      this.hud.hitSound        = GameSettings.get('hitSound');
    };
    this.menu.onLoginRequest = () => { window.location.href = '/login'; };
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
    this.weaponSystem.setArmAppearance(resolveViewmodelPalette(
      this.selectedSkin, this.selectedArmorType, this.selectedArmorSkin
    ));
  }

  _startGame(name, skinId, modeId = 'deathmatch', armorTypeId) {
    this._clearMenuBots();
    this.audio.resume();
    this.selectedSkin      = getSkin(skinId);
    this.selectedArmorSkin = getArmorSkin(Shop.getEquipped());
    this.selectedArmorType = armorTypeId || this.selectedArmorType || 'vanguard';
    applySkinToCharacter(this.previewCharacter, this.selectedSkin, this.selectedArmorSkin);
    this.weaponSystem.setArmAppearance(resolveViewmodelPalette(
      this.selectedSkin, this.selectedArmorType, this.selectedArmorSkin
    ));

    // Equip exactly the chosen gun + melee for this match.
    this.weaponSystem.setLoadout(Loadout.getGun(), Loadout.getMelee());

    const armoryMap = Armory.buildSkinMap(this.weaponSystem.allWeapons);
    this.weaponSystem.applyArmoryMap(armoryMap);

    this.player.name = name;
    this.player.skin = this.selectedSkin;
    this.player.setMaxShield(this.selectedArmorSkin?.shield || 0);
    this.player.respawn(this.world.randomSpawnPoint());
    this.weaponSystem.resetState(this.player.baseFov);
    this.grenadeSystem.reset();

    this._mode    = getMode(modeId);
    this.kills    = 0;
    this.score    = 0;
    this.deaths   = 0;
    this.matchStats = this._newMatchStats();
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
    this._showMapLoading(modeId, this.world.currentMapId);

    if (this._isDM) {
      this._activeManager = this.botManager;
      this.zombieManager.clear();
      this.dmManager.reset();
      // Fill the 8-slot server: you + (MAX_PLAYERS - 1) bots. Either the real
      // 24/7 relay (net) or the local ServerSim then flags some of those
      // bot slots as remote players as they come and go.
      this.botManager.spawnAll(MAX_PLAYERS - 1, false, 1);
      this._netSlots.clear();
      this._netDriven = this.net.connected;
      if (this._netDriven) {
        this.net.sendHello(name);
        this._modeTimer = (this.net.matchStart != null)
          ? THREE.MathUtils.clamp(this.net.matchDurationMs / 1000 - (Date.now() - this.net.matchStart) / 1000, 0, this.net.matchDurationMs / 1000)
          : 480;
        this._applyNetRoster(this.net.roster);
      } else {
        this._modeTimer = 480; // 8 minutes
        this.serverSim.start(false, 1);
      }
      this.hud.showServerPop(true);
      // (re)create pickup system for fresh match
      this.pickupSystem?.dispose();
      this.pickupSystem = new PickupSystem(this.world.scene, this.world.weaponSpawnPoints);
      const _mm = Math.floor(this._modeTimer / 60), _ss = Math.floor(this._modeTimer % 60);
      this.hud.showDMTimer(`${_mm}:${String(_ss).padStart(2, '0')}`);
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
      this.pickupSystem = new PickupSystem(this.world.scene, this.world.weaponSpawnPoints);
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
      this.selectedSkin, armorTypeId || this.selectedArmorType || 'vanguard', this.selectedArmorSkin
    );
    // The human soldier animates via its own skeleton; only the procedural
    // block character needs the limb-pivot rig.
    if (!this._playerBody.userData?.isHuman) rigCharacterLimbs(this._playerBody);
    // Yaw-first, so the run lean (rotation.x) pitches about the body's own axis.
    this._playerBody.rotation.order = 'YXZ';
    this._playerBody.visible = false;
    this._tpsWeaponId = null; // force TPS weapon (re)attach on next TPS frame
    this._tpsWeaponMesh = null; // old weapon went with the removed body
    this._tpsAnimPrev = null;
    this._tpsAnimSpeed = this._tpsAnimVX = this._tpsAnimVZ = 0;
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

    sm.onWaveStart = (wave, count, hpMult, speedMult, armedRatio = 0, dmgMult = 1) => {
      this.zombieManager.spawnWave(count, hpMult, speedMult, wave, armedRatio, dmgMult);
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
      this.player.respawn(this.world.randomSpawnPoint());
      this.weaponSystem.resetMotionState();
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

  // ── Shared 24/7 match state (see NetClient / server/) ───────────────────────

  // Fired whenever the net relay pushes a state snapshot. If the current
  // deathmatch started OFFLINE (the WebSocket races page load, so clicking
  // PLAY quickly lands before it connects — the timer shows a private 8:00),
  // adopt the shared server state as soon as it arrives: snap the countdown
  // to the real match time and swap the roster to real players. Better a
  // one-time timer jump than a whole match on a private clock.
  _onNetState(matchStart, durationMs, roster, mapId) {
    if (!this._isDM || this.state !== 'playing') return;
    if (!this._netDriven) {
      this._netDriven = true;
      this.serverSim.stop();           // hand the roster over to the real server
      // Release any slots the local sim had flagged as fake remote players so
      // the real roster below can claim them.
      for (const b of this.botManager.bots) { b.isHumanSlot = false; b._netId = null; }
      this._netSlots.clear();
      this.net.sendHello(this.player.name);
      console.info('[net] match server state adopted mid-match — timer synced to the shared 24/7 match');
    }
    const remaining = durationMs / 1000 - (Date.now() - matchStart) / 1000;
    this._modeTimer = THREE.MathUtils.clamp(remaining, 0, durationMs / 1000);
    if (mapId && mapId !== this.world.currentMapId) this._onAuthoritativeMap(mapId, {
      start: matchStart,
      durationMs,
    });
    this._applyNetRoster(roster);
  }

  _onAuthoritativeMap(mapId, match = {}, initial = false) {
    if (!mapId) return;
    if (Number.isFinite(match.start) && Number.isFinite(match.durationMs)) {
      const remaining = match.durationMs / 1000 - (Date.now() - match.start) / 1000;
      this._modeTimer = THREE.MathUtils.clamp(remaining, 0, match.durationMs / 1000);
    }
    if (mapId === this.world.currentMapId) return;
    this._pendingMapId = mapId;
    if (initial) {
      this._activateMap(mapId).catch((error) => console.error('[map] authoritative map load failed', error));
    } else if (this.state === 'playing') {
      // The server has advanced the shared round. Preserve the finished map
      // behind the results screen; _restart loads the new one after countdown.
      this._showLeaderboard();
    }
  }

  // Reconcile which existing bot slots represent real connected players vs
  // pure AI. Never resizes the roster — always exactly MAX_PLAYERS
  // combatants; a "net slot" just relabels an existing bot with a real
  // player's name and real kills/score instead of the usual random ones.
  _applyNetRoster(roster) {
    const others = (roster || []).filter((p) => p.id !== this.net.selfId).slice(0, MAX_PLAYERS - 1);
    const seenIds = new Set(others.map((p) => p.id));

    // Release slots for players who left — back to plain AI.
    for (const [id, bot] of this._netSlots) {
      if (!seenIds.has(id)) {
        bot.isHumanSlot = false;
        bot._netId = null;
        this._netSlots.delete(id);
      }
    }
    // Claim/refresh slots for current real players.
    for (const p of others) {
      let bot = this._netSlots.get(p.id);
      if (!bot) {
        bot = this.botManager.bots.find((b) => !b.isHumanSlot);
        if (!bot) continue; // no free slot (shouldn't happen at capacity)
        bot.isHumanSlot = true;
        bot._netId = p.id;
        this._netSlots.set(p.id, bot);
      }
      bot.displayName = p.name;
      bot._netKills = p.kills;
      bot._netScore = p.score;
    }
    // Real connections replace local AI slots; they do not make the remaining
    // bots stop being players. The occupied eight-player match stays full.
    this.hud.setServerPop(
      Math.min(MAX_PLAYERS, countLocalMatchPlayers(this.botManager.bots)),
      MAX_PLAYERS,
    );
  }

  // Format seconds as HH:MM:SS (survival best-time display).
  _fmtHMS(secs) {
    secs = Math.max(0, Math.floor(secs));
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  // Live scoreboard rows (you + opponents). Bot scores are seeded once per match
  // so they stay stable while you hold TAB. Net-flagged slots (real connected
  // players) use their real kills/score from the shared server instead.
  // Survival shows just you (vs. zombies).
  _buildScoreboardRows() {
    if (this._authNet?.ready) {
      const client = this._authNet.client;
      const rows = (client.roster || []).map((entry) => ({
        name: entry.name,
        kills: entry.id === client.you ? client.self.kills : entry.kills,
        score: entry.id === client.you ? client.self.score : entry.score,
        isYou: entry.id === client.you,
        isBot: entry.isBot,
      }));
      rows.sort((a, b) => b.kills - a.kills || b.score - a.score);
      return rows;
    }
    const rows = [{ name: this.player.name || 'You', kills: this.kills, score: this.score, isYou: true }];
    if (!this._isSurvival) {
      for (const bot of (this.botManager?.bots || [])) {
        const key = bot.displayName || 'Spartan';
        let kills, score;
        if (bot._netId != null) {
          kills = bot._netKills || 0;
          score = bot._netScore || 0;
        } else {
          kills = bot._botKills || 0;
          score = kills * 100;
        }
        rows.push({ name: key, kills, score, isYou: false });
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
      let k, d, a, score;
      if (bot._netId != null) {
        // Real connected player — use their actual reported stats. Deaths
        // aren't tracked server-side yet (out of scope for the shared-state
        // relay), so kd falls back to raw kills the same way the formula
        // already does for anyone with 0 recorded deaths.
        k = bot._netKills || 0;
        d = 0;
        a = 0;
        score = bot._netScore || 0;
      } else {
        k = bot._botKills || 0;
        d = bot._botDeaths || 0;
        a = Math.floor(Math.random() * 6);
        score = k * 100;
      }
      rows.push({ name: bot.displayName, score, assists: a, kills: k, deaths: d, kd: kd(k, d), isYou: false });
    }
    rows.sort((a, b) => b.kills - a.kills || b.score - a.score);
    const earnedCoins = Math.max(0, this.kills) * 10 + 100; // 10/kill + 100 match bonus

    if (this.weaponSystem.weaponMount) this.weaponSystem.weaponMount.visible = false;
    this.state    = 'leaderboard';
    this._lbTimer = 10;
    this.input.exitPointerLock();
    this.mobileControls?.hide();
    this.hud.hide();         // hide crosshair / ammo / health
    this.hud.hideDMTimer();
    this.hud.hideScoreboard(); this._sbShown = false;
    this.hud.hideLeaderboard(); // reset in case it was shown before
    const accuracy = this.matchStats.shotsFired > 0
      ? ((this.matchStats.hits / this.matchStats.shotsFired) * 100)
      : 0;
    this.hud.showLeaderboard(rows, this.player.name, earnedCoins, {
      ...this.matchStats,
      accuracy,
      kills: this.kills,
      deaths: this.deaths,
      score: this.score,
      playTime: this.playTime,
    });
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
  _showMapLoading(modeId, mapId = this.world.currentMapId) {
    const el = document.getElementById('map-loading');
    if (!el) return;
    const map = getImportedMap(mapId);
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
    const name = el.querySelector('.ml-name');
    if (name) name.replaceChildren(...map.name.split(/\s+/).flatMap((part, index) => {
      const nodes = [];
      if (index) nodes.push(document.createElement('br'));
      nodes.push(document.createTextNode(part.toUpperCase()));
      return nodes;
    }));
    const region = document.getElementById('ml-region');
    if (region) region.textContent = map.region;
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
    // Release the mouse. When ESC opened this the browser already did, but on
    // death we call it ourselves and the cursor is still captured — you'd see
    // the menu with no way to click it.
    this.input.exitPointerLock();
    this.menu.showPause();
  }

  _quitToMenu() {
    clearTimeout(this._respawnTimer);
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
    if (this.weaponSystem.weaponMount) this.weaponSystem.weaponMount.visible = false;
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

  async _activateMap(mapId) {
    if (!mapId || mapId === this.world.currentMapId) {
      this._pendingMapId = null;
      return this.world.currentMap;
    }
    this.pickupSystem?.dispose();
    this.pickupSystem = null;
    this._showMapLoading(this._mode?.id || 'deathmatch', mapId);
    const map = await this.world.loadMap(mapId);
    this._configureMapCamera(map);
    this.previewCharacter.position.copy(this.world.previewPedestalPos);
    if (this.state === 'playing') {
      this.pickupSystem = new PickupSystem(this.world.scene, this.world.weaponSpawnPoints);
    }
    this._pendingMapId = null;
    return map;
  }

  async _restart() {
    this._saveStats();
    this.hud.hideLeaderboard();
    this.menu.hideGameOver();
    const authoritativeMapId = this._pendingMapId
      || this._authNet?.client?.mapId
      || this.net?.mapId;
    const nextMapId = authoritativeMapId
      || nextImportedMapId(this.world.currentMapId);
    try {
      await this._activateMap(nextMapId);
    } catch (error) {
      console.error('[map] rotation failed; retaining current imported map', error);
    }
    this._startGame(
      this.player.name,
      this.selectedSkin.id,
      this._mode?.id || 'deathmatch'
    );
  }

  // Drop any picked-up map power weapon and refresh the right-side weapon
  // inventory back to the base main gun + melee.
  _resetLoadoutHud() {
    this.weaponSystem.resetLoadout?.();
    this.hud.buildWeaponSlots(this.weaponSystem.getHudInfo().slots, 0);
  }

  // ── Player damage / death ───────────────────────────────────────────────────

  _onPlayerDamaged(dmg, from = null) {
    if (this.player.isDead || this._playerDowned) return;
    const died = this.player.takeDamage(dmg);
    this.audio.playHurt();
    this.hud.flashDamage();
    // Which way did that come from? Without this you get shot by something you
    // never see and have no idea where to look.
    if (from) this.hud.showDamageFrom(from, this.player.position, this.player.yaw);
    // Damage flinch on the third-person body model.
    this._playerBody?.userData?.triggerHit?.(0, 1);
    triggerAction(this._playerBody?.userData?.rig, 'flinch');
    if (died) this._onPlayerDeath();
  }

  /** Wind the off arm up and lob — see Actions.js. */
  _throwAnim() {
    this._playerBody?.userData?.triggerAction?.('throw');
    triggerAction(this._playerBody?.userData?.rig, 'throw');
  }

  _onPlayerDeath() {
    this.deaths++;
    this.matchStats.currentStreak = 0;
    // Survival: enter downed state instead of immediate death
    if (this._isSurvival) {
      if (this._playerDowned) return; // already downed
      this._playerDowned = true;
      this.survivalManager.playerDowned();
      // survivalManager.onGameOver fires if no revives remain
      return;
    }

    // Deathmatch: infinite lives. Dying opens the menu and starts a 3s timer;
    // the respawn then happens on its own whether or not the menu is still up,
    // and clicking the canvas drops you straight back in (see _resume).
    if (this._isDM) {
      if (!this._menuOpen) this._openMenu();
      this.hud.addKillFeed(`YOU DIED — respawning in ${RESPAWN_DELAY}s`);
      clearTimeout(this._respawnTimer);
      this._respawnTimer = setTimeout(() => this._respawnPlayer(), RESPAWN_DELAY * 1000);
      return;
    }

    // Legacy modes
    if (this._mode?.lives !== Infinity) {
      this._lives = Math.max(0, this._lives - 1);
      if (this._lives > 0 && this._mode?.waves) {
        clearTimeout(this._respawnTimer);
        this._respawnTimer = setTimeout(() => {
          this.player.respawn(this.world.safeSpawnPoint(this._activeManager?.bots || []));
          this.weaponSystem.resetMotionState();
          this._resetLoadoutHud();   // drop any picked-up power weapon
          this._refreshModeHUD();
        }, RESPAWN_DELAY * 1000);
        return;
      }
    }
    this._endGame('YOU DIED');
  }

  // Put the player back in the fight at a spawn point away from everyone else,
  // so you don't rematerialise in front of whoever just killed you.
  _respawnPlayer() {
    if (this.state !== 'playing') return;
    const point = this.world.safeSpawnPoint(this._activeManager?.bots || []);
    this.player.respawn(point);
    this.weaponSystem.resetMotionState();
    this.player.setMaxShield(this.selectedArmorSkin?.shield || 0);
    this._resetLoadoutHud();   // drop any picked-up power weapon
    this.hud.addKillFeed('RESPAWNED');
  }

  _endGame(title, subtitle = '') {
    this._saveStats();
    this._menuOpen = false;
    if (this._scopeOverlay) this._scopeOverlay.classList.remove('active');
    if (this._hudCrosshair) this._hudCrosshair.classList.remove('hidden');
    if (this.weaponSystem.weaponMount) this.weaponSystem.weaponMount.visible = false;
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

    // Put the WebAudio listener on the camera so every positional sound (bot
    // gunfire, footsteps, deaths) arrives from the direction it happened.
    const cam = this.player.camera;
    cam.getWorldPosition(this._listenPos);
    cam.getWorldDirection(this._listenFwd);
    this._listenUp.set(0, 1, 0).applyQuaternion(cam.quaternion);
    this.audio.setListener(this._listenPos, this._listenFwd, this._listenUp);

    const menuOpen = this._menuOpen;

    // Player input is blocked while the menu overlay is open (no pointer lock),
    // but the match keeps running — this is a multiplayer game.
    // Phase 3: with the movesim flag on, the deterministic fixed-20Hz core
    // drives movement (interpolated); the legacy controller stays the default.
    // Phase 4/5 integration: with ?authnet on, the AUTHORITATIVE SERVER owns
    // movement + combat — the local player is client-predicted and other
    // players are real remotes. Falls back cleanly if the socket isn't up.
    if (this._authNet === undefined) {
      const url = authNetTarget();
      this._authNet = url ? new AuthNetBridge(this, url) : null;
    }
    // Dead players are frozen where they fell until the respawn timer fires —
    // clicking back in early shouldn't let a corpse run around and shoot.
    const dead = this.player.isDead && !this._playerDowned;
    if (!menuOpen && this._authNet && this._authNet.ready) {
      // Keep receiving authoritative snapshots while locally dead; otherwise
      // the server's respawn can never clear the client's dead state.
      this._authNet.update(dt, this.input);
    } else if (!menuOpen && !dead) {
      if (!this.world.usesMeshCollision && (this._moveSimOn ?? (this._moveSimOn = moveSimEnabled()))) {
        if (!this.moveBridge) this.moveBridge = new MoveBridge(this.player, this.world);
        this.moveBridge.update(dt, this.input, this.world);
      } else {
        this.player.update(dt, this.input, this.world);
      }
    }
    this.player.camera.updateMatrixWorld(true);

    // Animate the living sci-fi city (flying traffic, pulsing energy).
    this.world.update(dt);

    // Sync third-person body mesh and hide/show viewmodel
    const inTPS = this.player._camDist > 0 && !this.player._tpsObstructed;
    if (this._playerBody) {
      this._playerBody.visible = inTPS;
      this._playerBody.position.copy(this.player.position);
      // Face the way the camera looks, so from behind you see the character's
      // BACK. Note the player's yaw is a CAMERA yaw: three.js cameras look
      // down their own −Z, so the view direction is −(sin yaw, cos yaw), and
      // Player.update moves along it via `-moveZ`. Every playable body,
      // including the rigged soldier, is authored front-on-−Z and therefore
      // takes camera yaw unchanged. Movement-vector yaw is converted
      // separately for bots in Facing.js.
      this._playerBody.rotation.y = cameraYawToBodyYaw(this.player.yaw);
      // Tick the hidden body too: action, recoil, teleport, and gait clocks
      // must not freeze in FPS and replay stale motion on POV re-entry.
      this._syncTpsWeapon();
      this._animatePlayerBody(dt);
    }
    if (this.weaponSystem.weaponMount) this.weaponSystem.weaponMount.visible = !inTPS;

    // While the menu is open, downed, or dead-and-awaiting-respawn, block
    // weapon/grenade input — the match still runs.
    if (!menuOpen && !this._playerDowned && !dead) {
      this.weaponSystem.update(dt, this.input, this.world, this._activeManager, this.player);
    }
    this.deathEffects.update(dt);
    this._activeManager.update(dt, this.player, this.player.camera, (dmg, from) => this._onPlayerDamaged(dmg, from), this.world);
    this.pickupSystem?.update(dt, this.player, this.weaponSystem, this.hud);

    // grenade input  F = frag  E = smoke
    if (!menuOpen && !dead && this.input.consumeJustPressed('KeyF')) {
      const had = this.grenadeSystem.frags;
      this.grenadeSystem.throwFrag(this.player.camera);
      // Only animate a throw that actually happened — out of grenades, the
      // arm shouldn't wind up and lob nothing.
      if (this.grenadeSystem.frags < had) this._throwAnim();
      this.hud.updateGrenades(this.grenadeSystem.frags, this.grenadeSystem.smokes);
    }
    if (!menuOpen && !dead && this.input.consumeJustPressed('KeyE')) {
      const had = this.grenadeSystem.smokes;
      this.grenadeSystem.throwSmoke(this.player.camera);
      if (this.grenadeSystem.smokes < had) this._throwAnim();
      this.hud.updateGrenades(this.grenadeSystem.frags, this.grenadeSystem.smokes);
    }
    this.grenadeSystem.update(dt, this.player);

    this.hud.update(this.player, this.weaponSystem.getHudInfo(), this.kills, this.score);
    this.hud.updateGrenades(this.grenadeSystem.frags, this.grenadeSystem.smokes);
    this.hud.setActiveSlot(this.weaponSystem.currentIndex);

    // Enemy nameplates (name + health bar) over living opponents.
    if (this.botManager?.bots?.length) {
      this.nameplates.container.style.display = '';
      this.nameplates.update(this.player.camera, this.botManager.bots);
    } else {
      this.nameplates.container.style.display = 'none';
    }

    // In-game scoreboard — hold TAB to view live scores
    const sbDown = this.input.isDown('Tab');
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

    // Scope overlay — shown when ADS on a scoped weapon
    if (this._scopeOverlay) {
      const showScope = !!this.weaponSystem.currentDef.scoped && this.weaponSystem.scopeT > 0.5;
      this._scopeOverlay.classList.toggle('active', showScope);
      if (this._hudCrosshair) this._hudCrosshair.classList.toggle('hidden', showScope);
    }

    this._updateModeLogic(dt);
  }

  // Put the currently-held weapon into the third-person body's hand, rebuilding
  // only when the active weapon changes (gun ↔ melee switch). Human model only —
  // the procedural fallback body carries no weapon.
  _syncTpsWeapon() {
    const ud = this._playerBody?.userData;
    if (!ud) return;
    const def = this.weaponSystem.currentDef;
    if (!def || this._tpsWeaponId === def.id) return;
    const isSwap = this._tpsWeaponId !== null;
    this._tpsWeaponId = def.id;
    // Human soldier: attach to the rigged hand via its own hold system.
    if (ud.isHuman && ud.attachWeapon) {
      const built = buildWeaponModel(def, { procedural: true });
      ud.attachWeapon(built?.group || null, def.kind === 'melee');
      if (isSwap) ud.triggerAction?.('swap');
      return;
    }
    // Procedural / low-poly (cyborg) body: seat the weapon in front of the chest
    // where the arm grip pose brings both hands onto it.
    if (this._tpsWeaponMesh) { this._playerBody.remove(this._tpsWeaponMesh); this._tpsWeaponMesh = null; }
    const wm = buildWeaponModel(def, { procedural: true })?.group;
    if (wm) {
      wm.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = true; } });
      // rot.y = 0: the muzzle (−Z default) points out the body's −Z front, which
      // the +π world-facing turns toward where the player aims (not backward).
      if (def.kind === 'melee') { wm.position.set(-0.22, 1.06, -0.24); wm.rotation.set(-0.70, 0, 0.22); }
      else                      { restRifleTransform(wm); }
      this._playerBody.add(wm);
      this._tpsWeaponMesh = wm;
    }
  }

  // Drive the third-person body's walk cycle: swing the rigged arm/leg pivots
  // when moving, gentle breathing sway when standing still.
  _animatePlayerBody(dt) {
    const p = this.player;
    // Drive gait from post-collision displacement. Requested velocity can stay
    // non-zero while collision resolution pins the body against a wall.
    if (!this._tpsAnimPrev) {
      this._tpsAnimPrev = p.position.clone();
      this._tpsAnimSpeed = this._tpsAnimVX = this._tpsAnimVZ = 0;
    }
    const dx = p.position.x - this._tpsAnimPrev.x;
    const dz = p.position.z - this._tpsAnimPrev.z;
    const step = Math.hypot(dx, dz);
    const validStep = dt > 1e-4 && step < 2.0;
    if (!validStep) {
      this._tpsAnimSpeed = this._tpsAnimVX = this._tpsAnimVZ = 0;
    } else {
      const resolvedVX = dx / dt;
      const resolvedVZ = dz / dt;
      const resolvedSpeed = Math.hypot(resolvedVX, resolvedVZ);
      const speedEase = 1 - Math.exp(
        -(resolvedSpeed < this._tpsAnimSpeed ? 18 : 12) * dt
      );
      this._tpsAnimSpeed += (resolvedSpeed - this._tpsAnimSpeed) * speedEase;
      this._tpsAnimVX += (resolvedVX - this._tpsAnimVX) * speedEase;
      this._tpsAnimVZ += (resolvedVZ - this._tpsAnimVZ) * speedEase;
    }
    this._tpsAnimPrev.copy(p.position);
    const speed = this._tpsAnimSpeed;

    // Real human soldier: drive its skeletal Idle/Walk/Run clips.
    const ud = this._playerBody?.userData;
    if (ud?.isHuman) {
      // Strafe input in the body's local frame — feeds the lean layer.
      const yaw = p.yaw;
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const dirF = speed > 0.15
        ? (this._tpsAnimVX * -sn + this._tpsAnimVZ * -cs) / Math.max(0.01, speed) : 1;
      const dirR = speed > 0.15
        ? (this._tpsAnimVX * cs + this._tpsAnimVZ * -sn) / Math.max(0.01, speed) : 0;
      const strafe = -dirR;
      if (ud.setLocomotion) {
        ud.setLocomotion(speed, p.onGround, p.isSprinting, strafe, dirF, dirR);
      }
      else ud.setMotion(speed > 0.6 && p.onGround ? (speed > 6.5 ? 'run' : 'walk') : 'idle');
      // Head/spine track the player's aim pitch (the whole body already yaws to
      // face the aim direction, so we only need pitch here).
      if (ud.setAim) ud.setAim(p.pitch, 0);
      const wst = this.weaponSystem.currentState;
      const rTime = this.weaponSystem.currentDef?.reloadTime || 0;
      const reload = (wst?.isReloading && rTime > 0)
        ? THREE.MathUtils.clamp(1 - wst.reloadTimer / rTime, 0, 1) : 0;
      this._tpsAimHold = Math.max(0, (this._tpsAimHold || 0) - dt);
      ud.setActionState?.({
        reload,
        swing: this.weaponSystem.swingPhase,
        crouch: p.isCrouching ? 1 : 0,
        slide: p.isSliding ? 1 : 0,
        vy: p.velocity.y,
        aim: (this._tpsAimHold > 0 || this.weaponSystem.scopeT > 0.2) ? 1 : 0,
      });
      ud.mixer.update(dt);
      ud.armorTick?.(dt);
      return;
    }

    const rig = ud?.rig;
    if (!rig) return;
    const moving = speed > 0.6 && p.onGround;
    const t = p.bobTime;
    const L  = (j, tgt, k) => { if (j) j.rotation.x += (tgt - j.rotation.x) * Math.min(1, dt * k); };

    // Legs / gait — the same cycle the bots and every remote player run (see
    // Locomotion.js): stride with knee flex and a rolling ankle, plus the pelvis
    // drop and run lean it hands back for the body transform.
    const run = p.isSprinting ? 1 : THREE.MathUtils.clamp((speed - 3.0) / 6.0, 0, 0.45);
    this._tpsCrouch = (this._tpsCrouch || 0) +
      ((p.isCrouching ? 1 : 0) - (this._tpsCrouch || 0)) * Math.min(1, dt * 10);
    // Travel direction in the body's own frame. The body faces local -Z and is
    // yawed by the camera yaw, so forward is (-sin, -cos) and right is
    // (cos, -sin). Without this the legs stride forward while you strafe or
    // backpedal — the feet then just ride along with the body.
    const bsn = Math.sin(p.yaw), bcs = Math.cos(p.yaw);
    let dirF = 1, dirR = 0;
    if (speed > 0.6) {
      dirF = (p.velocity.x * -bsn + p.velocity.z * -bcs) / speed;
      dirR = (p.velocity.x *  bcs + p.velocity.z * -bsn) / speed;
    }
    const gait = applyWalkCycle(rig, {
      speed, moving, run, crouch: this._tpsCrouch, dt, dirF, dirR,
      grounded: p.onGround, vy: p.velocity.y,
      slide: p.isSliding ? 1 : 0,
    });
    // Subtle side-to-side weight transfer makes the armored chassis feel
    // connected through the hips. Apply it in body-local +X so strafing and
    // turning do not make the visual body drift in an unrelated world axis.
    this._playerBody.position.x = p.position.x + Math.cos(p.yaw) * gait.sway;
    this._playerBody.position.y = p.position.y + gait.bob;
    this._playerBody.position.z = p.position.z - Math.sin(p.yaw) * gait.sway;
    this._playerBody.rotation.x = gait.lean;   // already eased, and bob assumes it
    this._playerBody.rotation.z = gait.roll;

    // Arms: hold the weapon in a two-handed grip when armed with a gun, else
    // free-swing. This mirrors Avatar.update() exactly — the body OTHER players
    // see of you is driven by the same two calls from the same numbers, so your
    // third-person self and their view of you can't disagree.
    // ── one-shot actions ──────────────────────────────────────────────────
    // A weapon swap has no timer of its own, so notice the index changing —
    // that catches the number keys, the wheel and a floor pickup alike.
    if (this._tpsSlot !== this.weaponSystem.currentIndex) {
      if (this._tpsSlot !== undefined) triggerAction(rig, 'swap');
      this._tpsSlot = this.weaponSystem.currentIndex;
    }
    const act = tickActions(rig, dt);
    // A reload already has a clock — the weapon's own. Reading it rather than
    // starting a second one means the pose can't drift out of step with the
    // reload it is meant to be showing.
    const wst = this.weaponSystem.currentState;
    const rTime = this.weaponSystem.currentDef?.reloadTime || 0;
    const reload = (wst?.isReloading && rTime > 0)
      ? THREE.MathUtils.clamp(1 - wst.reloadTimer / rTime, 0, 1) : 0;

    const isGun = this.weaponSystem.currentDef && this.weaponSystem.currentDef.kind !== 'melee';
    if (isGun) {
      // A real soldier's carry: relaxed = rifle laid diagonally across the chest
      // (stock in the right shoulder, muzzle down-left); shooting or aiming down
      // sights shoulders it level. applyRifleCarry() blends the two and keeps
      // both hands welded to the grip + handguard through the whole range.
      this._tpsAimHold = Math.max(0, (this._tpsAimHold || 0) - dt);
      this._tpsGunKick = Math.max(0, (this._tpsGunKick || 0) - dt * 7);
      const wantAim = (this._tpsAimHold > 0 || this.weaponSystem.scopeT > 0.2) ? 1 : 0;
      this._tpsAim = (this._tpsAim || 0) + (wantAim - (this._tpsAim || 0)) * Math.min(1, dt * 8);
      // Your body aims where your shots actually go. applyRifleCarry owns the
      // conversion — pass the raw look pitch and nothing else, or this drifts
      // away from the copy of you that everyone else sees.
      this._tpsPitch = (this._tpsPitch || 0) + (p.pitch - (this._tpsPitch || 0)) * Math.min(1, dt * 12);
      applyRifleCarry(rig, this._tpsWeaponMesh, this._tpsAim, dt, {
        aimPitch: this._tpsPitch, bodyPitch: gait.lean,
        swing: gait.swing,
        kick:  this._tpsGunKick,
        reload, swap: act.swap, flinch: act.flinch, throwP: act.throw,
      });
    } else {
      // Blade: windup, slash, recover — the same phase the first-person view
      // swings on, so both views of the strike agree.
      applyMeleeCarry(rig, this._tpsWeaponMesh, {
        swing: this.weaponSystem.swingPhase,
        moving, phase: t, run, dt, throwP: act.throw, flinch: act.flinch,
      });
    }
  }

  _updateModeLogic(dt) {
    if (!this._mode || this.state !== 'playing') return;

    // ─── DEATHMATCH ─────────────────────────────────────────────────────────────
    if (this._isDM) {
      this.dmManager.update(dt);
      // Net-driven matches get their roster/timer resynced from the real
      // server via _onNetState; otherwise fall back to the local simulation.
      if (!this._netDriven) this.serverSim.update(dt);
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

  _spawnMenuBots() {
    if (this._menuBotsActive) return;
    this._menuBotsActive = true;
    this.botManager.spawnAll(6, true, 1);
    for (const bot of this.botManager.bots) {
      bot._provoked = false;
      bot._provokeTimer = 0;
    }
  }

  _clearMenuBots() {
    if (!this._menuBotsActive) return;
    this._menuBotsActive = false;
    this.botManager.clear();
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

    // Spectator bots — visible running around the map during the home screen.
    if (this.state === 'menu' && !this._menuBotsActive) this._spawnMenuBots();
    if (this._menuBotsActive) {
      const dummyPlayer = { position: new THREE.Vector3(9999, 9999, 9999), isDead: true };
      this.botManager.update(dt, dummyPlayer, this.menuCamera, () => {}, this.world, false);
    }

    // Continuous map-wide spectator fly-through. getPointAt is arc-length
    // sampled, keeping travel speed stable even when waypoint spacing varies.
    this._camTravelTime += dt;
    if (this._camTravelTime >= this._camCycleDuration) {
      this._camTravelTime %= this._camCycleDuration;
      if (this._camRoutes.length > 1) {
        this._camRouteIndex = (this._camRouteIndex + 1) % this._camRoutes.length;
        this._camWpts = this._camRoutes[this._camRouteIndex];
        this._rebuildSpectatorCurves();
      }
    }
    const u = this._camTravelTime / this._camCycleDuration;
    this._camPath.getPointAt(u, this._camPos);
    this._camLookPath.getPointAt(u, this._camLook);
    this.menuCamera.position.copy(this._camPos);
    this.menuCamera.lookAt(this._camLook);
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
