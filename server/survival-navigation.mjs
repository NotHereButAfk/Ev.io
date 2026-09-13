// Bounded local routing over the same ground/raycast queries as existing bots.
// Nodes include elevation: floors above one another cannot become false shortcuts.
export class SurvivalNavigation {
  constructor(room, config) {
    this.room = room;
    this.config = config;
  }
  lane(from, to) {
    const a = this.room.arena,
      dx = to[0] - from[0],
      dz = to[2] - from[2],
      length = Math.hypot(dx, dz);
    if (!length) return to;
    let y = from[1];
    for (let i = 1, n = Math.ceil(length / 0.6); i <= n; i++) {
      const x = from[0] + (dx * i) / n,
        z = from[2] + (dz * i) / n;
      const ground = a.groundHeightAt(x, z, y, y);
      if (
        !Number.isFinite(ground) ||
        ground <= a.killY ||
        Math.abs(ground - y) > 0.6
      )
        return null;
      if (
        a.raycast(
          from[0] + (dx * (i - 1)) / n,
          y + 0.9,
          from[2] + (dz * (i - 1)) / n,
          dx / length,
          0,
          dz / length,
          length / n + 0.45,
        ) <
        length / n + 0.35
      )
        return null;
      y = ground;
    }
    return [to[0], y, to[2]];
  }
  path(from, goal, salt = 0) {
    const deadline = performance.now() + this.config.navigationBudgetMs;
    const direct = this.lane(from, goal);
    if (direct && Math.abs(direct[1] - goal[1]) < 0.8) return [direct];
    const step = this.config.navigationCell,
      key = (p) =>
        p.map((x, i) => Math.round(x / (i === 1 ? 0.5 : step))).join(":");
    const heuristic = (p) =>
      Math.hypot(p[0] - goal[0], p[2] - goal[2]) + Math.abs(p[1] - goal[1]) * 2;
    const open = [{ p: from, g: 0, h: heuristic(from), parent: null }],
      seen = new Set();
    let best = open[0];
    for (
      let count = 0;
      open.length &&
      count < this.config.pathNodeBudget &&
      performance.now() < deadline;
      count++
    ) {
      open.sort((a, b) => a.g + a.h - b.g - b.h);
      const node = open.shift();
      if (seen.has(key(node.p))) continue;
      seen.add(key(node.p));
      if (node.h < best.h) best = node;
      if (node.h < step) {
        best = node;
        break;
      }
      for (let i = 0; i < 8; i++) {
        const angle = (((i + salt) % 8) * Math.PI) / 4;
        const next = this.lane(node.p, [
          node.p[0] + Math.sin(angle) * step,
          node.p[1],
          node.p[2] + Math.cos(angle) * step,
        ]);
        if (!next || seen.has(key(next))) continue;
        open.push({
          p: next,
          g: node.g + step,
          h: heuristic(next),
          parent: node,
        });
      }
    }
    const result = [];
    while (best.parent) {
      result.unshift(best.p);
      best = best.parent;
    }
    return result;
  }
  steer(p, goal) {
    const now = this.room.tick / 20,
      ai = p.survivalAI,
      pos = [p.state.px, p.state.py, p.state.pz];
    if (
      this.lastPathTick !== this.room.tick &&
      now >= ai.nextPath &&
      (!ai.path.length ||
        Math.hypot(goal[0] - ai.goal[0], goal[2] - ai.goal[2]) > 4 ||
        now - ai.pathAt > 4)
    ) {
      this.lastPathTick = this.room.tick;
      ai.goal = goal;
      ai.path = this.path(pos, goal, p.id % 8);
      ai.pathAt = now;
      ai.nextPath = now + this.config.pathfindingInterval;
    }
    while (
      ai.path.length &&
      Math.hypot(ai.path[0][0] - pos[0], ai.path[0][2] - pos[2]) < 0.8
    )
      ai.path.shift();
    const point = ai.path[0];
    return point ? [point[0] - pos[0], point[2] - pos[2]] : [0, 0];
  }
}
