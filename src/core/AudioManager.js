// Lightweight procedural sound effects via WebAudio — no external audio assets needed.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  ensureContext() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    this.ensureContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.ensureContext();
    this.master.gain.value = Math.max(0, Math.min(1, v));
  }

  _noiseBuffer(duration) {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _envGain(gainValue, attack, decay, startTime) {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(gainValue, startTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + attack + decay);
    return gain;
  }

  playShot(kind = 'rifle') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const params = {
      sidearm: { dur: 0.12, freq: 320, noiseMix: 0.5 },
      smg: { dur: 0.08, freq: 260, noiseMix: 0.6 },
      shotgun: { dur: 0.22, freq: 150, noiseMix: 0.85 },
      rifle: { dur: 0.1, freq: 240, noiseMix: 0.6 },
      lmg: { dur: 0.13, freq: 180, noiseMix: 0.7 },
      sniper: { dur: 0.32, freq: 110, noiseMix: 0.7 },
      rpg: { dur: 0.35, freq: 90, noiseMix: 0.85 }
    }[kind] || { dur: 0.12, freq: 240, noiseMix: 0.6 };

    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(params.dur);
    const noiseGain = this._envGain(params.noiseMix, 0.002, params.dur, t);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = params.freq * 6;
    noise.connect(filter).connect(noiseGain).connect(this.master);

    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(params.freq, t);
    osc.frequency.exponentialRampToValueAtTime(params.freq * 0.4, t + params.dur);
    const oscGain = this._envGain(1 - params.noiseMix * 0.5, 0.001, params.dur, t);
    osc.connect(oscGain).connect(this.master);

    noise.start(t);
    osc.start(t);
    noise.stop(t + params.dur + 0.02);
    osc.stop(t + params.dur + 0.02);
  }

  // Kawaii anime "pew!" — a cute pitch-bent chirp with a sparkle harmonic.
  playAnimeShot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // main chirp: quick rise then fall
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1760, t + 0.05);
    osc.frequency.exponentialRampToValueAtTime(620, t + 0.18);
    const gain = this._envGain(0.32, 0.004, 0.18, t);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.22);
    // sparkle harmonic
    const spark = this.ctx.createOscillator();
    spark.type = 'sine';
    spark.frequency.setValueAtTime(2640, t + 0.02);
    spark.frequency.exponentialRampToValueAtTime(3960, t + 0.12);
    const sGain = this._envGain(0.12, 0.002, 0.12, t + 0.02);
    spark.connect(sGain).connect(this.master);
    spark.start(t + 0.02);
    spark.stop(t + 0.16);
  }

  // Sci-fi laser zap — descending saw with a metallic ring.
  playLaserShot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.16);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 6;
    const gain = this._envGain(0.3, 0.002, 0.16, t);
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  // Fiery shot — whooshing filtered noise over a low boom.
  playFireShot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.3);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + 0.26);
    const nGain = this._envGain(0.7, 0.003, 0.28, t);
    noise.connect(filter).connect(nGain).connect(this.master);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.22);
    const oGain = this._envGain(0.55, 0.003, 0.22, t);
    osc.connect(oGain).connect(this.master);
    noise.start(t); osc.start(t);
    noise.stop(t + 0.32); osc.stop(t + 0.26);
  }

  // Dispatch a skin's custom shoot sound; returns false if there's no override.
  playSkinShot(soundId) {
    switch (soundId) {
      case 'anime': this.playAnimeShot(); return true;
      case 'laser': this.playLaserShot(); return true;
      case 'fire':  this.playFireShot();  return true;
      default: return false;
    }
  }

  playExplosion() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.6);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(70, t + 0.5);
    const noiseGain = this._envGain(0.95, 0.005, 0.55, t);
    noise.connect(filter).connect(noiseGain).connect(this.master);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    const oscGain = this._envGain(0.8, 0.005, 0.42, t);
    osc.connect(oscGain).connect(this.master);

    noise.start(t);
    osc.start(t);
    noise.stop(t + 0.62);
    osc.stop(t + 0.45);
  }

  playSwing() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.18);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(4000, t + 0.18);
    const gain = this._envGain(0.4, 0.01, 0.17, t);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.2);
  }

  playReload() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 0.12].forEach((offset) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 500;
      const gain = this._envGain(0.18, 0.001, 0.05, t + offset);
      osc.connect(gain).connect(this.master);
      osc.start(t + offset);
      osc.stop(t + offset + 0.07);
    });
  }

  playHit() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.08);
    const gain = this._envGain(0.3, 0.001, 0.09, t);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  playKill() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 0.07].forEach((offset, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 500 + i * 220;
      const gain = this._envGain(0.22, 0.001, 0.12, t + offset);
      osc.connect(gain).connect(this.master);
      osc.start(t + offset);
      osc.stop(t + offset + 0.14);
    });
  }

  playHurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.25);
    const gain = this._envGain(0.3, 0.001, 0.25, t);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  playEmptyClick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 220;
    const gain = this._envGain(0.15, 0.001, 0.04, t);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.05);
  }
}
