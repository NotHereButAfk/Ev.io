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
import { STATURE } from '../player/Proportions.js';
// Just above the crown. Was a flat 2.0, from when the body stood 2.2m.
const NAMEPLATE_Y = STATURE + 0.16;
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

// Give each remote a stable look derived from their id, so the same player is
// the same colour every time you see them.
const REMOTE_SKINS = [
  { primary: 0xd1372b, secondary: 0x2b1414 }, { primary: 0x2b6fd1, secondary: 0x14223a },
  { primary: 0x9050d1, secondary: 0x241433 }, { primary: 0x2fae5a, secondary: 0x0c2a16 },
  { primary: 0xc9d2d8, secondary: 0x2a3238 }, { primary: 0xe0902c, secondary: 0x33240c },
];
const REMOTE_CHASSIS = ['assault', 'recon', 'heavy', 'stealth'];
function hashId(id) {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const MOUSE_SENS = 0.0024;

export function authNetTarget() {
  try {
    const q = new URLSearchParams(location.search).get('authnet');
    if (q) return q === '1' ? `ws://${location.hostname}:8788` : q;
    if (localStorage.getItem('kx_authnet') === '1') return `ws://${location.hostname}:8788`;
  } catch {}
  return import.meta.env.VITE_AUTH_WS_URL || null;
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
    this._tpsDesired = new THREE.Vector3();
    this._tpsOffset = new THREE.Vector3();
    this._tpsRaycaster = new THREE.Raycaster();
    this._edges = { jump: false, crouch: false, tele: false };
    this._nameLayer = this._makeNameLayer();
    this.client.postStep = (next, previous) => this._resolveRookCollision(next, previous);
    this.client.onWelcome = () => {
      this.ready = true;
      // Authoritative matches must have one ownership model. Local AI used to
      // keep fighting underneath the real server snapshots, causing phantom
      // damage, fake population counts, and two incompatible scoreboards.
      game.botManager?.clear?.();
      game.serverSim?.stop?.();
      game._netDriven = true;
      game.hud?.setServerPop?.(1, 8);
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

  _remoteAvatar(id) {
    let r = this.remotes.get(id);
    if (r) return r;
    // The SAME Avatar the local third-person body uses — same model, same walk
    // cycle, same rifle carry. Remote players used to be a cyan capsule with a
    // sphere head, so what everyone else saw of you bore no relation to what
    // you saw of yourself.
    const avatar = new Avatar(this.scene, {
      skin: REMOTE_SKINS[hashId(id) % REMOTE_SKINS.length],
      armorTypeId: REMOTE_CHASSIS[hashId(id) % REMOTE_CHASSIS.length],
      weaponId: 'm4',
      allowHuman: true,
      world: this.game.world,
    });
    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:700 12px monospace;color:#fff;text-shadow:0 1px 3px #000;white-space:nowrap';
    this._nameLayer.appendChild(nameEl);
    r = { avatar, nameEl, pos: new THREE.Vector3() };
    this.remotes.set(id, r);
    return r;
  }

  update(dt, input) {
    const p = this.player, c = this.client;
    if (!c.sim) return;                 // not welcomed yet

    // ── look (client-owned), same math as the legacy controller ──
    const sign = p.invertY ? 1 : -1;
    p.yaw -= input.mouseDX * MOUSE_SENS * p.sensitivityMult;
    p.pitch += sign * input.mouseDY * MOUSE_SENS * p.sensitivityMult;
    p.pitch = THREE.MathUtils.clamp(p.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);

    // Match the legacy controller: the wheel enters/leaves third-person and
    // WeaponSystem sees _camDist immediately, so it cannot also swap weapons.
    if (input.wheelDelta !== 0) {
      p._camDist = nextThirdPersonDistance(p._camDist, input.wheelDelta);
    }

    // edges collected per frame, consumed on the next tick
    if (input.consumeJustPressed('Space')) this._edges.jump = true;
    if (input.consumeJustPressed('ControlLeft') || input.consumeJustPressed('KeyC')) this._edges.crouch = true;
    if (input.consumeJustPressed('KeyQ')) this._edges.tele = true;

    // ── fixed-tick input send + prediction ──
    this._acc += Math.min(dt, 0.1);
    const def = this.game.weaponSystem?.currentDef;
    while (this._acc >= DT) {
      this._acc -= DT;
      const mz = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
      const mx = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
      c.sendInput({
        mx, mz, yaw: p.yaw, pitch: p.pitch,
        sprint: input.isDown('ShiftLeft') || (input.isMobile && mz > 0),
        crouch: input.isDown('ControlLeft') || input.isDown('KeyC'),
        jumpJust: this._edges.jump, crouchJust: this._edges.crouch, teleJust: this._edges.tele,
        wid: def?.id || 'm4', aiming: !!input.rightMouseDown,
      });
      this._edges.jump = this._edges.crouch = this._edges.tele = false;
    }

    // ── drive the local player from the predicted sim ──
    const lp = c.localPos();
    if (lp) { p.position.set(lp.x, lp.y, lp.z); }
    p.velocity.set(c.sim.vx || 0, c.sim.vy || 0, c.sim.vz || 0);
    p.onGround = !!c.sim.onGround;
    p.isCrouching = !!c.sim.crouch;
    p.isSliding = !!c.sim.slide;
    p.isSprinting = !!c.sprinting;
    p._eyeHeight = c.sim.eye;
    p.health = c.self.health;
    if (p._camDist > 0) {
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
    const wantsShot = def && def.kind !== 'melee'
      && wantsTriggerShot(def.automatic, input.mouseDown, this._prevFireDown);
    if (wantsShot && this._fireCd <= 0) {
      c.sendFire(def.id, p.yaw, p.pitch);
      this._fireCd = scheduleNextShot(this._fireCd, def.fireRate);
    }
    if (!input.mouseDown && this._fireCd < 0) this._fireCd = 0;
    this._prevFireDown = !!input.mouseDown;

    // ── render remote players ──
    this._syncRemotes(dt);
    this.game.hud?.setServerPop?.(this.client.remotes.size + 1, 8);
    this._drainEvents();
  }

  _resolveRookCollision(next, previous) {
    const world = this.game.world;
    if (!world?._mapOctree) return next;
    const ground = world.groundHeightAt(next.px, next.pz, previous.py, next.py);
    if (next.py <= ground + 0.05 && next.vy <= 0.001) {
      next.py = ground; next.vy = 0; next.onGround = 1;
      next.nX = 0; next.nY = 1; next.nZ = 0;
    }
    const position = new THREE.Vector3(next.px, next.py, next.pz);
    world.resolveCollisions(position, 0.45);
    next.px = Math.round(position.x * 1e6) / 1e6;
    next.py = Math.round(position.y * 1e6) / 1e6;
    next.pz = Math.round(position.z * 1e6) / 1e6;
    return next;
  }

  _syncRemotes(dt) {
    const seen = new Set();
    const cam = this.player.camera;
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    for (const r of this.client.remoteStates()) {
      seen.add(r.id);
      const a = this._remoteAvatar(r.id);
      a.pos.set(r.x, r.y, r.z);
      a.avatar.setWeapon(r.wid || 'm4');
      // Derive cadence from rendered interpolation displacement, so a stalled
      // snapshot stream settles to idle rather than running in place.
      a.avatar.update(dt, {
        position: a.pos, yaw: r.yaw, pitch: r.pitch || 0,
        sprint: r.sprint, grounded: r.grounded, vy: r.vy || 0,
        crouch: r.crouch, sliding: r.sliding,
        aiming: r.aiming, firing: r.firing, alive: r.alive,
      });
      // nameplate
      v.set(r.x, r.y + NAMEPLATE_Y, r.z).project(cam);
      if (v.z < 1 && r.alive) {
        a.nameEl.style.display = 'block';
        a.nameEl.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
        a.nameEl.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
        a.nameEl.textContent = `${r.name}  ${Math.max(0, Math.round(r.health))}`;
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
    }
  }

  disconnect() {
    this.client.disconnect();
    for (const [, a] of this.remotes) { a.avatar.dispose(); a.nameEl.remove(); }
    this.remotes.clear();
    this._nameLayer?.remove();
  }
}
