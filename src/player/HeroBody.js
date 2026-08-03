// ═══════════════════════════════════════════════════════════════════════════
// The player / bot body: one skinned character, not a pile of parts.
//
// What changed and why
// ────────────────────
// The previous body was a set of rigid forms attached to pivot groups — a thigh
// tube, a knee ball, a calf tube — each rotating about its own joint. Every
// surface on it was smooth, and it still fell apart the moment a joint bent
// past about 60°, because smoothness within a part does nothing about the seam
// BETWEEN parts. At a crouch the leg read as two pipes sliding past each other.
//
// Here a limb is a single surface running hip → ankle, and it bends because its
// vertices are weighted between bones. Nothing slides past anything; the skin
// creases. That is the difference between a parts assembly and a character.
//
// ─── THE CONTRACT (do not move these) ────────────────────────────────────────
// Locomotion.js solves ground contact against a fixed leg chain, and
// RifleCarry.js IKs both arms against a fixed shoulder and fixed bone lengths.
// Neither derives anything from the mesh, so the body may be reshaped freely
// but these must stay exactly where they are:
//
//   hip    y 1.21          shoulder  |x| 0.27, y 1.76
//   knee   y 0.62          elbow     y 1.28        (UP_ARM  0.48)
//   ankle  y 0.27          hand      y 0.895       (FOREARM 0.385)
//   sole   y 0, from z +0.10 (heel) to −0.20 (toe)
//
// The rig object handed back exposes those joints under the names the animation
// already uses (legL/kneeL/ankleL/armL/elbowL/…), so applyWalkCycle(),
// applyRifleCarry() and Actions.js drive this body with no changes at all —
// they are setting bone rotations now instead of group rotations, and a bone is
// an Object3D like any other.
//
// `npm run test:mesh` measures every one of those numbers off the built body,
// plus the skinning itself: no unweighted vertex, no weight leaking across the
// gap between the legs, and joints that keep their volume when bent.
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { getLowPolyPalette, makeBodyMaterials } from './LowPolyModels.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  chainWeights, loftSkinned, appendGeometry, newBuffer, toGeometry, sePoint,
} from './BodyGeometry.js';

// Inverted-hull source: weld, re-smooth, push out along the normal. Welding
// keeps the contour continuous across a ring seam; the skin weights come along
// with it, so the outline deforms with the body rather than peeling off it.
function inflate(src, t) {
  let g = src.clone();
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++)
    p.setXYZ(i, p.getX(i) + n.getX(i) * t, p.getY(i) + n.getY(i) * t, p.getZ(i) + n.getZ(i) * t);
  return g;
}

// ── Skeleton layout ──────────────────────────────────────────────────────────
// World-space rest positions. The four the animation drives are marked; the
// spine chain exists so the torso deforms as a torso rather than a barrel, and
// so there is somewhere to hang a future lean or aim twist.
const JOINTS = {
  root:      { at: [0, 0, 0],          parent: null },
  hips:      { at: [0, 1.06, 0],       parent: 'root' },
  spine:     { at: [0, 1.30, 0],       parent: 'hips' },
  chest:     { at: [0, 1.52, 0],       parent: 'spine' },
  neck:      { at: [0, 1.72, 0],       parent: 'chest' },
  head:      { at: [0, 1.86, 0],       parent: 'neck' },
  shoulderL: { at: [-0.27, 1.76, 0],   parent: 'chest' },   // rig.armL
  elbowL:    { at: [-0.27, 1.28, 0],   parent: 'shoulderL' },
  handL:     { at: [-0.27, 0.895, 0],  parent: 'elbowL' },
  shoulderR: { at: [0.27, 1.76, 0],    parent: 'chest' },   // rig.armR
  elbowR:    { at: [0.27, 1.28, 0],    parent: 'shoulderR' },
  handR:     { at: [0.27, 0.895, 0],   parent: 'elbowR' },
  thighL:    { at: [-0.11, 1.21, 0],   parent: 'hips' },    // rig.legL
  kneeL:     { at: [-0.11, 0.62, 0],   parent: 'thighL' },
  ankleL:    { at: [-0.11, 0.27, 0],   parent: 'kneeL' },
  thighR:    { at: [0.11, 1.21, 0],    parent: 'hips' },
  kneeR:     { at: [0.11, 0.62, 0],    parent: 'thighR' },
  ankleR:    { at: [0.11, 0.27, 0],    parent: 'kneeR' },
};
const BONE_ORDER = Object.keys(JOINTS);
const B = {};
BONE_ORDER.forEach((n, i) => { B[n] = i; });

function buildSkeleton() {
  const bones = {}, list = [];
  for (const name of BONE_ORDER) {
    const j = JOINTS[name];
    const bone = new THREE.Bone();
    bone.name = name;
    const p = j.parent ? JOINTS[j.parent].at : [0, 0, 0];
    bone.position.set(j.at[0] - p[0], j.at[1] - p[1], j.at[2] - p[2]);
    if (j.parent) bones[j.parent].add(bone);
    bones[name] = bone;
    list.push(bone);
  }
  return { root: bones.root, bones, list };
}

// ── Weight chains ────────────────────────────────────────────────────────────
// `band` is the half-height of the crease at that joint: how much flesh moves
// with it. Wider at a knee than a wrist, because a knee creases over more of
// the leg. These are the only tuning numbers in the skinning.
const legChain = (s) => [
  { y: 1.21, bone: B['thigh' + s], band: 0.10 },
  { y: 0.62, bone: B['knee' + s],  band: 0.105 },
  { y: 0.27, bone: B['ankle' + s], band: 0.050 },
];
const armChain = (s) => [
  { y: 1.76, bone: B['shoulder' + s], band: 0.085 },
  { y: 1.28, bone: B['elbow' + s],    band: 0.080 },
  { y: 0.895, bone: B['hand' + s],    band: 0.045 },
];
const TORSO_CHAIN = [
  { y: 1.86, bone: B.head,  band: 0.045 },
  { y: 1.72, bone: B.neck,  band: 0.055 },
  { y: 1.52, bone: B.chest, band: 0.110 },
  { y: 1.30, bone: B.spine, band: 0.110 },
  { y: 1.06, bone: B.hips,  band: 0.110 },
];

// ── Station tables ───────────────────────────────────────────────────────────
// Extra rings cluster around each joint: linear blend skinning pinches at a
// bend, and the cheap standard answer is more loops through the crease plus a
// touch of radius through it.
const LEG = [
  { y: 1.235, rx: 0.098, rz: 0.106, n: 2.2 },
  { y: 1.180, rx: 0.112, rz: 0.124, n: 2.2 },
  { y: 1.100, rx: 0.118, rz: 0.130, n: 2.2, dz: -0.006 },
  { y: 1.010, rx: 0.116, rz: 0.128, n: 2.2, dz: -0.008 },
  { y: 0.920, rx: 0.110, rz: 0.121, n: 2.2, dz: -0.008 },
  { y: 0.830, rx: 0.101, rz: 0.111, n: 2.2, dz: -0.006 },
  { y: 0.760, rx: 0.093, rz: 0.101, n: 2.2 },
  { y: 0.710, rx: 0.087, rz: 0.093, n: 2.15 },
  { y: 0.675, rx: 0.084, rz: 0.090, n: 2.15 },
  { y: 0.645, rx: 0.084, rz: 0.089, n: 2.10 },
  { y: 0.620, rx: 0.085, rz: 0.090, n: 2.10 },   // knee
  { y: 0.595, rx: 0.084, rz: 0.090, n: 2.10 },
  { y: 0.565, rx: 0.083, rz: 0.093, n: 2.10, dz: 0.006 },
  { y: 0.530, rx: 0.083, rz: 0.098, n: 2.10, dz: 0.012 },   // calf
  { y: 0.480, rx: 0.081, rz: 0.097, n: 2.10, dz: 0.014 },
  { y: 0.430, rx: 0.072, rz: 0.085, n: 2.10, dz: 0.011 },
  { y: 0.380, rx: 0.061, rz: 0.069, n: 2.10, dz: 0.006 },
  { y: 0.335, rx: 0.051, rz: 0.057, n: 2.10, dz: 0.002 },
  { y: 0.300, rx: 0.046, rz: 0.050, n: 2.10 },
  { y: 0.272, rx: 0.044, rz: 0.048, n: 2.10 },   // ankle
];
const ARM = [
  { y: 1.740, rx: 0.078, rz: 0.082, n: 2.15 },
  { y: 1.690, rx: 0.089, rz: 0.093, n: 2.15 },
  { y: 1.630, rx: 0.092, rz: 0.096, n: 2.10, dz: -0.004 },
  { y: 1.560, rx: 0.084, rz: 0.090, n: 2.10, dz: -0.006 },
  { y: 1.480, rx: 0.076, rz: 0.082, n: 2.10, dz: -0.005 },
  { y: 1.400, rx: 0.069, rz: 0.075, n: 2.10 },
  { y: 1.340, rx: 0.063, rz: 0.067, n: 2.10 },
  { y: 1.302, rx: 0.060, rz: 0.064, n: 2.10 },
  { y: 1.280, rx: 0.059, rz: 0.063, n: 2.10 },   // elbow
  { y: 1.258, rx: 0.060, rz: 0.065, n: 2.10 },
  { y: 1.220, rx: 0.065, rz: 0.071, n: 2.10 },
  { y: 1.170, rx: 0.063, rz: 0.069, n: 2.10 },
  { y: 1.100, rx: 0.057, rz: 0.062, n: 2.10 },
  { y: 1.030, rx: 0.049, rz: 0.054, n: 2.10 },
  { y: 0.965, rx: 0.041, rz: 0.046, n: 2.20 },
  { y: 0.925, rx: 0.036, rz: 0.042, n: 2.30 },   // wrist
];
const TORSO = [
  { y: 0.985, rx: 0.120, rz: 0.094, n: 2.6, w: 0.0 },
  { y: 1.060, rx: 0.152, rz: 0.112, n: 2.8, w: 0.1 },
  { y: 1.140, rx: 0.160, rz: 0.113, n: 2.8, w: 0.1 },
  { y: 1.210, rx: 0.148, rz: 0.106, n: 2.7, w: 0.2 },
  { y: 1.280, rx: 0.135, rz: 0.099, n: 2.6, w: 0.3 },
  { y: 1.340, rx: 0.131, rz: 0.097, n: 2.6, w: 0.4 },
  { y: 1.400, rx: 0.142, rz: 0.104, n: 2.7, w: 0.6 },
  { y: 1.460, rx: 0.157, rz: 0.112, n: 2.8, w: 0.9 },
  { y: 1.520, rx: 0.172, rz: 0.117, n: 2.9, w: 1.0 },
  { y: 1.580, rx: 0.178, rz: 0.117, n: 2.9, w: 1.0 },
  { y: 1.640, rx: 0.176, rz: 0.114, n: 2.9, w: 0.9 },
  { y: 1.690, rx: 0.156, rz: 0.105, n: 2.8, w: 0.6 },
  { y: 1.740, rx: 0.112, rz: 0.088, n: 2.5, w: 0.2 },
  { y: 1.800, rx: 0.068, rz: 0.062, n: 2.3, w: 0.0 },
];
// Boot, swept heel → toe. Built along +Y then laid down by a −90° X turn, so a
// station's rz is its height and dz its height above the floor. Every station
// has dz == rz, which puts the sole flat on y 0 across the whole footprint —
// the plane Locomotion's ground solve assumes.
const FOOT = [
  { y: 0.000, rx: 0.044, rz: 0.042, dz: 0.042, n: 2.6 },
  { y: 0.045, rx: 0.058, rz: 0.056, dz: 0.056, n: 2.8 },
  { y: 0.105, rx: 0.063, rz: 0.058, dz: 0.058, n: 3.0 },
  { y: 0.175, rx: 0.064, rz: 0.048, dz: 0.048, n: 3.2 },
  { y: 0.245, rx: 0.058, rz: 0.035, dz: 0.035, n: 3.2 },
  { y: 0.295, rx: 0.042, rz: 0.024, dz: 0.024, n: 3.0 },
];
const ANKLE = [
  { y: 0.085, rx: 0.063, rz: 0.064, n: 2.4 },
  { y: 0.165, rx: 0.058, rz: 0.059, n: 2.2 },
  { y: 0.245, rx: 0.055, rz: 0.057, n: 2.1 },
  { y: 0.300, rx: 0.048, rz: 0.051, n: 2.1 },
];
const HAND = [
  { y: 0.930, rx: 0.036, rz: 0.042, n: 2.3 },
  { y: 0.900, rx: 0.044, rz: 0.041, n: 2.6 },
  { y: 0.872, rx: 0.049, rz: 0.038, n: 2.9 },
  { y: 0.846, rx: 0.050, rz: 0.036, n: 3.0 },
  { y: 0.822, rx: 0.047, rz: 0.033, n: 3.0 },
];
const FINGER = [
  { y: 0.824, rx: 0.011, rz: 0.011, n: 2.4 },
  { y: 0.792, rx: 0.010, rz: 0.010, n: 2.4 },
  { y: 0.766, rx: 0.008, rz: 0.008, n: 2.4 },
];
// Chin → crown. High n through the face gives the skull a flat face plane and
// squared temples; the crown drops back toward 2.4 and rounds over.
const SKULL = [
  { y: 1.838, rx: 0.052, rz: 0.062, dz: -0.026, n: 2.6 },
  { y: 1.876, rx: 0.074, rz: 0.092, dz: -0.016, n: 2.9 },
  { y: 1.922, rx: 0.087, rz: 0.104, dz: -0.010, n: 3.1 },
  { y: 1.980, rx: 0.096, rz: 0.112, dz: -0.002, n: 3.2 },
  { y: 2.038, rx: 0.101, rz: 0.116, dz: 0.004, n: 3.0 },
  { y: 2.092, rx: 0.099, rz: 0.112, dz: 0.010, n: 2.7 },
  { y: 2.140, rx: 0.086, rz: 0.096, dz: 0.014, n: 2.5 },
  { y: 2.178, rx: 0.058, rz: 0.064, dz: 0.016, n: 2.4 },
];

// Round a station stack's end over a dome instead of stopping at a flat disc.
function domed(st, top = 0, bottom = 0, steps = 3) {
  let out = st;
  if (bottom > 0) {
    const e = st[0], h = Math.min(e.rx, e.rz) * bottom, pre = [];
    for (let k = steps; k >= 1; k--) {
      const a = (k / (steps + 1)) * Math.PI / 2;
      pre.push({ ...e, y: e.y - h * Math.sin(a), rx: e.rx * Math.cos(a), rz: e.rz * Math.cos(a) });
    }
    out = pre.concat(out);
  }
  if (top > 0) {
    const e = st[st.length - 1], h = Math.min(e.rx, e.rz) * top;
    out = out.slice();
    for (let k = 1; k <= steps; k++) {
      const a = (k / (steps + 1)) * Math.PI / 2;
      out.push({ ...e, y: e.y + h * Math.sin(a), rx: e.rx * Math.cos(a), rz: e.rz * Math.cos(a) });
    }
  }
  return out;
}

const scaled = (st, k, useW) => (k === 1 ? st : st.map(q => ({
  ...q,
  rx: q.rx * (1 + (k - 1) * (useW ? (q.w ?? 1) : 1)),
  rz: q.rz * (1 + (k - 1) * (useW ? (q.w ?? 1) : 1) * 0.6),
})));

// Place a station stack in the world and weight it.
//  `sx`  the limb's x axis; `weightAt` maps a station's bind height to bones.
function place(st, sx, weightAt, sz = 0) {
  return st.map(q => ({
    y: q.y, rx: q.rx, rz: q.rz, n: q.n,
    x: sx, z: sz + (q.dz || 0),
    bones: weightAt(q.y),
  }));
}

// ── Armour ───────────────────────────────────────────────────────────────────
// Plates are hard surfaces and do not deform — each is bound rigidly to one
// bone, so a shin plate rides the shin exactly instead of bending with it. They
// wrap the form underneath rather than hovering over it as a slab: a plate is a
// partial ring lofted along the same superellipse as the limb, offset outward,
// with crisp side rims from duplicated corner vertices and ends that feather
// into the frame.
function plateGeometry(st, a0, a1, t, seg) {
  const S = st.length, pos = [], idx = [];
  const rings = st.map((q, s) => {
    const n = q.n ?? 2, x0 = q.x || 0, z0 = q.z || 0;
    const off = (s === 0 || s === S - 1) ? 0 : t;
    const arc = (o) => {
      const pts = [];
      for (let r = 0; r <= seg; r++) {
        const a = a0 + (a1 - a0) * (r / seg);
        const [x, z] = sePoint(a, q.rx + o, q.rz + o, n);
        pts.push([x0 + x, q.y, z0 + z]);
      }
      return pts;
    };
    const outer = arc(off), inner = arc(0), ring = outer.slice();
    ring.push(outer[seg].slice(), inner[seg].slice());
    for (let r = seg; r >= 0; r--) ring.push(inner[r]);
    ring.push(inner[0].slice(), outer[0].slice());
    return ring;
  });
  const N = rings[0].length;
  for (const ring of rings) for (const p of ring) pos.push(p[0], p[1], p[2]);
  for (let s = 0; s < S - 1; s++) {
    for (let r = 0; r < N; r++) {
      const a = s * N + r, b = s * N + (r + 1) % N;
      idx.push(a, b + N, b, a, a + N, b + N);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const FRONT = -Math.PI / 2, BACK = Math.PI / 2;
const arc = (c, half) => [c - half, c + half];

function addPlate(buf, st, sx, bone, o) {
  const placed = st.map(q => ({ ...q, x: sx, z: (q.z || 0) + (q.dz || 0) }));
  const g = plateGeometry(placed, o.a0, o.a1, o.t ?? 0.024, o.seg ?? 9);
  if (o.rot) { g.rotateX(o.rot[0] || 0); }
  if (o.at) g.translate(o.at[0], o.at[1], o.at[2]);
  appendGeometry(g, [[bone, 1]], buf);
  g.dispose();
}

function addBox(buf, w, h, d, x, y, z, bone, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  appendGeometry(g, [[bone, 1]], buf);
  g.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════
// Geometry depends only on the chassis, never on the skeleton instance: the
// skin attributes hold bone INDICES, and those are fixed by BONE_ORDER. So the
// buffers are built once per chassis and shared by every body wearing it, while
// each body gets its own bones (they animate independently) and its own
// materials (a death fade must not fade everyone).
//
// This matters: welding and re-smoothing the outline hulls is most of the build
// cost, and without the cache a body costs ~60ms — half a second to spawn a
// lobby of bots.
const _heroCache = new Map();

function heroGeometry(id) {
  const hit = _heroCache.get(id);
  if (hit) return hit;
  const parts = buildHeroBuffers(id);
  for (const p of parts) {
    p.geo.userData.shared = true;
    p.outline.userData.shared = true;
  }
  _heroCache.set(id, parts);
  return parts;
}

export function buildHeroBody(id = 'vanguard') {
  const pal = getLowPolyPalette(id);
  const M = makeBodyMaterials(pal);
  const parts = heroGeometry(id);

  const group = new THREE.Group();
  const { root, bones, list } = buildSkeleton();
  group.add(root);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);

  const olMat = new THREE.MeshBasicMaterial({ color: 0x1c1e24, side: THREE.BackSide });
  const meshes = [], outlines = [];
  for (const { key, geo, outline } of parts) {
    const mesh = new THREE.SkinnedMesh(geo, M[key]);
    mesh.name = 'body_' + key;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    mesh.bind(skeleton);
    meshes.push(mesh);

    const ol = new THREE.SkinnedMesh(outline, olMat);
    ol.name = 'outline';
    ol.castShadow = false;
    ol.frustumCulled = false;
    ol.raycast = () => {};
    group.add(ol);
    ol.bind(skeleton);
    outlines.push(ol);
  }

  group.userData = {
    isLowPoly: true, isHero: true, armorTypeId: id,
    // Headshots resolve by hit height, the way they already do for the rigged
    // human: a skinned body is a handful of merged meshes, so there is no
    // per-part head mesh left to tag. Measured off this skeleton — the skull
    // runs 1.84 to 2.23 and the neck sits below it.
    headshotY: 1.80,
    primaryMat: M.armor, secondaryMat: M.armor2,
    outlineMat: olMat,
    skeleton, bones, meshes, outlines,
    rig: {
      legL: bones.thighL, legR: bones.thighR,
      kneeL: bones.kneeL, kneeR: bones.kneeR,
      ankleL: bones.ankleL, ankleR: bones.ankleR,
      armL: bones.shoulderL, armR: bones.shoulderR,
      elbowL: bones.elbowL, elbowR: bones.elbowR,
      hips: bones.hips, spine: bones.spine, chest: bones.chest, head: bones.head,
    },
  };
  return group;
}

// ═══════════════════════════════════════════════════════════════════════════
function buildHeroBuffers(id) {
  const pal = getLowPolyPalette(id);
  const bulk = pal.bulk ?? 1;

  // One accumulator per material — the whole body ends up as a handful of
  // skinned draw calls instead of ~80 separate meshes.
  const bufs = {};
  const buf = (key) => (bufs[key] ||= newBuffer());

  const legR = scaled(LEG, bulk), armR = scaled(ARM, bulk);

  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? -0.11 : 0.11;
    const ax = s === 'L' ? -0.27 : 0.27;
    const out = s === 'L' ? -1 : 1;
    const legW = (y) => chainWeights(legChain(s), y);
    const armW = (y) => chainWeights(armChain(s), y);
    const ankle = B['ankle' + s], knee = B['knee' + s];
    const thigh = B['thigh' + s], elbow = B['elbow' + s], hand = B['hand' + s];

    // ── leg: ONE surface, hip to ankle, creasing at the knee ──
    loftSkinned(place(legR, sx, legW), 22, buf('frame'));

    // Boot and ankle ride the ankle bone rigidly.
    {
      const g = newBuffer();
      loftSkinned(place(domed(FOOT, 0.6), 0, () => [[ankle, 1]]), 18, g);
      const geo = toGeometry(g);
      geo.rotateX(-Math.PI / 2);
      geo.translate(sx, 0, 0.10);
      appendGeometry(geo, [[ankle, 1]], buf('joint'));
      geo.dispose();
    }
    loftSkinned(place(ANKLE, sx, () => [[ankle, 1]], 0.012), 14, buf('joint'));
    // Instep armour. Built in the boot's own upright frame and laid down with
    // it, so its arc (centred on the section's +Z, which becomes UP after the
    // turn) wraps the top of the foot rather than one side of it.
    {
      const st = FOOT.slice(1).map(q => ({ ...q, x: 0, z: q.dz }));
      const geo = plateGeometry(st, arc(BACK, 1.15)[0], arc(BACK, 1.15)[1], 0.020, 9);
      geo.rotateX(-Math.PI / 2);
      geo.translate(sx, 0, 0.10);
      appendGeometry(geo, [[ankle, 1]], buf('armor'));
      geo.dispose();
    }
    addBox(buf('armor'), 0.104, 0.052, 0.062, sx, 0.030, -0.176, ankle);

    // Leg armour
    addPlate(buf('armor'), legR.slice(1, 6).map(q => ({ ...q })), sx, thigh,
             { a0: arc(FRONT, 0.78)[0], a1: arc(FRONT, 0.78)[1], t: 0.026 });
    // Shin plate. The slice matters: the first and last stations feather to zero
    // thickness, so the plate you SEE is the interior — cut it too short and the
    // shin loses the armour it had.
    addPlate(buf('armor'), legR.slice(11, 18).map(q => ({ ...q })), sx, knee,
             { a0: arc(FRONT, 1.02)[0], a1: arc(FRONT, 1.02)[1], t: 0.026 });
    addPlate(buf('armor'), [
      { y: 0.552, rx: 0.078, rz: 0.082, n: 2.2 },
      { y: 0.600, rx: 0.089, rz: 0.092, n: 2.2 },
      { y: 0.645, rx: 0.090, rz: 0.093, n: 2.2 },
      { y: 0.692, rx: 0.080, rz: 0.084, n: 2.2 },
    ], sx, knee, { a0: arc(FRONT, 0.95)[0], a1: arc(FRONT, 0.95)[1], t: 0.028 });
    addBox(buf('glow'), 0.048, 0.042, 0.026, sx, 0.628, -0.114, knee);
    addPlate(buf('glow'), [
      { y: 0.880, rx: 0.107, rz: 0.118, n: 2.2 },
      { y: 0.930, rx: 0.112, rz: 0.123, n: 2.2 },
      { y: 0.990, rx: 0.115, rz: 0.127, n: 2.2 },
      { y: 1.040, rx: 0.112, rz: 0.124, n: 2.2 },
    ], sx, thigh, { a0: out > 0 ? -0.30 : Math.PI + 0.30,
                    a1: out > 0 ? 0.30 : Math.PI - 0.30, t: 0.014, seg: 5 });

    // ── arm: ONE surface, shoulder to wrist, creasing at the elbow ──
    loftSkinned(place(armR, ax, armW), 18, buf('frame'));
    addPlate(buf('armor'), armR.slice(9, 15).map(q => ({ ...q })), ax, elbow,
             { a0: arc(FRONT, 1.25)[0], a1: arc(FRONT, 1.25)[1], t: 0.028 });
    addBox(buf('glow'), 0.028, 0.085, 0.022, ax, 1.090, -0.094, elbow);

    // Hand + fingers, rigid to the hand bone.
    loftSkinned(place(domed(HAND, 0, 0.8), ax, () => [[hand, 1]]), 16, buf('joint'));
    for (let f = 0; f < 3; f++) {
      loftSkinned(place(domed(FINGER, 0, 0.9), ax + (f - 1) * 0.026,
                        () => [[hand, 1]], -0.026), 8, buf('joint'));
    }

    // Deltoid + pauldron sit on the chest, so they stay put while the arm swings
    // under them — a shoulder only reads as armour if the muscle shows beneath.
    loftSkinned(place([
      { y: 1.530, rx: 0.074, rz: 0.080, n: 2.2 },
      { y: 1.598, rx: 0.098, rz: 0.100, n: 2.3 },
      { y: 1.662, rx: 0.105, rz: 0.106, n: 2.4 },
      { y: 1.722, rx: 0.091, rz: 0.092, n: 2.4 },
      { y: 1.766, rx: 0.060, rz: 0.062, n: 2.3 },
    ], ax * 0.945, () => [[B.chest, 1]]), 18, buf('frame'));
    const PAUL = [
      { y: 1.512, rx: 0.100, rz: 0.104, n: 2.5 },
      { y: 1.550, rx: 0.117, rz: 0.119, n: 2.5 },
      { y: 1.602, rx: 0.111, rz: 0.113, n: 2.5 },
      { y: 1.662, rx: 0.109, rz: 0.110, n: 2.6 },
      { y: 1.716, rx: 0.095, rz: 0.096, n: 2.6 },
      { y: 1.762, rx: 0.064, rz: 0.066, n: 2.4 },
    ];
    const pa = out > 0 ? 0 : Math.PI;
    addPlate(buf('armor'), PAUL, ax * 0.945, B.chest,
             { a0: pa - out * 1.06, a1: pa + out * 1.06, t: 0.030, seg: 11 });
    addPlate(buf('armor2'), PAUL.slice(0, 3), ax * 0.945, B.chest,
             { a0: pa - out * 1.06, a1: pa + out * 1.06, t: 0.040, seg: 11 });
    addBox(buf('glow'), 0.04, 0.04, 0.03, ax * 0.945 + out * 0.05, 1.630, -0.088, B.chest);
  }

  // ── torso: one trunk, pelvis to neck, weighted up the spine ──
  loftSkinned(place(scaled(TORSO, bulk, true), 0, (y) => chainWeights(TORSO_CHAIN, y)),
              26, buf('frame'));

  for (const s of [-1, 1]) {
    addPlate(buf('armor'), TORSO.slice(0, 4), 0, B.hips,
             { a0: s > 0 ? -0.62 : Math.PI + 0.62, a1: s > 0 ? 0.62 : Math.PI - 0.62,
               t: 0.028, seg: 7 });
  }
  addBox(buf('glow'), 0.05, 0.05, 0.03, 0, 1.150, -0.104, B.hips);

  for (let i = 0; i < 3; i++) {
    const y = 1.255 + i * 0.072;
    addPlate(buf('armor2'), [
      { y: y - 0.034, rx: 0.130, rz: 0.096, n: 2.6 },
      { y: y - 0.014, rx: 0.136, rz: 0.100, n: 2.6 },
      { y: y + 0.014, rx: 0.137, rz: 0.101, n: 2.6 },
      { y: y + 0.030, rx: 0.130, rz: 0.096, n: 2.6 },
    ], 0, B.spine, { a0: arc(FRONT, 0.95)[0], a1: arc(FRONT, 0.95)[1], t: 0.022 });
  }
  addBox(buf('glow'), 0.045, 0.06, 0.03, 0, 1.330, -0.116, B.spine);

  const CHEST = [
    { y: 1.450, rx: 0.148, rz: 0.107, n: 2.8 },
    { y: 1.505, rx: 0.164, rz: 0.115, n: 2.8 },
    { y: 1.565, rx: 0.176, rz: 0.119, n: 2.9 },
    { y: 1.618, rx: 0.176, rz: 0.117, n: 2.9 },
    { y: 1.660, rx: 0.164, rz: 0.110, n: 2.9 },
  ];
  for (const s of [-1, 1]) {
    addPlate(buf('armor'), CHEST, 0, B.chest,
             { a0: FRONT + s * 0.13, a1: FRONT + s * 1.02, t: 0.030, seg: 9 });
  }
  addPlate(buf('frame'), CHEST.slice(0, 4), 0, B.chest,
           { a0: FRONT - 0.10, a1: FRONT + 0.10, t: 0.013, seg: 3 });
  addBox(buf('glow'), 0.04, 0.05, 0.03, 0, 1.455, -0.138, B.chest);
  addPlate(buf('armor2'), [
    { y: 1.638, rx: 0.176, rz: 0.117, n: 2.9 },
    { y: 1.672, rx: 0.168, rz: 0.112, n: 2.8 },
    { y: 1.706, rx: 0.150, rz: 0.102, n: 2.8 },
    { y: 1.736, rx: 0.116, rz: 0.090, n: 2.6 },
  ], 0, B.chest, { a0: -Math.PI * 1.32, a1: Math.PI * 0.32, t: 0.024, seg: 22 });
  addPlate(buf('frame'), [
    { y: 1.440, rx: 0.144, rz: 0.106, n: 2.8 },
    { y: 1.500, rx: 0.162, rz: 0.115, n: 2.8 },
    { y: 1.580, rx: 0.178, rz: 0.119, n: 2.9 },
    { y: 1.650, rx: 0.168, rz: 0.112, n: 2.9 },
  ], 0, B.chest, { a0: arc(BACK, 0.52)[0], a1: arc(BACK, 0.52)[1], t: 0.040, seg: 6 });

  // ── head ──
  loftSkinned(place(domed(SKULL, 0.55), 0, () => [[B.head, 1]]), 22, buf('bone'));
  addPlate(buf('bone'), SKULL.slice(4).map(q => ({ ...q, z: q.dz })), 0, B.head,
           { a0: -Math.PI, a1: Math.PI, t: 0.012, seg: 22 });
  addPlate(buf('joint'), SKULL.slice(3, 6).map(q => ({ ...q, z: q.dz })), 0, B.head,
           { a0: -Math.PI, a1: Math.PI, t: 0.005, seg: 22 });
  for (const s of [-1, 1]) addBox(buf('joint'), 0.026, 0.026, 0.026, s * 0.076, 2.100, 0.024, B.head);
  addBox(buf('joint'), 0.182, 0.030, 0.05, 0, 2.026, -0.098, B.head);
  addBox(buf('joint'), 0.166, 0.056, 0.040, 0, 1.982, -0.106, B.head);
  for (const s of [-1, 1]) addBox(buf('glow'), 0.05, 0.036, 0.03, s * 0.045, 1.982, -0.124, B.head);
  for (const s of [-1, 1]) addBox(buf('frame'), 0.034, 0.148, 0.112, s * 0.094, 1.992, 0.006, B.head);
  addBox(buf('bone'), 0.028, 0.058, 0.038, 0, 1.928, -0.108, B.head);
  addBox(buf('joint'), 0.126, 0.046, 0.030, 0, 1.886, -0.098, B.head);
  addBox(buf('steel'), 0.112, 0.030, 0.026, 0, 1.889, -0.104, B.head);
  for (let i = 0; i < 6; i++)
    addBox(buf('joint'), 0.006, 0.032, 0.022, -0.05 + i * 0.02, 1.889, -0.112, B.head);
  for (const s of [-1, 1]) addBox(buf('steel'), 0.016, 0.12, 0.016, s * 0.048, 1.800, 0.036, B.neck);

  const parts = [];
  for (const [key, b] of Object.entries(bufs)) {
    const geo = toGeometry(b);
    // Raycasts cull against the bounding sphere before testing triangles, and a
    // skinned mesh's is computed from the BIND pose — a leg thrown out in a
    // slide reaches past it and shots would silently miss a body plainly there.
    // One generous sphere around the whole character instead.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.1, 0), 2.0);
    parts.push({ key, geo, outline: inflate(geo, 0.011) });
  }
  return parts;
}
