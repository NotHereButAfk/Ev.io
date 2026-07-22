// ── Low-poly, cel-shaded player models — styled like the authored guns ───────
// Three clean low-poly humanoids that render with the SAME illustrated look as
// the arsenal: flat MeshToonMaterial cel bands (shared stepped ramp) + a dark
// inverted-hull contour outline on every part. Built from crisp boxes so the
// silhouette reads as tidy low-poly linework rather than smooth PBR.
//
// They follow the procedural-body naming convention (boot_/lleg_/thigh_/knee_/
// uarm_/farm_/elbow_/hand_) so rigCharacterLimbs() animates them for free — no
// special-casing in the walk/run rig.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const LOWPOLY_IDS = ['vanguard', 'striker', 'phantom'];
export function isLowPolyId(id) { return LOWPOLY_IDS.includes(id); }

// ── Cel shading (identical technique to WeaponModels' authored-gun look) ─────
let _rampTex = null;
function _ramp() {
  if (_rampTex) return _rampTex;
  // Lifted shadow floor (vs the guns' 115): big flat character plates that turn
  // away from the key would otherwise drop into a near-black band and read as
  // holes. Higher floor keeps the cel steps but shadows stay mid-grey.
  const d = new Uint8Array([158, 198, 232, 255]);          // 3 soft light bands
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

// Dark contour outline — classic inverted hull: a back-face copy inflated along
// smoothed vertex normals, so every part gets a clean dark edge from any angle.
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x23272e, side: THREE.BackSide });
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
function _addOutlines(group, t = 0.012) {
  const hosts = [];
  group.traverse(o => { if (o.isMesh && o.material !== OUTLINE_MAT) hosts.push(o); });
  for (const o of hosts) {
    const ol = new THREE.Mesh(_outlineGeo(o.geometry, t), OUTLINE_MAT);
    ol.name = 'outline';
    ol.castShadow = false;
    ol.raycast = () => {};   // never a hit/headshot target
    o.add(ol);
  }
}

// ── Palettes — clean steel bodies with one bright accent, gun-chart style.
// Kept light enough that the cel bands read even on the dark themes.
const PALETTES = {
  // Light steel bodies like the gun chart + one bright accent. Kept clear of the
  // medium-dark range that crushes to black in the cel shadow band.
  vanguard: { plate: 0xbcc2ca, plate2: 0x8b929c, suit: 0x6c737d, dark: 0x2a2d33,
              trim: 0xe4e9ee, accent: 0xff8a1f, visor: 0x2ee6ff, skin: 0x34383f },
  striker:  { plate: 0x84919c, plate2: 0x616d78, suit: 0x586570, dark: 0x24282e,
              trim: 0xbcc8d2, accent: 0x1fe0c2, visor: 0x54ffcf, skin: 0x2b2f36 },
  phantom:  { plate: 0x6a6f79, plate2: 0x494e57, suit: 0x40444c, dark: 0x1c1d22,
              trim: 0x9aa0ab, accent: 0xc158ff, visor: 0xe29bff, skin: 0x232429 },
};

function _mats(pal) {
  const eBase = (hex) => new THREE.Color(hex).multiplyScalar(0.14).getHex();
  // Body materials carry a self-emissive floor (a fraction of their own colour)
  // so the cel shadow band keeps the surface's hue instead of crushing to black
  // under ACES tone mapping — the failure mode for large flat character plates
  // in medium-dark greys. Glow materials (accent/visor) use a dark base + bright
  // emissive as usual.
  const body = (hex, role, floor = 0.34) => {
    const m = T(hex, { role });
    m.emissive = new THREE.Color(hex).multiplyScalar(floor);
    m.emissiveIntensity = 1;
    return m;
  };
  return {
    plate:  body(pal.plate,  'body'),
    plate2: body(pal.plate2, 'accent'),
    suit:   body(pal.suit,   'special'),
    dark:   body(pal.dark,   'metal', 0.55),
    trim:   body(pal.trim,   'metal', 0.30),
    accent: T(eBase(pal.accent), { role: 'energy', emissive: pal.accent, emissiveIntensity: 0.9  }),
    visor:  T(eBase(pal.visor),  { role: 'energy', emissive: pal.visor,  emissiveIntensity: 1.25 }),
    skin:   body(pal.skin,   'skin', 0.45),
  };
}

// ── Primitive + placement helpers ────────────────────────────────────────────
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r, h, m, s = 8) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, s), m);
function put(g, mesh, x, y, z, rx = 0, ry = 0, rz = 0, name) {
  mesh.position.set(x, y, z);
  if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
  if (name) mesh.name = name;
  g.add(mesh);
  return mesh;
}

// ── Shared clean low-poly humanoid base (named limbs → auto-rigged) ──────────
// Tapered torso (wide shoulders → narrow waist), clearly separated slim limbs,
// a proportioned head. `cfg` = { bulk, arm, leg } tunes the build per variant.
// Every mesh below the neck carries a limb name so the walk rig swings it.
function _base(g, M, cfg) {
  const { bulk = 1.0, arm = 0.052, leg = 0.075 } = cfg;
  // Legs (left −0.12 / right +0.12) — clear gap at the centreline
  for (const [sx, sd] of [[-0.12, 'L'], [0.12, 'R']]) {
    put(g, box(0.15, 0.09, 0.30, M.dark),               sx, 0.05,  0.03, 0, 0, 0, `boot_${sd}`);
    put(g, box(0.14, 0.16, 0.15, M.suit),                sx, 0.22, -0.01, 0, 0, 0, `boot_${sd}_u`);
    put(g, box(leg * 2 * bulk, 0.34, leg * 2 * bulk, M.suit),   sx, 0.52, 0, 0, 0, 0, `lleg_${sd}`);
    put(g, box(0.15, 0.11, 0.14, M.plate2),              sx, 0.70, -0.02, 0, 0, 0, `knee_${sd}`);
    put(g, box(leg * 2.4 * bulk, 0.30, leg * 2.2 * bulk, M.suit), sx, 0.93, 0, 0, 0, 0, `thigh_${sd}`);
  }
  // Pelvis + belt (static)
  put(g, box(0.32, 0.14, 0.23, M.suit), 0, 1.13, 0);
  put(g, box(0.35, 0.05, 0.25, M.trim), 0, 1.205, 0);
  // Tapered torso (static): narrow waist → chest → wide shoulder yoke
  put(g, box(0.28, 0.16, 0.20, M.suit),                 0, 1.30, 0);
  put(g, box(0.34 * bulk, 0.30, 0.21 * bulk, M.suit),   0, 1.53, 0);
  put(g, box(0.42 * bulk, 0.11, 0.23 * bulk, M.plate2), 0, 1.67, 0);   // shoulder yoke
  // Arms (left −0.30 / right +0.30) — slim, hang clear of the torso
  for (const [sx, sd] of [[-0.30, 'L'], [0.30, 'R']]) {
    put(g, box(arm * 2 * bulk, 0.26, arm * 2 * bulk, M.suit), sx, 1.51, 0, 0, 0, 0, `uarm_${sd}`);
    put(g, box(0.10, 0.09, 0.10, M.plate2),                   sx, 1.32, 0, 0, 0, 0, `elbow_${sd}`);
    put(g, box(arm * 1.8 * bulk, 0.22, arm * 1.8 * bulk, M.suit), sx, 1.12, 0, 0, 0, 0, `farm_${sd}`);
    put(g, box(0.10, 0.11, 0.09, M.dark),                    sx, 0.93, 0, 0, 0, 0, `hand_${sd}`);
  }
  // Neck + head base (static; the helmet covers it per-variant)
  put(g, cyl(0.055, 0.10, M.suit, 8), 0, 1.80, 0);
  put(g, box(0.21, 0.25, 0.23, M.dark), 0, 1.99, 0);
}

// ── VANGUARD — blocky armoured trooper, big pauldrons, boxed helmet ──────────
function _vanguard(g, M) {
  _base(g, M, { bulk: 1.08, arm: 0.058, leg: 0.082 });
  // Breastplate: medium plate with a light collar + a clean glowing sternum.
  put(g, box(0.34, 0.30, 0.09, M.plate2), 0, 1.52, -0.11);          // main breastplate
  put(g, box(0.30, 0.07, 0.10, M.plate),  0, 1.66, -0.115);         // light upper collar
  put(g, box(0.22, 0.02, 0.10, M.trim),   0, 1.45, -0.117);         // rib line
  put(g, box(0.05, 0.20, 0.05, M.accent), 0, 1.50, -0.155);         // glowing sternum
  put(g, box(0.34, 0.30, 0.09, M.plate2), 0, 1.52,  0.11);          // back plate
  put(g, box(0.17, 0.21, 0.11, M.dark),   0, 1.57,  0.19);          // pack
  // Angular pauldrons in the light plate so the shoulders pop.
  for (const s of [-1, 1]) {
    put(g, box(0.18, 0.14, 0.22, M.plate),  s * 0.31, 1.71, 0);
    put(g, box(0.19, 0.05, 0.24, M.trim),   s * 0.31, 1.775, 0);
    put(g, box(0.045, 0.045, 0.05, M.accent), s * 0.31, 1.71, -0.13);
  }
  // Forearm vambraces + knee pads (named — swing with the limb)
  for (const [sx, sd] of [[-0.30, 'L'], [0.30, 'R']])
    put(g, box(0.14, 0.18, 0.09, M.plate), sx, 1.12, -0.08, 0, 0, 0, `farm_${sd}_va`);
  for (const [sx, sd] of [[-0.12, 'L'], [0.12, 'R']])
    put(g, box(0.16, 0.13, 0.11, M.plate), sx, 0.71, -0.10, 0, 0, 0, `knee_${sd}_kp`);
  // Helmet — boxed shell, crown band, visor slit, brow, crest fin
  put(g, box(0.25, 0.24, 0.26, M.plate),  0, 2.00, 0.0);
  put(g, box(0.27, 0.06, 0.28, M.plate2), 0, 2.11, 0.0);            // crown band
  put(g, box(0.21, 0.05, 0.02, M.visor),  0, 1.99, -0.135);        // visor slit
  put(g, box(0.25, 0.045, 0.09, M.dark),  0, 1.91, -0.10);         // brow/chin
  put(g, box(0.05, 0.13, 0.15, M.accent), 0, 2.15, 0.02);          // crest fin
}

// ── STRIKER — slim agile scout, sleek raked visor, light kit ─────────────────
function _striker(g, M) {
  _base(g, M, { bulk: 0.94, arm: 0.048, leg: 0.070 });
  // Slim chest rig + accent + slim pack
  put(g, box(0.30, 0.28, 0.07, M.plate), 0, 1.52, -0.10);
  put(g, box(0.30, 0.02, 0.07, M.trim),  0, 1.60, -0.106);
  put(g, box(0.30, 0.02, 0.07, M.trim),  0, 1.46, -0.106);
  put(g, box(0.05, 0.15, 0.04, M.accent),0, 1.53, -0.14);
  put(g, box(0.16, 0.24, 0.08, M.plate2),0, 1.55,  0.12);
  // Small angled shoulder caps
  for (const s of [-1, 1]) {
    put(g, box(0.13, 0.09, 0.16, M.plate), s * 0.29, 1.70, 0, 0, 0, s * 0.22);
    put(g, box(0.03, 0.03, 0.03, M.accent), s * 0.31, 1.73, -0.08);
  }
  // Wrist units (named — swing)
  for (const [sx, sd] of [[-0.30, 'L'], [0.30, 'R']]) {
    put(g, box(0.11, 0.09, 0.10, M.plate2), sx, 1.02, -0.02, 0, 0, 0, `farm_${sd}_wr`);
    put(g, box(0.03, 0.03, 0.015, M.accent), sx, 1.02, -0.07, 0, 0, 0, `farm_${sd}_wt`);
  }
  // Sleek angled helmet — forward-raked wedge visor
  put(g, box(0.23, 0.22, 0.25, M.plate),  0, 2.00, 0.0);
  put(g, box(0.24, 0.11, 0.08, M.visor),  0, 1.98, -0.115, -0.2);   // raked visor band
  put(g, box(0.22, 0.05, 0.26, M.plate2), 0, 2.10, 0.01);           // crown
  put(g, box(0.02, 0.05, 0.19, M.accent), 0, 2.11, 0.02);           // centre ridge
  // small swept-back side vents (kept low/flat so they don't read as ears)
  for (const s of [-1, 1]) put(g, box(0.02, 0.05, 0.11, M.dark), s * 0.10, 2.05, 0.10, 0.7, 0, 0);
}

// ── PHANTOM — sleek stealth infiltrator, hooded cowl, glowing eye visor ──────
function _phantom(g, M) {
  _base(g, M, { bulk: 0.92, arm: 0.046, leg: 0.068 });
  // Minimal chest + a single glowing seam + slim pack
  put(g, box(0.27, 0.32, 0.06, M.plate),  0, 1.52, -0.09);
  put(g, box(0.02, 0.24, 0.03, M.accent), 0, 1.52, -0.12);
  put(g, box(0.15, 0.22, 0.07, M.plate2), 0, 1.54,  0.12);
  // Low sleek shoulder pads
  for (const s of [-1, 1]) {
    put(g, box(0.12, 0.07, 0.15, M.plate),  s * 0.28, 1.68, 0);
    put(g, box(0.09, 0.02, 0.12, M.accent), s * 0.28, 1.715, 0);
  }
  // Forearm blades/guards (named — swing)
  for (const [sx, sd] of [[-0.30, 'L'], [0.30, 'R']])
    put(g, box(0.09, 0.20, 0.06, M.plate2), sx, 1.12, -0.065, 0, 0, 0, `farm_${sd}_bl`);
  // Hooded cowl head: raked hood shell over a dark face with a bright eye visor
  put(g, box(0.28, 0.19, 0.28, M.plate),  0, 2.06, 0.02, -0.14);    // raked hood shell
  put(g, box(0.30, 0.15, 0.06, M.plate),  0, 2.03,  0.13);          // hood back
  put(g, box(0.19, 0.055, 0.02, M.visor), 0, 1.985, -0.125);        // bright eye visor
  put(g, box(0.06, 0.02, 0.02, M.accent), 0, 2.045, -0.12);         // brow accent
  put(g, box(0.05, 0.05, 0.05, M.accent), 0, 2.16, 0.05, 0.3);      // hood peak
  for (const s of [-1, 1]) put(g, box(0.035, 0.15, 0.13, M.plate2), s * 0.125, 1.98, -0.02);  // cheek guards
}

const BUILDERS = { vanguard: _vanguard, striker: _striker, phantom: _phantom };

// ── Public builder ───────────────────────────────────────────────────────────
export function buildLowPolyCharacter(id = 'vanguard') {
  const pal = PALETTES[id] || PALETTES.vanguard;
  const M = _mats(pal);
  const g = new THREE.Group();
  (BUILDERS[id] || _vanguard)(g, M);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  _addOutlines(g);
  g.userData = {
    isLowPoly: true, armorTypeId: id,
    primaryMat: M.plate, secondaryMat: M.plate2,
  };
  return g;
}
