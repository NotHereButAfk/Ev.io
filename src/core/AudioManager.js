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
    // Per-weapon profile: punch (body tone), crack (filtered noise burst), tail (reverb decay).
    // Values tuned to match each weapon's real acoustic signature.
    const P = {
      // Pistols — tight crack, medium body, short tail
      sidearm:  { dur: 0.14, body: 310, crackHz: 3400, tail: 0.10, gain: 0.88 },
      // SMGs — high rate, bright crack, little body
      smg:      { dur: 0.09, body: 240, crackHz: 3800, tail: 0.06, gain: 0.82 },
      // Shotgun — low frequency boom, wide crack, long reverb
      shotgun:  { dur: 0.28, body: 110, crackHz: 1600, tail: 0.26, gain: 1.0  },
      // Assault rifles — punchy mid body, sharp crack
      rifle:    { dur: 0.13, body: 230, crackHz: 4500, tail: 0.12, gain: 0.94 },
      // LMG — heavy sustained body, rumbling tail
      lmg:      { dur: 0.18, body: 160, crackHz: 2800, tail: 0.16, gain: 1.0  },
      // Sniper — ultra-low body boom, piercing supersonic crack, very long tail
      sniper:   { dur: 0.40, body:  85, crackHz: 6000, tail: 0.38, gain: 1.0  },
      // RPG — deep sub-bass thump (explosion handled by playExplosion separately)
      rpg:      { dur: 0.42, body:  70, crackHz: 1200, tail: 0.36, gain: 1.0  },
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
      case 'meow':  this.playMeowShot();  return true;
      case 'uwu':   this.playUwuShot();   return true;
      case 'bark':  this.playBarkShot();  return true;
      case 'sparkle': this.playSparkleShot(); return true;
      default: return false;
    }
  }

  // Anime cat-girl "nya~!" — a cute meow with a rising-then-falling pitch arch,
  // twin vowel formants and gentle vibrato so it reads as a voice, not a buzz.
  playMeowShot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // Vibrato LFO for the kitty "voice" wobble.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 22;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 34;
    lfo.connect(lfoGain);

    // Fundamental — "ny-aa-ow" pitch arch: up then down.
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.exponentialRampToValueAtTime(960, t + 0.09);
    osc.frequency.exponentialRampToValueAtTime(560, t + 0.30);
    lfoGain.connect(osc.frequency);

    // Two vowel formants sweeping from "eh" → "ah" make the meow vocal.
    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.Q.value = 5;
    f1.frequency.setValueAtTime(820, t);
    f1.frequency.linearRampToValueAtTime(1050, t + 0.30);
    const f2 = this.ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.Q.value = 7;
    f2.frequency.setValueAtTime(2600, t);
    f2.frequency.linearRampToValueAtTime(2200, t + 0.30);
    const gain = this._envGain(0.34, 0.012, 0.30, t);
    osc.connect(f1).connect(f2).connect(gain).connect(this.master);

    // A soft "breath" of noise at the very start ("ny" consonant).
    const breath = this.ctx.createBufferSource();
    breath.buffer = this._noiseBuffer(0.05);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.2;
    const bGain = this._envGain(0.10, 0.002, 0.045, t);
    breath.connect(bp).connect(bGain).connect(this.master);

    lfo.start(t); osc.start(t); breath.start(t);
    lfo.stop(t + 0.34); osc.stop(t + 0.34); breath.stop(t + 0.06);
  }

  // Kawaii "uwu~" squeak — a cute two-note rise with a giggly wobble.
  playUwuShot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 36;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 70;
    lfo.connect(lfoGain);
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    // "u-wu": dip then two little bumps up.
    osc.frequency.setValueAtTime(560, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.07);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.13);
    osc.frequency.exponentialRampToValueAtTime(1180, t + 0.2);
    lfoGain.connect(osc.frequency);
    const formant = this.ctx.createBiquadFilter();
    formant.type = 'bandpass'; formant.frequency.value = 900; formant.Q.value = 2.2;
    const gain = this._envGain(0.32, 0.006, 0.2, t);
    osc.connect(formant).connect(gain).connect(this.master);
    // sparkle on top
    const spark = this.ctx.createOscillator();
    spark.type = 'sine';
    spark.frequency.setValueAtTime(3200, t + 0.04);
    spark.frequency.exponentialRampToValueAtTime(4600, t + 0.16);
    const sGain = this._envGain(0.11, 0.002, 0.14, t + 0.04);
    spark.connect(sGain).connect(this.master);
    lfo.start(t); osc.start(t); spark.start(t + 0.04);
    lfo.stop(t + 0.24); osc.stop(t + 0.24); spark.stop(t + 0.2);
  }

  // Cute anime puppy "yip!" — a short sharp bark with a quick down-glide.
  playBarkShot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(820, t);
    osc.frequency.exponentialRampToValueAtTime(1300, t + 0.025);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.13);
    const formant = this.ctx.createBiquadFilter();
    formant.type = 'bandpass'; formant.frequency.value = 1400; formant.Q.value = 3;
    const gain = this._envGain(0.36, 0.003, 0.13, t);
    osc.connect(formant).connect(gain).connect(this.master);
    const breath = this.ctx.createBufferSource();
    breath.buffer = this._noiseBuffer(0.04);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'highpass'; bp.frequency.value = 2000;
    const bGain = this._envGain(0.12, 0.001, 0.035, t);
    breath.connect(bp).connect(bGain).connect(this.master);
    osc.start(t); breath.start(t);
    osc.stop(t + 0.15); breath.stop(t + 0.05);
  }

  // Magical sparkle "kira~" — ascending bell arpeggio with shimmer.
  playSparkleShot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [1568, 2093, 2637, 3136].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = this._envGain(0.16 - i * 0.02, 0.002, 0.16, t + i * 0.025);
      osc.connect(g).connect(this.master);
      osc.start(t + i * 0.025); osc.stop(t + i * 0.025 + 0.2);
    });
    // airy shimmer tail
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.2);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 5000;
    const nGain = this._envGain(0.07, 0.01, 0.18, t + 0.03);
    noise.connect(hp).connect(nGain).connect(this.master);
    noise.start(t + 0.03); noise.stop(t + 0.24);
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

  // Concrete footstep — low thud with scuff
  playFootstep(sprint = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = sprint ? 0.20 : 0.12;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(sprint ? 90 : 68, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.09);
    const oGain = this._envGain(g, 0.002, 0.09, t);
    osc.connect(oGain).connect(this.master);
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.06);
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = sprint ? 1600 : 1100;
    nf.Q.value = 0.5;
    const nGain = this._envGain(g * 0.35, 0.002, 0.05, t);
    noise.connect(nf).connect(nGain).connect(this.master);
    osc.start(t); noise.start(t);
    osc.stop(t + 0.11); noise.stop(t + 0.07);
  }

  // Jump effort whoosh
  playJump() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.12);
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(220, t + 0.10);
    const g = this._envGain(0.11, 0.005, 0.10, t);
    noise.connect(f).connect(g).connect(this.master);
    noise.start(t); noise.stop(t + 0.13);
  }

  // Landing impact thud
  playLand(hard = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gv = hard ? 0.50 : 0.28;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hard ? 115 : 78, t);
    osc.frequency.exponentialRampToValueAtTime(24, t + 0.19);
    const oGain = this._envGain(gv, 0.001, 0.19, t);
    osc.connect(oGain).connect(this.master);
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.10);
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 1400;
    const nGain = this._envGain(gv * 0.45, 0.001, 0.08, t);
    noise.connect(nf).connect(nGain).connect(this.master);
    osc.start(t); noise.start(t);
    osc.stop(t + 0.21); noise.stop(t + 0.11);
  }

  // Weapon switch click-whoosh
  playWeaponSwitch() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(780, t);
    osc.frequency.exponentialRampToValueAtTime(280, t + 0.07);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2200;
    const g = this._envGain(0.14, 0.001, 0.07, t);
    osc.connect(f).connect(g).connect(this.master);
    osc.start(t); osc.stop(t + 0.09);
  }

  // Brass shell casing ejecting and bouncing on concrete
  playShellCasing() {
    if (!this.ctx) return;
    const delay = 0.09 + Math.random() * 0.07;
    const t = this.ctx.currentTime + delay;
    [860, 1280, 2100].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * (0.96 + Math.random() * 0.08);
      const g = this._envGain(0.055 / (i + 1), 0.001, 0.11 - i * 0.02, t);
      osc.connect(g).connect(this.master);
      osc.start(t); osc.stop(t + 0.14);
    });
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.04);
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'highpass';
    nf.frequency.value = 3200;
    const nGain = this._envGain(0.07, 0.001, 0.03, t);
    noise.connect(nf).connect(nGain).connect(this.master);
    noise.start(t); noise.stop(t + 0.04);
  }

  // Magazine drop clatter (first phase of reload)
  playReloadMag() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 0.045, 0.09].forEach((off, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 370 - i * 35;
      const g = this._envGain(0.14, 0.001, 0.06, t + off);
      osc.connect(g).connect(this.master);
      osc.start(t + off); osc.stop(t + off + 0.08);
    });
  }

  // Slide rack / bolt action (second phase of reload)
  playReloadRack() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(860, t);
    osc.frequency.exponentialRampToValueAtTime(290, t + 0.065);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1700;
    f.Q.value = 1.6;
    const g = this._envGain(0.24, 0.001, 0.065, t);
    osc.connect(f).connect(g).connect(this.master);
    osc.start(t); osc.stop(t + 0.08);
  }

  // Zombie guttural growl
  playZombieGrowl() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 38;
    lfo.connect(lfoG);
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(98, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.65);
    lfoG.connect(osc.frequency);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(560, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.65);
    const g = this._envGain(0.25, 0.08, 0.52, t);
    osc.connect(lp).connect(g).connect(this.master);
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.7);
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 380;
    nf.Q.value = 0.55;
    const nGain = this._envGain(0.16, 0.06, 0.52, t);
    noise.connect(nf).connect(nGain).connect(this.master);
    lfo.start(t); osc.start(t); noise.start(t);
    lfo.stop(t + 0.72); osc.stop(t + 0.72); noise.stop(t + 0.72);
  }

  // Zombie death — wet splat + falling groan
  playZombieDeath() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.28);
    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'lowpass';
    f1.frequency.setValueAtTime(820, t);
    f1.frequency.exponentialRampToValueAtTime(110, t + 0.24);
    const g1 = this._envGain(0.5, 0.002, 0.24, t);
    noise.connect(f1).connect(g1).connect(this.master);
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(128, t + 0.04);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.48);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 480;
    const g2 = this._envGain(0.32, 0.01, 0.42, t + 0.04);
    osc.connect(lp).connect(g2).connect(this.master);
    noise.start(t); osc.start(t + 0.04);
    noise.stop(t + 0.30); osc.stop(t + 0.52);
  }

  // Zombie melee strike impact
  playZombieAttack() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(195, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.13);
    const g = this._envGain(0.42, 0.001, 0.13, t);
    osc.connect(g).connect(this.master);
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.09);
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 1100;
    const nGain = this._envGain(0.28, 0.001, 0.07, t);
    noise.connect(nf).connect(nGain).connect(this.master);
    osc.start(t); noise.start(t);
    osc.stop(t + 0.15); noise.stop(t + 0.10);
  }

  // Continuous ambient city — distant traffic + occasional siren
  startAmbientCity() {
    if (!this.ctx || this._ambientRunning) return;
    this._ambientRunning = true;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(6.0);
    noise.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const ambGain = this.ctx.createGain();
    ambGain.gain.value = 0.055;
    noise.connect(lp).connect(ambGain).connect(this.master);
    noise.start();
    this._ambientNoise = noise;
    this._sirenInterval = setInterval(() => {
      if (!this._ambientRunning || !this.ctx) return;
      if (Math.random() > 0.28) return;
      const t2 = this.ctx.currentTime;
      const s = this.ctx.createOscillator();
      s.type = 'sawtooth';
      s.frequency.setValueAtTime(620, t2);
      s.frequency.linearRampToValueAtTime(860, t2 + 0.55);
      s.frequency.linearRampToValueAtTime(620, t2 + 1.1);
      s.frequency.linearRampToValueAtTime(860, t2 + 1.65);
      const lp2 = this.ctx.createBiquadFilter();
      lp2.type = 'lowpass';
      lp2.frequency.value = 1100;
      const sGain = this.ctx.createGain();
      sGain.gain.setValueAtTime(0, t2);
      sGain.gain.linearRampToValueAtTime(0.019, t2 + 0.18);
      sGain.gain.setValueAtTime(0.019, t2 + 1.65);
      sGain.gain.linearRampToValueAtTime(0, t2 + 2.1);
      s.connect(lp2).connect(sGain).connect(this.master);
      s.start(t2); s.stop(t2 + 2.2);
    }, 7000);
  }

  stopAmbientCity() {
    this._ambientRunning = false;
    if (this._ambientNoise) { try { this._ambientNoise.stop(); } catch {} this._ambientNoise = null; }
    if (this._sirenInterval) { clearInterval(this._sirenInterval); this._sirenInterval = null; }
  }
}
