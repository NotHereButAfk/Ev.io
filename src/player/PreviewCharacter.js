import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ── Blender GLB player model loader ─────────────────────────────────────────
let _playerTemplate = null, _playerLoading = false;

export function preloadPlayerModel() {
  if (_playerTemplate || _playerLoading) return;
  _playerLoading = true;
  new GLTFLoader().load('/player.glb',
    (gltf) => { _playerTemplate = gltf.scene; _playerLoading = false; },
    undefined,
    (err) => { console.warn('[PlayerGLB] load failed:', err.message); _playerLoading = false; }
  );
}

function _buildFromGLB(skin, armorTypeId, armorSkin) {
  const armorRoot = _playerTemplate?.getObjectByName(`armor_${armorTypeId}`);
  if (!armorRoot) return null;

  const cloned = armorRoot.clone(true);
  cloned.position.set(0, 0, 0);
  // Blender -Y face → Three.js +Z; rotate 180° to match existing -Z facing convention
  cloned.rotation.y = Math.PI;

  const src = armorSkin || {};
  const P = new THREE.MeshStandardMaterial({
    color:             armorSkin ? armorSkin.primary   : skin.primary,
    roughness:         src.roughness         ?? 0.42,
    metalness:         src.metalness         ?? 0.52,
    emissive:          new THREE.Color(src.emissive ?? 0x000000),
    emissiveIntensity: src.emissiveIntensity ?? 0,
  });
  const S = new THREE.MeshStandardMaterial({
    color:     armorSkin ? armorSkin.secondary : skin.secondary,
    roughness: (src.roughness ?? 0.72) * 1.3,
    metalness: (src.metalness ?? 0.18) * 0.35,
  });

  cloned.traverse(obj => {
    if (!obj.isMesh || !obj.material) return;
    const n = obj.material.name || '';
    if      (n.endsWith('_Primary'))   obj.material = P;
    else if (n.endsWith('_Secondary')) obj.material = S;
    // Trim, DarkJoint, Visor materials kept from GLB
    obj.castShadow = obj.receiveShadow = true;
  });

  const g = new THREE.Group();
  g.add(cloned);
  g.userData = { primaryMat: P, secondaryMat: S, armorTypeId };
  return g;
}

// ---------------------------------------------------------------------------
// Shared fixed materials (not recolored by skins)
// ---------------------------------------------------------------------------
const _visorCyan = new THREE.MeshStandardMaterial({
  color: 0x00cfff, roughness: 0.06, metalness: 0.05,
  emissive: 0x00cfff, emissiveIntensity: 1.1,
  transparent: true, opacity: 0.84
});
const _visorGreen = new THREE.MeshStandardMaterial({
  color: 0x00ff88, roughness: 0.06, metalness: 0.05,
  emissive: 0x00ff88, emissiveIntensity: 0.9,
  transparent: true, opacity: 0.78
});
const _trimMat = new THREE.MeshStandardMaterial({
  color: 0x9aaab4, roughness: 0.22, metalness: 0.88
});
const _darkJoint = new THREE.MeshStandardMaterial({
  color: 0x08090c, roughness: 0.78, metalness: 0.08
});

// ---------------------------------------------------------------------------
// Primitive factories
// ---------------------------------------------------------------------------
function B(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
function Cap(r, h, mat, segs = 8) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, h, segs, 12), mat);
}
function Cyl(r, h, mat, segs = 10) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segs), mat);
}
function Sph(r, mat, sw = 10, sh = 8) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, sw, sh), mat);
}

function add(g, mesh, x, y, z, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
  g.add(mesh);
  return mesh;
}

// ===========================================================================
// ASSAULT — standard balanced tactical plate armour
// ===========================================================================
function buildAssault(g, P, S) {
  const V = _visorCyan;

  // Boots
  [[-0.15], [0.15]].forEach(([bx]) => {
    add(g, B(0.21, 0.22, 0.31, P),       bx,  0.11,  0.02);
    add(g, B(0.23, 0.04, 0.33, _trimMat),bx,  0.01,  0.02);
    add(g, B(0.19, 0.1,  0.07, _trimMat),bx,  0.11, -0.16);
    add(g, B(0.23, 0.09, 0.29, P),        bx,  0.23,  0.01);
  });

  // Lower legs
  [[-0.15], [0.15]].forEach(([lx]) => {
    add(g, Cap(0.095, 0.38, S),           lx,  0.53,  0);
    add(g, B(0.17,   0.38, 0.06, P),      lx,  0.53, -0.1);
    add(g, B(0.025,  0.34, 0.014, _trimMat), lx, 0.53, -0.134);
    add(g, B(0.21,   0.13, 0.15, P),      lx,  0.76, -0.06);
  });

  // Thighs
  [[-0.15, -1], [0.15, 1]].forEach(([tx, s]) => {
    add(g, Cap(0.12, 0.36, S),            tx,  1.04,  0);
    add(g, B(0.14,  0.34, 0.1, P),       tx - s * 0.13, 1.04, 0);
    add(g, B(0.12,  0.006, 0.104, _trimMat), tx - s * 0.13, 1.14, 0);
  });

  // Hips / belt
  add(g, B(0.47, 0.12, 0.29, P),   0, 1.21, 0);
  add(g, B(0.49, 0.07, 0.31, S),   0, 1.27, 0);
  add(g, B(0.07, 0.06, 0.04, _trimMat), 0, 1.27, -0.165);
  [-0.2, 0.2].forEach((px) => add(g, B(0.1, 0.1, 0.1, S), px, 1.17, 0.08));

  // Torso
  add(g, Cap(0.28, 0.48, S),         0, 1.56, 0);
  add(g, B(0.51, 0.51, 0.1, P),      0, 1.56, -0.18);
  add(g, B(0.51, 0.025, 0.1, _trimMat), 0, 1.815, -0.18);
  add(g, B(0.51, 0.025, 0.1, _trimMat), 0, 1.305, -0.18);
  add(g, B(0.025, 0.47, 0.014, _trimMat), 0, 1.56, -0.237);
  [-0.14, 0.14].forEach((px) => add(g, B(0.17, 0.18, 0.016, P), px, 1.64, -0.192));
  add(g, B(0.025, 0.28, 0.008, V),  -0.22, 1.6, -0.236);
  add(g, B(0.025, 0.28, 0.008, V),   0.22, 1.6, -0.236);
  add(g, B(0.49, 0.44, 0.09, P),    0, 1.56,  0.18);
  add(g, B(0.25, 0.22, 0.12, S),    0, 1.62,  0.285);
  add(g, B(0.06, 0.06, 0.014, V),   0, 1.68,  0.347);
  add(g, B(0.31, 0.08, 0.31, P),    0, 1.85, 0);

  // Pauldrons
  [[-1, -0.35], [1, 0.35]].forEach(([s, ax]) => {
    add(g, Sph(0.11, S),                   ax, 1.76, 0);
    const pau = B(0.23, 0.21, 0.33, P); pau.rotation.z = s * -0.12;
    add(g, pau, s * 0.44, 1.76, 0);
    add(g, B(0.26, 0.06, 0.35, P),        s * 0.44, 1.87, 0);
    add(g, B(0.008, 0.19, 0.33, V),       s * 0.555, 1.76, 0);
  });

  // Arms
  [[-1, -0.38], [1, 0.38]].forEach(([s, ax]) => {
    add(g, Cap(0.09, 0.34, S),              ax, 1.52, 0);
    add(g, B(0.18, 0.12, 0.18, P),         ax, 1.31, 0);
    add(g, Cap(0.08, 0.28, S),              ax, 1.1,  0);
    add(g, B(0.16, 0.28, 0.06, P),         ax, 1.1, -0.09);
    add(g, B(0.14, 0.005, 0.064, _trimMat),ax, 1.24, -0.09);
    add(g, Cyl(0.09, 0.04, _trimMat),      ax, 0.95, 0);
    add(g, B(0.18, 0.14, 0.16, S),         ax, 0.85, 0);
    add(g, B(0.18, 0.05, 0.06, P),         ax, 0.84, -0.07);
  });

  // Helmet
  add(g, B(0.38, 0.42, 0.4, P),         0, 2.05, 0);
  add(g, B(0.32, 0.1,  0.37, P),        0, 2.27, 0);
  add(g, B(0.05, 0.08, 0.38, _trimMat), 0, 2.33, 0);
  [-1, 1].forEach((s) => add(g, B(0.07, 0.21, 0.31, P), s * 0.225, 2.0, 0));
  add(g, B(0.29, 0.1, 0.1, P),          0, 1.84, -0.16);
  add(g, B(0.37, 0.1,  0.06, V),        0, 2.1, -0.22);
  add(g, B(0.39, 0.12, 0.02, _darkJoint), 0, 2.1, -0.2);
  [-1, 1].forEach((s) => {
    add(g, B(0.05, 0.13, 0.18, S),        s * 0.215, 2.08,  0.03);
    add(g, Cyl(0.014, 0.1, _trimMat, 6),  s * 0.215, 2.2,   0.03);
  });
  add(g, B(0.36, 0.38, 0.08, P),        0, 2.05,  0.24);
  add(g, Cyl(0.14, 0.06, S, 10),        0, 1.88, 0);
}

// ===========================================================================
// RECON — light scout plate carrier, slim profile
// ===========================================================================
function buildRecon(g, P, S) {
  const V = _visorGreen;

  // Low-profile boots
  [[-0.13], [0.13]].forEach(([bx]) => {
    add(g, B(0.18, 0.2, 0.28, S),           bx,  0.1,   0.01);
    add(g, B(0.2,  0.04, 0.3, _trimMat),    bx,  0.01,  0.01);
    add(g, B(0.18, 0.08, 0.25, P),          bx,  0.22,  0.01);
  });

  // Lower legs — minimal greaves
  [[-0.13], [0.13]].forEach(([lx]) => {
    add(g, Cap(0.085, 0.38, S),             lx,  0.52, 0);
    add(g, B(0.1,    0.22, 0.05, P),        lx,  0.52, -0.09);   // half-height greave
    add(g, B(0.16,   0.1,  0.12, P),        lx,  0.74, -0.05);   // knee pad
  });

  // Thighs — bare undersuit + thin outer plate
  [[-0.13, -1], [0.13, 1]].forEach(([tx, s]) => {
    add(g, Cap(0.105, 0.36, S),             tx,  1.03, 0);
    add(g, B(0.1,    0.26, 0.07, P),        tx - s * 0.1, 1.03, 0);
  });

  // Narrow hips
  add(g, B(0.38, 0.1, 0.26, S),   0, 1.2, 0);
  add(g, B(0.4,  0.06, 0.28, P),  0, 1.26, 0);

  // Torso — plate carrier (vest pads, not full chest plate)
  add(g, Cap(0.25, 0.46, S),      0, 1.54, 0);
  // Front plate carrier pouch rows
  add(g, B(0.42,  0.24, 0.1, P),  0, 1.6,  -0.16);
  for (let i = 0; i < 3; i++) {
    add(g, B(0.38, 0.005, 0.1, _trimMat), 0, 1.5 + i * 0.08, -0.162);
  }
  // Side MOLLE straps
  [-0.2, 0.2].forEach((px) => {
    add(g, B(0.06, 0.32, 0.08, S), px, 1.54, 0);
    for (let i = 0; i < 3; i++) add(g, B(0.06, 0.005, 0.08, _trimMat), px, 1.42 + i * 0.08, 0);
  });
  // Shoulder collar (narrower)
  add(g, B(0.28, 0.06, 0.28, S),  0, 1.82, 0);
  // Slim backpack/hydration pack
  add(g, B(0.22, 0.36, 0.1, S),   0, 1.58,  0.16);
  add(g, B(0.04, 0.06, 0.014, V), 0, 1.66,  0.215);

  // Slim pauldrons (epaulettes)
  [[-1, -0.29], [1, 0.29]].forEach(([s, ax]) => {
    add(g, Sph(0.09, S),               ax, 1.74, 0);
    add(g, B(0.16, 0.1, 0.24, P),     s * 0.38, 1.76, 0);
  });

  // Arms — bare limbs, no vambraces
  [[-1, -0.34], [1, 0.34]].forEach(([s, ax]) => {
    add(g, Cap(0.082, 0.34, S),         ax, 1.5,  0);
    add(g, B(0.15,   0.1,  0.15, P),    ax, 1.3,  0);  // elbow
    add(g, Cap(0.075, 0.28, S),         ax, 1.09, 0);
    // Wrist device (scout gadget)
    add(g, B(0.14,   0.06, 0.1, S),    ax, 0.95, -0.04);
    add(g, B(0.04,   0.04, 0.014, V),  ax, 0.95, -0.09);
    add(g, B(0.16,   0.14, 0.15, S),   ax, 0.84, 0);
  });

  // Helmet — ballistic dome, more open face
  add(g, B(0.34, 0.28, 0.38, P),       0, 2.05, 0);
  // Dome top
  const dome = Sph(0.185, P, 10, 8);
  add(g, dome,                           0, 2.2,  0);
  // NVG mount bracket
  add(g, B(0.06, 0.04, 0.1, _trimMat), 0, 2.32, -0.1);
  add(g, B(0.12, 0.03, 0.04, _trimMat), 0, 2.33, -0.15);
  // Slim visor (lower half of face, goggles style)
  add(g, B(0.28, 0.07, 0.05, V),        0, 2.08, -0.2);
  add(g, B(0.3,  0.09, 0.02, _darkJoint), 0, 2.08, -0.19);
  // Ear guards (small)
  [-1, 1].forEach((s) => add(g, B(0.04, 0.1, 0.18, P), s * 0.185, 2.1, 0));
  // Chin strap
  add(g, B(0.02, 0.1, 0.04, _trimMat), -0.12, 1.94, -0.19);
  add(g, B(0.02, 0.1, 0.04, _trimMat),  0.12, 1.94, -0.19);
  add(g, B(0.26, 0.02, 0.04, _trimMat), 0, 1.9, -0.19);
  // Back of helmet
  add(g, B(0.32, 0.24, 0.07, P),        0, 2.06,  0.22);
  add(g, Cyl(0.12, 0.05, S, 10),        0, 1.89, 0);
}

// ===========================================================================
// HEAVY — full juggernaut plate, extra-wide and imposing
// ===========================================================================
function buildHeavy(g, P, S) {
  const V = _visorCyan;

  // Massive armoured boots
  [[-0.18], [0.18]].forEach(([bx]) => {
    add(g, B(0.27, 0.28, 0.36, P),         bx,  0.14,  0.02);
    add(g, B(0.3,  0.05, 0.38, _trimMat),  bx,  0.01,  0.02);
    add(g, B(0.28, 0.1,  0.08, P),         bx,  0.14, -0.19);
    add(g, B(0.29, 0.12, 0.34, P),         bx,  0.28,  0.01);
  });

  // Thick greaves — double-plated
  [[-0.18], [0.18]].forEach(([lx]) => {
    add(g, Cap(0.12, 0.38, S),              lx,  0.55, 0);
    add(g, B(0.23,  0.4,  0.09, P),        lx,  0.55, -0.13);  // outer plate
    add(g, B(0.19,  0.3,  0.07, P),        lx,  0.55, -0.09);  // inner plate
    add(g, B(0.03,  0.36, 0.016, _trimMat),lx,  0.55, -0.185);
    // Quad knee guard (4 panels)
    add(g, B(0.26,  0.19, 0.2, P),         lx,  0.79, -0.08);
    add(g, B(0.24,  0.006, 0.2, _trimMat), lx,  0.88, -0.08);
  });

  // Thigh — thick exterior plates
  [[-0.18, -1], [0.18, 1]].forEach(([tx, s]) => {
    add(g, Cap(0.15, 0.38, S),              tx,  1.07, 0);
    add(g, B(0.2,   0.38, 0.13, P),        tx - s * 0.17, 1.07, 0);
    add(g, B(0.18,  0.006, 0.13, _trimMat),tx - s * 0.17, 1.19, 0);
    // Front thigh plate
    add(g, B(0.16,  0.28, 0.1, P),         tx,  1.07, -0.12);
  });

  // Wide hip / waist
  add(g, B(0.58, 0.16, 0.36, P),   0, 1.24, 0);
  add(g, B(0.6,  0.08, 0.38, S),   0, 1.32, 0);
  add(g, B(0.1,  0.08, 0.06, _trimMat), 0, 1.32, -0.2);
  [-0.24, 0.24].forEach((px) => add(g, B(0.14, 0.14, 0.12, S), px, 1.18, 0.1));

  // Torso — double chest plate
  add(g, Cap(0.34, 0.54, S),        0, 1.6,  0);
  add(g, B(0.6,   0.55, 0.12, P),   0, 1.6, -0.2);    // outer plate
  add(g, B(0.54,  0.48, 0.07, P),   0, 1.6, -0.14);   // inner plate
  add(g, B(0.6,   0.03, 0.12, _trimMat), 0, 1.875, -0.2);
  add(g, B(0.6,   0.03, 0.12, _trimMat), 0, 1.325, -0.2);
  add(g, B(0.03,  0.52, 0.018, _trimMat), 0, 1.6, -0.265);
  // Pec panel lights
  add(g, B(0.03,  0.32, 0.009, V), -0.26, 1.64, -0.265);
  add(g, B(0.03,  0.32, 0.009, V),  0.26, 1.64, -0.265);
  // Heavy backpack / power unit
  add(g, B(0.38,  0.5,  0.16, S),   0, 1.64,  0.24);
  add(g, B(0.14,  0.14, 0.024, V),  0, 1.72,  0.325);
  add(g, B(0.36,  0.5,  0.12, P),   0, 1.64,  0.2);
  add(g, B(0.1,   0.06, 0.016, V), -0.14, 1.58, 0.326);
  add(g, B(0.1,   0.06, 0.016, V),  0.14, 1.58, 0.326);
  // Collar
  add(g, B(0.42,  0.1,  0.38, P),   0, 1.9,  0);

  // Massive pauldrons
  [[-1, -0.43], [1, 0.43]].forEach(([s, ax]) => {
    add(g, Sph(0.13, S),                    ax, 1.8,  0);
    add(g, B(0.34, 0.28, 0.42, P),         s * 0.56, 1.78, 0);
    add(g, B(0.38, 0.09, 0.46, P),         s * 0.56, 1.9, 0);
    add(g, B(0.38, 0.09, 0.46, P),         s * 0.56, 1.66, 0);
    add(g, B(0.01, 0.26, 0.42, V),         s * 0.755, 1.78, 0);
  });

  // Arms — thick plated
  [[-1, -0.48], [1, 0.48]].forEach(([s, ax]) => {
    add(g, Cap(0.12, 0.34, S),              ax, 1.54, 0);
    add(g, B(0.24,  0.36, 0.06, P),        ax, 1.54, -0.11);  // upper arm plate
    add(g, B(0.22,  0.16, 0.22, P),        ax, 1.32, 0);      // elbow guard
    add(g, Cap(0.11, 0.3, S),              ax, 1.1,  0);
    add(g, B(0.22,  0.32, 0.08, P),        ax, 1.1, -0.11);   // vambrace
    add(g, B(0.2,   0.006, 0.08, _trimMat), ax, 1.27, -0.11);
    add(g, Cyl(0.12, 0.05, _trimMat),      ax, 0.94, 0);
    add(g, B(0.24,  0.18, 0.22, S),        ax, 0.83, 0);      // gauntlet
    add(g, B(0.24,  0.07, 0.08, P),        ax, 0.82, -0.09);
  });

  // Helmet — large boxy visor-slit design
  add(g, B(0.48, 0.52, 0.5, P),          0, 2.1,  0);
  add(g, B(0.42, 0.14, 0.48, P),         0, 2.34, 0);
  add(g, B(0.06, 0.12, 0.5, _trimMat),   0, 2.38, 0);
  // Full face plate
  add(g, B(0.46, 0.48, 0.06, P),         0, 2.1, -0.28);
  // Visor slit (narrow horizontal)
  add(g, B(0.38, 0.07, 0.07, V),         0, 2.18, -0.315);
  add(g, B(0.4,  0.09, 0.03, _darkJoint),0, 2.18, -0.295);
  // Cheek armour
  [-1, 1].forEach((s) => {
    add(g, B(0.09, 0.32, 0.38, P), s * 0.285, 2.1, 0);
    add(g, B(0.09, 0.32, 0.06, P), s * 0.285, 2.1, -0.28);
  });
  add(g, B(0.44, 0.1, 0.49, P),          0, 1.85, 0);
  add(g, B(0.44, 0.5, 0.09, P),          0, 2.1,  0.28);
  add(g, Cyl(0.18, 0.07, S, 10),         0, 1.87, 0);
}

// ===========================================================================
// STEALTH — slim infiltrator, minimal plate, form-fitting
// ===========================================================================
function buildStealth(g, P, S) {
  const V = _visorCyan;

  // Slim tactical boots
  [[-0.12], [0.12]].forEach(([bx]) => {
    add(g, B(0.17, 0.18, 0.28, S),          bx,  0.09, 0);
    add(g, B(0.19, 0.03, 0.3, _trimMat),    bx,  0.005,0);
    add(g, B(0.16, 0.08, 0.22, P),          bx,  0.2,  0.01);
  });

  // Lower legs — minimal shin pads
  [[-0.12], [0.12]].forEach(([lx]) => {
    add(g, Cap(0.08, 0.38, S),              lx,  0.52, 0);
    add(g, B(0.08,  0.18, 0.04, P),        lx,  0.52, -0.085);  // half shin pad
    add(g, B(0.13,  0.08, 0.1, P),         lx,  0.72, -0.04);   // knee cap only
  });

  // Thighs — bare undersuit
  [[-0.12, -1], [0.12, 1]].forEach(([tx, s]) => {
    add(g, Cap(0.1, 0.36, S),              tx, 1.02, 0);
    add(g, B(0.08, 0.2,  0.06, P),        tx - s * 0.08, 1.02, 0);
  });

  // Slim hips
  add(g, B(0.34, 0.09, 0.24, S),  0, 1.19, 0);
  add(g, B(0.36, 0.06, 0.26, P),  0, 1.25, 0);

  // Torso — tactical vest (minimal)
  add(g, Cap(0.23, 0.44, S),       0, 1.52, 0);
  // Slim front plate
  add(g, B(0.36,  0.36, 0.07, P), 0, 1.54, -0.15);
  add(g, B(0.025, 0.32, 0.01, _trimMat), 0, 1.54, -0.188);
  // Side panels
  [-0.15, 0.15].forEach((px) => add(g, B(0.07, 0.28, 0.06, P), px, 1.54, 0));
  // Slim collar
  add(g, B(0.26, 0.06, 0.26, S),  0, 1.8, 0);
  // Flat back
  add(g, B(0.38, 0.38, 0.06, S),  0, 1.54, 0.14);
  // Utility pack (slim)
  add(g, B(0.14, 0.2,  0.08, S),  0, 1.62, 0.19);
  add(g, B(0.03, 0.03, 0.014, V), 0, 1.65, 0.235);

  // Slim pauldrons (shoulder pads only)
  [[-1, -0.26], [1, 0.26]].forEach(([s, ax]) => {
    add(g, Sph(0.085, S),              ax, 1.72, 0);
    add(g, B(0.12, 0.08, 0.2, P),     s * 0.34, 1.74, 0);
  });

  // Arms — bare, wrist tech
  [[-1, -0.31], [1, 0.31]].forEach(([s, ax]) => {
    add(g, Cap(0.075, 0.34, S),        ax, 1.49, 0);
    add(g, B(0.12,   0.08, 0.14, P),   ax, 1.3,  0);   // elbow pad
    add(g, Cap(0.07,  0.28, S),        ax, 1.08, 0);
    // Multi-tool wrist bracer
    add(g, B(0.13,   0.1,  0.12, S),   ax, 0.96, -0.02);
    add(g, B(0.11,   0.05, 0.014, V),  ax, 0.96, -0.076);
    add(g, Cyl(0.007, 0.08, _trimMat, 6), ax, 0.89, -0.065);
    add(g, B(0.15,   0.12, 0.14, S),   ax, 0.83, 0);
  });

  // Helmet — partial face mask / half-helm
  add(g, B(0.33, 0.22, 0.38, P),          0, 2.08, 0);
  // Brow ridge / top
  const top = Cap(0.175, 0.06, P);
  top.rotation.z = Math.PI / 2;
  add(g, top,                               0, 2.22, 0);
  // Visor (upper half only)
  add(g, B(0.31, 0.09, 0.06, V),           0, 2.14, -0.2);
  add(g, B(0.33, 0.11, 0.02, _darkJoint),  0, 2.14, -0.19);
  // Lower face — mask (respirator style)
  add(g, B(0.25, 0.14, 0.1, S),            0, 1.98, -0.16);
  // Respirator vents
  [-0.08, 0.08].forEach((px) => add(g, B(0.04, 0.04, 0.024, _trimMat), px, 1.98, -0.215));
  // Ear comm (minimal)
  [-1, 1].forEach((s) => add(g, B(0.04, 0.1, 0.16, S), s * 0.185, 2.1, 0.02));
  // Back of helm (short, streamlined)
  add(g, B(0.3, 0.2, 0.06, P),             0, 2.1, 0.22);
  // Hood/cloak drape over back of neck
  add(g, B(0.32, 0.28, 0.08, S),           0, 1.9, 0.16);
  add(g, Cyl(0.11, 0.05, S, 10),           0, 1.86, 0);
}

// ===========================================================================
// Public API
// ===========================================================================

const BUILDERS = {
  assault: buildAssault,
  recon:   buildRecon,
  heavy:   buildHeavy,
  stealth: buildStealth,
};

export function buildPreviewCharacter(skin, armorTypeId = 'assault', armorSkin = null) {
  // Prefer Blender GLB when loaded
  const glbResult = _buildFromGLB(skin, armorTypeId, armorSkin);
  if (glbResult) return glbResult;

  // Fall back to procedural
  const g = new THREE.Group();

  const src = armorSkin || {};
  const primaryColor   = armorSkin ? armorSkin.primary   : skin.primary;
  const secondaryColor = armorSkin ? armorSkin.secondary : skin.secondary;

  const P = new THREE.MeshStandardMaterial({
    color:             primaryColor,
    roughness:         src.roughness         ?? 0.42,
    metalness:         src.metalness         ?? 0.52,
    emissive:          new THREE.Color(src.emissive ?? 0x000000),
    emissiveIntensity: src.emissiveIntensity ?? 0,
  });
  const S = new THREE.MeshStandardMaterial({
    color:     secondaryColor,
    roughness: (src.roughness ?? 0.72) * 1.3,
    metalness: (src.metalness ?? 0.18) * 0.35,
  });

  const builder = BUILDERS[armorTypeId] || buildAssault;
  builder(g, P, S);

  g.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow    = true;
      obj.receiveShadow = true;
    }
  });

  g.userData = { primaryMat: P, secondaryMat: S, armorTypeId };
  return g;
}

export function applySkinToCharacter(group, skin, armorSkin = null) {
  const { primaryMat, secondaryMat } = group.userData;
  primaryMat.color.setHex(armorSkin ? armorSkin.primary   : skin.primary);
  secondaryMat.color.setHex(armorSkin ? armorSkin.secondary : skin.secondary);
  if (armorSkin) {
    primaryMat.roughness         = armorSkin.roughness         ?? 0.42;
    primaryMat.metalness         = armorSkin.metalness         ?? 0.52;
    primaryMat.emissive.setHex(armorSkin.emissive ?? 0x000000);
    primaryMat.emissiveIntensity = armorSkin.emissiveIntensity ?? 0;
  }
}
