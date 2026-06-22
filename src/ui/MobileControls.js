// Touch sensitivity: how many radians per CSS pixel of swipe
// Mouse sensitivity is 0.0024 rad/px; touch pixels are finer so we scale up.
const TOUCH_SENSITIVITY = 3.8;
const JOY_RADIUS  = 58;  // max nub travel in CSS px
const JOY_DEAD    = 9;   // ignore micro-trembles below this px distance
const SPRINT_THRESH = JOY_RADIUS * 0.55; // full-tilt forward = auto-sprint

export class MobileControls {
  constructor(input, callbacks = {}) {
    this.input = input;
    this.onMenu = callbacks.onMenu || null;

    // id → { role, startX, startY, lastX, lastY }
    this._touches = new Map();
    this._joyCenter = { x: 0, y: 0 };

    this._el       = null;
    this._joyOuter = null;
    this._joyInner = null;

    this._build();
    this._wire();
  }

  // ── DOM construction ───────────────────────────────────────────────────────

  _build() {
    const el = document.createElement('div');
    el.id = 'mobile-controls';
    el.className = 'hidden';
    el.innerHTML = `
      <div id="joy-zone"></div>
      <div id="joy-outer"><div id="joy-inner"></div></div>
      <div id="mobile-btns">
        <div id="mobile-btns-top">
          <button id="btn-ability" class="mobile-btn" data-role="ability">Q</button>
          <button id="btn-reload"  class="mobile-btn" data-role="reload">R</button>
          <button id="btn-grenade" class="mobile-btn" data-role="grenade">G</button>
          <button id="btn-menu-m"  class="mobile-btn" data-role="menu">≡</button>
        </div>
        <div id="mobile-btns-bot">
          <button id="btn-jump" class="mobile-btn btn-jump" data-role="jump">↑</button>
          <button id="btn-fire" class="mobile-btn btn-fire" data-role="fire">●</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    this._el       = el;
    this._joyOuter = el.querySelector('#joy-outer');
    this._joyInner = el.querySelector('#joy-inner');
  }

  // ── Event wiring ───────────────────────────────────────────────────────────

  _wire() {
    // All touch routing is handled on the overlay itself so multi-touch works
    // across zone boundaries (e.g. holding fire while swiping to look).
    const opts = { passive: false };
    this._el.addEventListener('touchstart',  this._onStart.bind(this), opts);
    this._el.addEventListener('touchmove',   this._onMove.bind(this),  opts);
    this._el.addEventListener('touchend',    this._onEnd.bind(this),   opts);
    this._el.addEventListener('touchcancel', this._onEnd.bind(this),   opts);
  }

  // ── Touch classification ───────────────────────────────────────────────────

  _roleOf(touch) {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el) {
      const btn = el.closest('[data-role]');
      if (btn) return btn.dataset.role;
    }
    // Left 46 % → joystick zone; right side → camera look
    return touch.clientX < window.innerWidth * 0.46 ? 'joy' : 'look';
  }

  // ── Touch handlers ─────────────────────────────────────────────────────────

  _onStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const role = this._roleOf(t);
      this._touches.set(t.identifier, {
        role,
        startX: t.clientX, startY: t.clientY,
        lastX:  t.clientX, lastY:  t.clientY,
      });
      this._handleDown(role, t);
    }
  }

  _onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = this._touches.get(t.identifier);
      if (!rec) continue;
      this._handleMove(rec, t);
      rec.lastX = t.clientX;
      rec.lastY = t.clientY;
    }
  }

  _onEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = this._touches.get(t.identifier);
      if (rec) {
        this._handleUp(rec.role);
        this._touches.delete(t.identifier);
      }
    }
  }

  // ── Down / move / up per role ──────────────────────────────────────────────

  _handleDown(role, touch) {
    const inp = this.input;
    switch (role) {
      case 'joy':
        this._joyCenter = { x: touch.clientX, y: touch.clientY };
        // Anchor the visual ring at the touch point
        this._joyOuter.style.left    = (touch.clientX - 52) + 'px';
        this._joyOuter.style.top     = (touch.clientY - 52) + 'px';
        this._joyOuter.style.opacity = '1';
        break;
      case 'fire':
        inp.mouseDown = true;
        break;
      case 'jump':
        inp.justPressed.add('Space');
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

  _handleMove(rec, touch) {
    if (rec.role === 'joy') {
      this._updateJoy(touch.clientX, touch.clientY);
    } else if (rec.role === 'look') {
      const dx = touch.clientX - rec.lastX;
      const dy = touch.clientY - rec.lastY;
      this.input.mouseDX += dx * TOUCH_SENSITIVITY;
      this.input.mouseDY += dy * TOUCH_SENSITIVITY;
    }
  }

  _updateJoy(cx, cy) {
    let dx = cx - this._joyCenter.x;
    let dy = cy - this._joyCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Clamp nub to ring radius
    if (dist > JOY_RADIUS) {
      const s = JOY_RADIUS / dist;
      dx *= s; dy *= s;
    }

    // Move the inner nub (CSS transform, relative to outer center)
    this._joyInner.style.transform = `translate(${dx}px,${dy}px)`;

    // Map to virtual WASD keys
    const inp = this.input;
    const forward = -dy;
    inp.setVirtualKey('KeyW', forward >  JOY_DEAD);
    inp.setVirtualKey('KeyS', forward < -JOY_DEAD);
    inp.setVirtualKey('KeyA', dx < -JOY_DEAD);
    inp.setVirtualKey('KeyD', dx >  JOY_DEAD);

    // Auto-sprint: full-tilt forward or diagonal = hold Shift
    inp.setVirtualKey('ShiftLeft', forward > SPRINT_THRESH && Math.abs(dx) < JOY_RADIUS * 0.7);
  }

  _handleUp(role) {
    const inp = this.input;
    if (role === 'joy') {
      // Release all movement keys
      inp.setVirtualKey('KeyW',     false);
      inp.setVirtualKey('KeyS',     false);
      inp.setVirtualKey('KeyA',     false);
      inp.setVirtualKey('KeyD',     false);
      inp.setVirtualKey('ShiftLeft', false);
      // Hide joystick visual
      this._joyOuter.style.opacity = '0';
      this._joyInner.style.transform = 'translate(0px,0px)';
    } else if (role === 'fire') {
      inp.mouseDown = false;
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  show() {
    this._el.classList.remove('hidden');
  }

  hide() {
    // Release everything when hidden so controls don't get stuck
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
