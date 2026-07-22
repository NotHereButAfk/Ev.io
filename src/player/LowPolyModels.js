// ── Low-poly cyborg-terminator player models — cel-shaded like the guns ──────
// Endoskeleton cyborgs modelled on the "Cyborg Terminator (low poly)" look: a
// bare metal SKULL face with glowing red eyes, white/lavender armour plates over
// a black underframe, red glow accents scattered across chest / knees / thighs,
// and heavy angular segmented armour. Rendered with the SAME illustrated look as
// the authored arsenal — flat MeshToonMaterial cel bands + a dark inverted-hull
// contour outline on every part.
//
// Built with the procedural-body naming convention (boot_/lleg_/thigh_/knee_/
// uarm_/farm_/elbow_/hand_) so rigCharacterLimbs() walk-animates them for free.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const LOWPOLY_IDS = ['vanguard', 'striker', 'phantom'];
export function isLowPolyId(id) { return LOWPOLY_IDS.includes(id); }

// ── Cel shading (identical technique to WeaponModels' authored-gun look) ─────
let _rampTex = null;
function _ramp() {
  if (_rampTex) return _rampTex;
  // Lifted shadow floor so big flat plates don't crush to black under ACES.
  const d = new Uint8Array([150, 196, 232, 255]);
  _rampTex = new THREE.DataTexture(d, 4, 1, THREE.RedFormat);
  _rampTex.minFilter = _rampTex.magFilter = THREE.NearestFilter;
  _rampTex.needsUpdate = true;
  return _rampTex;
}
function T(color, opts = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: _ramp() });
  if (opts.emissive !== undefined) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  m.userData.role = opts.role || 'body';
  return m;
}

// Dark contour outline — inverted hull: a back-face copy inflated along smoothed
// vertex normals gives every part a clean dark edge from any angle.
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x1c1e24, side: THREE.BackSide });
const _olCache = new WeakMap();
function _outlineGeo(src, t) {
  let g = _olCache.get(src);
  if (g) return g;
  g = src.clone();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++)
    p.setXYZ(i, p.getX(i) + n.getX(i) * t, p.getY(i) + n.getY(i) * t, p.getZ(i) + n.getZ(i) * t);
  _olCache.set(src, g);
  return g;
}
function _addOutlines(group, t = 0.011) {
  const hosts = [];
  group.traverse(o => { if (o.isMesh && o.material !== OUTLINE_MAT) hosts.push(o); });
  for (const o of hosts) {
    const ol = new THREE.Mesh(_outlineGeo(o.geometry, t), OUTLINE_MAT);
    ol.name = 'outline';
    ol.castShadow = false;
    ol.raycast = () => {};
    o.add(ol);
  }
}

// ── Palettes — white/lavender endoskeleton armour + black frame + red glow.
// Three armour tones; the red terminator eyes/lights are shared.
const PALETTES = {
  vanguard: { armor: 0xe6e2ec, armor2: 0xc4bed2, frame: 0x1b1b22, joint: 0x0f0f13,
              steel: 0x8f8a9e, bone: 0xe0dde8, glow: 0xff2a20, bulk: 1.08 },   // white T-800
  striker:  { armor: 0x9aa6b4, armor2: 0x6c7684, frame: 0x181b20, joint: 0x0d0f13,
              steel: 0xcbd4dd, bone: 0xaab4c0, glow: 0x36e0ff, bulk: 0.96 },   // steel-blue (cyan eyes)
  phantom:  { armor: 0x585960, armor2: 0x393a40, frame: 0x121216, joint: 0x08090b,
              steel: 0x8f9099, bone: 0x6f7078, glow: 0xff2f26, bulk: 0.92 },   // dark graphite
};

function _mats(pal) {
  // Body materials carry a self-emissive floor so cel shadows keep their hue
  // instead of crushing to black on large flat plates under ACES tone mapping.
  const body = (hex, floor = 0.32) => {
    const m = T(hex);
    m.emissive = new THREE.Color(hex).multiplyScalar(floor);
    m.emissiveIntensity = 1;
    return m;
  };
  const red = pal.glow;
  return {
    armor:  body(pal.armor, 0.34),
    armor2: body(pal.armor2, 0.34),
    frame:  body(pal.frame, 0.6),
    joint:  body(pal.joint, 0.7),
    steel:  body(pal.steel, 0.3),
    bone:   body(pal.bone, 0.36),
    glow:   T(new THREE.Color(red).multiplyScalar(0.15).getHex(), { role: 'energy', emissive: red, emissiveIntensity: 1.5 }),
    eye:    T(new THREE.Color(red).multiplyScalar(0.2).getHex(),  { role: 'energy', emissive: red, emissiveIntensity: 2.2 }),
  };
}

// ── Primitive + placement helpers ────────────────────────────────────────────
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r, h, m, s = 8) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, s), m);
const sph = (r, m, w = 8, h = 6) => new THREE.Mesh(new THREE.SphereGeometry(r, w, h), m);
function put(g, mesh, x, y, z, rx = 0, ry = 0, rz = 0, name) {
  mesh.position.set(x, y, z);
  if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
  if (name) mesh.name = name;
  g.add(mesh);
  return mesh;
}
// red glow nub
function glowAt(g, M, x, y, z, w = 0.05, h = 0.05, d = 0.03) { put(g, box(w, h, d, M.glow), x, y, z); }

// ── Metal SKULL head — the signature terminator face ─────────────────────────
function _skull(g, M) {
  // Cranium: rounded metal dome + boxy back, with a couple of dark rivet dots.
  put(g, sph(0.125, M.bone, 10, 8), 0, 2.07, 0.01);
  put(g, box(0.20, 0.14, 0.20, M.bone), 0, 2.05, 0.02);
  for (const s of [-1, 1]) put(g, box(0.03, 0.03, 0.03, M.joint), s * 0.07, 2.15, 0.0);   // rivets
  put(g, box(0.03, 0.03, 0.03, M.joint), 0, 2.17, -0.05);
  // Angled face plate + dark brow shadow line
  put(g, box(0.185, 0.13, 0.06, M.bone), 0, 1.965, -0.09);
  put(g, box(0.19, 0.03, 0.04, M.joint), 0, 2.03, -0.10);                                 // brow ridge
  // Deep eye-socket recess + two glowing red eyes
  put(g, box(0.17, 0.055, 0.035, M.joint), 0, 1.985, -0.115);
  for (const s of [-1, 1]) {
    glowAt(g, M, s * 0.046, 1.985, -0.132, 0.05, 0.035, 0.03);
  }
  // Cheekbones (angled), temples, nose ridge
  for (const s of [-1, 1]) put(g, box(0.045, 0.09, 0.06, M.bone), s * 0.075, 1.90, -0.075, 0, 0, s * -0.25);
  for (const s of [-1, 1]) put(g, box(0.05, 0.16, 0.12, M.frame), s * 0.105, 1.99, 0.0);   // temple frame
  put(g, box(0.03, 0.06, 0.04, M.bone), 0, 1.93, -0.115);                                  // nose ridge
  // Jaw taper to a chin + bared metal teeth (individual segments → a grin)
  put(g, box(0.14, 0.055, 0.12, M.bone), 0, 1.875, -0.02);
  put(g, box(0.10, 0.04, 0.10, M.bone), 0, 1.835, -0.03);                                  // chin taper
  put(g, box(0.135, 0.05, 0.03, M.joint), 0, 1.885, -0.112);                               // dark mouth recess
  put(g, box(0.12, 0.03, 0.026, M.steel), 0, 1.888, -0.118);                               // teeth base
  for (let i = 0; i < 6; i++) put(g, box(0.006, 0.032, 0.022, M.joint), -0.05 + i * 0.02, 1.888, -0.126); // tooth gaps
  // neck actuators
  put(g, cyl(0.05, 0.11, M.frame, 8), 0, 1.79, 0);
  for (const s of [-1, 1]) put(g, cyl(0.018, 0.12, M.steel, 6), s * 0.05, 1.80, 0.03);
}

// ── Shared endoskeleton body (named limbs → auto-rigged) ─────────────────────
// `plating` scales how much white armour vs exposed black frame shows.
function _endoBase(g, M, cfg) {
  const { bulk = 1.0, plating = 1.0 } = cfg;
  const AW = M.armor, A2 = M.armor2, FR = M.frame, JT = M.joint;
  // ── Legs (left −0.13 / right +0.13) — armoured greaves over a dark frame ──
  for (const [sx, sd] of [[-0.13, 'L'], [0.13, 'R']]) {
    put(g, box(0.17, 0.09, 0.20, JT),                sx, 0.045, 0.04, 0, 0, 0, `boot_${sd}`);      // sole
    put(g, box(0.16, 0.14, 0.30, AW),                 sx, 0.13,  0.04, 0, 0, 0, `boot_${sd}_a`);    // armoured foot
    put(g, box(0.11, 0.16, 0.13, FR),                 sx, 0.30, -0.01, 0, 0, 0, `boot_${sd}_u`);    // ankle frame
    put(g, box(0.15 * bulk, 0.34, 0.15 * bulk, AW),   sx, 0.52,  0,    0, 0, 0, `lleg_${sd}`);      // shin greave
    put(g, box(0.16, 0.13, 0.15, AW),                 sx, 0.72, -0.02, 0, 0, 0, `knee_${sd}`);      // knee cap
    put(g, box(0.055, 0.05, 0.03, M.glow),            sx, 0.72, -0.11, 0, 0, 0, `knee_${sd}_g`);    // red knee light
    put(g, box(0.16 * bulk, 0.30, 0.16 * bulk, AW),   sx, 0.95,  0,    0, 0, 0, `thigh_${sd}`);     // thigh plate
    put(g, box(0.05, 0.10, 0.03, M.glow),             sx + (sd === 'L' ? -0.085 : 0.085), 0.98, -0.05, 0, 0, 0, `thigh_${sd}_g`); // thigh light
  }
  // ── Pelvis: dark frame + white hip plates + red core ──
  put(g, box(0.30, 0.16, 0.22, FR), 0, 1.13, 0);
  for (const s of [-1, 1]) put(g, box(0.10, 0.16, 0.16, AW), s * 0.16, 1.14, -0.01);
  glowAt(g, M, 0, 1.16, -0.115, 0.05, 0.05, 0.03);
  // ── Torso: dark endoskeleton frame with layered white plates ──
  put(g, box(0.26, 0.20, 0.19, FR), 0, 1.32, 0);                                 // abdomen frame
  for (let i = 0; i < 2; i++) put(g, box(0.22, 0.03, 0.20, A2), 0, 1.27 + i * 0.10, -0.005);  // ab plates
  glowAt(g, M, 0, 1.30, -0.11, 0.05, 0.07, 0.03);                                 // ab core light
  put(g, box(0.34 * bulk, 0.26, 0.22 * bulk, FR), 0, 1.55, 0);                    // chest frame
  // pectoral plates (angled) + sternum + chest core
  for (const s of [-1, 1]) put(g, box(0.16 * bulk, 0.20, 0.10, AW), s * 0.09, 1.56, -0.12, 0, 0, s * 0.12);
  put(g, box(0.07, 0.24, 0.09, A2), 0, 1.55, -0.13);                              // sternum
  glowAt(g, M, 0, 1.58, -0.175, 0.045, 0.06, 0.03);                              // chest core
  put(g, box(0.40 * bulk, 0.09, 0.23 * bulk, A2), 0, 1.69, 0);                    // collar/yoke
  // spine + shoulder cables (thin dark cylinders)
  put(g, box(0.14, 0.26, 0.14, FR), 0, 1.55, 0.10);                               // back unit
  for (const s of [-1, 1]) put(g, cyl(0.02, 0.20, M.steel, 6), s * 0.16, 1.62, 0.02, 0.3, 0, s * 0.35);
  // ── Arms (left −0.32 / right +0.32) — white pauldron, dark frame, gauntlet ──
  for (const [sx, sd] of [[-0.32, 'L'], [0.32, 'R']]) {
    put(g, box(0.19, 0.16, 0.21, AW),      sx, 1.70, 0, 0, 0, 0, `uarm_${sd}_p`);   // pauldron (static-ish, swings with arm)
    glowAt(g, M, sx, 1.71, -0.11, 0.045, 0.045, 0.03);
    put(g, box(0.10, 0.24, 0.10, FR),      sx, 1.50, 0, 0, 0, 0, `uarm_${sd}`);      // upper-arm frame
    put(g, box(0.11, 0.09, 0.11, JT),      sx, 1.31, 0, 0, 0, 0, `elbow_${sd}`);     // elbow joint
    put(g, box(0.13, 0.22, 0.12, AW),      sx, 1.11, 0, 0, 0, 0, `farm_${sd}`);      // forearm gauntlet
    put(g, box(0.035, 0.10, 0.03, M.glow), sx, 1.11, -0.075, 0, 0, 0, `farm_${sd}_g`);
    put(g, box(0.10, 0.12, 0.09, JT),      sx, 0.90, 0, 0, 0, 0, `hand_${sd}`);      // black mech hand
    for (let f = 0; f < 3; f++) put(g, box(0.022, 0.06, 0.02, JT), sx - 0.03 + f * 0.03, 0.81, -0.03, 0, 0, 0, `hand_${sd}_f${f}`);
  }
  // Head
  _skull(g, M);
}

function _build(id) {
  const pal = PALETTES[id] || PALETTES.vanguard;
  const M = _mats(pal);
  const g = new THREE.Group();
  _endoBase(g, M, { bulk: pal.bulk });
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  _addOutlines(g);
  g.userData = { isLowPoly: true, armorTypeId: id, primaryMat: M.armor, secondaryMat: M.armor2 };
  return g;
}

// ── Public builder ───────────────────────────────────────────────────────────
export function buildLowPolyCharacter(id = 'vanguard') {
  return _build(id);
}
