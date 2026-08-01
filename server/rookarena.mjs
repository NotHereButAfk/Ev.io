// Server-side collision for the exact same authored Rook map rendered by the
// browser. Keeping an Octree here prevents the authoritative player from being
// simulated against a different graybox while the client displays Rook.

import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { Octree } from 'three/addons/math/Octree.js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvMapScene, parseEvMap } from '../src/world/EvMapLoader.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAP_CANDIDATES = [
  process.env.ROOK_MAP_PATH,
  resolve(HERE, '../dist/maps/RookLit_0.evmap'),
  resolve(HERE, '../public/maps/RookLit_0.evmap'),
].filter(Boolean);
const mapPath = MAP_CANDIDATES.find((candidate) => existsSync(candidate));
if (!mapPath) throw new Error(`Rook map is missing; checked: ${MAP_CANDIDATES.join(', ')}`);

const bytes = readFileSync(mapPath);
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const scene = buildEvMapScene(parseEvMap(buffer));
const octree = new Octree().fromGraphNode(scene.colliderRoot);
const capsule = new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0.45);
const groundRay = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3());
const normal = new THREE.Vector3();

function q(value) { return Math.round(value * 1e6) / 1e6; }

function groundHeightAt(x, z, prevY, newY) {
  const stepUp = 0.55, grace = 0.06;
  groundRay.origin.set(x, Math.max(prevY, newY) + stepUp + grace, z);
  const hit = octree.rayIntersect(groundRay);
  if (!hit) return -100;
  hit.triangle.getNormal(normal);
  const top = hit.position.y;
  const crossed = prevY >= top - grace && newY <= top + grace;
  const stepping = newY <= top + stepUp && newY >= top - 0.8;
  return normal.y > 0.35 && (crossed || stepping) ? top : -100;
}

function resolveState(previous, state) {
  const height = (state.crouch || state.slide) ? 1.0 : 1.7;
  const groundY = groundHeightAt(state.px, state.pz, previous.py, state.py);
  if (state.py <= groundY + 0.05 && state.vy <= 0.001) {
    state.py = q(groundY);
    state.vy = 0;
    state.onGround = 1;
    state.nX = 0; state.nY = 1; state.nZ = 0;
  }

  capsule.radius = 0.45;
  capsule.start.set(state.px, state.py + capsule.radius, state.pz);
  capsule.end.set(state.px, state.py + Math.max(capsule.radius, height - capsule.radius), state.pz);
  for (let i = 0; i < 3; i++) {
    const hit = octree.capsuleIntersect(capsule);
    if (!hit) break;
    capsule.translate(hit.normal.clone().multiplyScalar(hit.depth));
    const into = state.vx * hit.normal.x + state.vy * hit.normal.y + state.vz * hit.normal.z;
    if (into < 0) {
      state.vx = q(state.vx - hit.normal.x * into);
      state.vy = q(state.vy - hit.normal.y * into);
      state.vz = q(state.vz - hit.normal.z * into);
    }
    if (hit.normal.y > 0.35) {
      state.onGround = 1;
      if (state.vy < 0) state.vy = 0;
      state.nX = q(hit.normal.x); state.nY = q(hit.normal.y); state.nZ = q(hit.normal.z);
    }
  }
  state.px = q(capsule.start.x);
  state.py = q(capsule.start.y - capsule.radius);
  state.pz = q(capsule.start.z);
  if (state.onGround) {
    state.safeTicks = Math.min(3, (previous.safeTicks || 0) + 1);
    if (state.safeTicks >= 3) {
      state.safeX = state.px; state.safeY = state.py; state.safeZ = state.pz;
    }
  }
  return state;
}

function raycast(ox, oy, oz, dx, dy, dz, maxT) {
  ray.origin.set(ox, oy, oz);
  ray.direction.set(dx, dy, dz).normalize();
  const hit = octree.rayIntersect(ray);
  return hit && hit.distance > 0.1 && hit.distance < maxT ? hit.distance : maxT;
}

const spawns = scene.spawnPoints.map((point) => [point.x, point.y, point.z]);
const maxXZ = Math.max(
  Math.abs(scene.bounds.min.x), Math.abs(scene.bounds.max.x),
  Math.abs(scene.bounds.min.z), Math.abs(scene.bounds.max.z),
);

export const ROOK = {
  name: 'Daytime Rook',
  half: Math.ceil(maxXZ + 4),
  killY: Math.min(-25, scene.collisionBounds.min.y - 10),
  noBaseFloor: true,
  platforms: [], boxes: [], gravLifts: [], teleporters: [],
  spawns,
  callouts: [],
  pickups: scene.weaponSpawnPoints.map((point) => ({
    type: 'weapon', x: point.x, y: point.y, z: point.z, markerKind: point.markerKind,
  })),
  resolveState,
  raycast,
};
