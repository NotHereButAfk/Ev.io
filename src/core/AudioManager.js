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
    // Master limiter — keeps overlapping full-auto gunfire from clipping into
    // harsh digital distortion; gives the mix a tight, "produced" punch instead.
    this._limiter = this.ctx.createDynamicsCompressor();
    this._limiter.threshold.value = -7;
    this._limiter.knee.value = 8;
    this._limiter.ratio.value = 14;
    this._limiter.attack.value = 0.002;
    this._limiter.release.value = 0.16;
    this.master.connect(this._limiter).connect(this.ctx.destination);
    this._initGunBus();
  }

  // Shared convolution reverb for gunfire — a synthesized arena impulse response
  // (exponential noise decay + discrete early reflections) gives every shot a
  // real environmental "report" tail bouncing off the map, the single biggest
  // realism upgrade over a dry synthetic blip.
  _initGunBus() {
    const ctx = this.ctx;
    this._gunVerb = ctx.createConvolver();
    this._gunVerb.buffer = this._makeImpulseResponse(1.7, 3.4);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.9;
    this._gunVerb.connect(verbOut).connect(this.master);
    this._gunVerbIn = ctx.createGain();   // shared reverb-send input
    this._gunVerbIn.gain.value = 1.0;
    this._gunVerbIn.connect(this._gunVerb);
  }

  _makeImpulseResponse(duration, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const ir = ctx.createBuffer(2, len, rate);
    // Discrete early reflections (slapback echoes off arena surfaces): [time s, gain]
    const early = [[0.011, 0.62], [0.023, -0.44], [0.041, 0.33], [0.069, -0.25], [0.097, 0.18], [0.131, -0.12]];
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
      // Slightly offset L/R reflection times for natural stereo width.
      for (const [tr, gr] of early) {
        const idx = Math.floor(tr * rate * (ch ? 1.06 : 1));
        if (idx < len) d[idx] += gr;
      }
    }
    return ir;
  }

  // Soft-saturation waveshaper curve (cached) — gives the muzzle transient grit
  // and "crack" that pure oscillators + white noise can't produce on their own.
  _distortionCurve(amount) {
    if (this._distCache && this._distCache.a === amount) return this._distCache.c;
    const n = 1024;
    const curve = new Float32Array(n);
    const k = amount;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
    }
    this._distCache = { a: amount, c: curve };
    return curve;
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
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const R = (a, b) => a + Math.random() * (b - a);
    // Per-shot pitch + level jitter so sustained automatic fire never sounds
    // like one looped sample — real gunfire varies shot to shot.
    const jit = R(0.95, 1.05);
    const lvl = R(0.9, 1.0);

    // Per-weapon acoustic profile.
    //  body: muzzle-blast fundamental Hz · crackHz: supersonic snap band ·
    //  sub: chest-thump Hz · dist: transient saturation · reverb: send to arena IR
    const P = {
      // Pistols — tight crack, medium body, short report
      sidearm:  { dur: 0.13, body: 320, crackHz: 3600, sub: 92, dist: 6,  reverb: 0.34, gain: 0.9  },
      // SMGs — fast, bright, little body
      smg:      { dur: 0.085, body: 250, crackHz: 3900, sub: 80, dist: 5,  reverb: 0.22, gain: 0.84 },
      // Shotgun — low boom, wide crack, long roar
      shotgun:  { dur: 0.30, body: 120, crackHz: 1700, sub: 55, dist: 9,  reverb: 0.62, gain: 1.0  },
      // Assault rifles — punchy mid body, sharp supersonic crack
      rifle:    { dur: 0.135, body: 240, crackHz: 4600, sub: 76, dist: 7,  reverb: 0.42, gain: 0.96 },
      // LMG — heavy sustained body, rumbling report
      lmg:      { dur: 0.18, body: 168, crackHz: 2900, sub: 60, dist: 8,  reverb: 0.5,  gain: 1.0  },
      // Sniper — deep boom, piercing crack, very long tail
      sniper:   { dur: 0.42, body:  90, crackHz: 6200, sub: 46, dist: 10, reverb: 0.92, gain: 1.0  },
      // RPG launch thump (the blast itself is playExplosion)
      rpg:      { dur: 0.44, body:  72, crackHz: 1200, sub: 38, dist: 9,  reverb: 0.8,  gain: 1.0  },
    }[kind] || { dur: 0.135, body: 230, crackHz: 4200, sub: 72, dist: 7, reverb: 0.42, gain: 0.95 };

    const g = P.gain * lvl;

    // Per-shot bus: a dry path to the master and a send to the shared arena reverb.
    const dry = ctx.createGain(); dry.gain.value = 1; dry.connect(this.master);
    const send = ctx.createGain(); send.gain.value = P.reverb; send.connect(this._gunVerbIn);
    const out = (node) => { node.connect(dry); if (P.reverb > 0) node.connect(send); };

    // 1) Muzzle transient — the initial pressure spike: an ultra-sharp, saturated
    //    noise click. Sub-millisecond attack + waveshaper grit = the "snap".
    const click = ctx.createBufferSource();
    click.buffer = this._noiseBuffer(0.03);
    const clickHP = ctx.createBiquadFilter();
    clickHP.type = 'highpass'; clickHP.frequency.value = 1700;
    const shaper = ctx.createWaveShaper();
    shaper.curve = this._distortionCurve(P.dist);
    const clickGain = this._envGain(0.85 * g, 0.0004, 0.022, t);
    click.connect(clickHP).connect(shaper).connect(clickGain); out(clickGain);

    // 2) Supersonic crack — bright bandpass noise sweeping down (the bullet snap).
    const crack = ctx.createBufferSource();
    crack.buffer = this._noiseBuffer(0.06);
    const crackBP = ctx.createBiquadFilter();
    crackBP.type = 'bandpass';
    crackBP.frequency.setValueAtTime(P.crackHz * jit, t);
    crackBP.frequency.exponentialRampToValueAtTime(P.crackHz * 0.38, t + 0.055);
    crackBP.Q.value = 0.7;
    const crackGain = this._envGain(0.5 * g, 0.0008, 0.055, t);
    crack.connect(crackBP).connect(crackGain); out(crackGain);

    // 3) Body punch — detuned square+saw pair dropping in pitch, lowpassed: the
    //    gunpowder "boom" with weight and harmonic richness.
    const bodyLP = ctx.createBiquadFilter();
    bodyLP.type = 'lowpass'; bodyLP.frequency.value = P.body * 9;
    const bodyGain = this._envGain(0.62 * g, 0.0009, P.dur, t);
    bodyLP.connect(bodyGain); out(bodyGain);
    for (const [type, det] of [['square', 1.0], ['sawtooth', 0.5]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(P.body * jit * det, t);
      o.frequency.exponentialRampToValueAtTime(P.body * 0.32 * det, t + P.dur);
      const og = ctx.createGain(); og.gain.value = det === 1 ? 1 : 0.5;
      o.connect(og).connect(bodyLP);
      o.start(t); o.stop(t + P.dur + 0.03);
    }

    // 4) Sub thump — a low sine you feel in the chest more than hear.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(P.sub * jit, t);
    sub.frequency.exponentialRampToValueAtTime(P.sub * 0.5, t + P.dur * 1.4);
    const subGain = this._envGain(0.5 * g, 0.001, P.dur * 1.4, t);
    sub.connect(subGain).connect(dry); // sub stays dry (reverb would muddy it)

    // 5) Mechanical action — a short metallic tick (slide/bolt) just after firing.
    const mech = ctx.createBufferSource();
    mech.buffer = this._noiseBuffer(0.03);
    const mechBP = ctx.createBiquadFilter();
    mechBP.type = 'bandpass'; mechBP.frequency.value = 2600; mechBP.Q.value = 2.2;
    const mechGain = this._envGain(0.12 * g, 0.0006, 0.03, t + 0.012);
    mech.connect(mechBP).connect(mechGain).connect(dry);

    click.start(t); crack.start(t); sub.start(t); mech.start(t + 0.012);
    click.stop(t + 0.04); crack.stop(t + 0.07);
    sub.stop(t + P.dur * 1.4 + 0.04); mech.stop(t + 0.05);
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

  // Anime-girl "ah~♪" — a soft feminine vocal chirp: slow vocal vibrato,
  // rising-then-falling intonation, and two parallel formant filters so it
  // reads as a voice rather than a synth beep. Kept cute, not sultry.
  playWaifuShot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // Slow voice-like vibrato (a human wobble, not the fast kawaii shimmer).
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 6.5;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 14;
    lfo.connect(lfoGain);

    // The "ah~": quick lift then a gentle falling sigh contour.
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(720, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.06);
    osc.frequency.exponentialRampToValueAtTime(470, t + 0.32);
    lfoGain.connect(osc.frequency);

    // Two vocal formants in parallel ("a" vowel-ish), mixed back together.
    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.value = 950;  f1.Q.value = 2.0;
    const f2 = this.ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.frequency.value = 2500; f2.Q.value = 3.0;
    const mix = this.ctx.createGain();
    mix.gain.value = 1;
    const gain = this._envGain(0.32, 0.03, 0.3, t); // soft attack — breathy, not clicky
    osc.connect(f1).connect(mix);
    osc.connect(f2).connect(mix);
    mix.connect(gain).connect(this.master);

    // Faint breath layer under the voice. The noise buffer is identical every
    // shot, so generate it once and reuse it — one AudioBuffer can back many
    // source nodes, avoiding a fresh alloc + fill on every rapid-fire call.
    const breath = this.ctx.createBufferSource();
    breath.buffer = this._breathNoise();
    const bf = this.ctx.createBiquadFilter();
    bf.type = 'bandpass'; bf.frequency.value = 1800; bf.Q.value = 0.8;
    const bGain = this._envGain(0.05, 0.02, 0.16, t);
    breath.connect(bf).connect(bGain).connect(this.master);

    lfo.start(t); osc.start(t); breath.start(t);
    lfo.stop(t + 0.36); osc.stop(t + 0.36);
  }

  // Cached 0.2s decaying-noise buffer for the breath layer, built on first use.
  _breathNoise() {
    if (this._breathBuf) return this._breathBuf;
    const dur = 0.2;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    this._breathBuf = buf;
    return buf;
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

  // Prism mythic — crystalline refraction zap: three harmonic pings cascading
  // down like light splitting through glass, over a bright laser body and an
  // airy shimmer so it reads "energy through a crystal", not a plain pew.
  playPrismShot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // cascading refraction pings
    for (const [freq, dt] of [[2600, 0.0], [1950, 0.035], [1470, 0.07]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t + dt);
      o.frequency.exponentialRampToValueAtTime(freq * 0.82, t + dt + 0.09);
      const g = this._envGain(0.16, 0.002, 0.09, t + dt);
      o.connect(g).connect(this.master);
      o.start(t + dt); o.stop(t + dt + 0.11);
    }
    // laser body for punch
    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(980, t);
    body.frequency.exponentialRampToValueAtTime(220, t + 0.13);
    const bGain = this._envGain(0.3, 0.002, 0.13, t);
    body.connect(bGain).connect(this.master);
    body.start(t); body.stop(t + 0.15);
    // airy shimmer
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.14);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 5200;
    const nGain = this._envGain(0.12, 0.004, 0.13, t);
    noise.connect(hp).connect(nGain).connect(this.master);
    noise.start(t); noise.stop(t + 0.16);
  }

  // Pyroclasm mythic — volcanic blast: a sub-bass eruption drop, a wide slow
  // whoosh and trailing lava crackles. Deeper, longer and heavier than the
  // legendary 'fire' sound so the mythic reads bigger.
  playPyroShot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // sub eruption
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(120, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.32);
    const sGain = this._envGain(0.85, 0.003, 0.34, t);
    sub.connect(sGain).connect(this.master);
    // gritty mid layer
    const mid = this.ctx.createOscillator();
    mid.type = 'square';
    mid.frequency.setValueAtTime(72, t);
    mid.frequency.exponentialRampToValueAtTime(36, t + 0.24);
    const mGain = this._envGain(0.22, 0.004, 0.24, t);
    mid.connect(mGain).connect(this.master);
    // big slow whoosh
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.42);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3400, t);
    lp.frequency.exponentialRampToValueAtTime(240, t + 0.38);
    const nGain = this._envGain(0.8, 0.003, 0.4, t);
    noise.connect(lp).connect(nGain).connect(this.master);
    // trailing lava crackles
    for (const dt of [0.08, 0.15, 0.23]) {
      const c = this.ctx.createBufferSource();
      c.buffer = this._noiseBuffer(0.04);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400 + Math.random() * 1400;
      bp.Q.value = 8;
      const cGain = this._envGain(0.18, 0.002, 0.035, t + dt);
      c.connect(bp).connect(cGain).connect(this.master);
      c.start(t + dt); c.stop(t + dt + 0.05);
    }
    sub.start(t); mid.start(t); noise.start(t);
    sub.stop(t + 0.38); mid.stop(t + 0.28); noise.stop(t + 0.44);
  }

  // Dispatch a skin's custom shoot sound; returns false if there's no override.
  playSkinShot(soundId) {
    switch (soundId) {
      case 'anime': this.playAnimeShot(); return true;
      case 'waifu': this.playWaifuShot(); return true;
      case 'laser': this.playLaserShot(); return true;
      case 'fire':  this.playFireShot();  return true;
      case 'prism': this.playPrismShot(); return true;
      case 'pyro':  this.playPyroShot();  return true;
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

  // Sci-fi teleport blink — ascending sweep + resonant pop + shimmer tail.
  playTeleport() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // Ascending chirp: the "charge" just before blink.
    const sweep = this.ctx.createOscillator();
    sweep.type = 'sine';
    sweep.frequency.setValueAtTime(280, t);
    sweep.frequency.exponentialRampToValueAtTime(2800, t + 0.08);
    const sweepGain = this._envGain(0.28, 0.002, 0.08, t);
    sweep.connect(sweepGain).connect(this.master);

    // Hard pop at the blink moment.
    const pop = this.ctx.createOscillator();
    pop.type = 'square';
    pop.frequency.setValueAtTime(1200, t + 0.07);
    pop.frequency.exponentialRampToValueAtTime(60, t + 0.22);
    const popFilter = this.ctx.createBiquadFilter();
    popFilter.type = 'lowpass';
    popFilter.frequency.value = 800;
    const popGain = this._envGain(0.45, 0.001, 0.15, t + 0.07);
    pop.connect(popFilter).connect(popGain).connect(this.master);

    // Resonant shimmer tail.
    const ring = this.ctx.createOscillator();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(820, t + 0.09);
    ring.frequency.exponentialRampToValueAtTime(340, t + 0.38);
    const ringGain = this._envGain(0.18, 0.003, 0.32, t + 0.09);
    ring.connect(ringGain).connect(this.master);

    sweep.start(t);        pop.start(t + 0.07);  ring.start(t + 0.09);
    sweep.stop(t + 0.10);  pop.stop(t + 0.25);   ring.stop(t + 0.42);
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
