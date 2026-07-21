// AuthNetBridge — folds the proven authoritative netcode (AuthClient) into the
// LIVE game. When enabled it replaces the local ServerSim path: the server owns
// movement + combat, the local player is client-predicted, and other players
// are real remotes interpolated from snapshots. OFF by default — enable with
//   ?authnet=1                  (connect to ws://<host>:8788)
//   ?authnet=ws://host:port     (explicit URL)
//   localStorage.kx_authnet = "1"
// The single-player / ServerSim path is completely untouched when off.

import * as THREE from 'three';
import { AuthClient } from './AuthClient.js';
import { DT } from '../sim/MoveSim.js';

const MOUSE_SENS = 0.0024;

export function authNetTarget() {
  try {
    const q = new URLSearchParams(location.search).get('authnet');
    if (q) return q === '1' ? `ws://${location.hostname}:8788` : q;
    if (localStorage.getItem('kx_authnet') === '1') return `ws://${location.hostname}:8788`;
  } catch {}
  return null;
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
    this._edges = { jump: false, crouch: false, tele: false };
    this._nameLayer = this._makeNameLayer();
    this.client.onWelcome = () => { this.ready = true; };
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
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x35e0ff, emissive: 0x00303a, emissiveIntensity: 0.6, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 4, 12), mat);
    body.position.y = 0.9; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), mat);
    head.position.y = 1.62; group.add(head);
    this.scene.add(group);
    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:700 12px monospace;color:#fff;text-shadow:0 1px 3px #000;white-space:nowrap';
    this._nameLayer.appendChild(nameEl);
    r = { group, mat, nameEl };
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

    // edges collected per frame, consumed on the next tick
    if (input.consumeJustPressed('Space')) this._edges.jump = true;
    if (input.consumeJustPressed('ControlLeft') || input.consumeJustPressed('KeyC')) this._edges.crouch = true;
    if (input.consumeJustPressed('KeyQ')) this._edges.tele = true;

    // ── fixed-tick input send + prediction ──
    this._acc += Math.min(dt, 0.1);
    while (this._acc >= DT) {
      this._acc -= DT;
      const mz = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
      const mx = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
      c.sendInput({
        mx, mz, yaw: p.yaw, pitch: p.pitch,
        sprint: input.isDown('ShiftLeft') || (input.isMobile && mz > 0),
        crouch: input.isDown('ControlLeft') || input.isDown('KeyC'),
        jumpJust: this._edges.jump, crouchJust: this._edges.crouch, teleJust: this._edges.tele,
      });
      this._edges.jump = this._edges.crouch = this._edges.tele = false;
    }

    // ── drive the local player from the predicted sim ──
    const lp = c.localPos();
    if (lp) { p.position.set(lp.x, lp.y, lp.z); }
    p.onGround = !!c.sim.onGround;
    p.isCrouching = !!c.sim.crouch;
    p._eyeHeight = c.sim.eye;
    p.health = c.self.health;
    p.camera.position.set(p.position.x, p.position.y + p._eyeHeight, p.position.z);
    p.camera.rotation.order = 'YXZ';
    p.camera.rotation.y = p.yaw;
    p.camera.rotation.x = p.pitch;

    // ── fire (server-authoritative hit; client just requests) ──
    this._fireCd = Math.max(0, this._fireCd - dt);
    const def = this.game.weaponSystem?.currentDef;
    if (input.mouseDown && this._fireCd <= 0 && def && def.kind !== 'melee') {
      this._fireCd = def.fireRate || 0.12;
      c.sendFire(def.id, p.yaw, p.pitch);
    }

    // ── render remote players ──
    this._syncRemotes();
    this._drainEvents();
  }

  _syncRemotes() {
    const seen = new Set();
    const cam = this.player.camera;
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    for (const r of this.client.remoteStates()) {
      seen.add(r.id);
      const a = this._remoteAvatar(r.id);
      a.group.position.set(r.x, r.y, r.z);
      a.group.rotation.y = r.yaw;
      a.group.visible = r.alive;
      a.mat.color.setHex(r.alive ? 0x35e0ff : 0x555b63);
      // nameplate
      v.set(r.x, r.y + 2.0, r.z).project(cam);
      if (v.z < 1 && r.alive) {
        a.nameEl.style.display = 'block';
        a.nameEl.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
        a.nameEl.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
        a.nameEl.textContent = `${r.name}  ${Math.max(0, Math.round(r.health))}`;
      } else { a.nameEl.style.display = 'none'; }
    }
    for (const [id, a] of this.remotes) {
      if (!seen.has(id)) { this.scene.remove(a.group); a.nameEl.remove(); this.remotes.delete(id); }
    }
  }

  _drainEvents() {
    const me = this.client.you;
    for (const e of this.client.drainEvents()) {
      if (e.e === 'hit' && e.by === me) this.game.hud?.flashHitmarker?.(e.head);
      else if (e.e === 'kill') {
        if (e.by === me) this.game.hud?.flashHitmarker?.(true);
        const tag = e.head ? ' 🎯' : '';
        this.game.hud?.addKillFeed?.(`${e.byName} eliminated ${e.victimName}${tag}`);
      }
    }
  }

  disconnect() {
    this.client.disconnect();
    for (const [, a] of this.remotes) { this.scene.remove(a.group); a.nameEl.remove(); }
    this.remotes.clear();
    this._nameLayer?.remove();
  }
}
