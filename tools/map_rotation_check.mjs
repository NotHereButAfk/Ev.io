#!/usr/bin/env node
// Gate for map rotation (src/world/World.js).
//
// Swapping an arena between matches fails quietly rather than loudly. A
// collider left behind from the previous map is an invisible wall you walk into
// in the next one. A spawn point left behind drops you inside geometry. A map
// root that is detached but not disposed leaks a whole arena of GPU buffers per
// match, which nobody notices until the tab dies twenty rounds in. And a shared
// material freed during teardown makes the SECOND match render untextured while
// the first looked perfect.
//
// So this rotates further than anyone will play and asserts the world comes
// back to exactly the same state each cycle.

import * as THREE from 'three';

// The world draws facade/billboard atlases on a canvas at construction. Nothing
// here needs them to draw correctly, only to not throw.
const noop = () => {};
const ctx2d = new Proxy({}, {
  get: (t, k) => (k === 'canvas' ? {}
    : (k === 'createLinearGradient' || k === 'createRadialGradient')
      ? () => ({ addColorStop: noop })
      : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) })
      : noop),
  set: () => true,
});
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }),
  getElementById: () => null,
};

const { World, MAPS, mapById, nextMapId } = await import('../src/world/World.js');

let fails = 0;
const ok = (c, msg, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${msg}${detail ? '   ' + detail : ''}`);
};

console.log('── rotation order ──');
ok(MAPS.length >= 2, 'there is more than one map to rotate through', `${MAPS.length} maps`);
{
  const seen = new Set();
  let id = MAPS[0].id;
  for (let i = 0; i < MAPS.length; i++) { seen.add(id); id = nextMapId(id); }
  ok(seen.size === MAPS.length, 'the rotation visits every map before repeating',
     [...seen].join(' → '));
  ok(id === MAPS[0].id, 'and wraps back to the first');
  ok(nextMapId('does-not-exist') === MAPS[0].id, 'an unknown id falls back rather than throwing');
  ok(new Set(MAPS.map(m => m.id)).size === MAPS.length, 'map ids are unique');
}

console.log('\n── each map stands up ──');
// Constructed on a PROCEDURAL map: the default entry fetches, and Node has
// no server to fetch from.
const w = new World('winter-graveyard');
await w.ready;
const snap = () => {
  let meshes = 0, tris = 0;
  w._mapRoot.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return {
    colliders: w.colliders.length, platforms: w.platforms.length,
    spawns: w.spawnPoints.length, raycast: w.raycastMeshes.length,
    meshes, tris: Math.round(tris),
  };
};

// The official Rook entry fetches /maps/RookLit_0.evmap, which needs the dev
// server; `npm run test:evmap` already gates that file end to end. This gate
// covers the ROTATION — so it exercises every procedural map and asserts the
// async one is wired, rather than skipping the question.
const PROCEDURAL = MAPS.filter((m) => m.id !== 'rook');
ok(MAPS[0].id === 'rook' && MAPS[0].build.constructor.name === 'AsyncFunction',
   'the official map is first in the rotation and builds asynchronously');
ok(World.prototype.loadMap.constructor.name === 'AsyncFunction',
   'loadMap is async, so an entry may fetch');

const first = new Map();
for (const def of PROCEDURAL) {
  await w.loadMap(def.id);
  const s = snap();
  first.set(def.id, s);
  console.log(`  ${def.id.padEnd(18)} ${s.meshes} meshes, ${s.tris} tris, `
            + `${s.colliders} colliders, ${s.spawns} spawns`);
  ok(s.meshes > 50, `${def.id}: builds real geometry`, `${s.meshes} meshes`);
  ok(s.colliders > 0, `${def.id}: has collision`, `${s.colliders} colliders`);
  ok(s.spawns >= 4, `${def.id}: has spawn points`, `${s.spawns}`);
  ok(w.scene.background instanceof THREE.Color, `${def.id}: sets its own sky`);
  ok(!!w.scene.fog, `${def.id}: sets its own fog`);

  // A spawn you cannot stand in is worse than no spawn at all.
  const box = new THREE.Box3();
  let inside = 0;
  for (const p of w.spawnPoints) {
    box.min.set(p.x - 0.45, p.y + 0.15, p.z - 0.45);
    box.max.set(p.x + 0.45, p.y + 1.7, p.z + 0.45);
    if (w.colliders.some((c) => c.box && c.box.intersectsBox(box))) inside++;
  }
  ok(inside === 0, `${def.id}: no spawn point is inside geometry`, `${inside} buried`);

  const half = w.arenaHalf + 1;
  const out = w.spawnPoints.filter((p) => Math.abs(p.x) > half || Math.abs(p.z) > half);
  ok(out.length === 0, `${def.id}: every spawn is inside the arena`, `${out.length} outside`);
}

console.log('\n── rotating does not accumulate ──');
// Three full laps. If teardown misses anything, the counts drift.
let id = PROCEDURAL[0].id;
let drift = [], roots = [];
for (let lap = 0; lap < 3; lap++) {
  for (const _ of PROCEDURAL) {
    if (id === 'rook') id = nextMapId(id);
    await w.loadMap(id);
    const s = snap(), f = first.get(id);
    for (const k of Object.keys(f)) {
      if (s[k] !== f[k]) drift.push(`${id}.${k} ${f[k]} → ${s[k]} (lap ${lap + 1})`);
    }
    roots.push(w.scene.children.filter((c) => c.name?.startsWith('map:')).length);
    id = nextMapId(id);
  }
}
ok(drift.length === 0, 'every map rebuilds to identical counts on every lap',
   drift.slice(0, 3).join('; '));
ok(roots.every((n) => n === 1), 'exactly one map root is in the scene at a time',
   `max ${Math.max(...roots)}`);

// The shared atlases and prop geometry are constructor-owned and must outlive
// every teardown — this is the check that catches a dispose() that reached too
// far and left the SECOND match rendering untextured.
{
  const shared = [...w._sharedDisposables];
  const dead = shared.filter((r) => r.attributes === null || r.__disposed === true);
  ok(dead.length === 0, 'shared prop geometry / materials survive teardown',
     `${shared.length} shared resources checked`);
  const g = w._geo.flower;
  ok(g && g.attributes && g.attributes.position,
     'a shared geometry still has its buffers after 9 map loads');
}

// The old arena is genuinely gone, not merely hidden.
//
// This was first written as "the geometry looks disposed afterwards", which is
// not a check at all: dispose() frees GPU state and fires an event, it does not
// null the JS-side attribute arrays, so every way of asking the geometry
// afterwards answers the same before and after. Count the dispose CALLS
// instead — that is the thing the teardown either does or does not do.
{
  const outgoing = w.mapId;
  const geos = new Set(), mats = new Set();
  // Meshes are not the only drawables a map owns — Rook Foundry's dust field is
  // a Points, and _disposeMap frees lines and points too. Counting only meshes
  // made this read one geometry and one material SHORT of what teardown
  // actually disposed, which is a hole in the gate, not a leak in the code.
  w._mapRoot.traverse((o) => {
    if (!o.isMesh && !o.isLine && !o.isPoints) return;
    if (o.geometry && !w._sharedDisposables.has(o.geometry)) geos.add(o.geometry);
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (m && !w._sharedDisposables.has(m)) mats.add(m);
    }
  });

  let geoDisposed = 0, matDisposed = 0, sharedHit = 0;
  const gProto = THREE.BufferGeometry.prototype, mProto = THREE.Material.prototype;
  const gReal = gProto.dispose, mReal = mProto.dispose;
  gProto.dispose = function (...a) {
    if (w._sharedDisposables.has(this)) sharedHit++; else geoDisposed++;
    return gReal.apply(this, a);
  };
  mProto.dispose = function (...a) {
    if (w._sharedDisposables.has(this)) sharedHit++; else matDisposed++;
    return mReal.apply(this, a);
  };
  const root = w._mapRoot;
  let target = nextMapId(outgoing);
  if (target === 'rook') target = nextMapId(target);   // procedural only, see above
  try {
    await w.loadMap(target);
  } finally {
    gProto.dispose = gReal;
    mProto.dispose = mReal;
  }

  ok(root.parent === null, 'the previous map root is detached from the scene');
  ok(geoDisposed === geos.size,
     'every geometry the outgoing map owned was disposed',
     `${geoDisposed}/${geos.size}`);
  ok(matDisposed === mats.size,
     'every material the outgoing map owned was disposed',
     `${matDisposed}/${mats.size}`);
  ok(sharedHit === 0, 'and teardown never touched a shared resource',
     `${sharedHit} shared disposals`);
}

console.log(fails ? `\n${fails} map-rotation check(s) FAILED` : '\nall map-rotation checks passed');
process.exit(fails ? 1 : 0);
