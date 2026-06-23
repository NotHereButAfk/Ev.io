// Touch sensitivity relative to existing mouse sensitivity (0.0024 rad/px)
const TOUCH_SENS  = 4.0;
const JOY_RADIUS  = 62;  // max nub travel in px
const JOY_DEAD    = 8;   // deadzone
const JOY_CENTER_X = 90; // fixed joystick center from left edge
const JOY_CENTER_Y_FROM_BOTTOM = 110; // from bottom edge

export class MobileControls {
  constructor(input, callbacks = {}) {
    this.input   = input;
    this.onMenu  = callbacks.onMenu || null;

    // id → { role, lastX, lastY }
    this._touches = new Map();
    this._joyActive = false;

    this._el       = null;
    this._joyInner = null;
    this._joyCenter = { x: 0, y: 0 }; // set on first show / resize

    this._build();
    this._wire();
    window.addEventListener('resize', () => this._updateJoyCenter());
  }

  // ── DOM ────────────────────────────────────────────────────────────────────

  _build() {
    const el = document.createElement('div');
    el.id = 'mobile-controls';
    el.className = 'hidden';
    el.innerHTML = `
      <!-- Joystick (fixed position, always visible) -->
      <div id="joy-outer">
        <div id="joy-ring"></div>
        <div id="joy-inner"></div>
      </div>

      <!-- Action buttons — right side -->
      <div id="m-top-btns">
        <button class="mbtn mbtn-sm mbtn-menu" data-role="menu">≡</button>
        <button class="mbtn mbtn-sm" data-role="swap">⇄</button>
        <button class="mbtn mbtn-sm" data-role="reload">R</button>
        <button class="mbtn mbtn-sm" data-role="ability">Q</button>
        <button class="mbtn mbtn-sm" data-role="grenade">G</button>
      </div>
      <div id="m-bot-btns">
        <button class="mbtn mbtn-jump" data-role="jump">↑</button>
        <button class="mbtn mbtn-fire" data-role="fire">●</button>
      </div>
    `;
    document.body.appendChild(el);
    this._el       = el;
    this._joyInner = el.querySelector('#joy-inner');
  }

  _updateJoyCenter() {
    this._joyCenter = {
      x: JOY_CENTER_X,
      y: window.innerHeight - JOY_CENTER_Y_FROM_BOTTOM,
    };
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  _wire() {
    const o = { passive: false };
    this._el.addEventListener('touchstart',  this._onStart.bind(this), o);
    this._el.addEventListener('touchmove',   this._onMove.bind(this),  o);
    this._el.addEventListener('touchend',    this._onEnd.bind(this),   o);
    this._el.addEventListener('touchcancel', this._onEnd.bind(this),   o);
  }

  _roleOf(touch) {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el) {
      const btn = el.closest('[data-role]');
      if (btn) return btn.dataset.role;
    }
    // Generous joystick zone: left 44% of screen width
    if (touch.clientX < window.innerWidth * 0.44) return 'joy';
    return 'look';
  }

  _onStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const role = this._roleOf(t);
      this._touches.set(t.identifier, { role, lastX: t.clientX, lastY: t.clientY });
      this._handleDown(role, t);
    }
  }

  _onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = this._touches.get(t.identifier);
      if (!rec) continue;
      if (rec.role === 'joy') {
        this._updateJoy(t.clientX, t.clientY);
      } else if (rec.role === 'look') {
        this.input.mouseDX += (t.clientX - rec.lastX) * TOUCH_SENS;
        this.input.mouseDY += (t.clientY - rec.lastY) * TOUCH_SENS;
      }
      rec.lastX = t.clientX;
      rec.lastY = t.clientY;
    }
  }

  _onEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = this._touches.get(t.identifier);
      if (rec) {
        if (rec.role === 'joy')  this._releaseJoy();
        if (rec.role === 'fire') this.input.mouseDown = false;
        this._touches.delete(t.identifier);
      }
    }
  }

  // ── Per-role handling ──────────────────────────────────────────────────────

  _handleDown(role, touch) {
    const inp = this.input;
    switch (role) {
      case 'joy':
        this._joyActive = true;
        this._updateJoy(touch.clientX, touch.clientY);
        break;
      case 'fire':
        inp.mouseDown = true;
        break;
      case 'jump':
        inp.justPressed.add('Space');
        break;
      case 'swap':
        inp.wheelDelta += 1; // WeaponSystem cycles to next slot on wheelDelta != 0
        break;
      case 'reload':
        inp.justPressed.add('KeyR');
        break;
      case 'grenade':
        inp.justPressed.add('KeyF');
        break;
      case 'ability':
        inp.justPressed.add('KeyQ');
        break;
      case 'menu':
        if (this.onMenu) this.onMenu();
        break;
    }
  }

  _updateJoy(cx, cy) {
    const { x: ox, y: oy } = this._joyCenter;
    let dx = cx - ox;
    let dy = cy - oy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > JOY_RADIUS) { dx = dx / dist * JOY_RADIUS; dy = dy / dist * JOY_RADIUS; }

    // Move the nub visually
    this._joyInner.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    // Inject WASD virtual keys
    const inp = this.input;
    const fwd = -dy;
    inp.setVirtualKey('KeyW', fwd >  JOY_DEAD);
    inp.setVirtualKey('KeyS', fwd < -JOY_DEAD);
    inp.setVirtualKey('KeyA', dx  < -JOY_DEAD);
    inp.setVirtualKey('KeyD', dx  >  JOY_DEAD);
    inp.setVirtualKey('ShiftLeft', fwd > JOY_RADIUS * 0.5 && Math.abs(dx) < JOY_RADIUS * 0.75);
  }

  _releaseJoy() {
    this._joyActive = false;
    this._joyInner.style.transform = 'translate(-50%, -50%)';
    const inp = this.input;
    ['KeyW','KeyS','KeyA','KeyD','ShiftLeft'].forEach(k => inp.setVirtualKey(k, false));
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  show() {
    this._updateJoyCenter();
    this._el.classList.remove('hidden');
  }

  hide() {
    const inp = this.input;
    ['KeyW','KeyS','KeyA','KeyD','ShiftLeft'].forEach(k => inp.setVirtualKey(k, false));
    inp.mouseDown = false;
    this._touches.clear();
    this._el.classList.add('hidden');
  }

  dispose() {
    this.hide();
    this._el?.remove();
  }
}
