// Manages zombie survival mode: grace period, escalating waves, player downed/revive.

const GRACE_TIME       = 60;   // seconds before first wave
const WAVE_TIME_LIMIT  = 60;   // seconds to clear a wave before next auto-starts
const BETWEEN_WAVE_GAP = 12;   // seconds of rest between waves
const AUTO_REVIVE_SECS = 12;   // seconds until teammate auto-revives downed player

export class SurvivalManager {
  constructor() {
    this.AUTO_REVIVE_TIME = AUTO_REVIVE_SECS;
    this.reset();
  }

  reset() {
    this.wave          = 0;
    this.graceActive   = true;
    this.graceTimer    = GRACE_TIME;
    this.waveTimer     = 0;
    this.betweenWave   = false;
    this.betweenTimer  = 0;
    this.isDowned      = false;
    this.downedTimer   = 0;
    this.revivesLeft   = 2;    // player gets 2 auto-revives per game
    this.gameOver      = false;
    this.elapsed       = 0;    // seconds survived this run (for best-time)

    // Callbacks — set by Game.js before calling update()
    this.onWaveStart  = null; // (wave, count, hpMult, speedMult, armedRatio, dmgMult) => void
    this.onWaveClear  = null; // (wave) => void
    this.onRevive     = null; // () => void
    this.onGameOver   = null; // () => void
    this.onGraceEnd   = null; // () => void
  }

  // Call when player HP hits 0 in survival
  playerDowned() {
    if (this.isDowned || this.gameOver) return;
    if (this.revivesLeft <= 0) {
      this.gameOver = true;
      this.onGameOver?.();
      return;
    }
    this.isDowned    = true;
    this.downedTimer = AUTO_REVIVE_SECS;
  }

  // Coin reward for killing a zombie: 0.10–0.27
  zombieKillReward() {
    return +( 0.10 + Math.random() * 0.17 ).toFixed(2);
  }

  // Escalating coin multiplier shown in the HUD; grows each wave.
  waveBonus() {
    return +Math.min(5, 1 + Math.max(0, this.wave) * 0.1).toFixed(1);
  }

  // Best survival time, persisted across runs.
  bestTime() {
    try { return Math.max(0, +localStorage.getItem('sio_survival_best') || 0); }
    catch { return 0; }
  }
  recordBest() {
    if (this.elapsed > this.bestTime()) {
      try { localStorage.setItem('sio_survival_best', String(Math.floor(this.elapsed))); } catch { /* ignore */ }
    }
  }

  _startNextWave() {
    this.wave++;
    this.betweenWave = false;
    this.waveTimer   = WAVE_TIME_LIMIT;

    // Escalation curve — the zombies get harder every single wave forever:
    // more of them, more HP, faster (softly capped so runs stay reactable),
    // more damage, and by mid-game they pull guns. Waves are unlimited; the
    // only end condition is the player running out of revives.
    const w = this.wave;
    const count     = Math.min(60, Math.round(4 + (w - 1) * 2.5));
    const hpMult    = 1 + (w - 1) * 0.35;                     // wave 10 ≈ 4.15x, wave 30 ≈ 11.15x
    // Soft cap on speed — asymptotically approaches 3.0 so wave 50 is still
    // faster than wave 20, but not physically impossible to react to.
    const speedMult = 1 + 2 * (1 - Math.exp(-(w - 1) * 0.10));
    const dmgMult   = 1 + (w - 1) * 0.15;                     // wave 10 ≈ 2.35x

    // Armed escalation — guns start earlier and ramp harder. From wave 15 the
    // whole arena is armed troopers, and it never comes back down.
    let armedRatio = 0;
    if      (w >= 15) armedRatio = 0.95;
    else if (w >= 12) armedRatio = 0.80;
    else if (w >= 10) armedRatio = 0.65;
    else if (w >=  8) armedRatio = 0.50;
    else if (w >=  6) armedRatio = 0.30;
    else if (w >=  4) armedRatio = 0.15;

    this.onWaveStart?.(w, count, hpMult, speedMult, armedRatio, dmgMult);
  }

  _waveClear() {
    this.betweenWave  = true;
    this.betweenTimer = BETWEEN_WAVE_GAP;
    this.onWaveClear?.(this.wave);
  }

  // allZombiesDead: ZombieManager.allDead() result passed in each frame
  update(dt, allZombiesDead) {
    if (this.gameOver) return;
    this.elapsed += dt;   // count total time survived

    // Grace period countdown
    if (this.graceActive) {
      this.graceTimer -= dt;
      if (this.graceTimer <= 0) {
        this.graceActive = false;
        this.onGraceEnd?.();
        this._startNextWave();
      }
      return;
    }

    // Downed countdown (zombies keep moving while player is down)
    if (this.isDowned) {
      this.downedTimer -= dt;
      if (this.downedTimer <= 0) {
        this.isDowned = false;
        this.revivesLeft--;
        this.onRevive?.();
      }
      // Wave timer still ticks while downed so zombies can overwhelm
    }

    // Between-wave rest period
    if (this.betweenWave) {
      this.betweenTimer -= dt;
      if (this.betweenTimer <= 0) this._startNextWave();
      return;
    }

    // Active wave — auto-advance if time expires or all zombies dead
    this.waveTimer -= dt;
    if (allZombiesDead || this.waveTimer <= 0) {
      this._waveClear();
    }
  }
}
