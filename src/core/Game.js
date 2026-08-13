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
import { consumeThrowable } from './GameplayInput.js';
import { deathCameraPose, deathFallProgress } from '../player/DeathAnimation.js';
import { buildLeaderboardRows, buildMatchRows } from './MatchRows.js';

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
    this._respawnRemaining = 0;
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
    this._camPreviousPos = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0);
    this._camStallTime = 0;
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
    this.deaths�m���$z{-���jם this._firePulseT = Math.max(0, this._firePulseT - dt);
      if (s.firing && this._firePulseT <= 0) {
        ud.triggerFire?.(1);
        this._firePulseT = 0.09;
      }
      ud.mixer?.update(dt);
      ud.armorTick?.(dt);
      return;
    }
    if (!this.rig) { g.position.copy(s.position); return; }

    this._crouch += ((s.crouch ? 1 : 0) - this._crouch) * Math.min(1, dt * 10);

    // Which way this body is travelling relative to the way it is FACING —
    // without it the legs run a forward stride while the character strafes or
    // backpedals, and the feet travel with the body instead of planting.
    // The body faces local -Z, so after its yaw forward is (-sin, -cos) and
    // right is (cos, -sin).
    const sn = Math.sin(yaw), cs = Math.cos(yaw);
    let dirF = 1, dirR = 0;
    if (speed > 0.6) {
      _v.copy(s.position).sub(this._lastDirPos); _v.y = 0;
      const m = _v.length();
      if (m > 1e-5) {
        dirF = (_v.x * -sn + _v.z * -cs) / m;
        dirR = (_v.x *  cs + _v.z * -sn) / m;
      }
    }
    this._lastDirPos.copy(s.position);

    // One-shot actions. `swap` has no clock of its own, so notice the weapon
    // changing; `reload` and `melee` are progresses owned by the weapon and
    // passed straight through.
    if (this._lastWeaponId !== undefined && this._lastWeaponId !== this.weaponId) {
      triggerAction(this.rig, 'swap');
    }
    this._lastWeaponId = this.weaponId;
    if (s.throwing && !this._wasThrowing) triggerAction(this.rig, 'throw');
    this._wasThrowing = !!s.throwing;
    if (s.hit && !this._wasHit) triggerAction(this.rig, 'flinch');
    this._wasHit = !!s.hit;
    const act = tickActions(this.rig, dt);

    // The stride phase is owned by applyWalkCycle and derived from `speed`.
    const gait = applyWalkCycle(this.rig, {
      speed, moving, run, crouch: this._crouch, dt, dirF, dirR,
      grounded, vy: s.vy || 0, slide: s.sliding ? 1 : 0,
    });
    this._walkT = gait.phase;
    g.position.set(
      s.position.x + Math.cos(yaw) * gait.sway,
      s.position.y + gait.bob,
      s.position.z - Math.sin(yaw) * gait.sway,
    );
    g.rotation.x = gait.lean;                  // already eased, and bob assumes it
    g.rotation.z = gait.roll;

    if (this.isMelee) {
      applyMeleeCarry(this.rig, this.weapon, {
        swing: s.swing, moving, phase: gait.phase, run, dt,
        throwP: act.throw, flinch: act.flinch,
      });
      return;
    }
    if (!this.weapon) return;

    // Shoulder the rifle while firing, drift back to the patrol carry after.
    this._aimHold = Math.max(0, (this._aimHold || 0) - dt);
    if (s.firing) this._aimHold = 1.1;
    this._firePulseT = Math.max(0, this._firePulseT - dt);
    if (s.firing && this._firePulseT <= 0) {
      this._kick = 1;
      this._firePulseT = 0.09;
    }
    this._kick = Math.max(0, this._kick - dt * 7);
    const want = (this._aimHold > 0 || s.aiming) ? 1 : 0;
    this._aim += (want - this._aim) * Math.min(1, dt * 8);

    // The rifle points where this character is actually shooting. Only the
    // smoothing lives here — applyRifleCarry converts the angle, so a remote
    // and its own local body cannot end up aiming at two different places.
    this._pitch += ((s.pitch || 0) - this._pitch) * Math.min(1, dt * 12);

    applyRifleCarry(this.rig, this.weapon, this._aim, dt, {
      aimPitch: this._pitch, bodyPitch: gait.lean,
      swing: gait.swing,
      kick:  this._kick,
      reload: s.reload || 0, swap: act.swap, flinch: act.flinch, throwP: act.throw,
      smooth: true,
    });
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      // The cyborg chassis share their buffers between every body on the map
      // (LowPolyModels caches geometry per shape). Freeing one here would empty
      // the player's own model and every bot's along with this avatar's.
      if (!isSharedGeometry(o.geometry)) o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
      else o.material?.dispose?.();
    });
  }
}
