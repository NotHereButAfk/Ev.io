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
// Rounded muscle (capsule) + tapered muscle (cone-cylinder) — the human forms.
const cap = (r, len, m, s = 12) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, s), m);
const tcyl = (rt, rb, h, m, s = 12) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), m);
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

// ── Shared endoskeleton body — HUMAN anatomy (muscle frame + armour plates) ──
// Rounded muscular limbs (capsules / tapered cones) form the endoskeleton; hard
// white armour plates strap over them, with the dark muscle showing at the
// joints. Heroic human proportions: broad round shoulders, defined chest,
// tapered waist, muscular tapered legs.
function _endoBase(g, M, cfg) {
  const { bulk = 1.0 } = cfg;
  const AW = M.armor, A2 = M.armor2, FR = M.frame, JT = M.joint;
  // ── Legs (left −0.11 / right +0.11) — tapered muscle under armour plates ──
  for (const [sx, sd] of [[-0.11, 'L'], [0.11, 'R']]) {
    const out = sd === 'L' ? -1 : 1;
    // Foot points FORWARD (−Z): toe projects well past the ankle, short heel.
    put(g, box(0.135, 0.06, 0.30, JT),                sx, 0.03, -0.05, 0, 0, 0, `boot_${sd}`);     // sole
    put(g, box(0.14, 0.14, 0.24, AW),                 sx, 0.14, -0.04, 0, 0, 0, `boot_${sd}_a`);   // armoured foot
    put(g, box(0.125, 0.08, 0.08, AW),                sx, 0.085, -0.20, 0, 0, 0, `boot_${sd}_t`);  // toe cap
    put(g, sph(0.07, JT, 8, 6),                       sx, 0.27,  0.02, 0, 0, 0, `boot_${sd}_u`);   // ankle ball
    put(g, tcyl(0.065, 0.10, 0.34, FR),               sx, 0.45,  0,    0, 0, 0, `lleg_${sd}`);     // calf muscle
    put(g, box(0.12, 0.28, 0.10, AW),                 sx, 0.47, -0.05, 0, 0, 0, `lleg_${sd}_p`);   // shin plate
    put(g, sph(0.088, JT, 8, 6),                      sx, 0.65,  0,    0, 0, 0, `knee_${sd}`);     // knee ball
    put(g, box(0.14, 0.13, 0.09, AW),                 sx, 0.66, -0.06, 0, 0, 0, `knee_${sd}_p`);   // knee cap
    put(g, box(0.05, 0.045, 0.03, M.glow),            sx, 0.66, -0.115, 0, 0, 0, `knee_${sd}_g`);  // knee light
    put(g, tcyl(0.115 * bulk, 0.09, 0.34, FR),        sx, 0.92,  0,    0, 0, 0, `thigh_${sd}`);    // thigh muscle
    put(g, box(0.15, 0.28, 0.12, AW),                 sx, 0.94, -0.02, 0, 0, 0, `thigh_${sd}_p`);  // thigh plate
    put(g, box(0.045, 0.11, 0.03, M.glow),            sx + out * 0.085, 0.95, -0.03, 0, 0, out * 0.1, `thigh_${sd}_gl`); // thigh light
  }
  // ── Pelvis: dark frame + white hip plates + red core ──
  put(g, box(0.28, 0.15, 0.21, FR), 0, 1.13, 0);
  for (const s of [-1, 1]) put(g, box(0.11, 0.17, 0.15, AW), s * 0.15, 1.13, -0.01);   // hip plates
  glowAt(g, M, 0, 1.15, -0.11, 0.05, 0.05, 0.03);
  // ── Torso: tapered muscular frame (wide chest → narrow waist) + armour ──
  put(g, tcyl(0.135, 0.16, 0.20, FR, 14), 0, 1.32, 0);                              // abdomen (narrow waist)
  for (let i = 0; i < 2; i++) put(g, box(0.18, 0.03, 0.18, A2), 0, 1.28 + i * 0.10, -0.045);  // ab plates
  glowAt(g, M, 0, 1.31, -0.115, 0.045, 0.06, 0.03);                                 // ab core
  put(g, box(0.32 * bulk, 0.26, 0.21 * bulk, FR), 0, 1.55, 0);                       // rib cage
  // Pectorals — flat ANGLED armour plates (not round), split by a sternum groove
  for (const s of [-1, 1]) put(g, box(0.145 * bulk, 0.17, 0.08, AW), s * 0.088, 1.575, -0.10, -0.12, 0, s * 0.14);
  put(g, box(0.05, 0.24, 0.085, FR), 0, 1.55, -0.115);                               // sternum groove (dark split)
  put(g, box(0.03, 0.20, 0.07, A2), 0, 1.55, -0.14);                                 // sternum ridge
  glowAt(g, M, 0, 1.45, -0.145, 0.04, 0.05, 0.03);                                   // lower-chest core
  // Trapezius / collar sweeping up to the neck
  put(g, tcyl(0.10, 0.19 * bulk, 0.12, A2, 12), 0, 1.68, 0);                          // traps (wide at shoulders)
  put(g, box(0.14, 0.24, 0.15, FR), 0, 1.54, 0.10);                                   // back unit
  // ── Deltoids (round shoulder muscle) + draping pauldron armour ──
  for (const [sx, sd] of [[-0.26, 'L'], [0.26, 'R']]) {
    const out = sd === 'L' ? -1 : 1;
    put(g, sph(0.12, FR, 10, 8),           sx, 1.62, 0);                              // deltoid muscle
    // Pauldron cap + trim — STATIC (stay on the shoulder while the arm swings).
    put(g, box(0.165, 0.135, 0.20, AW),    sx + out * 0.015, 1.645, 0, 0, 0, -out * 0.18);   // pauldron cap
    put(g, box(0.165, 0.04, 0.205, A2),    sx + out * 0.015, 1.71, 0, 0, 0, -out * 0.18);     // pauldron trim
    glowAt(g, M, sx + out * 0.05, 1.63, -0.095, 0.04, 0.04, 0.03);
  }
  // ── Arms (left −0.27 / right +0.27) — rounded muscle + strapped armour ──
  for (const [sx, sd] of [[-0.27, 'L'], [0.27, 'R']]) {
    put(g, cap(0.074, 0.16, FR),           sx, 1.45, 0, 0, 0, 0, `uarm_${sd}`);       // bicep
    put(g, sph(0.062, JT, 8, 6),           sx, 1.26, 0, 0, 0, 0, `elbow_${sd}`);      // elbow
    put(g, cap(0.062, 0.15, FR),           sx, 1.08, 0, 0, 0, 0, `farm_${sd}`);       // forearm muscle
    put(g, box(0.115, 0.20, 0.10, AW),     sx, 1.09, -0.03, 0, 0, 0, `farm_${sd}_p`); // forearm gauntlet
    put(g, box(0.03, 0.09, 0.03, M.glow),  sx, 1.09, -0.095, 0, 0, 0, `farm_${sd}_g`);
    put(g, box(0.092, 0.12, 0.085, JT),    sx, 0.895, 0, 0, 0, 0, `hand_${sd}`);      // mech hand
    for (let f = 0; f < 3; f++) put(g, box(0.02, 0.06, 0.02, JT), sx - 0.026 + f * 0.026, 0.81, -0.03, 0, 0, 0, `hand_${sd}_f${f}`);
  }
  // Neck + head
  put(g, cyl(0.06, 0.13, FR, 10), 0, 1.79, 0);
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
