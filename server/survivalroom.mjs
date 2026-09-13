import { AuthRoom, TICK_HZ } from "./authroom.mjs";
import { makeInput } from "../src/sim/MoveSim.js";
// Authoritative PvE reuses the production collision, weapon and damage simulation.
export class SurvivalRoom extends AuthRoom {
  constructor(arena, options = {}) {
    super(arena, { ...options, targetPopulation: 0 });
    this.mode = "survival";
    this.wave = 0;
    this.nextWaveTick = TICK_HZ * 15;
    this.matchDurationMs = 24 * 60 * 60 * 1000;
    this.matchStart = Date.now();
  }
  _fillBotSlots() {}
  _rebalanceBots() {}
  add(send, name) {
    if ([...this.players.values()].filter((p) => !p.isBot).length >= 5) {
      send({ t: "kick", reason: "match full" });
      return null;
    }
    return super.add(send, name);
  }
  _rotateMatch() {
    return false;
  }
  remove(id) {
    super.remove(id);
    if (![...this.players.values()].some((p) => !p.isBot)) {
      for (const p of [...this.players.values()]) this._remove(p.id, false);
      this.economy
        ?.finish()
        .catch((e) => console.error("[survival close]", e.message));
      this.wave = 0;
      this.nextWaveTick = this.tick + TICK_HZ * 15;
    }
  }
  _driveBot(p) {
    const targets = [...this.players.values()].filter(
      (t) => !t.isBot && t.alive,
    );
    targets.sort(
      (a, b) =>
        Math.hypot(a.state.px - p.state.px, a.state.pz - p.state.pz) -
        Math.hypot(b.state.px - p.state.px, b.state.pz - p.state.pz),
    );
    const t = targets[0];
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
        jumpJust: this.tick % 40 === 0,
      }),
      wid: "sword",
      aiming: false,
    };
  }
  _damage(target, shooter, damage, head) {
    if (target.isBot === shooter?.isBot) return;
    super._damage(target, shooter, damage, head);
  }
  _kill(target, shooter, head = false, wid = null) {
    const wasAlive = target.alive,
      result = super._kill(target, shooter, head, wid);
    if (!wasAlive) return result;
    target.deadUntil = Infinity;
    if (target.isBot) {
      if (target.bossInstance && shooter && !shooter.isBot) {
        const boss = this.economy?.match.bosses[target.bossInstance];
        if (boss && !boss.defeated) {
          boss.defeated = true;
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
    const humans = [...this.players.values()].filter((p) => !p.isBot);
    for (const p of this.players.values())
      if (p.isBot && !p.alive) this._remove(p.id, false);
    const enemies = [...this.players.values()].filter(
      (p) => p.isBot && p.alive,
    );
    if (humans.length && humans.every((p) => !p.alive)) {
      this.matchStart = Date.now() - this.matchDurationMs;
      super._rotateMatch();
      for (const p of [...this.players.values()])
        if (p.isBot) this._remove(p.id, false);
      this.wave = 0;
      this.nextWaveTick = this.tick + TICK_HZ * 15;
    } else if (
      humans.length &&
      !enemies.length &&
      this.tick >= this.nextWaveTick
    ) {
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
      this.nextWaveTick = this.tick + TICK_HZ * 10;
    }
    super.update();
  }
}
