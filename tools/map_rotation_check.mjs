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
import { readFile } from 'node:fs/promises';

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
// The official map carries embedded textures, which three decodes through an
// <img>. Node has none, so hand back a stub that reports loaded immediately —
// this gate is about the rotation's teardown, not about pixels.
const fakeImage = () => {
  const img = {
    width: 4, height: 4, complete: true,
    addEventListener(kind, fn) { if (kind === 'load') img._onload = fn; },
    removeEventListener() {},
    set src(_v) { queueMicrotask(() => img._onload?.({ target: img })); },
    get src() { return ''; },
  };
  return img;
};
globalThis.document = {
  createElement: (tag) => (tag === 'img' ? fakeImage()
    : { width: 0, height: 0, getContext: () => ctx2d, style: {} }),
  createElementNS: (_ns, tag) => (tag === 'img' ? fakeImage()
    : { width: 0, height: 0, getContext: () => ctx2d, style: {} }),
  getElementById: () => null,
};
globalThis.URL.createObjectURL ??= () => 'blob:stub';
globalThis.URL.revokeObjectURL ??= () => {};

// The rotation now contains only DOWNLOADED official maps, and those load over
// fetch. Rather than skip them — which would leave the teardown machinery
// completely ungated — serve the real file off disk, exactly as the dev server
// would. The gate therefore exercises the actual 5.7MB decode.
const publicDir = new URL('../public/', import.meta.url);
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^\//, '');
  const bytes = await readFile(new URL(rel, publicDir));
  return {
    ok: true, status: 200,
    arrayBuffer: async () => bytes.buffer.slice(
      bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
};

const { World, MAPS, nextMapId } = await import('../src/world/World.js');

let fails = 0;
const ok = (c, msg, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${msg}${detail ? '   ' + detail : ''}`);
};

console.log('── the rotation ──');
ok(MAPS.length >= 1, 'the rotation has at least one map', `${MAPS.length}`);
ok(new Set(MAPS.map((m) => m.id)).size === MAPS.length, 'map ids are unique');
ok(nextMapId('does-not-exist') === MAPS[0].id,
   'an unknown id falls back rather than throwing');
{
  const seen = new Set();
  let id = MAPS[0].id;
  for (let i = 0; i < MAPS.length; i++) { seen.add(id); id = nextMapId(id); }
  ok(seen.size === MAPS.length && id === MAPS[0].id,
     'it visits every map once and wraps', [...seen].join(' → '));
}
// Only downloaded assets belong in rotation — the procedural recreations stay
// defined in World.js but out of it. An async builder is the tell: a map built
// from primitives has nothing to await.
ok(MAPS.every((m) => m.build.constructor.name === 'AsyncFunction'),
   'every map in rotation loads a downloaded asset',
   MAPS.map((m) => m.id).join(', '));
ok(World.prototype.loadMap.constructor.name === 'AsyncFunction',
   'loadMap is async, so an entry may fetch');

console.log('\n── it stands up, and reloading does not accumulate ──');
const w = new World(MAPS[0].id);
await w.ready;

const snap = () => {
  let meshes = 0;
  w._mapRoot.traverse((o) => { if (o.isMesh) meshes++; });
  return { colliders: w.colliders.length, spawns: w.spawnPoints.length, meshes };
};
const first = snap();
console.log(`  ${w.mapId.padEnd(18)} ${first.meshes} meshes, `
          + `${first.colliders} colliders, ${first.spawns} spawns`);
ok(first.meshes > 20, 'builds real geometry', `${first.meshes} meshes`);
ok(first.spawns >= 4, 'has spawn points', `${first.spawns}`);
ok(w.scene.background instanceof THREE.Color, 'sets its own sky');
ok(!!w.scene.fog, 'sets its own fog');

// A spawn you cannot stand in is worse than no spawn at all.
{
  const box = new THREE.Box3();
  let inside = 0;
  for (const p of w.spawnPoints) {
    box.min.set(p.x - 0.45, p.y + 0.15, p.z - 0.45);
    box.max.set(p.x + 0.45, p.y + 1.7, p.z + 0.45);
    if (w.colliders.some((c) => c.box && c.box.intersectsBox(box))) inside++;
  }
  ok(inside === 0, 'no spawn point is inside geometry', `${inside} buried`);
}

// Reload the same map repeatedly. Teardown is what this gate exists for, and
// it has to hold whether the next map is a different one or the same one.
const roots = [];
for (let i = 0; i < 4; i++) {
  await w.loadMap(MAPS[0].id);
  const s = snap();
  for (const k of Object.keys(first)) {
    ok(s[k] === first[k], `lap ${i + 1}: ${k} rebuilds identically`,
       `${first[k]} → ${s[k]}`);
  }
  roots.push(w.scene.children.filter((c) => c.name?.startsWith('map:')).length);
}
ok(roots.every((n) => n === 1), 'exactly one map root is in the scene at a time',
   `max ${Math.max(...roots)}`);

// Constructor-owned resources must outlive every teardown — free one and the
// FIRST match still looks perfect while every later one renders wrong.
{
  const shared = [...w._sharedDisposables];
  ok(shared.length > 0, 'shared resources are tracked', `${shared.length}`);
  ok(w._geo.flower?.attributes?.position,
     'a shared geometry still has its buffers after 5 map loads');
}

// The old arena is genuinely gone. Count the dispose CALLS — dispose() frees GPU
// state without nulling the JS arrays, so inspecting the geometry afterwards
// reads the same before and after and cannot fail.
//
// Instrument the TEARDOWN only, not the whole loadMap. Wrapping the full call
// also catches whatever the incoming map frees while building itself — the
// .evmap decode releases one temporary buffer — and the count comes out one
// over, which reads exactly like a leak in teardown and is not one.
{
  const geos = new Set(), mats = new Set();
  w._mapRoot.traverse((o) => {
    if (!o.isMesh && !o.isLine && !o.isPoints) return;
    if (o.geometry && !w._sharedDisposables.has(o.geometry)) geos.add(o.geometry);
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (m && !w._sharedDisposables.has(m)) mats.add(m);
    }
  });
  let geoDisposed = 0, matDisposed = 0, sharedHit = 0;
  const gP = THREE.BufferGeometry.prototype, mP = THREE.Material.prototype;
  const gReal = gP.dispose, mReal = mP.dispose;
  gP.dispose = function (...a) {
    if (w._sharedDisposables.has(this)) sharedHit++; else geoDisposed++;
    return gReal.apply(this, a);
  };
  mP.dispose = function (...a) {
    if (w._sharedDisposables.has(this)) sharedHit++; else matDisposed++;
    return mReal.apply(this, a);
  };
  const root = w._mapRoot;
  try { w._disposeMap(); }
  finally { gP.dispose = gReal; mP.dispose = mReal; }

  ok(root.parent === null, 'the previous map root is detached from the scene');
  ok(geoDisposed === geos.size, 'every geometry the outgoing map owned was disposed',
     `${geoDisposed}/${geos.size}`);
  ok(matDisposed === mats.size, 'every material the outgoing map owned was disposed',
     `${matDisposed}/${mats.size}`);
  ok(sharedHit === 0, 'and teardown never touched a shared resource',
     `${sharedHit} shared disposals`);
}

console.log(fails ? `\n${fails} map-rotation check(s) FAILED`
                  : '\nall map-rotation checks passed');
process.exit(fails ? 1 : 0);
