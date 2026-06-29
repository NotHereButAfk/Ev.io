export class InputManager {
  constructor(domElement) {
    this.domElement = domElement;
    this.keys = new Set();
    this.mouseDown = false;
    this.rightMouseDown = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.pointerLocked = false;
    this.justPressed = new Set();

    // Treat any coarse-pointer / touch device as mobile.
    // Use three independent signals so one false negative doesn't break it.
    this.isMobile = ('ontouchstart' in window)
      || (navigator.maxTouchPoints > 0)
      || (window.matchMedia?.('(pointer: coarse)').matches ?? false);
    this._virtualKeys = new Set();

    this._onKeyDown = (e) => {
      // Tab is the in-game scoreboard — stop it from cycling focus / leaving the page.
      if (e.code === 'Tab') e.preventDefault();
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightMouseDown = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightMouseDown = false;
    };
    this._onWheel = (e) => {
      this.wheelDelta += Math.sign(e.deltaY);
    };
    this.onLockChange = null; // (locked: boolean) => void
    this._onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.domElement;
      if (!this.pointerLocked) {
        this.mouseDown = false;
        this.rightMouseDown = false;
      }
      if (this.onLockChange) this.onLockChange(this.pointerLocked);
    };
    this._onContextMenu = (e) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    domElement.addEventListener('contextmenu', this._onContextMenu);
  }

  isDown(code) {
    return this.keys.has(code) || this._virtualKeys.has(code);
  }

  consumeJustPressed(code) {
    if (this.justPressed.has(code)) {
      this.justPressed.delete(code);
      return true;
    }
    return false;
  }

  /**
   * Set a virtual key state from touch controls.
   * Also fires a justPressed event on the leading edge so consumeJustPressed works.
   */
  setVirtualKey(code, pressed) {
    if (pressed) {
      if (!this._virtualKeys.has(code) && !this.keys.has(code)) {
        this.justPressed.add(code);
      }
      this._virtualKeys.add(code);
    } else {
      this._virtualKeys.delete(code);
    }
  }

  requestPointerLock() {
    if (this.isMobile) return;
    this.domElement.requestPointerLock();
  }

  exitPointerLock() {
    if (this.isMobile) return;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Call once per frame after consuming deltas. */
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.justPressed.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
  }
}
