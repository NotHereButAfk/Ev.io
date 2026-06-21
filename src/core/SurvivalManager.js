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

    // Callbacks — set by Game.js before calling update()
    this.onWaveStart  = null; // (wave, count, hpMult, speedMult, armedRatio) => void
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

  _startNextWave() {
    this.wave++;
    this.betweenWave = false;
    this.waveTimer   = WAVE_TIME_LIMIT;

    const count     = 4 + (this.wave - 1) * 2;          // wave1=4, wave2=6, …
    const hpMult    = 1 + (this.wave - 1) * 0.25;        // +25 % HP per wave
    const speedMult = 1 + (this.wave - 1) * 0.07;        // +7 % speed per wave

    // Armed escalation: waves 1-5 = melee only, 6-8 = 20% pistols,
    // 9-11 = 40%, 12-14 = 60% rifle mix, 15+ = 80% heavy mix
    let armedRatio = 0;
    if      (this.wave >= 15) armedRatio = 0.80;
    else if (this.wave >= 12) armedRatio = 0.60;
    else if (this.wave >=  9) armedRatio = 0.40;
    else if (this.wave >=  6) armedRatio = 0.20;

    this.onWaveStart?.(this.wave, count, hpMult, speedMult, armedRatio);
  }

  _waveClear() {
    this.betweenWave  = true;
    this.betweenTimer = BETWEEN_WAVE_GAP;
    this.onWaveClear?.(this.wave);
  }

  // allZombiesDead: ZombieManager.allDead() result passed in each frame
  update(dt, allZombiesDead) {
    if (this.gameOver) return;

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
