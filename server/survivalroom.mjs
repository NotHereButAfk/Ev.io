import { AuthRoom, TICK_HZ } from "./authroom.mjs";
import { SurvivalBotAI } from "./survival-bot-ai.mjs";
import { SurvivalNavigation } from "./survival-navigation.mjs";
import {
  survivalBotConfig,
  loadSurvivalBotConfig,
} from "./survival-bot-config.mjs";
import { makeInput } from "../src/sim/MoveSim.js";
// Authoritative PvE reuses the production collision, weapon and damage simulation.
export class SurvivalRoom extends AuthRoom {
  constructor(arena, options = {}) {
    super(arena, { ...options, shieldsEnabled: true, targetPopulation: 0 });
    this.mode = "survival";
    this.botConfig = options.botConfig
      ? survivalBotConfig(options.botConfig)
      : loadSurvivalBotConfig();
    this.navigation = new SurvivalNavigation(this, this.botConfig);
    this.allyAI = new SurvivalBotAI(this, this.botConfig, this.navigation);
    this.waveState = "PRE_WAVE";
    this.wave = 0;
    this.nextWaveTick = TICK_HZ * 15;
    this.matchDurationMs = 24 * 60 * 60 * 1000;
    this.matchStart = Date.now();
  }
  participants() {
    return [...this.players.values()].filter((p) => !p.survivalEnemy);
  }
  enemies() {
    return [...this.players.values()].filter((p) => p.survivalEnemy);
  }
  opponents(a, b) {
    if (!a || !b || a.id === b.id) return false;
    if (a.survivalEnemy && b.survivalEnemy) return false;
    if (!a.survivalEnemy && !b.survivalEnemy)
      return !this.botConfig.survivalFriendlyBots;
    return true;
  }
  _provokeBot() {} // Survival perception never receives FFA's wall-penetrating last-seen hints.
  _allyName(used) {
    for (let suffix = 0; ; suffix++)
      for (const base of this.botConfig.names) {
        const name = base + (suffix || "");
        if (!used.has(name)) {
          used.add(name);
          return name;
        }
      }
  }
  _fillBotSlots() {
    this._rebalanceBots();
  }
  _rebalanceBots() {
    if (!this.botConfig) return;
    const humans = this.participants().filter((p) => !p.isBot);
    if (!humans.length) return;
    const desired = Math.min(
      this.botConfig.maximumBots,
      this.botConfig.desiredParticipants - humans.length,
    );
    const bots = this.participants().filter((p) => p.isBot);
    while (bots.length > desired) this._remove(bots.pop().id, false);
    while (bots.length < desired) {
      const used = new Set(this.participants().map((p) => p.name)),
        name = this._allyName(used);
      const id = this.addBot(name),
        p = this.players.get(id);
      p.survivalAlly = true;
      p.survivalWeapon =
        this.botConfig.weapons[id % this.botConfig.weapons.length];
      this._resetLifeInventory(p);
      p.damageDealt = 0;
      p.bossDamage = 0;
      p.wavesSurvived = 0;
      p.livesRemaining = this.botConfig.limitedLives;
      this.allyAI.reset(p);
      // Filling a vacated slot during combat must not manufacture an extra life.
      if (this.waveState === "ACTIVE" || this.waveState === "GAME_OVER") {
        p.alive = false;
        p.health = 0;
        p.deadUntil = Infinity;
        p.survivalAI.state = "DEAD";
      }
      bots.push(p);
    }
  }
  add(send, name) {
    const humans = this.participants().filter((p) => !p.isBot);
    if (humans.length >= this.botConfig.desiredParticipants) {
      send({ t: "kick", reason: "match full" });
      return null;
    }
    if (this.participants().length >= this.botConfig.desiredParticipants) {
      const enemies = this.enemies().filter((p) => p.alive);
      const danger = (p) =>
        Math.min(
          Infinity,
          ...enemies.map((e) =>
            Math.hypot(e.state.px - p.state.px, e.state.pz - p.state.pz),
          ),
        );
      const bots = this.participants()
        .filter((p) => p.isBot)
        .sort(
          (a, b) => Number(a.alive) - Number(b.alive) || danger(b) - danger(a),
        );
      if (bots[0]) this._remove(bots[0].id, false);
    }
    const id = super.add(send, name),
      p = this.players.get(id);
    if (p) {
      p.livesRemaining = this.botConfig.limitedLives;
      p.damageDealt = 0;
      p.bossDamage = 0;
      p.wavesSurvived = 0;
    }
      const used = new Set(this.participants().filter(q => !q.isBot).map(q => q.name));
      for (const bot of this.participants().filter(q => q.isBot)) {
        if (used.has(bot.name)) bot.name = this._allyName(used);
        else used.add(bot.name);
      }
    return id;
  }
  _rotateMatch() {
    return false;
  }
  remove(id) {
    this._remove(id, false);
    if (!this.participants().some((p) => !p.isBot)) {
      for (const p of [...this.players.values()]) this._remove(p.id, false);
      this.economy
        ?.finish()
        .catch((e) => console.error("[survival close]", e.message));
      this.wave = 0;
      this.waveState = "PRE_WAVE";
      this.nextWaveTick = this.tick + TICK_HZ * 15;
    } else this._rebalanceBots();
  }
  _driveBot(p) {
    if (p.survivalAlly) return this.allyAI.update(p);
    if (this.waveState === "GAME_OVER")
      return { seq: p.lastInputSeq + 1, inp: makeInput({}), wid: "sword" };
    const targets = [...this.players.values()].filter(
      (t) => !t.survivalEnemy && t.alive,
    );
    targets.sort(
      (a, b) =>
        Math.hypot(a.state.px - p.state.px, a.state.pz - p.state.pz) -
        Math.hypot(b.state.px - p.state.px, b.state.pz - p.state.pz),
    );
    const t = targets[0];
    p.attackingId = t?.id ?? null;
    if (!t)
      return { seq: p.lastInputSeq + 1, inp: makeInput({}), wid: "sword" };
    const dx = t.state.px - p.state.px,
      dz = t.state.pz - p.state.pz,
      distance = Math.hypot(dx, dz),
      yaw = Math.atan2(-dx, -dz);
    if (
      distance < 1.9 &&
      Math.abs(t.state.py - p.state.py) < 2 &&
      this.tick >= (p.attackAt || 0)
    ) {
      const obstruction = this.arena.raycast(
        p.state.px,
        p.state.py + 1.2,
        p.state.pz,
        dx / Math.max(0.001, distance),
        0,
        dz / Math.max(0.001, distance),
        distance,
      );
      if (obstruction >= distance - 0.3) {
        this._damage(t, p, p.enemyDamage || 20, false);
        p.attackAt = this.tick + TICK_HZ;
      }
    }
    return {
      seq: p.lastInputSeq + 1,
      inp: makeInput({
        mx: 0,
        mz: distance > 1.4 ? 1 : 0,
        yaw,
        jumpJust: false,
      }),
      wid: "sword",
      aiming: false,
    };
  }
  _damage(target, shooter, damage, head) {
    if (this.waveState === "GAME_OVER" || !this.opponents(target, shooter))
      return;
    if (
      target.alive &&
      this.tick >= (target.invulnerableUntil || 0) &&
      shooter
    ) {
      const actual = Math.min(
        damage,
        Math.max(0, target.health) + Math.max(0, target.shield),
      );
      shooter.damageDealt = (shooter.damageDealt || 0) + actual;
      if (target.bossInstance)
        shooter.bossDamage = (shooter.bossDamage || 0) + actual;
      target.attackedBy = shooter.id;
    }
    super._damage(target, shooter, damage, head);
  }
  _kill(target, shooter, head = false, wid = null) {
    const wasAlive = target.alive,
      result = super._kill(target, shooter, head, wid);
    if (!wasAlive) return result;
    target.deadUntil = Infinity;
    if (target.survivalAlly) {
      target.survivalAI.state = "DEAD";
      target.survivalAI.target = null;
      target.fireReq = null;
    }
    if (!target.survivalEnemy && target.livesRemaining !== null)
      target.livesRemaining = Math.max(0, (target.livesRemaining ?? 1) - 1);
    if (target.survivalEnemy) {
      if (target.bossInstance && shooter) {
        const boss = this.economy?.match.bosses[target.bossInstance];
        if (boss && !boss.defeated) {
          boss.defeated = true;
          if (shooter.isBot) return result;
          const before = Number(this.economy.preview(shooter.id)?.finalE || 0);
          this.economy.direct(
            shooter.id,
            "BOSS_REWARD",
            boss.directE,
            boss.instanceId,
          );
          const after = Number(this.economy.preview(shooter.id)?.finalE || 0);
          shooter.send({
            t: "earning",
            kind: "boss",
            amount: (after - before).toFixed(4),
          });
        }
      }
    }
    return result;
  }
  update() {
    const humans = this.participants().filter((p) => !p.isBot);
    for (const p of this.enemies()) if (!p.alive) this._remove(p.id, false);
    const enemies = this.enemies().filter((p) => p.alive);
    const survivors = this.participants().filter(
      (p) => p.alive && (!p.isBot || this.botConfig.botsCountAsAlive),
    );
    if (humans.length && !survivors.length && this.waveState !== "GAME_OVER") {
      this.waveState = "GAME_OVER";
      this.gameOverUntil = this.tick + TICK_HZ * this.botConfig.gameOverSeconds;
      for (const p of this.players.values()) {
        p.fireReq = null;
        p.queue = [];
        p._firingTicks = 0;
      }
    }
    if (this.waveState === "GAME_OVER") {
      for (const p of this.players.values()) {
        p.fireReq = null;
        p.queue = [];
      }
      if (this.tick >= this.gameOverUntil) {
        for (const p of this.enemies()) this._remove(p.id, false);
        const elapsed = Date.now() - this.matchStart;
        this.matchDurationMs = Math.max(1, elapsed);
        super._rotateMatch();
        this.matchDurationMs = 24 * 60 * 60 * 1000;
        const usedNames = new Set(
          this.participants()
            .filter((p) => !p.isBot)
            .map((p) => p.name),
        );
        for (const p of this.participants()) {
          if (p.isBot) p.name = this._allyName(usedNames);
          p.damageDealt = 0;
          p.bossDamage = 0;
          p.wavesSurvived = 0;
          p.livesRemaining = this.botConfig.limitedLives;
          if (p.isBot) this.allyAI.reset(p);
        }
        this.wave = 0;
        this.waveState = "PRE_WAVE";
        this.nextWaveTick = this.tick + TICK_HZ * 15;
      }
    } else if (
      humans.length &&
      !enemies.length &&
      this.tick >= this.nextWaveTick
    ) {
      this.waveState = "ACTIVE";
      this.wave++;
      if (this.economy?.ready) this.economy.match.wave = this.wave;
      const amount = Math.min(30, 3 + this.wave * 2);
      for (let i = 0; i < amount; i++) {
        const p = this.players.get(this.addBot(`Survival Enemy ${i + 1}`));
        p.survivalEnemy = true;
        p.health = 100 + this.wave * 8;
        p.enemyDamage = 15 + Math.floor(this.wave / 5);
        p.wid = p.mainWid = "sword";
      }
      const boss = this.economy?.ready
        ? this.economy.spawnBoss(this.wave)
        : null;
      if (boss) {
        const p = this.players.get(this.addBot(boss.id));
        p.survivalEnemy = true;
        p.bossInstance = boss.instanceId;
        p.health = boss.health;
        p.enemyDamage = boss.damage;
        p.wid = p.mainWid = "sword";
        if (boss.announce)
          for (const h of humans)
            h.send({
              t: "earning",
              kind: "boss_spawn",
              description: "RARE BOSS SPAWNED",
            });
      }
      this.nextWaveTick = Infinity;
    } else if (
      humans.length &&
      !enemies.length &&
      this.nextWaveTick === Infinity
    ) {
      this.waveState = "WAVE_CLEAR";
      this.waveClearTick=this.tick;
      for (const p of this.participants()) {
        if (p.alive) p.wavesSurvived = (p.wavesSurvived || 0) + 1;
        else if (
          this.botConfig.respawnRule === "wave" &&
          (p.livesRemaining === null || p.livesRemaining > 0)
        )
          p.deadUntil = this.tick + 1;
      }
      this.nextWaveTick = this.tick + TICK_HZ * 10;
    }
    if (this.waveState === "WAVE_CLEAR" && this.tick > this.waveClearTick)
      this.waveState = "INTERMISSION";
    super.update();
  }
}
