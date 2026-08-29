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
import { preloadUniversalAnimations } from '../player/UniversalAnimations.js';
import { triggerAction, tickActions, applyMeleeCarry } from '../player/Actions.js';
import { loadArmorType } from '../player/ArmorTypes.js';
import { isLowPolyId } from '../player/LowPolyModels.js';
import { cameraYawToBodyYaw } from '../player/Facing.js';
import { PLAYER_WORLD_MODEL_SCALE } from '../player/Proportions.js';
import { GrenadeSystem } from '../weapons/GrenadeSystem.js';
import { Shop } from './Shop.js';
import { Loadout } from './Loadout.js';
import { BattlePass } from './BattlePass.js';
import { getArmorSkin, ARMOR_SKINS } from '../player/ArmorSkins.js';
import { WEAPON_SKINS } from '../weapons/WeaponSkins.js';
import { MoveBridge, moveSimEnabled } from '../sim/MoveBridge.js';
import { AuthNetBridge, authNetTarget, authNetTargets } from '../net/AuthNetBridge.js';
import { findAvailableMatch } from '../net/Matchmaker.js';
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
import { isHumanSoldierReady, preloadHumanSoldier } from '../player/HumanSoldier.js';
import { preloadWeaponModels, onWeaponModelsReady, buildWeaponModel, hasLoadedWeaponModel } from '../weapons/WeaponModels.js';
import { PickupSystem } from '../world/PickupSystem.js';
import { getImportedMap, nextImportedMapId } from '../world/MapRegistry.js';
import { countLocalMatchPlayers } from './Population.js';
import { consumeThrowable } from './GameplayInput.js';
import { deathCameraPose, deathFallProgress } from '../player/DeathAnimation.js';
import { buildLeaderboardRows, buildMatchRows } from './MatchRows.js';
import {
  bloomEnabled, lowerRuntimeQuality, postFxPixelRatio, rendererPixelRatio,
  shouldReduceMenuQuality, shouldReduceRuntimeQuality,
} from './RenderQuality.js';

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
    this.renderer.setPixelRatio(rendererPixelRatio(_q, window.devicePixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.78;

    // Presentation models start after the arena decode. Starting their parsers
    // here could block the one-second connection handoff on a cold cache.
    this._presentationPreloadsStarted = false;

    const requestedMapId = new URLSearchParams(window.location.search).get('map');
    this._initialMapId = getImportedMap(requestedMapId).id;
    // The cold .evmap decode starts after the connection card hands off.
    this.world        = new World(this._initialMapId, { autoLoad: false });

    // PMREM compilation is one of the most expensive synchronous startup GPU
    // tasks. The loading overlay hides the arena anyway, so build it after the
    // real map arrives instead of delaying the loader's first paint.
    this._environmentReady = false;
    this.world.scene.environmentIntensity = 0.5;

    // ── HDR bloom post-processing ──────────────────────────────────────────
    // Makes every emissive surface — neon signs, lit windows, glowing weapon
    // skins, muzzle flashes, lamps — bleed light for a cinematic glow.
    // Medium/low render directly and do not need several full-screen bloom
    // targets. Allocate the composer lazily only when High quality requests it.
    this.composer = null;
    this.renderPass = null;
    this.bloomPass = null;
    this._bloomEnabled = false;
    if (bloomEnabled(_q)) this._buildPostFX();
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
    this.survivalManager = new SurvivalManager();
    this.dmManager       = new DeathmatchManager();
    this.serverSim       = null; // built once the HUD exists (see below)
    this._activeManager  = this.botManager;  // switches between botManager / zombieManager
    this._isSurvival     = false;
    this._isDM           = false;
    this._playerDowned   = false;
    this._respawnRemaining = 0;
    this._respawnDeadline = 0;
    this._deathAnimT = 0;
    this._deathSide = 1;
    this._deathCameraBasePos = new THREE.Vector3();
    this._deathCameraBaseRot = new THREE.Euler();
    this._pendingCoins   = 0;   // fractional coin accumulator for survival
    this.input        = new InputManager(canvas);
    this.mobileControls = this.input.isMobile
      ? new MobileControls(this.input, { onMenu: () => this._openMenu() })
      : null;
    this.hud            = new HUD();
    this.damageNumbers  = new DamageNumbers();
    this.nameplates     = new Nameplates();
    // Reused by both active and menu simulation; do not allocate closures or
    // temporary player vectors in the 60Hz loop.
    this._damageCallback = (dmg, from) => this._onPlayerDamaged(dmg, from);
    this._noopCallback = () => {};
    this._menuDummyPlayer = {
      position: new THREE.Vector3(9999, 9999, 9999),
      isDead: true,
    };
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
    this.grenadeSystem  = new GrenadeSystem(this.world.scene, this.audio);
    this.pickupSystem = null; // created on first play, cleared on restart
    this.menu           = new MenuUI();

    // The menu background is a first-person spectator POV, not a fixed hero
    // shot. Match the playable camera's wider spatial feel.
    this.menuCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300);

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
    this._camPreviousPos = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0);
    this._camStallTime = 0;
    this._camFadeIn = 0;
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
    document.getElementById('boot-retry')?.addEventListener('click', () => {
      this._startupReadyPromise = this._runConnectSequence();
    });
    // Match entry awaits this exact promise. The menu is initialized before
    // the arena decode so the fly-through can appear promptly, but a Play
    // click must not spawn combatants from World's temporary origin fallback.
    this._startupReadyPromise = this._runConnectSequence();
  }

  // Release all global event listeners and cancel the render loop.
  dispose() {
    cancelAnimationFrame(this._rafId);
    this.input.dispose();
    this.renderer.dispose();
    this.botManager.clear();
    this.zombieManager.clear();
  }

  _startPresentationPreloads(onProgress = null) {
    if (this._presentationPreloadsStarted) return this._presentationPreloadPromise || Promise.resolve();
    this._presentationPreloadsStarted = true;
    const swapPreview = () => {
      const wasVisible = this.previewCharacter?.visible ?? false;
      this._rebuildPreviewCharacter();
      this.previewCharacter.visible = wasVisible;
      if (isHumanSoldierReady() && this.state === 'playing'
          && this._playerBody && !this._playerBody.userData?.isHuman
          && !isLowPolyId(this.selectedArmorType)) {
        this._rebuildPlayerBody(this.selectedArmorType, true);
      }
      if (this._menuBotsActive) {
        this._clearMenuBots();
        this._spawnMenuBots();
      }
    };
    const idlePause = () => new Promise((resolve) => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(resolve, { timeout: 750 });
      else setTimeout(resolve, 100);
    });
    const loadStage = (label, starter) => new Promise((resolve) => {
      let advanced = false;
      let applied = false;
      const advance = () => {
        if (advanced) return;
        advanced = true;
        resolve();
      };
      const ready = () => {
        if (!applied) {
          applied = true;
          swapPreview();
          onProgress?.(label);
        }
        advance();
      };
      // A missing optional asset must not prevent the remaining fallbacks from
      // loading. A late success still applies even after this stage advances.
      const timeout = setTimeout(advance, 8000);
      try { starter(() => { clearTimeout(timeout); ready(); }); }
      catch (error) {
        clearTimeout(timeout);
        console.warn(`[startup] optional ${label} preload failed`, error);
        advance();
      }
    });
    const stages = [
      ['player', preloadHumanSoldier],
      ['weapons', (ready) => { onWeaponModelsReady(ready); preloadWeaponModels(); }],
      ['animations', preloadUniversalAnimations],
      ['models', preloadPlayerModel],
      ['armor', preloadSpartanModel],
    ];
    // Loading every GLB and the 6 MB animation library simultaneously caused
    // parse spikes while the menu/game was already rendering. One idle-paced
    // stage at a time keeps bandwidth and main-thread work predictable.
    this._presentationPreloadPromise = (async () => {
      for (const [label, starter] of stages) {
        await idlePause();
        await loadStage(label, starter);
      }
    })();
    return this._presentationPreloadPromise;
  }

  _schedulePresentationPreloads() {
    if (this._presentationPreloadsStarted || this._presentationPreloadScheduled) return;
    this._presentationPreloadScheduled = true;
    const start = () => {
      this._presentationPreloadScheduled = false;
      // These assets improve presentation, but every system has an immediate
      // procedural fallback. Load them only after the menu is usable.
      this._startPresentationPreloads().catch((error) => {
        console.warn('[startup] optional presentation preload failed', error);
      });
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 2200 });
    else setTimeout(start, 500);
  }

  _ensureEnvironment() {
    if (this._environmentReady) return;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.world.scene.environment = pmrem.fromScene(new RoomEnvironment(0.35)).texture;
    pmrem.dispose();
    this._environmentReady = true;
  }

  // ── Connect sequence ─────────────────────────────────────────────────────────

  // Match ev.io's cold-open handoff: a brief engine connection card gives way
  // to the arena card, which stays up until the real map is ready. The old
  // sequence held both cards on unrelated multi-second timers.
  _setStartupProgress(status, progress, detail = status) {
    const value = Math.max(0, Math.min(100, Math.round(progress)));
    const screen = document.getElementById('connect-screen');
    const statusEl = document.getElementById('boot-status');
    const detailEl = document.getElementById('boot-detail');
    const percentEl = document.getElementById('boot-percent');
    const fill = document.getElementById('boot-progress-fill');
    const bar = screen?.querySelector('.boot-progress');
    if (statusEl) statusEl.textContent = status;
    if (detailEl) detailEl.textContent = detail;
    if (percentEl) percentEl.textContent = `${value}%`;
    if (fill) fill.style.width = `${value}%`;
    bar?.setAttribute('aria-valuenow', String(value));
  }

  _showStartupError(error) {
    const screen = document.getElementById('connect-screen');
    screen?.classList.remove('hidden', 'fade-out');
    screen?.classList.add('boot-error');
    this._setStartupProgress('CONNECTION FAILED', this._startupProgress || 0,
      String(error?.message || error || 'Unable to finish loading').slice(0, 96));
    document.getElementById('boot-retry')?.classList.remove('hidden');
  }

  async _runConnectSequence() {
    if (this._startupInFlight) return;
    this._startupInFlight = true;
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const connectScreen = document.getElementById('connect-screen');
    connectScreen?.classList.remove('hidden', 'fade-out', 'boot-error');
    document.getElementById('boot-retry')?.classList.add('hidden');
    this._startupProgress = 0;
    this._setStartupProgress('INITIALIZING...', 0, 'Starting engine...');
    try {
      await delay(70); // guarantee the first-paint loader reaches the screen
      this._startupProgress = 10;
      this._setStartupProgress('LOADING GAME...', 10, 'Loading player session...');

      const targets = authNetTargets();
      this._startupProgress = 22;
      this._setStartupProgress(targets.length ? 'CONNECTING...' : 'LOADING GAME...', 22,
        targets.length ? 'Finding an available server...' : 'Preparing local match...');
      const match = targets.length ? await findAvailableMatch(targets) : null;
      if (match) {
        this._selectedAuthNetUrl = match.url;
        this._selectedMatch = match;
        if (match.mapId) {
          this._initialMapId = getImportedMap(match.mapId).id;
          this.world._initialMapId = this._initialMapId;
        }
      }

      this._startupProgress = 72;
      this._setStartupProgress('LOADING GAME...', 72, 'Preparing gameplay systems...');
      this._startupProgress = 92;
      this._setStartupProgress('PREPARING MATCH...', 92, 'Preparing menu and match systems...');
      this._initAuth();
      await delay(80);
      this._startupProgress = 100;
      this._setStartupProgress('READY', 100, 'Game systems ready');

      // Startup and arena loading are two real stages. The branded shell owns
      // scripts/session/models; the map card then owns the actual geometry
      // decode. Keeping the card visible before starting the decode prevents a
      // black canvas or an already-finished menu from flashing underneath.
      this._showMapLoading('deathmatch', this._initialMapId, { autoHide: false });
      this._setMapLoadingPhase('Waiting for arena stream...', 8);
      await delay(80);
      connectScreen?.classList.add('fade-out');
      await delay(240);
      connectScreen?.classList.add('hidden');

      this._setMapLoadingPhase('Loading arena geometry...', 24);
      const map = await this.world.startInitialLoad();
      this._setMapLoadingPhase('Building collision and spawn data...', 76);
      this._ensureEnvironment();
      this.previewCharacter.position.copy(this.world.previewPedestalPos);
      this._configureMapCamera(map);
      this._setMapLoadingPhase('Preparing arena presentation...', 92);
      await this._finishMapLoading(650);
      this._schedulePresentationPreloads();
    } catch (error) {
      console.error('[startup] load failed', error);
      // A rejected map promise must be cleared so RETRY performs a new fetch.
      if (!this.world.currentMap) this.world.ready = null;
      this._hideMapLoading();
      this._showStartupError(error);
    } finally {
      this._startupInFlight = false;
    }
  }

  _configureMapCamera(map) {
    // Imported routes are authored from valid player viewpoints. Float along
    // every lane, then briefly dissolve between lanes so touring the complete
    // arena never exposes a camera cut or crosses solid map geometry.
    if (map.spectatorRoutes?.length) {
      this._camRoutes = map.spectatorRoutes
        .map((route) => route.filter((waypoint, index) => (
          index === 0 || waypoint.p.distanceToSquared(route[index - 1].p) > 0.25
        )))
        .filter((route) => route.length >= 4);
      if (!this._camRoutes.length) return this._configureMapCamera({ ...map, spectatorRoutes: null });
      this._camRouteIndex = 0;
      this._camWpts = this._camRoutes[0];
      this._camTravelTime = 0;
      this._camFadeIn = 0;
      this.canvas.style.opacity = '1';
      this._rebuildSpectatorCurves();
      this.menuCamera.far = 600;
      this.menuCamera.updateProjectionMatrix();
      return;
    }
    // Fallback for maps without authored safe lanes. Use the authored playable
    // bounds; imported maps also contain enormous
    // decorative sky/fog meshes and off-map collision shells; including those
    // would push the camera kilometres away from the actual arena.
    const bounds = map.bounds;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const pad = Math.max(18, Math.min(size.x, size.z) * 0.08);
    const height = Math.max(30, bounds.max.y + 18);
    const lowHeight = Math.max(24, bounds.max.y + 10);
    const tx = Math.max(12, size.x * 0.18);
    const tz = Math.max(12, size.z * 0.18);
    const targetY = THREE.MathUtils.clamp(12, bounds.min.y + 6, bounds.max.y - 5);
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
    const pathLength = this._camPath.getLength();
    this._camCycleDuration = closed
      ? THREE.MathUtils.clamp(pathLength / 7, 32, 90)
      : THREE.MathUtils.clamp(pathLength / 3.5, 4, 8);
    this._camStallTime = 0;
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
    if (username) {
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
    this._setRuntimeQuality(q, true);

    // accessibility → runtime (visuals are CSS-driven; these are the 3D + audio bits)
    const rm = GameSettings.get('reduceMotion');
    this.player.reduceMotion = rm;
    if (this.hud) {
      this.hud.reduceMotion  = rm;
      this.hud.reduceFlashes = GameSettings.get('reduceFlashes');
      this.hud.hitSound      = GameSettings.get('hitSound');
    }
  }

  _setRuntimeQuality(quality, resetMonitor = false) {
    this._runtimeQuality = quality;
    this.renderer.setPixelRatio(rendererPixelRatio(quality, window.devicePixelRatio));
    const wantsBloom = bloomEnabled(quality);
    if (wantsBloom && !this.composer) this._buildPostFX();
    this.composer?.setPixelRatio(postFxPixelRatio(quality, window.devicePixelRatio));
    this._bloomEnabled = wantsBloom;
    const monitorGrace = this.state === 'playing' ? 8 : 1.5;
    if (resetMonitor || !this._perfMonitor) {
      this._perfMonitor = { grace: monitorGrace, elapsed: 0, frames: 0, slow: 0 };
    } else {
      this._perfMonitor.grace = this.state === 'playing' ? 5 : 1;
      this._perfMonitor.elapsed = this._perfMonitor.frames = this._perfMonitor.slow = 0;
    }
  }

  _sampleRuntimePerformance(rawDt) {
    const monitor = this._perfMonitor;
    const isPlaying = this.state === 'playing';
    const isSpectating = this.state === 'menu';
    if (!monitor || (!isPlaying && !isSpectating) || this._authoritativeMapTransitioning
      || rawDt <= 0 || rawDt >= 2 || this._runtimeQuality === 'low') return;
    if (monitor.grace > 0) {
      monitor.grace = Math.max(0, monitor.grace - rawDt);
      return;
    }
    // Cap a single parser/GC pause so one optional asset cannot lower quality,
    // while sustained slow spectator frames still accumulate and react.
    monitor.elapsed += Math.min(rawDt, 0.25);
    monitor.frames += 1;
    if (rawDt > 0.025) monitor.slow += 1;
    const sampleReady = isPlaying
      ? monitor.elapsed >= 3 && monitor.frames >= 30
      : monitor.elapsed >= 1.5 && monitor.frames >= 8;
    if (!sampleReady) return;
    const shouldReduce = isPlaying
      ? shouldReduceRuntimeQuality(monitor.elapsed, monitor.frames, monitor.slow)
      : shouldReduceMenuQuality(monitor.elapsed, monitor.frames, monitor.slow);
    if (shouldReduce) {
      this._setRuntimeQuality(lowerRuntimeQuality(this._runtimeQuality));
      return;
    }
    monitor.elapsed = monitor.frames = monitor.slow = 0;
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
    this.grenadeSystem.onSelfDamage = (damage, point) => {
      // In an authoritative match the server applies grenade damage. Running
      // the local copy too would double-hit and let a client decide its death.
      if (this._authNet?.ready) return;
      this._onPlayerDamaged(damage, point);
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
    this.menu.onPlay = async (name, skinId, modeId, armorTypeId) => {
      if (this._joinInFlight) return;
      this._joinInFlight = true;
      try {
        await this._startupReadyPromise;
        // A failed map load owns its visible RETRY state. Do not create a
        // match against the one-point construction fallback underneath it.
        if (!this.world.currentMap) return;
        if (!this.currentUsername || UserAccount.isGuest()) {
          if (!UserAccount.isGuest()) UserAccount.guest();
          this._onAuth('__guest__');
          name = UserAccount.getDisplayName('__guest__');
        }
        const publicMode = ['deathmatch', 'teamslayer', 'ctf', 'koth'].includes(modeId);
        if (publicMode && authNetTargets().length) {
          await this._prepareAuthoritativeMatch(name, modeId);
        }
        this._startGame(name, skinId, modeId, armorTypeId);
      } catch (error) {
        console.error('[matchmaker] join failed', error);
        this._showServerJoinError(error.message);
      } finally {
        this._joinInFlight = false;
      }
    };
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
      this._setRuntimeQuality(s.quality, true);
      // Apply the heavy toggles live so a quality drop gives immediate relief
      // (bloom + shadows). The decorative light budget is baked at world build,
      // so the lighting part of the change takes full effect on the next reload.
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

  _rebuildPlayerBody(armorTypeId = this.selectedArmorType, preserveVisibility = false) {
    const wasVisible = preserveVisibility && !!this._playerBody?.visible;
    if (this._playerBody) this.world.scene.remove(this._playerBody);
    this._playerBody = buildPreviewCharacter(
      this.selectedSkin, armorTypeId || 'vanguard', this.selectedArmorSkin
    );
    // The human Soldier animates through its skeleton; connected arena bodies
    // use the shared limb-pivot rig and full-mesh RifleCarry solver.
    if (!this._playerBody.userData?.isHuman) rigCharacterLimbs(this._playerBody);
    this._playerBody.scale.setScalar(PLAYER_WORLD_MODEL_SCALE);
    this._playerBody.userData.worldModelScale = PLAYER_WORLD_MODEL_SCALE;
    this._playerBody.rotation.order = 'YXZ';
    this._playerBody.visible = wasVisible;
    this._tpsWeaponId = null;
    this._tpsWeaponMesh = null;
    this._tpsAnimPrev = null;
    this._tpsAnimSpeed = this._tpsAnimVX = this._tpsAnimVZ = 0;
    this.world.scene.add(this._playerBody);
  }

  _startGame(name, skinId, modeId = 'deathmatch', armorTypeId) {
    this.canvas.style.opacity = '1';
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
    this._respawnRemaining = 0;
    this._respawnDeadline = 0;
    this._resetDeathAnimation();

    // Mode-specific setup
    this._isDM       = ['deathmatch', 'teamslayer', 'ctf', 'koth'].includes(modeId);
    this._isSurvival = modeId === 'survival';
    const expectsAuth = this._isDM && !!(this._selectedAuthNetUrl || authNetTarget());

    this.hud.hideDMTimer();
    this.hud.hideDowned();
    this.hud.hideRespawn();
    this.hud.hideModeHUD();
    this.hud.hideWaveBonus();   // only survival shows it
    this.nameplates.clear();
    this.waveBanner?.classList?.add('hidden');
    // The preview already shows this loaded map. A loading card is reserved
    // for a real authoritative map transition, where the server-provided map
    // id is known and cannot disagree with the card.
    this._hideMapLoading();

    if (this._isDM) {
      this._activeManager = this.botManager;
      this.zombieManager.clear();
      this.dmManager.reset();
      this._netSlots.clear();
      if (expectsAuth) {
        // Never run a second local roster underneath authoritative snapshots.
        // That duplicate roster caused bots to pop, attack during join, then
        // disappear as soon as the server welcome arrived.
        this.botManager.clear();
        this.serverSim.stop();
        this._netDriven = true;
        this._modeTimer = 480;
        if (!this._authNet?.ready) this._showServerJoining(modeId);
      } else {
        this.botManager.spawnAll(MAX_PLAYERS - 1, false, 1);
        this.player.respawn(this.world.safeSpawnPoint(this.botManager.bots));
        this._netDriven = this.net.connected;
      }
      if (!expectsAuth && this._netDriven) {
        this.net.sendHello(name);
        this._modeTimer = (this.net.matchStart != null)
          ? THREE.MathUtils.clamp(this.net.matchDurationMs / 1000 - (Date.now() - this.net.matchStart) / 1000, 0, this.net.matchDurationMs / 1000)
          : 480;
        this._applyNetRoster(this.net.roster);
      } else if (!expectsAuth) {
        this._modeTimer = 480; // 8 minutes
        this.serverSim.start(false, 1);
      }
      this.hud.showServerPop(true);
      // (re)create pickup system for fresh match
      this.pickupSystem?.dispose();
      this.pickupSystem = this._createPickupSystem();
      const _mm = Math.floor(this._modeTimer / 60), _ss = Math.floor(this._modeTimer % 60);
      this.hud.showDMTimer(`${_mm}:${String(_ss).padStart(2, '0')}`);
    } else if (this._isSurvival) {
      // Firefight has a long opening grace period, so fetch its optional model
      // only when that mode is selected instead of taxing every visitor.
      preloadZombieModel();
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
      this.pickupSystem = this._createPickupSystem();
      this._refreshModeHUD();
    }

    this.previewCharacter.visible = false;
    this.menu.hideMain();
    this.menu.hideGameOver();
    this.hud.show();
    this.hud.buildWeaponSlots(this.weaponSystem.getHudInfo().slots, 0);

    // Build a third-person body matching the selected kit. Slow optional art
    // gets the connected Hero fallback and is hot-upgraded by swapPreview().
    this._rebuildPlayerBody(armorTypeId || this.selectedArmorType || 'vanguard');

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
    if (!mapId) return Promise.resolve(null);
    if (Number.isFinite(match.start) && Number.isFinite(match.durationMs)) {
      const remaining = match.durationMs / 1000 - (Date.now() - match.start) / 1000;
      this._modeTimer = THREE.MathUtils.clamp(remaining, 0, match.durationMs / 1000);
    }
    this._authoritativeMapTarget = mapId;
    this._pendingMapId = mapId;
    if (mapId === this.world.currentMapId && !this._authoritativeMapTransitioning) {
      return Promise.resolve(this.world.currentMap);
    }
    if (this._authoritativeMapPromise) return this._authoritativeMapPromise;

    // The dedicated room is continuous. Loading the new arena immediately is
    // essential: keeping the old mesh behind a results screen while applying
    // new-map server coordinates causes void spawns, wrong labels and jitter.
    this._authoritativeMapPromise = (async () => {
      this._authoritativeMapTransitioning = true;
      this.hud?.hideLeaderboard?.();
      if (this.state === 'leaderboard') this.state = 'playing';
      try {
        while (this.world.currentMapId !== this._authoritativeMapTarget) {
          const target = this._authoritativeMapTarget;
          await this._activateMap(target);
        }
        this._authNet?.client?.resetPresentation?.();
        this.weaponSystem?.resetMotionState?.();
        this._resetDeathAnimation?.();
        return this.world.currentMap;
      } finally {
        this._authoritativeMapTransitioning = false;
        this._pendingMapId = null;
        this._authoritativeMapPromise = null;
      }
    })();
    return this._authoritativeMapPromise;
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
    return buildMatchRows({
      authClient: this._authNet?.ready ? this._authNet.client : null,
      playerName: this.player.name,
      playerKills: this.kills,
      playerDeaths: this.deaths,
      playerScore: this.score,
      bots: this.botManager?.bots || [],
      isSurvival: this._isSurvival,
    });
  }

  // ── Post-match leaderboard ───────────────────────────────────────────────────

  _showLeaderboard() {
    this.serverSim?.stop();
    this._saveStats();
    this._menuOpen = false;
    if (this._scopeOverlay) this._scopeOverlay.classList.remove('active');
    if (this._hudCrosshair) this._hudCrosshair.classList.remove('hidden');

    // AuthNetBridge clears BotManager on welcome, so the results screen must
    // consume the same complete server roster as the live scoreboard.
    const rows = buildLeaderboardRows(this._buildScoreboardRows());
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

  _updateLeaderboard(dt, cameraDt = dt) {
    // Bots and cinematic camera keep running during the scoreboard
    this._activeManager.update(dt, this.player, this.player.camera, () => {});
    this.deathEffects.update(dt);
    this._updateMenuScene(dt, cameraDt);

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
  _showServerJoining(modeId) {
    const el = document.getElementById('map-loading');
    if (!el) return;
    const name = el.querySelector('.ml-name');
    if (name) name.textContent = 'JOINING MATCH';
    const building = document.getElementById('ml-building');
    if (building) building.textContent = 'Finding an available match...';
    const region = document.getElementById('ml-region');
    if (region) region.textContent = 'kryx.live';
    const mode = document.getElementById('ml-mode');
    if (mode) mode.textContent = modeId === 'teamslayer' ? 'Team Slayer' : 'Deathmatch';
    const players = document.getElementById('ml-players');
    if (players) players.textContent = 'Syncing players...';
    const tip = document.getElementById('ml-tip');
    if (tip) tip.textContent = 'Connecting to the authoritative arena';
    clearTimeout(this._mlTimer1); clearTimeout(this._mlTimer2);
    clearTimeout(this._serverJoinTimer);
    this._serverJoinShownAt = performance.now();
    el.classList.remove('hidden', 'ml-fade', 'ml-arena-ready');
    this._setMapLoadingPhase('Finding an available match...', 12);
  }

  _showServerJoinError(message = 'No public server is available') {
    const el = document.getElementById('map-loading');
    if (!el) return;
    const name = el.querySelector('.ml-name');
    if (name) name.textContent = 'SERVER UNAVAILABLE';
    const building = document.getElementById('ml-building');
    if (building) building.textContent = 'Could not join a public match';
    const region = document.getElementById('ml-region');
    if (region) region.textContent = String(message).slice(0, 80);
    const players = document.getElementById('ml-players');
    if (players) players.textContent = 'Try again in a moment';
    clearTimeout(this._serverJoinTimer);
    el.classList.remove('hidden', 'ml-fade', 'ml-arena-ready');
    this._setMapLoadingPhase('Could not join a public match', 0);
    this._serverJoinTimer = setTimeout(() => this._hideMapLoading(), 3500);
  }

  async _prepareAuthoritativeMatch(name, modeId) {
    this._showServerJoining(modeId);
    const match = await findAvailableMatch(authNetTargets());
    if (!match?.url) throw new Error('No public server is available');
    this._selectedAuthNetUrl = match.url;
    this._selectedMatch = match;
    this.player.name = name;
    this._authNet?.disconnect?.();
    this._authNet = new AuthNetBridge(this, match.url);
    const timeout = new Promise((_, reject) => {
      this._authJoinTimer = setTimeout(() => reject(new Error('The selected server did not answer')), 10000);
    });
    try {
      await Promise.race([this._authNet.readyPromise, timeout]);
    } catch (error) {
      this._authNet?.disconnect?.();
      this._authNet = undefined;
      throw error;
    } finally {
      clearTimeout(this._authJoinTimer);
    }
  }

  _finishServerJoining() {
    const elapsed = performance.now() - (this._serverJoinShownAt || 0);
    clearTimeout(this._serverJoinTimer);
    this._serverJoinTimer = setTimeout(() => this._hideMapLoading(), Math.max(0, 1800 - elapsed));
  }

  _showMapLoading(modeId, mapId = this.world.currentMapId, { autoHide = true } = {}) {
    const el = document.getElementById('map-loading');
    if (!el) return;
    const map = getImportedMap(mapId);
    const building = document.getElementById('ml-building');
    if (building) building.textContent = 'Loading arena geometry...';
    const TIPS = [
      'TIP: press Q to blink-teleport forward',
      'TIP: hold TAB to check the scoreboard mid-match',
      'TIP: G throws a frag grenade, F throws smoke',
      'TIP: headshots deal bonus damage — aim high',
      'TIP: grav-lifts by the plaza launch you onto the rooftops',
      'TIP: rarer skins earn more coins per kill',
    ];
    const modeNames = {
      deathmatch: 'Deathmatch', teamslayer: 'Team Slayer', ctf: 'Capture the Flag',
      koth: 'King of the Hill', survival: 'Firefight',
    };
    const name = el.querySelector('.ml-name');
    if (name) name.textContent = map.name.toUpperCase();
    const region = document.getElementById('ml-region');
    if (region) region.textContent = map.region;
    const mode = document.getElementById('ml-mode');
    if (mode) mode.textContent = modeNames[modeId] || 'Deathmatch';
    const players = document.getElementById('ml-players');
    if (players) {
      const count = this._selectedMatch?.players;
      const capacity = this._selectedMatch?.capacity || MAX_PLAYERS;
      players.textContent = Number.isFinite(count) ? `${count} / ${capacity} players` : `${capacity} players`;
    }
    const tip = document.getElementById('ml-tip');
    if (tip) tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];

    clearTimeout(this._mlTimer1); clearTimeout(this._mlTimer2);
    this._mapLoadingSequence = (this._mapLoadingSequence || 0) + 1;
    this._mapLoadingShownAt = performance.now();
    el.classList.remove('hidden', 'ml-fade', 'ml-arena-ready');
    this._setMapLoadingPhase('Loading arena geometry...', 46);
    if (autoHide) {
      this._mlTimer1 = setTimeout(() => el.classList.add('ml-fade'), 2600);
      this._mlTimer2 = setTimeout(() => el.classList.add('hidden'), 3300);
    }
  }

  async _finishMapLoading(minimumDisplayMs = 0) {
    const el = document.getElementById('map-loading');
    if (!el) return;
    const sequence = this._mapLoadingSequence;
    this._setMapLoadingPhase('Arena ready', 100, true);
    const elapsed = performance.now() - (this._mapLoadingShownAt || 0);
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await delay(Math.max(0, minimumDisplayMs - elapsed));
    if (sequence !== this._mapLoadingSequence) return;
    el.classList.add('ml-fade');
    await delay(320);
    if (sequence === this._mapLoadingSequence) el.classList.add('hidden');
  }

  _hideMapLoading() {
    clearTimeout(this._mlTimer1); clearTimeout(this._mlTimer2);
    clearTimeout(this._serverJoinTimer);
    this._mapLoadingSequence = (this._mapLoadingSequence || 0) + 1;
    document.getElementById('map-loading')?.classList.add('hidden');
  }

  _setMapLoadingPhase(label, progress, ready = false) {
    const el = document.getElementById('map-loading');
    const status = document.getElementById('ml-building');
    const fill = document.getElementById('ml-progress-fill');
    if (status) status.textContent = label;
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    el?.classList.toggle('ml-arena-ready', ready);
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
    this._authNet?.disconnect?.();
    this._authNet = undefined;
    this._netDriven = false;
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
    this.hud.hideRespawn();
    this.input.exitPointerLock();
    this.botManager.clear();
    this.zombieManager.clear();
    this.pickupSystem?.dispose();
    this.pickupSystem = null;
    this._playerDowned = false;
    this._respawnRemaining = 0;
    this._respawnDeadline = 0;
    this.menu.showMain();
  }

  async _activateMap(mapId) {
    if (!mapId || mapId === this.world.currentMapId) {
      this._pendingMapId = null;
      return this.world.currentMap;
    }
    this.pickupSystem?.dispose();
    this.pickupSystem = null;
    this._showMapLoading(this._mode?.id || 'deathmatch', mapId, { autoHide: false });
    try {
      const map = await this.world.loadMap(mapId);
      this._configureMapCamera(map);
      this.previewCharacter.position.copy(this.world.previewPedestalPos);
      if (this.state === 'playing') {
        this.pickupSystem = this._createPickupSystem();
      }
      await this._finishMapLoading(1800);
      this._pendingMapId = null;
      return map;
    } catch (error) {
      this._pendingMapId = null;
      this._hideMapLoading();
      throw error;
    }
  }

  async _restart() {
    if (this._restartInFlight) return this._restartInFlight;
    this._restartInFlight = this._restartOnNextMap();
    try {
      return await this._restartInFlight;
    } finally {
      this._restartInFlight = null;
    }
  }

  async _restartOnNextMap() {
    this._saveStats();
    this.hud.hideLeaderboard();
    this.menu.hideGameOver();
    const authoritativeMapId = this._pendingMapId
      || (this._authNet?.ready ? this._authNet.client?.mapId : null)
      || (this.net?.connected ? this.net.mapId : null);
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
    // Respawn is a new-life boundary, not only a HUD refresh. Reset ammo,
    // reload timers, recoil and switch state after dropping any map pickup so
    // dying mid-reload cannot resume a hidden partial action in the next life.
    this.weaponSystem.resetState(this.player.baseFov);
    this.hud.buildWeaponSlots(this.weaponSystem.getHudInfo().slots, 0);
  }

  _createPickupSystem() {
    const authClient = this._authNet?.ready ? this._authNet.client : null;
    return new PickupSystem(this.world.scene, this.world.weaponSpawnPoints, {
      lootPads: authClient?.lootPads || null,
      onPickupRequest: authClient
        ? (padId) => authClient.sendPickup?.(padId)
        : null,
    });
  }

  _dropLifePickups() {
    this.player.setMaxShield(this.selectedArmorSkin?.shield || 0);
    this._resetLoadoutHud();
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

    // A death ends the current pickup inventory immediately. The permanent
    // menu-selected main gun and sword are rebuilt by resetLoadout(); temporary
    // loot guns and every stacked shield are gone before the respawn begins.
    this._dropLifePickups();

    // Deathmatch: keep the live match/camera active during the automatic
    // respawn. Opening the full navigation GUI here made headless and
    // backgrounded tabs throttle requestAnimationFrame so heavily that a
    // three-second gameplay countdown could take more than ten wall seconds.
    // The dedicated respawn overlay is the death UI; the player may still open
    // the navigation manually with Escape.
    this._beginDeathAnimation();
    if (this._isDM) {
      this.hud.addKillFeed(`YOU DIED — respawning in ${RESPAWN_DELAY}s`);
      clearTimeout(this._respawnTimer);
      this._respawnRemaining = RESPAWN_DELAY;
      this._respawnDeadline = performance.now() + RESPAWN_DELAY * 1000;
      this.hud.showRespawn(this._respawnRemaining);
      this.weaponSystem.resetMotionState();
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
    this.player.setMaxShield(this.selectedArmorSkin?.shield || 0);
    this.player.respawn(point);
    this.weaponSystem.resetMotionState();
    this._resetLoadoutHud();   // drop any picked-up power weapon
    // Match the authoritative room's clean-life ability contract without
    // deleting smoke/explosion presentation that is still active in the map.
    this.grenadeSystem.refillInventory?.();
    this.hud.updateGrenades(this.grenadeSystem.frags, this.grenadeSystem.smokes);
    this._respawnRemaining = 0;
    this._respawnDeadline = 0;
    this._resetDeathAnimation();
    this.hud.hideRespawn();
    this.hud.addKillFeed('RESPAWNED');
  }

  // The authoritative room owns the actual respawn tick. These callbacks only
  // drive presentation and input lock across the dead/alive transition.
  _onAuthoritativeDeath(self) {
    this.deaths = self?.deaths ?? (this.deaths + 1);
    this.matchStats.currentStreak = 0;
    this._respawnRemaining = RESPAWN_DELAY;
    this._respawnDeadline = 0;
    this._beginDeathAnimation();
    this._dropLifePickups();
    // The dedicated overlay is the death UI. Opening the navigation menu here
    // released pointer lock, obscured the match, and made the authoritative
    // path disagree with local deathmatch behavior.
    this.hud.showRespawn(this._respawnRemaining);
    this.hud.addKillFeed(`YOU DIED — respawning in ${RESPAWN_DELAY}s`);
    this.weaponSystem.resetMotionState();
  }

  _onAuthoritativeRespawn(self) {
    this.deaths = self?.deaths ?? this.deaths;
    this._respawnRemaining = 0;
    this._respawnDeadline = 0;
    this._resetDeathAnimation();
    this.player.velocity.set(0, 0, 0);
    this.player.isSprinting = false;
    this.player.setMaxShield(self?.maxShield ?? (this.selectedArmorSkin?.shield || 0));
    this._resetLoadoutHud();
    this.weaponSystem.resetMotionState();
    this.hud.hideRespawn();
    this.hud.addKillFeed('RESPAWNED');
  }

  _beginDeathAnimation() {
    this._deathAnimT = 0;
    this._deathSide *= -1;
    this._deathCameraBasePos.copy(this.player.camera.position);
    this._deathCameraBaseRot.copy(this.player.camera.rotation);
  }

  _resetDeathAnimation() {
    this._deathAnimT = 0;
    this.player.camera.rotation.z = 0;
    if (this._playerBody) {
      this._playerBody.rotation.x = 0;
      this._playerBody.rotation.z = 0;
      this._playerBody.userData?.setDeathState?.(0, this._deathSide);
    }
  }

  _applyDeathCamera(dt) {
    this._deathAnimT += dt;
    if (this.player._camDist > 0) return;
    const pose = deathCameraPose(this._deathAnimT, this._deathSide);
    this.player.camera.position.copy(this._deathCameraBasePos);
    this.player.camera.position.y -= pose.drop;
    this.player.camera.rotation.set(
      this._deathCameraBaseRot.x + pose.pitch,
      this._deathCameraBaseRot.y,
      pose.roll,
      'YXZ',
    );
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
    this.hud.hideRespawn();
    this.menu.showGameOver(
      { kills: this.kills, score: this.score, time: Math.floor(this.playTime) },
      subtitle ? `${title} — ${subtitle}` : title
    );
  }

  // ── Post-processing (bloom) ──────────────────────────────────────────────

  _buildPostFX() {
    if (this.composer) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.composer = new EffectComposer(this.renderer);
    const quality = GameSettings.get('quality');
    this.composer.setPixelRatio(postFxPixelRatio(quality, window.devicePixelRatio));
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
    this._bloomEnabled = bloomEnabled(quality);
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
      const url = this._selectedAuthNetUrl || authNetTarget();
      this._authNet = url ? new AuthNetBridge(this, url) : null;
    }
    // Dead players are frozen where they fell until the respawn timer fires —
    // clicking back in early shouldn't let a corpse run around and shoot.
    let dead = this.player.isDead && !this._playerDowned;
    if (this._authNet && this._authNet.ready) {
      // Menus are presentation only. Keep receiving server snapshots behind
      // them so the world and automatic respawn continue, but send neutral
      // controls while the full navigation GUI owns the mouse and keyboard.
      this._authNet.update(dt, this.input, !menuOpen && !dead);
    } else if (!menuOpen && !dead) {
      if (!this.world.usesMeshCollision && (this._moveSimOn ?? (this._moveSimOn = moveSimEnabled()))) {
        if (!this.moveBridge) this.moveBridge = new MoveBridge(this.player, this.world);
        this.moveBridge.update(dt, this.input, this.world);
      } else {
        this.player.update(dt, this.input, this.world);
      }
    }
    if (!(this._authNet && this._authNet.ready) && !dead) {
      const crossedKillPlane = this.player.position.y < (this.world.killY ?? -25);
      const recoveredByMoveSim = !!this.moveBridge?.recoveredThisFrame;
      if (crossedKillPlane || recoveredByMoveSim) {
        this._onPlayerDamaged(this.player.health + this.player.shield + 1);
      }
    }
    // A server snapshot can change alive/dead during AuthNetBridge.update(),
    // so the render and combat gates below must use the refreshed state.
    dead = this.player.isDead && !this._playerDowned;
    if (dead) {
      // Death/respawn is a wall-clock contract, not an animation. Browsers can
      // throttle requestAnimationFrame in a background tab; decrementing by
      // clamped frame deltas made "3 seconds" take tens of seconds there.
      if (this._respawnDeadline > 0) {
        this._respawnRemaining = Math.max(0, (this._respawnDeadline - performance.now()) / 1000);
      } else {
        this._respawnRemaining = Math.max(0, this._respawnRemaining - dt);
      }
      this.hud.showRespawn(this._respawnRemaining);
      if (!(this._authNet && this._authNet.ready) && this._isDM && this._respawnRemaining <= 0) {
        this._respawnPlayer();
        dead = false;
      }
      if (dead) this._applyDeathCamera(dt);
    }
    this.player.camera.updateMatrixWorld(true);

    // Animate the living sci-fi city (flying traffic, pulsing energy).
    this.world.update(dt);

    // Gameplay is first-person-only. Clear stale camera state as an invariant,
    // not merely when a wheel event arrives: an older session/save or an
    // interrupted map transition must never hide the held gun again.
    this.player._camDist = 0;
    this.player._tpsObstructed = false;
    const inTPS = false;
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
    if (this.weaponSystem.weaponMount) this.weaponSystem.weaponMount.visible = !dead;

    // While the menu is open, downed, or dead-and-awaiting-respawn, block
    // weapon/grenade input — the match still runs.
    if (!menuOpen && !this._playerDowned && !dead) {
      this.weaponSystem.update(dt, this.input, this.world, this._activeManager, this.player);
    }
    this.deathEffects.update(dt);
    this._activeManager.update(dt, this.player, this.player.camera, this._damageCallback, this.world);
    this.pickupSystem?.update(dt, this.player, this.weaponSystem, this.hud);

    // The same G/F contract shown by the HUD. Online, the local projectile is
    // presentation; authoritative charges and damage live on the server.
    const throwable = !menuOpen && !dead ? consumeThrowable(this.input) : null;
    if (throwable) {
      const auth = this._authNet?.ready ? this._authNet.client : null;
      const serverCharges = auth?.self?.abilities?.[throwable];
      const canThrow = !auth || ((serverCharges ?? 0) > 0 && (auth.self.abilityCD ?? 0) <= 0);
      if (canThrow) {
        const field = throwable === 'frag' ? 'frags' : 'smokes';
        const had = this.grenadeSystem[field];
        if (throwable === 'frag') this.grenadeSystem.throwFrag(this.player.camera);
        else this.grenadeSystem.throwSmoke(this.player.camera);
        if (this.grenadeSystem[field] < had) {
          this._throwAnim();
          auth?.sendAbility(throwable, this.player.yaw, this.player.pitch);
        }
      }
    }
    this.grenadeSystem.update(dt, this.player, this.world);

    this.hud.update(this.player, this.weaponSystem.getHudInfo(), this.kills, this.score);
    this.hud.updateGrenades(this.grenadeSystem.frags, this.grenadeSystem.smokes);
    this.hud.setActiveSlot(this.weaponSystem.currentIndex);

    // Enemy nameplates (name + health bar) over living opponents.
    if (this.botManager?.bots?.length) {
      this.nameplates.container.style.display = '';
      this.nameplates.update(this.player.camera, this.botManager.bots, this.world);
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
  // only when the active weapon changes (gun ↔ melee switch). Human and
  // connected arena bodies use their respective gated carry solvers.
  _syncTpsWeapon() {
    const ud = this._playerBody?.userData;
    if (!ud) return;
    const def = this.weaponSystem.currentDef;
    const needsImportedRefresh = def && this._tpsWeaponMesh
      && this._tpsWeaponMesh.userData.modelSource !== 'quaternius'
      && hasLoadedWeaponModel(def.id);
    if (!def || (this._tpsWeaponId === def.id && !needsImportedRefresh)) return;
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
    const ud = this._playerBody?.userData;
    if (p.isDead && !this._playerDowned) {
      const fall = deathFallProgress(this._deathAnimT);
      if (ud?.isHuman) {
        ud.setLocomotion?.(0, true, false, 0, 1, 0);
        ud.setDeathState?.(fall, this._deathSide);
        ud.mixer?.update(dt);
        ud.armorTick?.(dt);
      }
      this._playerBody.position.set(
        p.position.x + this._deathSide * fall * 0.16,
        p.position.y - fall * 0.48,
        p.position.z,
      );
      this._playerBody.rotation.x = 0;
      this._playerBody.rotation.z = this._deathSide * fall * 1.28;
      return;
    }
    ud?.setDeathState?.(0, this._deathSide);
    this._playerBody.rotation.z = 0;
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
        move: speed > 0.6 && p.onGround ? 1 : 0,
        run: p.isSprinting ? 1 : 0,
        firing: this._tpsAimHold > 0 ? 1 : 0,
        scoped: this.weaponSystem.scopeT,
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
    // Do not stack the generic retargeted clip over the connected exosuit gait;
    // its source hip height folds this rig and separates the hands from the gun.
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
      // ev.io-style combat ready: relaxed keeps the stock tight to the right
      // shoulder with the rifle high across the chest; shooting/ADS completes
      // the small lift to level. applyRifleCarry() keeps both hands welded to
      // the grip + handguard through the whole range.
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
        move: moving ? 1 : 0, run,
        firing: this._tpsAimHold > 0 ? 1 : 0,
        scoped: this.weaponSystem.scopeT,
        smooth: true,
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
      if (this._modeTimer <= 0 && !this._netDriven) {
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
      let alive = 0;
      for (const zombie of this.zombieManager.zombies) if (zombie.alive) alive++;
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
      let alive = 0;
      for (const bot of this.botManager.bots) if (bot.alive) alive++;
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
      // Menu spectators do not need twelve always-on health-bar draw calls.
      // The bodies and weapons remain visible and animate normally.
      if (bot.healthBarGroup) bot.healthBarGroup.visible = false;
    }
  }

  _clearMenuBots() {
    if (!this._menuBotsActive) return;
    this._menuBotsActive = false;
    this.botManager.clear();
  }

  _updateMenuScene(dt, cameraDt = dt) {
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
      this.botManager.update(
        dt, this._menuDummyPlayer, this.menuCamera, this._noopCallback, this.world, false,
      );
      // A void recovery calls Bot.respawnAt(), which restores its combat HUD.
      // Keep those bars suppressed on the spectator presentation every frame.
      for (const bot of this.botManager.bots) {
        if (bot.healthBarGroup?.visible) bot.healthBarGroup.visible = false;
      }
    }

    // Continuous map-wide spectator fly-through. getPointAt is arc-length
    // sampled, keeping travel speed stable even when waypoint spacing varies.
    // Gameplay simulation stays capped for stability, but camera travel uses
    // real frame time. Otherwise a 90 ms render advances only 50 ms and the
    // fly-through visibly crawls/freezes exactly when the browser is busy.
    const cameraStep = THREE.MathUtils.clamp(cameraDt, 0, 0.25);
    this._camTravelTime += cameraStep;
    const fadeWindow = 0.18;
    let cameraOpacity = 1;
    let routeChanged = false;
    if (this._camRoutes.length > 1) {
      const remaining = this._camCycleDuration - this._camTravelTime;
      if (remaining < fadeWindow) cameraOpacity = THREE.MathUtils.clamp(remaining / fadeWindow, 0, 1);
    }
    if (this._camTravelTime >= this._camCycleDuration) {
      this._camTravelTime %= this._camCycleDuration;
      if (this._camRoutes.length > 1) {
        this._camRouteIndex = (this._camRouteIndex + 1) % this._camRoutes.length;
        this._camWpts = this._camRoutes[this._camRouteIndex];
        this._rebuildSpectatorCurves();
        this._camFadeIn = fadeWindow;
        routeChanged = true;
      }
    }
    if (this._camFadeIn > 0) {
      // Keep the route-change frame fully hidden. Decrementing immediately
      // exposed the new lane at partial opacity and made the cut look like a
      // camera hitch, especially below 60 fps.
      if (routeChanged) cameraOpacity = 0;
      else {
        this._camFadeIn = Math.max(0, this._camFadeIn - cameraStep);
        cameraOpacity = Math.min(cameraOpacity, 1 - this._camFadeIn / fadeWindow);
      }
    }
    const opacityText = String(cameraOpacity);
    if (this.canvas.style.opacity !== opacityText) this.canvas.style.opacity = opacityText;
    const u = this._camTravelTime / this._camCycleDuration;
    this._camPath.getPointAt(u, this._camPos);
    this._camLookPath.getPointAt(u, this._camLook);
    const movedSq = this._camPos.distanceToSquared(this._camPreviousPos);
    // Detect actual speed, not a fixed distance per rendered frame. The old
    // 2 cm threshold falsely fired at high refresh rates and skipped 6% of the
    // route every 0.45 seconds, which looked exactly like spectator lag.
    const minimumCameraStep = Math.max(cameraStep, 1 / 240) * 0.05;
    this._camStallTime = movedSq < minimumCameraStep * minimumCameraStep
      ? this._camStallTime + cameraStep : 0;
    if (this._camStallTime > 0.45) {
      this._camTravelTime = (this._camTravelTime + this._camCycleDuration * 0.06) % this._camCycleDuration;
      this._camStallTime = 0;
      this._camPath.getPointAt(this._camTravelTime / this._camCycleDuration, this._camPos);
      this._camLookPath.getPointAt(this._camTravelTime / this._camCycleDuration, this._camLook);
    }
    this._camPreviousPos.copy(this._camPos);
    this.menuCamera.position.copy(this._camPos);
    this.menuCamera.lookAt(this._camLook);
  }

  _loop() {
    this._rafId = requestAnimationFrame(() => this._loop());
    this.timer.update();
    const rawDt = this.timer.getDelta();
    const dt = Math.min(0.05, rawDt);
    const qa = this._qaFrameStats;
    if (qa && rawDt < 0.25) {
      const ms = rawDt * 1000;
      qa.elapsed += rawDt;
      qa.frames += 1;
      qa.maxMs = Math.max(qa.maxMs, ms);
      if (ms > 20) qa.slow20 += 1;
      if (qa.elapsed >= 1) {
        qa.last = {
          fps: Math.round((qa.frames / qa.elapsed) * 10) / 10,
          avgMs: Math.round((qa.elapsed * 10000) / qa.frames) / 10,
          maxMs: Math.round(qa.maxMs * 10) / 10,
          slow20: qa.slow20,
        };
        qa.elapsed = qa.frames = qa.maxMs = qa.slow20 = 0;
      }
    }

    if (this.state === 'playing') {
      this._updatePlaying(dt);
    } else if (this.state === 'leaderboard') {
      this._updateLeaderboard(dt, rawDt);
    } else {
      // Cinematic camera runs for every non-playing state (connecting, auth, menu, paused, gameover)
      this._updateMenuScene(dt, rawDt);
    }

    const camera = this.state === 'playing' ? this.player.camera : this.menuCamera;
    if (!this.renderer.info.autoReset) this.renderer.info.reset();
    if (this._bloomEnabled && this.composer) {
      this.renderPass.camera = camera;
      this.composer.render();
    } else {
      this.renderer.render(this.world.scene, camera);
    }
    this._sampleRuntimePerformance(rawDt);
    this.input.endFrame();
  }
}
