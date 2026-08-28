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
// Neither derives anything from the mesh, so the body may be reshaped freely,
// but it has to be built on the same figure they solve against —
//
// every joint height, bone length and sole corner. They all come from
// Proportions.js — which is also where Locomotion and RifleCarry read them, so
// there is one figure rather than three copies of one.
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
import * as BODY from './Proportions.js';
import { remapY, GIRTH as G, LEGACY as OLD } from './Proportions.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  chainWeights, loftSkinned, appendGeometry, newBuffer, toGeometry, sePoint,
} from './BodyGeometry.js';
import { attachUniversalAnimator } from './UniversalAnimations.js';

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
  root:      { at: [0, 0, 0],                          parent: null },
  hips:      { at: [0, BODY.PELVIS_Y, 0],              parent: 'root' },
  spine:     { at: [0, BODY.LUMBAR_Y, 0],              parent: 'hips' },
  chest:     { at: [0, BODY.THORAX_Y, 0],              parent: 'spine' },
  neck:      { at: [0, BODY.NECK_Y, 0],                parent: 'chest' },
  head:      { at: [0, BODY.HEAD_Y, 0],                parent: 'neck' },
  shoulderL: { at: [-BODY.SHOULDER_X, BODY.SHOULDER_Y, 0], parent: 'chest' },   // rig.armL
  elbowL:    { at: [-BODY.SHOULDER_X, BODY.ELBOW_Y, 0],    parent: 'shoulderL' },
  handL:     { at: [-BODY.SHOULDER_X, BODY.WRIST_Y, 0],    parent: 'elbowL' },
  shoulderR: { at: [BODY.SHOULDER_X, BODY.SHOULDER_Y, 0],  parent: 'chest' },   // rig.armR
  elbowR:    { at: [BODY.SHOULDER_X, BODY.ELBOW_Y, 0],     parent: 'shoulderR' },
  handR:     { at: [BODY.SHOULDER_X, BODY.WRIST_Y, 0],     parent: 'elbowR' },
  thighL:    { at: [-BODY.HIP_X, BODY.HIP_Y, 0],       parent: 'hips' },        // rig.legL
  kneeL:     { at: [-BODY.HIP_X, BODY.KNEE_Y, 0],      parent: 'thighL' },
  ankleL:    { at: [-BODY.HIP_X, BODY.ANKLE_Y, 0],     parent: 'kneeL' },
  thighR:    { at: [BODY.HIP_X, BODY.HIP_Y, 0],        parent: 'hips' },
  kneeR:     { at: [BODY.HIP_X, BODY.KNEE_Y, 0],       parent: 'thighR' },
  ankleR:    { at: [BODY.HIP_X, BODY.ANKLE_Y, 0],      parent: 'kneeR' },
};

// ── carrying the authored anatomy onto the new figure ────────────────────────
// The station tables below were shaped against the previous 2.21m figure. They
// are kept in that space and mapped, rather than 200 numbers being retyped:
// the map is piecewise-linear between the joints, so the quad belly, the calf
// and the ribcage taper land on the same part of the same bone instead of the
// whole body being uniformly squashed and every muscle drifting off its joint.
//
// Legs and arms need SEPARATE maps even though they overlap in height — the
// wrist sits between the knee and the hip, and a single global map would put it
// at 0.72 instead of 0.88.
const mapLeg   = remapY([[0, 0], [OLD.ANKLE_Y, BODY.ANKLE_Y],
                         [OLD.KNEE_Y, BODY.KNEE_Y], [OLD.HIP_Y, BODY.HIP_Y]]);
const mapArm   = remapY([[OLD.WRIST_Y, BODY.WRIST_Y], [OLD.ELBOW_Y, BODY.ELBOW_Y],
                         [OLD.SHOULDER_Y, BODY.SHOULDER_Y]]);
const mapTorso = remapY([[OLD.PELVIS_Y, BODY.PELVIS_Y], [OLD.LUMBAR_Y, BODY.LUMBAR_Y],
                         [OLD.THORAX_Y, BODY.THORAX_Y], [OLD.NECK_Y, BODY.NECK_Y],
                         [OLD.HEAD_Y, BODY.HEAD_Y]]);
const mapHead  = remapY([[OLD.CHIN_Y, BODY.CHIN_Y], [OLD.CROWN_Y, BODY.CROWN_Y]]);

/** Map a station table onto the new figure: heights by `m`, girth by GIRTH. */
function xf(tbl, m) {
  return tbl.map(q => ({
    ...q, y: m(q.y),
    rx: q.rx * G, rz: q.rz * G,
    dz: q.dz === undefined ? undefined : q.dz * G,
  }));
}

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
  { y: BODY.HIP_Y,   bone: B['thigh' + s], band: 0.10 * G },
  { y: BODY.KNEE_Y,  bone: B['knee' + s],  band: 0.105 * G },
  { y: BODY.ANKLE_Y, bone: B['ankle' + s], band: 0.050 * G },
];
const armChain = (s) => [
  { y: BODY.SHOULDER_Y, bone: B['shoulder' + s], band: 0.085 * G },
  { y: BODY.ELBOW_Y,    bone: B['elbow' + s],    band: 0.080 * G },
  { y: BODY.WRIST_Y,    bone: B['hand' + s],     band: 0.045 * G },
];
const TORSO_CHAIN = [
  { y: BODY.HEAD_Y,   bone: B.head,  band: 0.045 * G },
  { y: BODY.NECK_Y,   bone: B.neck,  band: 0.055 * G },
  { y: BODY.THORAX_Y, bone: B.chest, band: 0.110 * G },
  { y: BODY.LUMBAR_Y, bone: B.spine, band: 0.110 * G },
  { y: BODY.PELVIS_Y, bone: B.hips,  band: 0.110 * G },
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
// Every plate is generated from the SAME station radii as the surface beneath
// it, so its inner face lands exactly on that surface — two coincident sheets,
// which is a depth fight, and on a cel-shaded body it reads as black mottling
// crawling over the armour. GAP lifts the whole plate clear of what it covers.
const PLATE_GAP = 0.003;
// The end rings taper the plate to an edge rather than stopping it square — but
// they must not taper to NOTHING. At zero the outer and inner arcs land on the
// same points, mergeVertices welds them, and computeVertexNormals averages two
// opposing normals into ~zero. The lit body does not care (it never sees those
// faces edge-on), but the inverted-hull outline pushes every vertex along its
// normal, and a garbage normal throws that vertex somewhere arbitrary — the
// hull then slashes across the plate as dark hatching. On a two-station trim
// strip EVERY ring is an end ring, which is why the thin rims hatched solid.
const PLATE_EDGE = 0.0035;
// Thinnest a plate may be. The inverted-hull outline pushes every vertex
// OUT_T along its normal, so a shell thinner than twice that has its two faces
// swapped by the hull and the hull swallows the plate — it renders as black
// hatching where a trim strip should be. Trim thickness is not a free choice;
// it is bounded below by the outline weight.
const OUT_T = 0.0062;
const TRIM  = 0.016;

function plateGeometry(st, a0, a1, t, seg) {
  // The arc is a SPAN, not a direction — but half the call sites mirror a side
  // by writing it backwards (`pa - out*half` … `pa + out*half` with out = −1).
  // Swept backwards the triangles come out wound the other way, so the plate's
  // normals point INTO the body: the lit pass then culls the face you are
  // looking at, and the inverted-hull outline pushes the hull the wrong way and
  // fills the hole. Run every arc in increasing order and the span is identical.
  if (a1 < a0) { const s = a0; a0 = a1; a1 = s; }
  const S = st.length, pos = [], idx = [];
  const desc = S > 1 && st[S - 1].y < st[0].y;
  const rings = st.map((q, s) => {
    const n = q.n ?? 2, x0 = q.x || 0, z0 = q.z || 0;
    const end = (s === 0 || s === S - 1);
    const off = PLATE_GAP + (end ? Math.min(t, PLATE_EDGE) : t);
    const arc = (o) => {
      const pts = [];
      for (let r = 0; r <= seg; r++) {
        const a = a0 + (a1 - a0) * (r / seg);
        const [x, z] = sePoint(a, q.rx + o, q.rz + o, n);
        pts.push([x0 + x, q.y, z0 + z]);
      }
      return pts;
    };
    const outer = arc(off), inner = arc(PLATE_GAP), ring = outer.slice();
    ring.push(outer[seg].slice(), inner[seg].slice());
    for (let r = seg; r >= 0; r--) ring.push(inner[r]);
    ring.push(inner[0].slice(), outer[0].slice());
    return ring;
  });
  const N = rings[0].length;
  for (const ring of rings) for (const p of ring) pos.push(p[0], p[1], p[2]);
  for (let s = 0; s < S - 1; s++) {
    for (let r = 0; r < N; r++) {
      // Same station-order rule as loftSkinned: a plate cut from a descending
      // table (a shin plate, a tasset, the cape) is wound the other way round.
      const a = s * N + r, b = s * N + (r + 1) % N;
      if (desc) idx.push(a, b, b + N, a, b + N, a + N);
      else idx.push(a, b + N, b, a, a + N, b + N);
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

// A trim strip that hugs ONE edge of a plate instead of covering half of it.
//
// Trims were being cut with `st.slice(2)` — three of a five-station plate, so
// 60% of every panel was pale trim and the armour read as two-tone stripes
// rather than a plate with a lit edge. This walks `frac` of the way back from
// the end station toward the previous one and lands three rings in that sliver:
// three because a two-ring plate is all end-rings and degenerates, and `frac`
// small because an edge highlight is an edge.
function edgeStrip(st, frac = 0.30, atEnd = true) {
  const i = atEnd ? st.length - 1 : 0, j = atEnd ? st.length - 2 : 1;
  const a = st[i], b = st[j];
  const lerp = (u) => {
    const q = { ...a };
    for (const k of ['y', 'rx', 'rz', 'z', 'dz']) {
      if (a[k] === undefined || b[k] === undefined) continue;
      q[k] = a[k] + (b[k] - a[k]) * u;
    }
    return q;
  };
  const out = [lerp(0), lerp(frac * 0.5), lerp(frac)];
  return atEnd ? out.reverse() : out;
}

// `o.lift` raises the plate's station radii before it is built — how a rim
// stacks ON another plate rather than through it. Without it a trim strip built
// from its parent's stations shares that parent's inner face and fights it.
// `o.hard` overrides the superellipse exponent: the station tables carry the
// exponent of the BODY under the plate (n ≈ 2.2, a round limb), so armour built
// straight off them comes out as an inflated pillow wrapped round the arm. A
// plate is a pressed sheet — it wants a flat face and a tight corner, which is
// a high exponent. This is the single biggest difference between armour that
// reads as armour and armour that reads as upholstery.
function addPlate(buf, st, sx, bone, o) {
  const lift = o.lift || 0;
  const placed = st.map(q => ({
    ...q, rx: q.rx + lift, rz: q.rz + lift,
    n: o.hard ?? q.n,
    x: sx, z: (q.z || 0) + (q.dz || 0),
  }));
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

// An eight-sided, lightly bevelled hard-surface panel. BoxGeometry was useful
// for tiny hidden supports, but using it for every visible detail left the suit
// looking assembled from toy blocks. This produces clipped corners, a raised
// rim and real highlight-catching bevels while remaining cheap enough to merge
// into the same seven skinned draw calls as the rest of the body.
function addChamferedPanel(buf, w, h, d, x, y, z, bone, o = {}) {
  const c = Math.min(o.chamfer ?? Math.min(w, h) * 0.16, w * 0.34, h * 0.34);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + c, -h / 2);
  shape.lineTo(w / 2 - c, -h / 2);
  shape.lineTo(w / 2, -h / 2 + c);
  shape.lineTo(w / 2, h / 2 - c);
  shape.lineTo(w / 2 - c, h / 2);
  shape.lineTo(-w / 2 + c, h / 2);
  shape.lineTo(-w / 2, h / 2 - c);
  shape.lineTo(-w / 2, -h / 2 + c);
  shape.closePath();
  const bevel = Math.min(o.bevel ?? 0.0045, d * 0.24, c * 0.30);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: d, steps: 1, curveSegments: 1,
    bevelEnabled: true, bevelSegments: 1,
    bevelSize: bevel, bevelThickness: bevel,
  });
  g.translate(0, 0, -d / 2);
  if (o.rx) g.rotateX(o.rx);
  if (o.ry) g.rotateY(o.ry);
  if (o.rz) g.rotateZ(o.rz);
  g.translate(x, y, z);
  appendGeometry(g, [[bone, 1]], buf);
  g.dispose();
}

function addDisc(buf, radius, depth, x, y, z, bone, side) {
  const g = new THREE.CylinderGeometry(radius, radius * 0.92, depth, 10, 1, false);
  g.rotateZ(Math.PI / 2);
  g.translate(x + side * depth * 0.5, y, z);
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
    // Every chassis buffer owns the generous animated bounding sphere created
    // below. Let Three skip players behind the camera instead of skinning and
    // drawing the whole lobby every frame.
    mesh.frustumCulled = true;
    group.add(mesh);
    mesh.bind(skeleton);
    meshes.push(mesh);

    const ol = new THREE.SkinnedMesh(outline, olMat);
    ol.name = 'outline';
    ol.castShadow = false;
    ol.frustumCulled = true;
    ol.raycast = () => {};
    group.add(ol);
    ol.bind(skeleton);
    outlines.push(ol);
  }

  group.userData = {
    isLowPoly: true, isHero: true, isNinjaInspired: true,
    silhouetteStyle: id === 'vanguard' ? 'human-tactical-operative' : 'shinobi-operative',
    armorTypeId: id,
    // Headshots resolve by hit height, the way they already do for the rigged
    // human: a skinned body is a handful of merged meshes, so there is no
    // per-part head mesh left to tag. Measured off this skeleton — the skull
    // runs 1.84 to 2.23 and the neck sits below it.
    headshotY: BODY.HEADSHOT_Y,
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
      // The default arena chassis is authored around a low, loaded stance.
      // Locomotion reads this without changing the shared skeleton/IK contract.
      readyStance: id === 'vanguard' ? 1 : 0,
    },
  };
  attachUniversalAnimator(group);
  return group;
}

// ═══════════════════════════════════════════════════════════════════════════
function buildHeroBuffers(id) {
  const pal = getLowPolyPalette(id);
  const bulk = pal.bulk ?? 1;
  const arena = id === 'vanguard';
  // The connected anatomy stays at the animation contract, while visible hard
  // plates pull inward for a fast, cloth-over-light-armour shinobi silhouette.
  // This helper is deliberately used only on rigid armour station tables: arm
  // lengths, shoulder pivots, hit height, and the weapon IK never move.
  const lightPlate = (st, radial = 0.86, depth = 0.91) => st.map(q => ({
    ...q, rx: q.rx * radial, rz: q.rz * depth,
  }));

  // One accumulator per material — the whole body ends up as a handful of
  // skinned draw calls instead of ~80 separate meshes.
  const bufs = {};
  const buf = (key) => (bufs[key] ||= newBuffer());

  // Authored tables carried onto the new figure.
  const legR = xf(scaled(LEG, bulk), mapLeg);
  const armR = xf(scaled(ARM, bulk), mapArm);
  const torsoT = xf(scaled(TORSO, bulk, true), mapTorso);
  // The arena suit is intentionally closer to a six-head heroic proportion
  // than a tall human mannequin. The larger helmet is armour, not a larger hit
  // target: headshot height and the head bone remain unchanged.
  const skullT = xf(scaled(SKULL, arena ? 1.06 : 1), mapHead);
  const handT = xf(HAND, mapArm), fingerT = xf(FINGER, mapArm);
  // The foot is swept along its own length, so its "y" is distance from the
  // heel: scaled to the new foot length, and its height by girth. The ankle is
  // 3.9% of stature off the floor now instead of 12.2%, so the boot shaft that
  // used to reach a third of the way up the shin is a boot shaft again.
  const footT = FOOT.map(q => ({ ...q,
    y: q.y * (BODY.FOOT_LEN / 0.30),
    rx: q.rx * G * (arena ? 1.06 : 1),
    // FOOT.rz becomes world-up after the -90deg foot laydown; keep that
    // dimension unchanged so the wider arena boot still plants on y=0.
    rz: q.rz * G, dz: q.dz * G }));
  const ankleMap = remapY([[0.085, BODY.ANKLE_Y * 0.42], [0.300, BODY.ANKLE_Y * 1.62]]);
  const ankleT = xf(scaled(ANKLE, arena ? 1.03 : 1), ankleMap);

  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? -BODY.HIP_X : BODY.HIP_X;
    const ax = s === 'L' ? -BODY.SHOULDER_X : BODY.SHOULDER_X;
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
      loftSkinned(place(domed(footT, 0.6), 0, () => [[ankle, 1]]), 18, g);
      const geo = toGeometry(g);
      geo.rotateX(-Math.PI / 2);
      geo.translate(sx, 0, BODY.HEEL_Z);
      appendGeometry(geo, [[ankle, 1]], buf('steel'));
      geo.dispose();
    }
    loftSkinned(place(ankleT, sx, () => [[ankle, 1]], 0.012 * G), 14, buf('steel'));
    // Boot shaft. Rides the SHIN, not the foot: a boot's cuff stays with the leg
    // while the ankle rolls under it, and hanging it off the ankle bone would
    // swing 13cm of armour every heel strike.
    {
      const bootK = arena ? 1.05 : 1;
      const SHAFT = [
        { y: 0.106, rx: 0.050 * bootK, rz: 0.055 * bootK, n: 3.0 },
        { y: 0.152, rx: 0.055 * bootK, rz: 0.060 * bootK, n: 3.0 },
        { y: 0.198, rx: 0.058 * bootK, rz: 0.063 * bootK, n: 2.9 },
        { y: 0.234, rx: 0.052 * bootK, rz: 0.057 * bootK, n: 2.8 },
      ];
      addPlate(buf('bone'), SHAFT, sx, knee,
               { a0: arc(FRONT, 1.02)[0], a1: arc(FRONT, 1.02)[1],
                 t: 0.014, seg: 12, hard: 3.4 });
      addPlate(buf('armor2'), edgeStrip(SHAFT, 0.36, true), sx, knee,
               { a0: arc(FRONT, 1.02)[0], a1: arc(FRONT, 1.02)[1],
                 lift: 0.014, t: TRIM, seg: 12, hard: 3.4 });
    }
    // Heel block — kept inside the sole footprint Locomotion plants, so the boot
    // reads chunky without moving the contact corners.
    addBox(buf('steel'), 0.098 * G, 0.062, 0.070, sx, 0.033, 0.038, ankle);
    // Instep armour. Built in the boot's own upright frame and laid down with
    // it, so its arc (centred on the section's +Z, which becomes UP after the
    // turn) wraps the top of the foot rather than one side of it.
    {
      const st = footT.slice(1).map(q => ({ ...q, x: 0, z: q.dz }));
      const geo = plateGeometry(st, arc(BACK, 1.15)[0], arc(BACK, 1.15)[1], 0.020, 9);
      geo.rotateX(-Math.PI / 2);
      geo.translate(sx, 0, BODY.HEEL_Z);
      appendGeometry(geo, [[ankle, 1]], buf('bone'));
      geo.dispose();
    }
    addBox(buf('steel'), 0.104, 0.052, 0.062, sx, 0.030, -0.176, ankle);
    if (arena) {
      // Overlapping instep and toe shells turn the rectangular collision-safe
      // boot core into a tapered armored shoe. They sit above the sole, so the
      // locomotion contact footprint and floor tests remain unchanged.
      addChamferedPanel(buf('bone'), 0.132, 0.158, 0.020,
                        sx, 0.066, -0.105, ankle,
                        { chamfer: 0.022, bevel: 0.003, rx: -Math.PI / 2 });
      addChamferedPanel(buf('armor2'), 0.098, 0.070, 0.012,
                        sx, 0.084, -0.174, ankle,
                        { chamfer: 0.015, bevel: 0.002, rx: -Math.PI / 2 });
      addDisc(buf('steel'), 0.028, 0.018,
              sx + out * 0.058, 0.132, 0.006, ankle, out);
    }

    // Leg armour
    // Down to just above the knee: the skirt now covers the top of the thigh,
    // so a plate that stops at mid-thigh leaves a bare band between the two.
    addPlate(buf(arena ? 'armor2' : 'armor'), arena ? lightPlate(legR.slice(1, 8), 0.94, 0.96) : legR.slice(1, 8).map(q => ({ ...q })), sx, thigh,
             { a0: arc(FRONT, arena ? 0.36 : 0.50)[0], a1: arc(FRONT, arena ? 0.36 : 0.50)[1],
               t: arena ? 0.018 : 0.030, hard: arena ? 3.1 : 3.4 });
    // Shin plate. The slice matters: the first and last stations feather to zero
    // thickness, so the plate you SEE is the interior — cut it too short and the
    // shin loses the armour it had.
    addPlate(buf('bone'), lightPlate(legR.slice(11, 18), arena ? 1.03 : 1, arena ? 1.02 : 1), sx, knee,
             { a0: arc(FRONT, arena ? 0.66 : 0.62)[0], a1: arc(FRONT, arena ? 0.66 : 0.62)[1],
               t: arena ? 0.026 : 0.030, hard: arena ? 3.5 : 3.4 });
    addPlate(buf(arena ? 'armor2' : 'armor'), xf([
      { y: 0.552, rx: 0.078, rz: 0.082, n: 2.2 },
      { y: 0.600, rx: 0.089, rz: 0.092, n: 2.2 },
      { y: 0.645, rx: 0.090, rz: 0.093, n: 2.2 },
      { y: 0.692, rx: 0.080, rz: 0.084, n: 2.2 },
    ], mapLeg), sx, knee, { a0: arc(FRONT, arena ? 0.48 : 0.58)[0], a1: arc(FRONT, arena ? 0.48 : 0.58)[1],
                           t: (arena ? 0.020 : 0.030) * G, hard: arena ? 3.1 : 3.4 });
    addBox(buf(arena ? 'steel' : 'glow'), 0.040 * G, 0.032 * G, 0.018 * G,
           sx, mapLeg(0.628), -0.108 * G, knee);
    addPlate(buf(arena ? 'steel' : 'glow'), xf([
      { y: 0.880, rx: 0.107, rz: 0.118, n: 2.2 },
      { y: 0.930, rx: 0.112, rz: 0.123, n: 2.2 },
      { y: 0.990, rx: 0.115, rz: 0.127, n: 2.2 },
      { y: 1.040, rx: 0.112, rz: 0.124, n: 2.2 },
    ], mapLeg), sx, thigh, { a0: out > 0 ? -0.30 : Math.PI + 0.30,
                    a1: out > 0 ? 0.30 : Math.PI - 0.30, t: 0.014, seg: 5 });
    if (arena) {
      // Floating faceted kneecap over the wraparound cup: a separate raised
      // part gives the joint a mechanical hinge instead of one orange blob.
      addChamferedPanel(buf('armor'), 0.086, 0.056, 0.016,
                        sx, mapLeg(0.628), -0.142, knee,
                        { chamfer: 0.012, rz: -out * 0.020 });
      addChamferedPanel(buf('steel'), 0.026, 0.008, 0.006,
                        sx, mapLeg(0.628), -0.163, knee,
                        { chamfer: 0.003, bevel: 0.001 });
      addDisc(buf('steel'), 0.026, 0.014,
              sx + out * 0.070, mapLeg(0.628), 0, knee, out);
      // A narrow outer calf reinforcement reads as a protective pad while most
      // of the trouser leg remains visible in profile.
      const calfSide = lightPlate(legR.slice(12, 18), 0.96, 0.98);
      const center = out > 0 ? 0 : Math.PI;
      addPlate(buf('steel'), calfSide, sx, knee,
               { a0: center - 0.25, a1: center + 0.25,
                 t: 0.014, seg: 6, hard: 3.1 });
      addPlate(buf('armor2'), edgeStrip(calfSide, 0.24, true), sx, knee,
               { a0: center - 0.25, a1: center + 0.25,
                 lift: 0.014, t: TRIM, seg: 6, hard: 3.1 });
    }

    // Front tasset. Hung off the THIGH rather than the hips, which is the only
    // way a hanging plate this long survives a stride: rigid to the pelvis it
    // would be a fence the leg swings straight through, and 20cm below the hip
    // joint a 35° swing carries the thigh 10cm past where any hip-mounted panel
    // could stand off to. On the thigh it simply travels with the leg.
    {
      const TAS = arena ? [
        { y: 0.958, rx: 0.102, rz: 0.128, n: 3.2 },
        { y: 0.930, rx: 0.108, rz: 0.134, n: 3.2 },
        { y: 0.906, rx: 0.104, rz: 0.130, n: 3.2 },
      ] : [
        { y: 0.962, rx: 0.100, rz: 0.130, n: 2.4 },
        { y: 0.916, rx: 0.110, rz: 0.146, n: 2.4 },
        { y: 0.868, rx: 0.112, rz: 0.149, n: 2.4 },
        { y: 0.824, rx: 0.104, rz: 0.141, n: 2.4 },
      ];
      addPlate(buf(arena ? 'armor2' : 'armor'), TAS, sx, thigh,
               { a0: arc(FRONT, 0.58)[0], a1: arc(FRONT, 0.58)[1],
                 t: 0.024, seg: 9, hard: 4.0 });
      addPlate(buf('armor2'), edgeStrip(TAS, 0.30, true), sx, thigh,
               { a0: arc(FRONT, 0.58)[0], a1: arc(FRONT, 0.58)[1],
                 lift: 0.024, t: TRIM, seg: 9, hard: 4.0 });
      addBox(buf(arena ? 'steel' : 'glow'), 0.022, 0.030, 0.016, sx, 0.910, -0.158, thigh);
      if (arena) {
        // Raised thigh face and recessed service slot. These overlap the curved
        // tasset deliberately, producing a layered shell rather than a single
        // smooth orange tube.
        addChamferedPanel(buf('armor'), 0.072, 0.086, 0.014,
                          sx, 0.842, -0.154, thigh,
                          { chamfer: 0.014, rz: out * 0.030 });
        addChamferedPanel(buf('steel'), 0.042, 0.012, 0.007,
                          sx, 0.866, -0.174, thigh,
                          { chamfer: 0.005, bevel: 0.0015, rz: out * 0.035 });
      }
    }

    // ── arm: ONE surface, shoulder to wrist, creasing at the elbow ──
    loftSkinned(place(armR, ax, armW), 18, buf('frame'));
    const forearmShell = arena ? lightPlate(armR.slice(9, 15), 0.98, 0.99)
      : armR.slice(9, 15).map(q => ({ ...q }));
    addPlate(buf(arena ? 'armor2' : 'bone'), forearmShell, ax, elbow,
             { a0: arc(FRONT, arena ? 0.58 : 0.78)[0], a1: arc(FRONT, arena ? 0.58 : 0.78)[1],
               t: arena ? 0.018 : 0.032, hard: arena ? 3.1 : 3.2 });
    addBox(buf(arena ? 'steel' : 'glow'), 0.020 * G, 0.060 * G, 0.014 * G,
           ax, mapArm(1.090), -0.086 * G, elbow);

    // Gauntlet: a cuff that flares out toward the wrist. Rigid to the forearm,
    // so it stays a hard shell while the skin under it creases at the elbow.
    {
      const CUFF = xf([
        { y: 1.096, rx: 0.062, rz: 0.067, n: 3.0 },
        { y: 1.040, rx: 0.058, rz: 0.063, n: 3.0 },
        { y: 0.982, rx: 0.052, rz: 0.057, n: 2.9 },
        { y: 0.938, rx: 0.046, rz: 0.051, n: 2.8 },
      ], mapArm);
      addPlate(buf(arena ? 'steel' : 'bone'), arena ? lightPlate(CUFF, 0.98, 0.99) : CUFF, ax, elbow,
               { a0: arc(FRONT, arena ? 0.76 : 1.06)[0], a1: arc(FRONT, arena ? 0.76 : 1.06)[1],
                 t: arena ? 0.009 : 0.014, seg: arena ? 9 : 12, hard: arena ? 3.1 : 3.4 });
      addPlate(buf('armor2'), edgeStrip(CUFF, 0.36, true), ax, elbow,
               { a0: arc(FRONT, 1.06)[0], a1: arc(FRONT, 1.06)[1],
                 lift: 0.014, t: TRIM, seg: 12, hard: 3.4 });
      addBox(buf('glow'), 0.018 * G, 0.050 * G, 0.016 * G,
             ax, mapArm(1.012), -0.062 * G, elbow);
      if (arena) {
        // A small protective glove plate and stitched-looking seams keep the
        // forearm recognizable without turning it into a mechanical gauntlet.
        addChamferedPanel(buf('armor'), 0.060, 0.082, 0.014,
                          ax, mapArm(1.050), -0.108, elbow,
                          { chamfer: 0.011, rz: -out * 0.030 });
        for (const rail of [-1, 1])
          addChamferedPanel(buf('frame'), 0.007, 0.046, 0.005,
                            ax + rail * 0.017, mapArm(1.050), -0.120, elbow,
                            { chamfer: 0.003, bevel: 0.001 });
        addDisc(buf('steel'), 0.024, 0.014,
                ax + out * 0.065, BODY.ELBOW_Y, 0, elbow, out);
      }
    }

    // Hand + fingers, rigid to the hand bone.
    loftSkinned(place(domed(handT, 0, 0.8), ax, () => [[hand, 1]]), 16, buf('steel'));
    for (let f = 0; f < 3; f++) {
      loftSkinned(place(domed(fingerT, 0, 0.9), ax + (f - 1) * 0.026 * G,
                        () => [[hand, 1]], -0.026 * G), 8, buf('steel'));
    }

    // Deltoid + pauldron sit on the chest, so they stay put while the arm swings
    // under them — a shoulder only reads as armour if the muscle shows beneath.
    loftSkinned(place(xf([
      { y: 1.530, rx: 0.074, rz: 0.080, n: 2.2 },
      { y: 1.598, rx: 0.098, rz: 0.100, n: 2.3 },
      { y: 1.662, rx: 0.105, rz: 0.106, n: 2.4 },
      { y: 1.722, rx: 0.091, rz: 0.092, n: 2.4 },
      { y: 1.766, rx: 0.060, rz: 0.062, n: 2.3 },
    ], mapArm), ax * 0.945, () => [[B.chest, 1]]), 18, buf('frame'));
    // Low-profile overlapping shoulder guards. The former three broad exosuit
    // lames made the character read like a heavy mech. These sit close to the
    // deltoid so the arm can still shoulder every gun without becoming bulky.
    const px = ax * 0.945;
    const pa = out > 0 ? 0 : Math.PI;
    const lame = (st, half, t) => {
      const arenaShell = arena;
      const T = xf(lightPlate(st, arenaShell ? 0.98 : 0.86,
        arenaShell ? 0.96 : 0.91), mapArm);
      addPlate(buf(arenaShell ? 'armor2' : 'bone'), T, px, B.chest,
               { a0: pa - out * half, a1: pa + out * half, t: t * G, seg: 11, hard: 4.0 });
      addPlate(buf('armor2'), edgeStrip(T, 0.34, false), px, B.chest,
               { a0: pa - out * half, a1: pa + out * half,
                 lift: t * G, t: TRIM * G, seg: 11, hard: 4.0 });
      return T;
    };
    lame([                                  // fitted top guard
      { y: 1.512, rx: 0.100, rz: 0.104, n: 2.5 },
      { y: 1.550, rx: 0.117, rz: 0.119, n: 2.5 },
      { y: 1.602, rx: 0.111, rz: 0.113, n: 2.5 },
      { y: 1.662, rx: 0.109, rz: 0.110, n: 2.6 },
      { y: 1.716, rx: 0.095, rz: 0.096, n: 2.6 },
      { y: 1.762, rx: 0.064, rz: 0.066, n: 2.4 },
    ], arena ? 0.56 : 0.88, arena ? 0.014 : 0.022);
    lame([                                  // short lower guard
      { y: 1.512, rx: 0.104, rz: 0.108, n: 2.5 },
      { y: 1.548, rx: 0.124, rz: 0.126, n: 2.5 },
      { y: 1.592, rx: 0.129, rz: 0.131, n: 2.5 },
      { y: 1.642, rx: 0.125, rz: 0.126, n: 2.6 },
      { y: 1.692, rx: 0.114, rz: 0.115, n: 2.6 },
    ], arena ? 0.42 : 0.94, arena ? 0.010 : 0.020);
    if (arena) {
      // Outer pauldron badge is a chamfered side-facing plate, not another
      // cuboid. Two narrow vents keep the shoulder readable at gameplay scale.
      addChamferedPanel(buf('armor'), 0.060, 0.078, 0.012,
                        px + out * 0.116, mapArm(1.626), -0.008, B.chest,
                        { chamfer: 0.012, ry: out * Math.PI / 2, rz: -out * 0.05 });
      for (const dy of [-0.022, 0.022])
        addChamferedPanel(buf('steel'), 0.034, 0.008, 0.008,
                          px + out * 0.128, mapArm(1.626) + dy, -0.008, B.chest,
                          { chamfer: 0.003, bevel: 0.001, ry: out * Math.PI / 2 });
    }
    // A single restrained shoulder status mark keeps team identity readable.
    addBox(buf('glow'), 0.018 * G, 0.046 * G, 0.016 * G,
           px + out * 0.105 * G, mapArm(1.570), -0.052 * G, B.chest);

    // Upper-arm plate. Without it the whole arm between pauldron and gauntlet is
    // bare underframe, and the figure reads sleeveless.
    const upperArmShell = arena ? lightPlate(armR.slice(3, 7), 0.96, 0.98)
      : armR.slice(3, 7).map(q => ({ ...q }));
    addPlate(buf(arena ? 'armor2' : 'armor'), upperArmShell, ax, B['shoulder' + s],
             { a0: pa - out * (arena ? 0.48 : 0.68), a1: pa + out * (arena ? 0.48 : 0.68),
               t: arena ? 0.016 : 0.026, seg: arena ? 7 : 9, hard: arena ? 3.1 : 3.4 });
  }

  // ── torso: one trunk, pelvis to neck, weighted up the spine ──
  loftSkinned(place(torsoT, 0, (y) => chainWeights(TORSO_CHAIN, y)), 26, buf('frame'));

  for (const s of [-1, 1]) {
    addPlate(buf(arena ? 'armor2' : 'armor'), torsoT.slice(0, 4), 0, B.hips,
             { a0: s > 0 ? (arena ? -0.48 : -0.62) : Math.PI + (arena ? 0.48 : 0.62),
               a1: s > 0 ? (arena ? 0.48 : 0.62) : Math.PI - (arena ? 0.48 : 0.62),
               t: arena ? 0.018 : 0.028, seg: arena ? 6 : 7 });
  }
  addBox(buf('glow'), 0.05 * G, 0.05 * G, 0.03 * G, 0, mapTorso(1.150), -0.104 * G, B.hips);

  // ── waist and skirt ────────────────────────────────────────────────────────
  // Everything from here down is authored in the FIGURE's own metres rather
  // than remapped from the old tables: it is new armour, not carried anatomy,
  // and it has to clear limbs whose swept volumes are known in this space.
  {
    const BELT = [
      { y: 1.010, rx: arena ? 0.112 : 0.120, rz: arena ? 0.086 : 0.090, n: arena ? 3.8 : 2.6 },
      { y: 1.048, rx: arena ? 0.118 : 0.127, rz: arena ? 0.090 : 0.095, n: arena ? 3.8 : 2.6 },
      { y: 1.086, rx: arena ? 0.114 : 0.122, rz: arena ? 0.088 : 0.092, n: arena ? 3.8 : 2.6 },
    ];
    addPlate(buf('steel'), BELT, 0, B.hips, { a0: -Math.PI, a1: Math.PI, t: 0.016, seg: 26 });
    addPlate(buf(arena ? 'armor2' : 'armor'), BELT, 0, B.hips,
             { a0: -Math.PI, a1: Math.PI, lift: 0.016, t: TRIM, seg: 26 });
    addBox(buf('armor2'), 0.070, 0.052, 0.026, 0, 1.048, -0.100, B.hips);
    addBox(buf('glow'), 0.028, 0.028, 0.024, 0, 1.048, -0.110, B.hips, Math.PI / 4);
  }
  // Side tassets. These CAN hang off the pelvis — the thigh's lateral travel is
  // a couple of centimetres where its fore/aft travel is ten, so a side panel
  // standing 2cm proud of the widest point of the leg stays clear all cycle.
  {
    // 14cm of panel, not 22. The long version hung to mid-thigh the whole way
    // round and the figure read as wearing a skirt rather than hip armour — the
    // LENGTH did that, more than the width.
    const SIDE = arena ? [
      // Compact hip pods keep the waist pinched; the old long panels made the
      // character read as a human wearing a skirt.
      { y: 1.018, rx: 0.136, rz: 0.104, n: 3.3 },
      { y: 0.992, rx: 0.151, rz: 0.115, n: 3.4 },
      { y: 0.964, rx: 0.154, rz: 0.117, n: 3.4 },
      { y: 0.944, rx: 0.145, rz: 0.109, n: 3.3 },
    ] : [
      { y: 1.012, rx: 0.150, rz: 0.112, n: 2.6 },
      { y: 0.972, rx: 0.170, rz: 0.126, n: 2.6 },
      { y: 0.936, rx: 0.178, rz: 0.131, n: 2.5 },
      { y: 0.906, rx: 0.170, rz: 0.125, n: 2.5 },
    ];
    for (const s of [-1, 1]) {
      const c = s > 0 ? 0 : Math.PI;
      addPlate(buf(arena ? 'armor2' : 'armor'), SIDE, 0, B.hips,
               { a0: c - s * 0.56, a1: c + s * 0.56, t: 0.020, seg: 8, hard: 3.4 });
      addPlate(buf('armor2'), edgeStrip(SIDE, 0.30, true), 0, B.hips,
               { a0: c - s * 0.56, a1: c + s * 0.56,
                 lift: 0.020, t: TRIM, seg: 8, hard: 3.4 });
      addBox(buf('steel'), 0.014, 0.030, 0.018, s * 0.157, 0.966, -0.026, B.hips);
    }
    // Rear panel, tucked under the cape.
    addPlate(buf('armor'), SIDE, 0, B.hips,
             { a0: arc(BACK, 0.50)[0], a1: arc(BACK, 0.50)[1],
               t: 0.024, seg: 7, hard: 4.0 });
  }

  const abdomenBands = arena ? 1 : 3;
  for (let i = 0; i < abdomenBands; i++) {
    const y = 1.255 + i * 0.072;
    addPlate(buf(arena ? 'frame' : 'armor'), xf(scaled([
      { y: y - 0.034, rx: 0.116, rz: 0.090, n: 2.6 },
      { y: y - 0.014, rx: 0.122, rz: 0.094, n: 2.6 },
      { y: y + 0.014, rx: 0.123, rz: 0.095, n: 2.6 },
      { y: y + 0.030, rx: 0.116, rz: 0.090, n: 2.6 },
    ], bulk), mapTorso), 0, B.spine,
      { a0: arc(FRONT, 0.74)[0], a1: arc(FRONT, 0.74)[1], t: 0.022 * G, hard: 3.6 });
  }
  addBox(buf('glow'), 0.045 * G, 0.06 * G, 0.03 * G, 0, mapTorso(1.330), -0.116 * G, B.spine);
  if (arena) {
    // A narrow vest placket bridges chest and waist while leaving the fabric
    // sides visible. That keeps the trunk fitted instead of reading as a hard
    // mechanical carapace.
    addChamferedPanel(buf('steel'), 0.066, 0.166, 0.024,
                      0, mapTorso(1.360), -0.132, B.spine,
                      { chamfer: 0.014, bevel: 0.004 });
    addChamferedPanel(buf('armor'), 0.038, 0.046, 0.014,
                      0, mapTorso(1.420), -0.158, B.spine,
                      { chamfer: 0.008, bevel: 0.002 });
    // One low-profile webbing tab at the waist; repeated segmented ribs made
    // the abdomen look mechanical even after the limb armour was reduced.
    addChamferedPanel(buf('armor2'), 0.104, 0.016, 0.010,
                      0, mapTorso(1.274), -0.134, B.spine,
                      { chamfer: 0.004, bevel: 0.001 });
  }

  // Scaled by `bulk` like the torso loft under it. Without that a heavy chassis
  // grows the trunk and leaves its own chest plates buried inside it — the plate
  // is still there, it is just under the skin, and the chest reads as bare
  // underframe from every angle.
  const chestShape = arena ? [
    // Human ribcage under a fitted plate carrier: broad enough for a soldier,
    // but without the extreme inverted-triangle mech shell.
    { y: 1.440, rx: 0.128, rz: 0.106, n: 3.1 },
    { y: 1.492, rx: 0.154, rz: 0.116, n: 3.2 },
    { y: 1.548, rx: 0.180, rz: 0.126, n: 3.3 },
    { y: 1.604, rx: 0.194, rz: 0.130, n: 3.4 },
    { y: 1.652, rx: 0.184, rz: 0.122, n: 3.3 },
  ] : [
    { y: 1.450, rx: 0.148, rz: 0.107, n: 2.8 },
    { y: 1.505, rx: 0.164, rz: 0.115, n: 2.8 },
    { y: 1.565, rx: 0.176, rz: 0.119, n: 2.9 },
    { y: 1.618, rx: 0.176, rz: 0.117, n: 2.9 },
    { y: 1.660, rx: 0.164, rz: 0.110, n: 2.9 },
  ];
  const CHEST = xf(lightPlate(scaled(chestShape, bulk),
    arena ? 1.00 : 0.92, arena ? 0.98 : 0.94), mapTorso);
  for (const s of [-1, 1]) {
    addPlate(buf(arena ? 'steel' : 'armor'), CHEST, 0, B.chest,
             { a0: FRONT + s * 0.12, a1: FRONT + s * (arena ? 1.00 : 1.34),
               t: (arena ? 0.020 : 0.030) * G, seg: arena ? 10 : 12, hard: arena ? 3.2 : 4.2 });
  }
  if (arena) {
    // Layered pectoral faces sit above the curved breastplate. Their clipped
    // corners and diagonal seam break up the single broad orange surface.
    for (const s of [-1, 1]) {
      addChamferedPanel(buf('armor2'), 0.118, 0.084, 0.014,
                        s * 0.086, mapTorso(1.570), -0.154, B.chest,
                        { chamfer: 0.017, rz: -s * 0.08 });
      addChamferedPanel(buf('frame'), 0.068, 0.014, 0.007,
                        s * 0.092, mapTorso(1.578), -0.168, B.chest,
                        { chamfer: 0.005, bevel: 0.001, rz: -s * 0.10 });
      addChamferedPanel(buf('armor'), 0.034, 0.044, 0.010,
                        s * 0.146, mapTorso(1.530), -0.152, B.chest,
                        { chamfer: 0.007, rz: -s * 0.08 });
    }
    addChamferedPanel(buf('glow'), 0.016, 0.052, 0.008,
                      0, mapTorso(1.558), -0.174, B.chest,
                      { chamfer: 0.006, bevel: 0.002 });
  }
  addPlate(buf('frame'), CHEST.slice(0, 4), 0, B.chest,
           { a0: FRONT - 0.10, a1: FRONT + 0.10, t: 0.013 * G, seg: 3 });
  addBox(buf('glow'), 0.04 * G, 0.05 * G, 0.03 * G, 0, mapTorso(1.455), -0.138 * G, B.chest);
  {
    const YOKE = xf(scaled([
      { y: 1.638, rx: arena ? 0.180 : 0.176, rz: arena ? 0.120 : 0.117, n: arena ? 3.3 : 2.9 },
      { y: 1.672, rx: arena ? 0.172 : 0.168, rz: arena ? 0.114 : 0.112, n: arena ? 3.2 : 2.8 },
      { y: 1.706, rx: arena ? 0.152 : 0.150, rz: arena ? 0.104 : 0.102, n: arena ? 3.1 : 2.8 },
      { y: 1.736, rx: arena ? 0.120 : 0.116, rz: arena ? 0.092 : 0.090, n: arena ? 3.0 : 2.6 },
    ], bulk), mapTorso);
    const YA = { a0: -Math.PI * 1.32, a1: Math.PI * 0.32, seg: 22, hard: 3.4 };
    addPlate(buf(arena ? 'steel' : 'bone'), YOKE, 0, B.chest, { ...YA, t: (arena ? 0.018 : 0.024) * G });
    addPlate(buf('armor2'), edgeStrip(YOKE, 0.26, false), 0, B.chest,
             { ...YA, lift: 0.024 * G, t: TRIM });
    if (arena) {
      // Raised collar wings tuck the helmet into the shoulder wedge. Without
      // them the head floats above the torso like a mannequin on a long neck.
      for (const s of [-1, 1]) {
        addChamferedPanel(buf('armor'), 0.064, 0.088, 0.046,
                          s * 0.092, mapTorso(1.732), -0.024, B.chest,
                          { chamfer: 0.014, rz: s * 0.10, ry: -s * 0.12 });
        addChamferedPanel(buf('armor2'), 0.046, 0.032, 0.050,
                          s * 0.078, mapTorso(1.775), -0.018, B.chest,
                          { chamfer: 0.010, rz: s * 0.10, ry: -s * 0.12 });
      }
    }
  }
  addPlate(buf(arena ? 'armor2' : 'armor'), xf(scaled([
    { y: 1.440, rx: 0.144, rz: 0.106, n: 2.8 },
    { y: 1.500, rx: 0.162, rz: 0.115, n: 2.8 },
    { y: 1.580, rx: 0.178, rz: 0.119, n: 2.9 },
    { y: 1.650, rx: 0.168, rz: 0.112, n: 2.9 },
  ], bulk), mapTorso), 0, B.chest,
    { a0: arc(BACK, arena ? 0.42 : 0.52)[0], a1: arc(BACK, arena ? 0.42 : 0.52)[1],
      t: (arena ? 0.024 : 0.040) * G, seg: 6, hard: arena ? 3.2 : 3.8 });

  if (arena) {
    // A compact plate-carrier back pad and shoulder webbing leave most of the
    // upper back visibly fabric-covered. The smaller pieces still read at game
    // distance without turning the wearer into a powered suit.
    addChamferedPanel(buf('steel'), 0.086, 0.190, 0.018,
                      0, mapTorso(1.530), 0.154, B.chest,
                      { chamfer: 0.017, bevel: 0.003 });
    addChamferedPanel(buf('armor2'), 0.044, 0.130, 0.010,
                      0, mapTorso(1.548), 0.176, B.chest,
                      { chamfer: 0.010, bevel: 0.002 });
    for (const s of [-1, 1]) {
      addChamferedPanel(buf('armor2'), 0.094, 0.090, 0.014,
                        s * 0.096, mapTorso(1.592), 0.148, B.chest,
                        { chamfer: 0.018, rz: s * 0.11 });
      for (let i = 0; i < 2; i++)
        addChamferedPanel(buf('frame'), 0.038, 0.008, 0.006,
                          s * 0.096, mapTorso(1.574 + i * 0.030), 0.166, B.chest,
                          { chamfer: 0.003, bevel: 0.001 });
    }
    addChamferedPanel(buf('glow'), 0.010, 0.060, 0.006,
                      0, mapTorso(1.548), 0.190, B.chest,
                      { chamfer: 0.003, bevel: 0.001 });
  }

  // Narrow chamfered chest clasp instead of a rectangular superhero crest.
  addChamferedPanel(buf('steel'), 0.058, 0.098, 0.022,
                    0, 1.352, -0.156, B.chest, { chamfer: 0.012 });
  addChamferedPanel(buf('glow'), 0.018, 0.056, 0.010,
                    0, 1.352, -0.174, B.chest, { chamfer: 0.005, bevel: 0.002 });

  // ── cape ───────────────────────────────────────────────────────────────────
  // A shell, not a plane: plateGeometry already builds a wrapped surface with
  // thickness and rimmed edges, so the cape gets a visible edge and a lining
  // instead of being a one-sided sheet that disappears at a grazing angle.
  // Rigid to the chest — it hangs off the shoulders, and nothing below it is
  // load-bearing for the animation.
  // Keep the cape as the Phantom's silhouette feature. It used to cover every
  // chassis, including the default Vanguard, turning the normal rear gameplay
  // view into one flat black rectangle and hiding the rifle/arm pose we need to
  // read. Vanguard and Striker show their shaped back plate and waist instead.
  if (id === 'phantom') {
    const CAPE = [
      { y: 1.492, rx: 0.104, rz: 0.086, n: 2.6, dz: 0.052 },
      { y: 1.400, rx: 0.140, rz: 0.100, n: 2.6, dz: 0.056 },
      { y: 1.230, rx: 0.170, rz: 0.114, n: 2.7, dz: 0.060 },
      { y: 1.020, rx: 0.192, rz: 0.126, n: 2.7, dz: 0.062 },
      { y: 0.800, rx: 0.208, rz: 0.134, n: 2.8, dz: 0.064 },
      { y: 0.610, rx: 0.218, rz: 0.140, n: 2.8, dz: 0.066 },
      { y: 0.480, rx: 0.222, rz: 0.142, n: 2.8, dz: 0.068 },
    ];
    const CA = arc(BACK, 0.92);
    addPlate(buf('joint'), CAPE, 0, B.chest, { a0: CA[0], a1: CA[1], t: 0.016, seg: 16 });
    // A lit edge down both hems: an unbroken black shape has no silhouette of
    // its own against a dark map, and the cape is the biggest surface here.
    for (const s of [-1, 1])
      addPlate(buf('armor'), CAPE, 0, B.chest,
               { a0: BACK + s * 0.92, a1: BACK + s * 0.84, lift: 0.004, t: TRIM, seg: 2 });
    // Collar: the clasp the cape hangs from, over the trapezius.
    for (const s of [-1, 1])
      addBox(buf('armor2'), 0.056, 0.040, 0.052, s * 0.088, 1.452, 0.072, B.chest);
  }

  // ── head: compact arena helmet / wrapped tactical hood ─────────────────────
  // Vanguard wears a fitted tactical helmet and mask over a human head; the
  // alternate chassis retain the wrapped ninja treatment. Both share the same
  // head/eye hit contract.
  loftSkinned(place(domed(skullT, arena ? 0.50 : 0.55), 0, () => [[B.head, 1]]), 22, buf(arena ? 'frame' : 'joint'));
  // Crown plate, hard-faced so the helm has flats and a temple corner rather
  // than being a bowl. Its trim is a band at the BROW, where a helmet's seam
  // actually is — a pale cap over the whole crown reads as a bald head.
  {
    const CROWN = skullT.slice(4).map(q => ({ ...q, z: q.dz }));
    const CA = { a0: -Math.PI, a1: Math.PI, seg: 22, hard: 3.8 };
    addPlate(buf(arena ? 'steel' : 'armor'), CROWN, 0, B.head, { ...CA, t: (arena ? 0.016 : 0.014) * G });
    addPlate(buf('steel'), edgeStrip(CROWN, 0.18, false), 0, B.head,
             { ...CA, lift: 0.014 * G, t: TRIM });
  }
  addPlate(buf('joint'), skullT.slice(3, 5).map(q => ({ ...q, z: q.dz })), 0, B.head,
           { a0: -Math.PI, a1: Math.PI, t: 0.012 * G, seg: 22, hard: 3.4 });
  if (arena) {
    // A shallow rear helmet shell follows the skull rather than forming a
    // mechanical pod around the whole jaw.
    const REAR_HELM = skullT.slice(2, 6).map(q => ({ ...q, z: q.dz }));
    addPlate(buf('steel'), REAR_HELM, 0, B.head,
             { a0: arc(BACK, 0.92)[0], a1: arc(BACK, 0.92)[1],
               t: 0.016 * G, seg: 12, hard: 3.5 });
    addPlate(buf('armor2'), edgeStrip(REAR_HELM, 0.22, true), 0, B.head,
             { a0: arc(BACK, 0.92)[0], a1: arc(BACK, 0.92)[1],
               lift: 0.016 * G, t: TRIM, seg: 12, hard: 3.5 });
  }

  // Eye opening and lower face wrap. The slit is intentionally narrower than
  // the old visor so the face reads masked rather than robotic.
  const operative = arena;
  if (operative) {
    // Narrow goggle opening and brow over a fabric mask. Keeping the pieces
    // close to the face preserves a human nose/cheek/jaw silhouette.
    addChamferedPanel(buf('joint'), 0.206 * G, 0.060 * G, 0.038 * G,
                      0, mapHead(1.982), -0.110 * G, B.head,
                      { chamfer: 0.014 * G, bevel: 0.003 * G });
    for (const s of [-1, 1])
      addChamferedPanel(buf('glow'), 0.060 * G, 0.018 * G, 0.010 * G,
                        s * 0.044 * G, mapHead(1.984), -0.146 * G, B.head,
                        { chamfer: 0.005 * G, bevel: 0.001 * G });
    addChamferedPanel(buf('armor'), 0.202 * G, 0.024 * G, 0.016 * G,
                      0, mapHead(2.030), -0.136 * G, B.head,
                      { chamfer: 0.007 * G, bevel: 0.002 * G });
    for (const s of [-1, 1]) {
      addChamferedPanel(buf('steel'), 0.030 * G, 0.102 * G, 0.026 * G,
                        s * 0.104 * G, mapHead(1.966), -0.084 * G, B.head,
                        { chamfer: 0.008 * G, rz: -s * 0.04 });
      addDisc(buf('armor2'), 0.026 * G, 0.016 * G,
              s * 0.116 * G, mapHead(1.960), -0.004 * G, B.head, s);
      addDisc(buf('steel'), 0.011 * G, 0.019 * G,
              s * 0.124 * G, mapHead(1.960), -0.004 * G, B.head, s);
    }
  } else {
    addBox(buf('frame'), 0.188 * G, 0.052 * G, 0.052 * G,
           0, mapHead(1.992), -0.104 * G, B.head);
    addBox(buf('glow'), 0.126 * G, 0.014 * G, 0.026 * G,
           0, mapHead(1.996), -0.132 * G, B.head);
  }
  addBox(buf('joint'), 0.174 * G, 0.112 * G, 0.056 * G, 0, mapHead(1.912), -0.082 * G, B.head);

  // Rear helmet strap / hood knot. It remains compact enough to follow a human
  // skull instead of reading as a battery block.
  addChamferedPanel(buf(arena ? 'frame' : 'armor2'), arena ? 0.046 * G : 0.070 * G,
                    arena ? 0.036 * G : 0.052 * G, arena ? 0.030 * G : 0.060 * G,
                    0, mapHead(1.960), 0.108 * G, B.head,
                    { chamfer: 0.008 * G, bevel: 0.002 * G });
  if (!operative) {
    addBox(buf('joint'), 0.050 * G, 0.250 * G, 0.020 * G, -0.040 * G, mapTorso(1.710), 0.132 * G, B.chest, -0.10);
    addBox(buf('joint'), 0.044 * G, 0.205 * G, 0.018 * G,  0.040 * G, mapTorso(1.720), 0.139 * G, B.chest,  0.13);
  } else {
    addChamferedPanel(buf('frame'), 0.108 * G, 0.038 * G, 0.030 * G,
                      0, mapTorso(1.744), 0.094 * G, B.chest,
                      { chamfer: 0.008 * G, bevel: 0.002 * G });
  }

  // Cheek guards + chin plate close the jaw.
  if (arena) {
    for (const s of [-1, 1]) {
      addChamferedPanel(buf('frame'), 0.040 * G, 0.118 * G, 0.046 * G,
                        s * 0.092 * G, mapHead(1.930), -0.052 * G, B.head,
                        { chamfer: 0.011 * G, rz: -s * 0.055, ry: -s * 0.05 });
      for (let i = 0; i < 2; i++)
        addChamferedPanel(buf('steel'), 0.018 * G, 0.008 * G, 0.006 * G,
                          s * 0.094 * G, mapHead(1.916 + i * 0.030), -0.088 * G, B.head,
                          { chamfer: 0.003 * G, bevel: 0.001 * G });
    }
    addChamferedPanel(buf('steel'), 0.118 * G, 0.050 * G, 0.032 * G,
                      0, mapHead(1.882), -0.098 * G, B.head,
                      { chamfer: 0.014 * G, bevel: 0.003 * G });
    addChamferedPanel(buf('armor'), 0.050 * G, 0.024 * G, 0.012 * G,
                      0, mapHead(1.872), -0.136 * G, B.head,
                      { chamfer: 0.007 * G, bevel: 0.002 * G });
  } else {
    for (const s of [-1, 1])
      addBox(buf('frame'), 0.040 * G, 0.130 * G, 0.104 * G,
             s * 0.088 * G, mapHead(1.932), -0.020 * G, B.head);
    addBox(buf('joint'), 0.118 * G, 0.052 * G, 0.056 * G,
           0, mapHead(1.884), -0.086 * G, B.head);
  }
  // Neck seal
  for (const s of [-1, 1])
    addBox(buf('steel'), 0.016 * G, 0.12 * G, 0.016 * G, (s * 0.048) * G, mapTorso(1.800), 0.036 * G, B.neck);

  const parts = [];
  for (const [key, b] of Object.entries(bufs)) {
    const geo = toGeometry(b);
    // Raycasts cull against the bounding sphere before testing triangles, and a
    // skinned mesh's is computed from the BIND pose — a leg thrown out in a
    // slide reaches past it and shots would silently miss a body plainly there.
    // One generous sphere around the whole character instead.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.1, 0), 2.0);
    // Outline weight. 11mm was chosen on the 2.21m body, where it was 0.5% of
    // stature and the body was a dozen big forms. On a 1.82m figure wearing
    // this many small plates it is a fat black rim on every one of them, and
    // the armour reads as dark first and violet second.
    parts.push({ key, geo, outline: inflate(geo, OUT_T) });
  }
  return parts;
}
