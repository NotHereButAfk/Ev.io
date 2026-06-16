const _KEY = 'sio_settings';

export const DEFAULTS = {
  sensitivity: 1.0,   // mouse-look scale multiplier
  volume:      0.5,   // master audio gain  0–1
  fov:         78,    // player camera field-of-view in degrees
  quality:     'medium', // 'low' | 'medium' | 'high'
};

export const GameSettings = {
  _d: null,

  load() {
    try { this._d = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(_KEY) || '{}') }; }
    catch { this._d = { ...DEFAULTS }; }
    return this;
  },

  save() { localStorage.setItem(_KEY, JSON.stringify(this._d)); },

  get(key)        { if (!this._d) this.load(); return this._d[key] ?? DEFAULTS[key]; },
  set(key, value) { if (!this._d) this.load(); this._d[key] = value; this.save(); },
};
