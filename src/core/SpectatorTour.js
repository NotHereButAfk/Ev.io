import * as THREE from 'three';

/** Build a continuous tour through mutually visible map viewpoints.
 * Collision tests happen once at map readiness, never in the render loop.
 * Disconnected rooms are not joined by a teleport or a flight through a wall.
 */
export function buildSpectatorTour(routes, clearSegment) {
  const nodes = [];
  for (const route of routes) for (const waypoint of route) {
    if (nodes.length >= 96) break;
    if (!nodes.some((n) => n.p.distanceToSquared(waypoint.p) < 0.25)) {
      nodes.push({ p: waypoint.p.clone(), t: waypoint.t.clone() });
    }
  }
  if (nodes.length < 2) return null;
  const edges = nodes.map(() => []);
  const checked = new Set();
  for (let i = 0; i < nodes.length; i++) {
    const nearest = nodes.map((n, j) => ({ j, d: n.p.distanceTo(nodes[i].p) }))
      .filter(({ j, d }) => j !== i && d < 65)
      .sort((a, b) => a.d - b.d).slice(0, 8);
    for (const { j } of nearest) {
      const key = `${Math.min(i, j)}:${Math.max(i, j)}`;
      if (checked.has(key)) continue;
      checked.add(key);
      if (!clearSegment(nodes[i].p, nodes[j].p)) continue;
      edges[i].push(j); edges[j].push(i);
    }
  }
  // Prefer the largest connected touring area. No random spawn selection can
  // strand the camera in a tiny disconnected alcove.
  const seen = new Set();
  let component = [];
  for (let i = 0; i < nodes.length; i++) {
    if (seen.has(i)) continue;
    const found = [i]; seen.add(i);
    for (let k = 0; k < found.length; k++) for (const j of edges[found[k]]) {
      if (!seen.has(j)) { seen.add(j); found.push(j); }
    }
    if (found.length > component.length) component = found;
  }
  if (component.length < 2) return null;
  const tour = [], visited = new Set();
  function visit(i) {
    visited.add(i); tour.push(nodes[i]);
    // A depth-first circuit visits every connected viewpoint and returns along
    // already collision-tested links. Look targets stay on the arena, not a bot.
    for (const j of edges[i]) {
      if (visited.has(j)) continue;
      visit(j); tour.push(nodes[i]);
    }
  }
  visit(component[0]);
  return tour;
}

/** Round each corner within a small, collision-checked envelope. */
export function spectatorTourCurves(tour, clearSegment) {
  const path = new THREE.CurvePath();
  const look = new THREE.CurvePath();
  const unique = tour.slice(0, -1);
  const corners = unique.map((node, i) => {
    const prev = unique[(i + unique.length - 1) % unique.length];
    const next = unique[(i + 1) % unique.length];
    const radius = Math.min(0.6, node.p.distanceTo(prev.p) * 0.2, node.p.distanceTo(next.p) * 0.2);
    let enter = node.p.clone().lerp(prev.p, radius / Math.max(0.001, node.p.distanceTo(prev.p)));
    let leave = node.p.clone().lerp(next.p, radius / Math.max(0.001, node.p.distanceTo(next.p)));
    if (!clearSegment(enter, leave)) { enter = node.p.clone(); leave = node.p.clone(); }
    return { enter, leave, node };
  });
  // Pair every position curve with a look curve of the same relative duration.
  // Sampling look by its own arc length would desynchronise it from the camera.
  const pieces = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length];
    const bend = new THREE.QuadraticBezierCurve3(a.enter, a.node.p, a.leave);
    if (bend.getLength() > 0.001) pieces.push({ p: bend, from: a.node.t, to: a.node.t });
    const line = new THREE.LineCurve3(a.leave, b.enter);
    if (line.getLength() > 0.001) pieces.push({ p: line, from: a.node.t, to: b.node.t });
  }
  for (const piece of pieces) path.add(piece.p);
  const lengths = pieces.map((piece) => piece.p.getLength());
  const total = lengths.reduce((a, b) => a + b, 0);
  // Same getPointAt interface as Three curves, without per-frame allocation.
  look.getPointAt = (u, target = new THREE.Vector3()) => {
    let remaining = THREE.MathUtils.clamp(u, 0, 1) * total;
    for (let i = 0; i < pieces.length; i++) {
      if (remaining <= lengths[i] || i === pieces.length - 1) {
        const blend = THREE.MathUtils.smoothstep(remaining / lengths[i], 0, 1);
        return target.copy(pieces[i].from).lerp(pieces[i].to, blend);
      }
      remaining -= lengths[i];
    }
    return target.copy(tour[0].t);
  };
  // CurvePath.getPoint already traverses child curves by length. Calling its
  // inherited getPointAt remaps it a second time and distorts corner timing.
  path.getPointAt = (u, target = new THREE.Vector3()) => path.getPoint(u, target);
  return { path, look, length: total };
}

export function makeSpectatorClearance(world) {
  const ray = new THREE.Ray(), delta = new THREE.Vector3();
  const offsets = [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]];
  return (a, b) => {
    delta.subVectors(b, a);
    const distance = delta.length();
    if (distance < 0.001) return true;
    ray.direction.copy(delta).divideScalar(distance);
    for (const [x, y] of offsets) {
      ray.origin.copy(a); ray.origin.x += x; ray.origin.y += y;
      if (world.raycastCollisionDistance(ray, distance) < distance - 0.03) return false;
      // Two-sided testing catches camera exit through one-sided map triangles.
      ray.origin.copy(b); ray.origin.x += x; ray.origin.y += y;
      ray.direction.negate();
      const blocked = world.raycastCollisionDistance(ray, distance) < distance - 0.03;
      ray.direction.negate();
      if (blocked) return false;
    }
    return true;
  };
}
