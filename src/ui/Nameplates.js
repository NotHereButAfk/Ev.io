// Floating enemy nameplates (ev.io-style): a name + health bar above each living
// opponent, projected to the screen each frame. Replaces the 3D bar on bots so
// the plate stays crisp and always faces the camera.
import * as THREE from 'three';

const MAX_DIST = 90;   // don't show plates for very distant bots

export class Nameplates {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'nameplates';
    (document.getElementById('hud') || document.body).appendChild(this.container);
    this._labels = new Map();   // bot -> element
    this._v   = new THREE.Vector3();
    this._cam = new THREE.Vector3();
  }

  update(camera, bots) {
    if (!camera || !bots) return;
    const w = window.innerWidth, h = window.innerHeight;
    camera.getWorldPosition(this._cam);
    const live = new Set();

    for (const bot of bots) {
      if (!bot.alive || !bot.mesh) continue;
      // Hide the bot's built-in 3D health bar; the DOM plate replaces it.
      if (bot.healthBarGroup) bot.healthBarGroup.visible = false;

      this._v.set(bot.position.x, bot.position.y + 2.15, bot.position.z);
      const dist = this._cam.distanceTo(this._v);
      this._v.project(camera);
      const onScreen = this._v.z < 1 &&
        this._v.x > -1.05 && this._v.x < 1.05 && this._v.y > -1.05 && this._v.y < 1.05;
      let el = this._labels.get(bot);

      if (!onScreen || dist > MAX_DIST) {
        if (el) el.style.display = 'none';
        if (bot.alive) live.add(bot);
        continue;
      }
      live.add(bot);

      if (!el) {
        el = document.createElement('div');
        el.className = 'nameplate';
        el.innerHTML = '<div class="np-name"></div><div class="np-bar"><div class="np-bar-fg"></div></div>';
        el._name = el.querySelector('.np-name');
        el._fg   = el.querySelector('.np-bar-fg');
        el._name.textContent = bot.displayName || 'Enemy';
        this.container.appendChild(el);
        this._labels.set(bot, el);
      }
      el.style.display = 'block';
      const x = (this._v.x * 0.5 + 0.5) * w;
      const y = (-this._v.y * 0.5 + 0.5) * h;
      const s = Math.max(0.6, Math.min(1.1, 16 / dist));
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
      el.style.transform = `translate(-50%, -100%) scale(${s})`;
      el._fg.style.width = `${Math.max(0, (bot.health / bot.maxHealth) * 100)}%`;
    }

    // Remove plates for dead / despawned bots.
    for (const [bot, el] of this._labels) {
      if (!live.has(bot)) { el.remove(); this._labels.delete(bot); }
    }
  }

  clear() {
    this.container.innerHTML = '';
    this._labels.clear();
  }
}
