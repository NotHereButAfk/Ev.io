// AuthNetBridge — folds the proven authoritative netcode (AuthClient) into the
// LIVE game. When enabled it replaces the local ServerSim path: the server owns
// movement + combat, the local player is client-predicted, and other players
// are real remotes interpolated from snapshots. OFF by default — enable with
//   ?authnet=1                  (connect to ws://<host>:8788)
//   ?authnet=ws://host:port     (explicit URL)
//   localStorage.kx_authnet = "1"
// Production can enable it with VITE_AUTH_WS_URL. The single-player /
// ServerSim path is completely untouched when no target is configured.

import * as THREE from 'three';
import { SHIELD_PER_STACK } from '../core/ShieldConfig.js';
import { PLAYER_WORLD_MODEL_SCALE, STATURE } from '../player/Proportions.js';
// Just above each rendered crown. Human avatars use a slightly smaller world
// scale than full-size bots, so their plate follows that actual silhouette.
const nameplateY = (avatar) => STATURE * (avatar.group.userData?.worldModelScale || 1) + 0.16;
import { AuthClient } from './AuthClient.js';
import { DT } from '../sim/MoveSim.js';
import { Avatar } from '../player/Avatar.js';
import {
  nextThirdPersonDistance,
  safeThirdPersonObstructionDistance,
  setThirdPersonDesired,
  findThirdPersonObstruction,
} from '../player/ThirdPersonCamera.js';
import {
  advanceFireCooldown,
  scheduleNextShot,
  wantsTriggerShot,
} from '../weapons/FireControl.js';
import { countAuthoritativePlayers } from '../core/Population.js';
import { isNameplateOccluded } from '../ui/NameplateOcclusion.js';
import { sprintRequested } from '../core/GameplayInput.js';
import { applyAuthoritativeResources } from './AuthoritativePresentation.js';
import { PLAYABLE_ARMOR_IDS } from '../player/ArmorTypes.js';
import { getSkin } from '../player/skins.js';

// Give each remote a stable look derived from their id, so the same player is
// the same colour every time you see them.
const REMOTE_SKINS = [
  { primary: 0xd1372b, secondary: 0x2b1414 }, { primary: 0x2b6fd1, secondary: 0x14223a },
  { primary: 0x9050d1, secondary: 0x241433 }, { primary: 0x2fae5a, secondary: 0x0c2a16 },
  { primary: 0xc9d2d8, secondary: 0x2a3238 }, { primary: 0xe0902c, secondary: 0x33240c },
];
const DEFAULT_REMOTE_SKIN = getSkin('default');
function hashId(id) {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const MOUSE_SENS = 0.0024;

export function authNetTarget() {
  return authNetTargets()[0] || null;
}

export function nearestSpawnYaw(spawns, x, y, z, fallback = Math.PI, maxDistanceSq = 64) {
  let bestYaw = fallback;
  let bestDistanceSq = maxDistanceSq;
  for (const spawn of spawns || []) {
    if (!Number.isFinite(spawn?.spawnYaw)) continue;
    const distanceSq = (spawn.x - x) ** 2 + (spawn.y - y) ** 2 + (spawn.z - z) ** 2;
    if (distanceSq >= bestDistanceSq) continue;
    bestDistanceSq = distanceSq;
    bestYaw = spawn.spawnYaw;
  }
  return bestYaw;
}

export function authNetTargets() {
  try {
    const q = new URLSearchParams(location.search).get('authnet');
    if (q) return q === '1' ? [`ws://${location.hostname}:8788`] : q.split(',').map((s) => s.trim()).filter(Boolean);
    if (localStorage.getItem('kx_authnet') === '1') return [`ws://${location.hostname}:8788`];
  } catch {}
  return String(import.meta.env.VITE_AUTH_WS_URLS || import.meta.env.VITE_AUTH_WS_URL || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

export class AuthNetBridge {
  constructor(game, url) {
    this.game = game;
    this.player = game.player;
    this.scene = game.world.scene;
    this.client = new AuthClient(url, { name: game.player?.name || 'Recruit' });
    this.remotes = new Map();          // id -> { group, mat, nameEl }
    this._acc = 0;
    this._fireCd = 0;
    this._prevFireDown = false;
    this._prevReloadDown = false;
    this._autoReloadRequested = false;
    this._tpsDesired = new THREE.Vector3();
    this._tpsOffset = new THREE.Vector3();
    this._tpsRaycaster = new THREE.Raycaster();
    this._nameRaycaster = new THREE.Raycaster();
    this._nameOrigin = new THREE.Vector3();
    this._nameTarget = new THREE.Vector3();
    this._remoteProject = new THREE.Vector3();
    this._collisionPosition = new THREE.Vector3();
    this._collisionContact = {
      grounded: false, normalY: -1, depth: 0, verticalCorrection: 0,
    };
    this._remoteSeen = new Set();
    this._edges = { jump: false, crouch: false, tele: false };
    this._wasAlive = true;
    // The local preview chooses a random spawn before the authoritative room
    // answers. Align the camera to the actual server spawn once its map is
    // ready instead of inheriting an unrelated yaw and staring into a wall.
    this._needsSpawnFacing = true;
    this.ready = false;
    this._welcomed = false;
    this._starting = false;
    this._mapReady = Promise.resolve();
    this.readyPromise = new Promise((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });
    this._nameLayer = this._makeNameLayer();
    this.client.postStep = (next, previous) => this._resolveRookCollision(next, previous);
    this.client.onWelcome = (arena, match) => {
      this._welcomed = true;
      // Authoritative matches must have one ownership model. Local AI used to
      // keep fighting underneath the real server snapshots, causing phantom
      // damage, fake population counts, and two incompatible scoreboards.
      game.botManager?.clear?.();
      game.serverSim?.stop?.();
      game._netDriven = true;
      game.hud?.setServerPop?.(countAuthoritativePlayers(this.client.roster), 8);
      this._mapReady = Promise.resolve(game._onAuthoritativeMap?.(arena?.id, match, true));
    };
    this.client.onSnapshot = () => {
      if (!this._welcomed || this.ready || this._starting) return;
      this._starting = true;
      this._mapReady.then(() => {
          this.ready = true;
          game._finishServerJoining?.();
          this._resolveReady?.(this);
        }).catch((error) => {
          console.error('[map] authoritative map load failed', error);
          this._rejectReady?.(error);
        });
    };
    this.client.onMapChange = (mapId, match) => {
      this._needsSpawnFacing = true;
      game._onAuthoritativeMap?.(mapId, match, false);
    };
    this.client.connect();
  }

  _makeNameLayer() {
    let el = document.getElementById('authnet-names');
    if (!el) { el = document.createElement('div'); el.id = 'authnet-names';
      el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6;overflow:hidden';
      document.getElementById('app')?.appendChild(el); }
    return el;
  }

  _remoteAvatar(id, isBot = false) {
    let r = this.remotes.get(id);
    if (r) return r;
    // The SAME Avatar the local third-person body uses — same model, same walk
    // cycle, same rifle carry. Remote players used to be a cyan capsule with a
    // sphere head, so what everyone else saw of you bore no relation to what
    // you saw of yourself.
    const avatar = new Avatar(this.scene, {
      skin: isBot ? DEFAULT_REMOTE_SKIN : REMOTE_SKINS[hashId(id) % REMOTE_SKINS.length],
      armorTypeId: isBot ? PLAYABLE_ARMOR_IDS[0]
        : PLAYABLE_ARMOR_IDS[hashId(id) % PLAYABLE_ARMOR_IDS.length],
      weaponId: 'm4',
      // Network peers must render from the same connected exosuit roster as
      // local players and bots; the legacy Soldier is tooling-only.
      allowHuman: false,
      // Bots remain the full readable combat silhouette. Human-controlled
      // avatars use the slightly smaller player presentation scale.
      modelScale: isBot ? 1 : PLAYER_WORLD_MODEL_SCALE,
    });
    const nameEl = document.createElement('div');
    nameEl.className = 'nameplate';
    const nameRow = document.createElement('div');
    nameRow.className = 'np-name';
    const botBadge = document.createElement('span');
    botBadge.className = 'np-bot';
    botBadge.textContent = 'BOT';
    botBadge.hidden = !isBot;
    const nameText = document.createElement('span');
    const bar = document.createElement('div');
    bar.className = 'np-bar';
    const healthFg = document.createElement('div');
    healthFg.className = 'np-bar-fg';
    nameRow.append(botBadge, nameText);
    bar.appendChild(healthFg);
    nameEl.append(nameRow, bar);
    this._nameLayer.appendChild(nameEl);
    r = { avatar, nameEl, nameText, botBadge, healthFg, pos: new THREE.Vector3() };
    this.remotes.set(id, r);
    return r;
  }

  update(dt, input, controlsEnabled = true) {
    const p = this.player, c = this.client;
    if (!c.sim) return;                 // not welcomed yet
    const mapReady = !this.game._authoritativeMapTransitioning
      && this.game.world.currentMapId === c.mapId;

    const alive = c.self.alive !== false;
    if (this._wasAlive && !alive) this.game._onAuthoritativeDeath?.(c.self);
    if (!this._wasAlive && alive) {
      this._needsSpawnFacing = true;
      this.game._onAuthoritativeRespawn?.(c.self);
    }
    this._wasAlive = alive;
    const canControl = alive && controlsEnabled && mapReady;
    this.game.pickupSystem?.syncLootPads?.(c.lootPads);

    // ── look (client-owned), same math as the legacy controller ──
    if (canControl) {
      const sign = p.invertY ? 1 : -1;
      p.yaw -= input.mouseDX * MOUSE_SENS * p.sensitivityMult;
      p.pitch += sign * input.mouseDY * MOUSE_SENS * p.sensitivityMult;
      p.pitch = THREE.MathUtils.clamp(p.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    }

    // Match the legacy controller: the wheel enters/leaves third-person and
    // WeaponSystem sees _camDist immediately, so it cannot also swap weapons.
    if (canControl && input.wheelDelta !== 0) {
      p._camDist = nextThirdPersonDistance(p._camDist, input.wheelDelta);
    }

    // edges collected per frame, consumed on the next tick
    if (canControl && input.consumeJustPressed('Space')) this._edges.jump = true;
    if (canControl && (input.consumeJustPressed('ControlLeft') || input.consumeJustPressed('KeyC'))) this._edges.crouch = true;
    if (canControl && input.consumeJustPressed('KeyQ')) this._edges.tele = true;

    // ── fixed-tick input send + prediction ──
    this._acc += Math.min(dt, 0.1);
    this._syncAuthoritativeLoadout();
    const def = this.game.weaponSystem?.currentDef;
    while (this._acc >= DT) {
      this._acc -= DT;
      const mz = canControl ? (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0) : 0;
      const mx = canControl ? (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0) : 0;
      if (alive) c.sendInput({
        mx, mz, yaw: p.yaw, pitch: p.pitch,
        sprint: canControl && sprintRequested(input, mz),
        crouch: canControl && (input.isDown('ControlLeft') || input.isDown('KeyC')),
        jumpJust: this._edges.jump, crouchJust: this._edges.crouch, teleJust: this._edges.tele,
        wid: def?.id || 'm4', aiming: canControl && !!input.rightMouseDown,
      });
      this._edges.jump = this._edges.crouch = this._edges.tele = false;
    }

    // ── drive the local player from the predicted sim ──
    c.advancePresentation(dt);
    const lp = mapReady ? c.localPos(this._acc) : null;
    if (lp) { p.position.set(lp.x, lp.y, lp.z); }
    if (lp && this._needsSpawnFacing) {
      p.yaw = nearestSpawnYaw(this.game.world.spawnPoints, lp.x, lp.y, lp.z, p.yaw);
      p.pitch = 0;
      this._needsSpawnFacing = false;
    }
    p.velocity.set(alive ? (c.sim.vx || 0) : 0, alive ? (c.sim.vy || 0) : 0, alive ? (c.sim.vz || 0) : 0);
    p.onGround = !!c.sim.onGround;
    p.isCrouching = !!c.sim.crouch;
    p.isSliding = !!c.sim.slide;
    p.isSprinting = alive && !!c.sprinting;
    p._eyeHeight += ((c.sim.eye ?? p._eyeHeight) - p._eyeHeight)
      * (1 - Math.exp(-22 * Math.max(0, dt)));
    p.health = c.self.health;
    // Movement prediction and the HUD now consume the same authoritative
    // stamina/inventory snapshot, so sprint drain and grenade counts agree.
    applyAuthoritativeResources(p, c, this.game.grenadeSystem);
    this.game.kills = c.self.kills ?? this.game.kills;
    this.game.deaths = c.self.deaths ?? this.game.deaths;
    this.game.score = c.self.score ?? this.game.score;
    const weaponState = this.game.weaponSystem?.currentState;
    if (weaponState && def?.kind !== 'melee') {
      weaponState.magAmmo = c.self.mag ?? weaponState.magAmmo;
      weaponState.reserveAmmo = c.self.reserve ?? weaponState.reserveAmmo;
      if (c.self.reloading) {
        weaponState.isReloading = true;
        weaponState.reloadTimer = (c.self.reloadTicks || 0) / 20;
      } else if (!this._prevReloadDown) {
        weaponState.isReloading = false;
        weaponState.reloadTimer = 0;
      }
    }
    this.game.hud?.updateBlind?.((c.self.blindTicks || 0) / 20);
    if (!mapReady) {
      p.velocity.set(0, 0, 0);
    } else if (p._camDist > 0) {
      setThirdPersonDesired(
        this._tpsDesired, p.position, p.yaw, p.pitch, p._camDist,
      );
      p._tpsTarget.set(p.position.x, p.position.y + 1.25, p.position.z);
      const cameraOffset = this._tpsOffset.copy(this._tpsDesired).sub(p._tpsTarget);
      const obstruction = findThirdPersonObstruction(
        this._tpsRaycaster, this.game.world, p._tpsTarget, this._tpsDesired, cameraOffset,
      );
      cameraOffset.copy(this._tpsDesired).sub(p._tpsTarget).normalize();
      p._tpsObstructed = !!obstruction && obstruction.distance < 0.8;
      if (p._tpsObstructed) {
        p.camera.position.set(p.position.x, p.position.y + p._eyeHeight, p.position.z);
        p.camera.rotation.order = 'YXZ';
        p.camera.rotation.y = p.yaw;
        p.camera.rotation.x = p.pitch;
        p.camera.rotation.z = 0;
      } else if (obstruction) {
        p.camera.position.copy(p._tpsTarget)
          .addScaledVector(cameraOffset, safeThirdPersonObstructionDistance(obstruction.distance));
      } else {
        p.camera.position.copy(this._tpsDesired);
      }
      if (!p._tpsObstructed) {
        p.camera.rotation.order = 'YXZ';
        p.camera.rotation.y = p.yaw;
        p.camera.rotation.x = p.pitch;
        p.camera.rotation.z = 0;
      }
    } else {
      p._tpsObstructed = false;
      p.camera.position.set(p.position.x, p.position.y + p._eyeHeight, p.position.z);
      p.camera.rotation.order = 'YXZ';
      p.camera.rotation.y = p.yaw;
      p.camera.rotation.x = p.pitch;
      p.camera.rotation.z = 0;
    }

    // ── fire (server-authoritative hit; client just requests) ──
    this._fireCd = advanceFireCooldown(this._fireCd, dt);
    const reloadDown = canControl && input.isDown('KeyR');
    if (reloadDown && !this._prevReloadDown && def?.kind !== 'melee') c.sendReload(def.id);
    if (c.self.mag <= 0 && !c.self.reloading && !this._autoReloadRequested && def?.kind !== 'melee') {
      c.sendReload(def.id);
      this._autoReloadRequested = true;
    }
    if (c.self.mag > 0 || c.self.reloading) this._autoReloadRequested = false;
    this._prevReloadDown = reloadDown;

    const wantsShot = canControl && def
      && wantsTriggerShot(def.automatic, input.mouseDown, this._prevFireDown);
    if (wantsShot && this._fireCd <= 0) {
      c.sendFire(def.id, p.yaw, p.pitch);
      this._fireCd = scheduleNextShot(this._fireCd, def.fireRate);
    }
    if (!input.mouseDown && this._fireCd < 0) this._fireCd = 0;
    this._prevFireDown = canControl && !!input.mouseDown;

    // ── render remote players ──
    this._syncRemotes(dt, mapReady);
    // Count the authoritative roster, not only currently interpolated remote
    // meshes. Bots are full match participants and remain counted while dead,
    // respawning, or waiting for their first render buffer.
    this.game.hud?.setServerPop?.(countAuthoritativePlayers(this.client.roster), 8);
    this._drainEvents();
  }

  _syncAuthoritativeLoadout() {
    const weapons = this.game.weaponSystem;
    const matchWeapon = this.client.self.matchWeapon || null;
    if (matchWeapon && weapons?.mapGunId !== matchWeapon) {
      const def = weapons.addMapGun?.(matchWeapon);
      if (def) {
        this.game.hud?.buildWeaponSlots?.(weapons.getHudInfo().slots, weapons.currentIndex);
        this.game.hud?.addKillFeed?.(`PICKED UP — ${def.name}`);
      }
    } else if (!matchWeapon && weapons?.mapGunId) {
      weapons.resetLoadout?.();
      weapons.resetState?.(this.player.baseFov);
      this.game.hud?.buildWeaponSlots?.(weapons.getHudInfo().slots, weapons.currentIndex);
    }
  }

  _resolveRookCollision(next, previous) {
    const world = this.game.world;
    if (!world?._mapOctree || this.game._authoritativeMapTransitioning
      || world.currentMapId !== this.client.mapId) return next;
    const ground = world.groundHeightAt(next.px, next.pz, previous.py, next.py);
    if (next.py <= ground + 0.05 && next.vy <= 0.001) {
      next.py = ground; next.vy = 0; next.onGround = 1;
      next.nX = 0; next.nY = 1; next.nZ = 0;
    }
    const position = this._collisionPosition.set(next.px, next.py, next.pz);
    world.resolveCollisions(position, 0.45, this._collisionContact,
      (next.crouch || next.slide) ? 1.0 : 1.7);
    if (this._collisionContact.grounded && next.vy <= 0.001) {
      next.vy = 0;
      next.onGround = 1;
      next.nX = 0;
      next.nY = 1;
      next.nZ = 0;
    }
    next.px = Math.round(position.x * 1e6) / 1e6;
    next.py = Math.round(position.y * 1e6) / 1e6;
    next.pz = Math.round(position.z * 1e6) / 1e6;
    return next;
  }

  _syncRemotes(dt, mapReady = true) {
    const seen = this._remoteSeen;
    seen.clear();
    const cam = this.player.camera;
    cam.getWorldPosition(this._nameOrigin);
    const w = window.innerWidth, h = window.innerHeight;
    const v = this._remoteProject;
    const now = performance.now();
    for (const r of this.client.remoteStates()) {
      seen.add(r.id);
      const a = this._remoteAvatar(r.id, r.isBot);
      a.avatar.group.visible = mapReady;
      if (!mapReady) { a.nameEl.style.display = 'none'; continue; }
      a.pos.set(r.x, r.y, r.z);
      const avatarDistanceSq = this._nameOrigin.distanceToSquared(a.pos);
      a.avatar.setWeapon(r.wid || 'm4');
      // Derive cadence from rendered interpolation displacement, so a stalled
      // snapshot stream settles to idle rather than running in place.
      a.avatar.update(dt, {
        position: a.pos, yaw: r.yaw, aimYaw: r.aimYaw, pitch: r.pitch || 0,
        sprint: r.sprint, grounded: r.grounded, vy: r.vy || 0,
        crouch: r.crouch, sliding: r.sliding,
        aiming: r.aiming, firing: r.firing, alive: r.alive,
        reload: r.reload || 0, swing: r.swing == null ? 1 : r.swing,
        viewDistanceSq: avatarDistanceSq,
      });
      // Keep semantic plate state current even while it is off-screen or
      // occluded, so the first visible frame never flashes an empty bar/name.
      if (a.nameText.textContent !== r.name) a.nameText.textContent = r.name;
      if (a.botBadge.hidden === !!r.isBot) a.botBadge.hidden = !r.isBot;
      const healthWidth = `${THREE.MathUtils.clamp(r.health || 0, 0, 100)}%`;
      if (a.healthFg.style.width !== healthWidth) a.healthFg.style.width = healthWidth;
      // nameplate
      this._nameTarget.set(r.x, r.y + nameplateY(a.avatar), r.z);
      v.copy(this._nameTarget).project(cam);
      const distanceSq = this._nameOrigin.distanceToSquared(this._nameTarget);
      const drawable = v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1
        && distanceSq <= 90 * 90 && r.alive;
      if (drawable && (!a._losNext || now >= a._losNext)) {
        a._nameOccluded = isNameplateOccluded(
          this.game.world, this._nameOrigin, this._nameTarget, this._nameRaycaster,
        );
        a._losNext = now + 100;
      }
      if (drawable && !a._nameOccluded) {
        const distance = Math.sqrt(distanceSq);
        a.nameEl.style.display = 'block';
        a.nameEl.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
        a.nameEl.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
        a.nameEl.style.transform = `translate(-50%,-100%) scale(${THREE.MathUtils.clamp(1.15 - distance / 180, 0.72, 1)})`;
      } else { a.nameEl.style.display = 'none'; }
    }
    for (const [id, a] of this.remotes) {
      if (!seen.has(id)) { a.avatar.dispose(); a.nameEl.remove(); this.remotes.delete(id); }
    }
  }

  _drainEvents() {
    const me = this.client.you;
    for (const e of this.client.drainEvents()) {
      if (e.e === 'hit') {
        if (e.by === me) this.game.hud?.flashHitmarker?.(e.head);
        if (e.id === me) this.game._playerBody?.userData?.triggerHit?.(0.7, 0.8);
        else this.remotes.get(e.id)?.avatar?.group?.userData?.triggerHit?.(0.7, 0.8);
      }
      else if (e.e === 'kill') {
        if (e.by === me) {
          this.game.hud?.flashHitmarker?.(e.head);
          this.game.hud?.showKillConfirm?.(e.head, 100);
          if (e.head) this.game.hud?.showHeadshotFlair?.();
        }
        const tag = e.head ? ' 🎯' : '';
        this.game.hud?.addKillFeed?.(`${e.byName} eliminated ${e.victimName}${tag}`);
      }
      else if (e.e === 'ability' && e.kind === 'smoke') {
        this.game.grenadeSystem?.showAuthoritativeSmoke?.(new THREE.Vector3(e.x, e.y, e.z));
      }
      else if (e.e === 'explosion' && e.kind === 'frag') {
        this.game.grenadeSystem?.showAuthoritativeExplosion?.(new THREE.Vector3(e.x, e.y, e.z));
      }
      else if (e.e === 'shot' && e.by !== me) {
        const from = new THREE.Vector3(e.x, e.y, e.z);
        const to = new THREE.Vector3(e.tx, e.ty, e.tz);
        const direction = to.clone().sub(from).normalize();
        // Start just outside the remote avatar so the streak does not glow
        // through the shooter's face/chest before entering the firing lane.
        from.addScaledVector(direction, 0.42);
        this.game.weaponSystem?.showAuthoritativeTracer?.(e.wid, from, to);
      }
      else if (e.e === 'explosion' && e.kind === 'rocket' && e.by !== me) {
        this.game.weaponSystem?.showAuthoritativeExplosion?.(
          new THREE.Vector3(e.x, e.y, e.z), e.r || 5, 'rocket',
        );
      }
      else if (e.e === 'pickup' && e.id === me && e.lootType === 'shield') {
        const stacks = Math.ceil((e.maxShield || 0) / SHIELD_PER_STACK);
        this.game.hud?.addKillFeed?.(`SHIELD +${SHIELD_PER_STACK} · ${stacks} STACK${stacks === 1 ? '' : 'S'}`);
      }
    }
  }

  disconnect() {
    this.client.disconnect();
    for (const [, a] of this.remotes) { a.avatar.dispose(); a.nameEl.remove(); }
    this.remotes.clear();
    this._nameLayer?.remove();
  }
}
