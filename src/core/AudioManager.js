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
    // Per-weapon character: punch (low body), crack (filtered noise), tail.
    const P = {
      sidearm: { dur: 0.14, body: 300, crackHz: 3200, tail: 0.10, gain: 0.9 },
      smg:     { dur: 0.10, body: 250, crackHz: 3600, tail: 0.07, gain: 0.85 },
      shotgun: { dur: 0.26, body: 130, crackHz: 1900, tail: 0.22, gain: 1.0 },
      rifle:   { dur: 0.13, body: 220, crackHz: 4200, tail: 0.12, gain: 0.95 },
      lmg:     { dur: 0.16, body: 170, crackHz: 3000, tail: 0.14, gain: 1.0 },
      sniper:  { dur: 0.36, body: 100, crackHz: 5200, tail: 0.30, gain: 1.0 },
      rpg:     { dur: 0.4,  body: 80,  crackHz: 1400, tail: 0.34, gain: 1.0 },
    }[kind] || { dur: 0.13, body: 220, crackHz: 4000, tail: 0.12, gain: 0.95 };

    // 1) Transient crack — short bright noise burst (the "snap").
    const crack = this.ctx.createBufferSource();
    crack.buffer = this._noiseBuffer(0.05);
    const crackHP = this.ctx.createBiquadFilter();
    crackHP.type = 'highpass';
    crackHP.frequency.value = 1200;
    const crackBP = this.ctx.createBiquadFilter();
    crackBP.type = 'bandpass';
    crackBP.frequency.setValueAtTime(P.crackHz, t);
    crackBP.frequency.exponentialRampToValueAtTime(P.crackHz * 0.4, t + 0.05);
    crackBP.Q.value = 0.8;
    const crackGain = this._envGain(0.55 * P.gain, 0.001, 0.05, t);
    crack.connect(crackHP).connect(crackBP).connect(crackGain).connect(this.master);

    // 2) Body punch — pitch-dropping tone for weight.
    const body = this.ctx.createOscillator();
    body.type = 'square';
    body.frequency.setValueAtTime(P.body, t);
    body.frequency.exponentialRampToValueAtTime(P.body * 0.35, t + P.dur);
    const bodyGain = this._envGain(0.6 * P.gain, 0.001, P.dur, t);
    const bodyShape = this.ctx.createBiquadFilter();
    bodyShape.type = 'lowpass';
    bodyShape.frequency.value = P.body * 8;
    body.connect(bodyShape).connect(bodyGain).connect(this.master);

    // 3) Tail — lower-passed noise that decays, the report bouncing off the map.
    const tail = this.ctx.createBufferSource();
    tail.buffer = this._noiseBuffer(P.tail);
    const tailLP = this.ctx.createBiquadFilter();
    tailLP.type = 'lowpass';
    tailLP.frequency.setValueAtTime(P.crackHz * 0.5, t);
    tailLP.frequency.exponentialRampToValueAtTime(220, t + P.tail);
    const tailGain = this._envGain(0.5 * P.gain, 0.004, P.tail, t + 0.01);
    tail.connect(tailLP).connect(tailGain).connect(this.master);

    crack.start(t); body.start(t); tail.start(t + 0.005);
    crack.stop(t + 0.06);
    body.stop(t + P.dur + 0.02);
    tail.stop(t + P.tail + 0.04);
  }

  // Kawaii anime "pew~!" — a cute vocal-ish chirp with vibrato + sparkle.
  playAnimeShot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // Vibrato LFO for a cute "voice" wobble.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 28;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 55;
    lfo.connect(lfoGain);

    // Main "pew" — bright rise then a quick down-glide (the kawaii drop).
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1040, t);
    osc.frequency.exponentialRampToValueAtTime(1960, t + 0.045);
    osc.frequency.exponentialRampToValueAtTime(680, t + 0.2);
    lfoGain.connect(osc.frequency);
    // soft formant so it sounds vocal, not buzzy
    const formant = this.ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 1500;
    formant.Q.value = 1.4;
    const gain = this._envGain(0.34, 0.005, 0.2, t);
    osc.connect(formant).connect(gain).connect(this.master);

    // A soft sub sine doubling an octave down for body.
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(520, t);
    sub.frequency.exponentialRampToValueAtTime(340, t + 0.2);
    const subGain = this._envGain(0.16, 0.005, 0.2, t);
    sub.connect(subGain).connect(this.master);

    // Twinkle sparkle on top.
    const spark = this.ctx.createOscillator();
    spark.type = 'sine';
    spark.frequency.setValueAtTime(2800, t + 0.02);
    spark.frequency.exponentialRampToValueAtTime(4200, t + 0.14);
    const sGain = this._envGain(0.13, 0.002, 0.14, t + 0.02);
    spark.connect(sGain).connect(this.master);

    lfo.start(t); osc.start(t); sub.start(t); spark.start(t + 0.02);
    lfo.stop(t + 0.24); osc.stop(t + 0.24); sub.stop(t + 0.24); spark.stop(t + 0.18);
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
