import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { metalNormalMap, metalRoughnessMap, polymerNormalMap } from './WeaponTextures.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ── Blender GLB weapon loader ─────────────────────────────────────────────────
let _weaponTemplate = null, _weaponLoading = false;

export function preloadWeaponModels() {
  if (_weaponTemplate || _weaponLoading) return;
  _weaponLoading = true;
  new GLTFLoader().load('/weapons.glb',
    (gltf) => { _weaponTemplate = gltf.scene; _weaponLoading = false; },
    undefined,
    (err) => { console.warn('[WeaponGLB] load failed:', err.message); _weaponLoading = false; }
  );
}

function _buildFromGLB(weaponDef) {
  const weaponRoot = _weaponTemplate?.getObjectByName(`weapon_${weaponDef.id}`);
  if (!weaponRoot) return null;

  const cloned = weaponRoot.clone(true);
  cloned.position.set(0, 0, 0);

  const color = weaponDef.color ?? 0x2a2a2a;
  const body  = M('body',   color,    { roughness: 0.55, metalness: 0.35 });
  const metal = M('metal',  0x808890, { metalness: 0.92, roughness: 0.18 });
  const dark  = M('accent', 0x0e0f11, { roughness: 0.45, metalness: 0.55 });
  const wood  = M('wood',   0x4a2e18, { roughness: 0.72, metalness: 0.0  });
  const blade = M('metal',  0xd0d8e0, { metalness: 0.95, roughness: 0.10,
                                        clearcoat: 0.8, clearcoatRoughness: 0.08 });
  const scope = M('special', 0x060a10, { roughness: 0.08, metalness: 0.2,
                                         clearcoat: 0.9, clearcoatRoughness: 0.05 });

  cloned.traverse(obj => {
    if (!obj.isMesh) return;
    const n = (obj.material?.name || '').toLowerCase();
    if      (n.includes('dark_metal'))  obj.material = dark;
    else if (n.includes('wood'))        obj.material = wood;
    else if (n.includes('blade'))       obj.material = blade;
    else if (n.includes('scope_glass')) obj.material = scope;
    else if (n.includes('rubber'))      obj.material = body;
    else if (n.includes('metal') || n.includes('brass')) obj.material = metal;
    else                                obj.material = body;
    obj.castShadow = true;
  });

  // Find muzzle point (Blender auto-renames duplicates to muzzle_point.001 etc.)
  let muzzle = null;
  cloned.traverse(obj => { if (!muzzle && /^muzzle_point/.test(obj.name)) muzzle = obj; });

  if (!muzzle) {
    muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.062, -0.32);
    cloned.add(muzzle);
  }

  const group = new THREE.Group();
  group.add(cloned);
  return { group, muzzle };
}

// ---------------------------------------------------------------------------
// Material helpers
// 'role' tags let the skin system recolor parts:
//   body   = main shell / polymer (skin-recolored)
//   accent = furniture, dark trim (skin-recolored)
//   metal  = barrels, rails, hardware (skin-recolored)
//   wood   = wooden parts (untouched)
//   special= optics, unique parts (untouched)
//
// Materials are MeshPhysicalMaterial: metal gets brushed scratches + anisotropy
// (directional sheen), polymer/furniture get a clearcoat so they read as a real
// coated surface rather than flat plastic.
// ---------------------------------------------------------------------------
function M(role, color, opts = {}) {
  const defaults = { roughness: 0.5, metalness: 0.5, envMapIntensity: 2.0 };
  const m = new THREE.MeshPhysicalMaterial({ color, ...defaults, ...opts });
  m.userData.role = role;

  if (role === 'metal') {
    m.normalMap = metalNormalMap();
    m.roughnessMap = metalRoughnessMap();
    m.normalScale = new THREE.Vector2(0.4, 0.4);
    m.anisotropy = 0.5;                 // brushed directional reflection
    m.clearcoat = 0.25;
    m.clearcoatRoughness = 0.3;
  } else if (role === 'body') {
    m.normalMap = polymerNormalMap();
    m.normalScale = new THREE.Vector2(0.2, 0.2);
    m.clearcoat = 0.55;                 // semi-gloss polymer coating
    m.clearcoatRoughness = 0.42;
  } else if (role === 'accent') {
    m.normalMap = polymerNormalMap();
    m.normalScale = new THREE.Vector2(0.14, 0.14);
    m.clearcoat = 0.35;
    m.clearcoatRoughness = 0.5;
  } else if (role === 'special') {
    m.clearcoat = 0.8;                  // glassy optics
    m.clearcoatRoughness = 0.1;
  }
  return m;
}

function addMuzzle(group, x, y, z) {
  const pt = new THREE.Object3D();
  pt.position.set(x, y, z);
  group.add(pt);
  return pt;
}

// Primitives ---------------------------------------------------------------
// Structural boxes get rounded/beveled edges so they catch light like a real
// machined part; tiny detail boxes stay sharp (and cheap).
function box(w, h, d, material) {
  const minD = Math.min(w, h, d);
  if (minD < 0.022) return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  const r = Math.min(minD * 0.16, minD * 0.48);
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), material);
}

function cyl(r1, r2, h, material, segs = 16, rotX = Math.PI / 2) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, segs), material);
  m.rotation.x = rotX;
  return m;
}

function cone(r, h, material, segs = 12, rotX = -Math.PI / 2) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, segs), material);
  m.rotation.x = rotX;
  return m;
}

// Hex-nut-like knurled collar (row of small radial bumps around a cylinder).
function knurledCollar(group, mat, x, y, z, radius, count = 12) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const nub = box(0.01, 0.01, 0.018, mat);
    nub.position.set(x + Math.cos(a) * radius, y + Math.sin(a) * radius, z);
    nub.rotation.z = a;
    group.add(nub);
  }
}

// Grid of small raised squares on a flat face — simulates grip stippling.
function stippleGrip(group, mat, cx, cy, cz, faceW, faceH, cols, rows) {
  const sw = faceW / cols * 0.45;
  const sh = faceH / rows * 0.45;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const nub = box(sw, sh, 0.006, mat);
      nub.position.set(
        cx + (c / (cols - 1) - 0.5) * faceW * 0.8,
        cy + (r / (rows - 1) - 0.5) * faceH * 0.8,
        cz
      );
      group.add(nub);
    }
  }
}

// Evenly spaced slots along Z — M-LOK / vented handguard.
function railSlats(group, mat, count, x, y, zStart, zStep, w = 0.08, t = 0.012) {
  for (let i = 0; i < count; i++) {
    const slat = box(w, t, 0.03, mat);
    slat.position.set(x, y, zStart - i * zStep);
    group.add(slat);
  }
}

// Small Picatinny rail section (horizontal teeth on top of rail).
function picRail(group, mat, x, y, zStart, length, step = 0.028) {
  const count = Math.floor(length / step);
  for (let i = 0; i < count; i++) {
    const tooth = box(0.036, 0.01, 0.016, mat);
    tooth.position.set(x, y, zStart - i * step);
    group.add(tooth);
  }
}

// ===========================================================================
// PISTOLS
// ===========================================================================

function buildSidearm(color) {
  const g = new THREE.Group();
  const body    = M('body',   color,    { roughness: 0.55, metalness: 0.35 });
  const slide   = M('accent', 0x18191d, { roughness: 0.35, metalness: 0.72 });
  const metal   = M('metal',  0x6c7177, { metalness: 0.85, roughness: 0.25 });
  const dark    = M('accent', 0x0e0f11, { roughness: 0.65, metalness: 0.2  });

  // Frame
  const frame = box(0.072, 0.055, 0.28, body);
  frame.position.set(0, 0.0, -0.02);
  g.add(frame);

  // Slide
  const sl = box(0.080, 0.088, 0.36, slide);
  sl.position.set(0, 0.062, -0.04);
  g.add(sl);

  // Rear serrations on slide
  for (let i = 0; i < 6; i++) {
    const s = box(0.084, 0.072, 0.007, metal);
    s.position.set(0, 0.062, 0.06 + i * 0.016);
    g.add(s);
  }

  // Front serrations
  for (let i = 0; i < 3; i++) {
    const s = box(0.084, 0.06, 0.007, metal);
    s.position.set(0, 0.062, -0.18 + i * 0.016);
    g.add(s);
  }

  // Ejection port (inset panel on slide side)
  const ej = box(0.005, 0.04, 0.08, dark);
  ej.position.set(0.041, 0.07, -0.08);
  g.add(ej);

  // Dust cover rail
  const rail = box(0.05, 0.016, 0.14, dark);
  rail.position.set(0, -0.022, -0.1);
  g.add(rail);
  for (let i = 0; i < 4; i++) {
    const tooth = box(0.052, 0.006, 0.012, metal);
    tooth.position.set(0, -0.012, -0.06 - i * 0.026);
    g.add(tooth);
  }

  // Grip
  const grip = box(0.078, 0.195, 0.1, body);
  grip.position.set(0, -0.11, 0.1);
  grip.rotation.x = 0.2;
  g.add(grip);
  stippleGrip(g, dark, 0.041, -0.1, 0.06, 0.0, 0.15, 4, 6);

  // Trigger guard
  const tgBot = box(0.052, 0.014, 0.1, body);
  tgBot.position.set(0, -0.048, 0.02);
  g.add(tgBot);
  const tgFront = box(0.052, 0.04, 0.014, body);
  tgFront.position.set(0, -0.026, -0.03);
  g.add(tgFront);

  // Trigger
  const trig = box(0.016, 0.048, 0.018, metal);
  trig.position.set(0, -0.02, 0.01);
  g.add(trig);

  // Barrel
  const barrel = cyl(0.016, 0.014, 0.065, metal);
  barrel.position.set(0, 0.062, -0.25);
  g.add(barrel);

  // Sights
  const sightR = box(0.022, 0.016, 0.018, metal);
  sightR.position.set(0, 0.112, -0.18);
  g.add(sightR);
  const sightF = box(0.01, 0.014, 0.012, metal);
  sightF.position.set(0, 0.112, 0.09);
  g.add(sightF);

  // Takedown pin
  const pin = cyl(0.008, 0.008, 0.086, metal, 16, 0);
  pin.position.set(0, -0.002, -0.04);
  g.add(pin);

  const muzzle = addMuzzle(g, 0, 0.062, -0.295);
  return { group: g, muzzle };
}

function _buildGlock_REMOVED(color) {
  const g = new THREE.Group();
  const frame  = M('body',   color,    { roughness: 0.72, metalness: 0.12 });
  const slide  = M('accent', 0x141619, { roughness: 0.38, metalness: 0.68 });
  const metal  = M('metal',  0x6c7177, { metalness: 0.85, roughness: 0.25 });
  const dark   = M('accent', 0x0d0e10, { roughness: 0.6,  metalness: 0.15 });

  // Slide
  const sl = box(0.076, 0.092, 0.38, slide);
  sl.position.set(0, 0.072, -0.04);
  g.add(sl);

  // Rear slide serrations
  for (let i = 0; i < 7; i++) {
    const s = box(0.080, 0.074, 0.007, metal);
    s.position.set(0, 0.072, 0.07 + i * 0.016);
    g.add(s);
  }

  // Front serrations
  for (let i = 0; i < 4; i++) {
    const s = box(0.080, 0.06, 0.007, metal);
    s.position.set(0, 0.072, -0.2 + i * 0.016);
    g.add(s);
  }

  // Slide top flat rib
  const rib = box(0.022, 0.008, 0.36, dark);
  rib.position.set(0, 0.12, -0.04);
  g.add(rib);

  // Sights
  const sR = box(0.026, 0.016, 0.02, metal);
  sR.position.set(0, 0.126, 0.13);
  g.add(sR);
  const sF = box(0.012, 0.018, 0.014, metal);
  sF.position.set(0, 0.128, -0.19);
  g.add(sF);

  // Ejection port
  const ej = box(0.004, 0.038, 0.09, dark);
  ej.position.set(0.040, 0.075, -0.04);
  g.add(ej);

  // Frame
  const fr = box(0.070, 0.058, 0.34, frame);
  fr.position.set(0, 0.002, -0.02);
  g.add(fr);

  // Dust cover rail
  const dcRail = box(0.048, 0.018, 0.16, dark);
  dcRail.position.set(0, -0.024, -0.08);
  g.add(dcRail);
  for (let i = 0; i < 5; i++) {
    const tooth = box(0.050, 0.007, 0.011, metal);
    tooth.position.set(0, -0.014, -0.04 - i * 0.022);
    g.add(tooth);
  }

  // Grip
  const grip = box(0.076, 0.225, 0.1, frame);
  grip.position.set(0, -0.128, 0.1);
  grip.rotation.x = 0.15;
  g.add(grip);
  stippleGrip(g, dark, 0.040, -0.12, 0.052, 0.0, 0.18, 5, 7);

  // Trigger guard
  const tgBot = box(0.056, 0.015, 0.1, frame);
  tgBot.position.set(0, -0.048, 0.01);
  g.add(tgBot);
  const tgF = box(0.056, 0.042, 0.015, frame);
  tgF.position.set(0, -0.023, -0.04);
  g.add(tgF);

  // Trigger
  const trig = box(0.014, 0.048, 0.016, slide);
  trig.position.set(0, -0.018, 0.01);
  g.add(trig);

  // Barrel
  const barrel = cyl(0.014, 0.013, 0.06, metal);
  barrel.position.set(0, 0.072, -0.27);
  g.add(barrel);

  // Takedown lever
  const tdl = box(0.04, 0.012, 0.022, metal);
  tdl.position.set(0, -0.002, -0.04);
  g.add(tdl);

  const muzzle = addMuzzle(g, 0, 0.072, -0.32);
  return { group: g, muzzle };
}

// ===========================================================================
// SMGs
// ===========================================================================

function buildSMG(color) {
  const g = new THREE.Group();
  const body  = M('body',   color,    { roughness: 0.55, metalness: 0.38 });
  const dark  = M('accent', 0x111318, { roughness: 0.65, metalness: 0.2  });
  const metal = M('metal',  0x72787f, { metalness: 0.82, roughness: 0.28 });

  // Lower receiver
  const lower = box(0.095, 0.09, 0.38, body);
  lower.position.set(0, 0.02, 0.0);
  g.add(lower);

  // Upper receiver
  const upper = box(0.088, 0.075, 0.38, dark);
  upper.position.set(0, 0.108, 0.0);
  g.add(upper);

  // Top rail
  const rail = box(0.038, 0.018, 0.32, metal);
  rail.position.set(0, 0.152, 0.02);
  g.add(rail);
  picRail(g, dark, 0, 0.162, 0.14, 0.3);

  // Magazine
  const mag = box(0.058, 0.22, 0.08, dark);
  mag.position.set(0, -0.13, -0.04);
  mag.rotation.x = -0.14;
  g.add(mag);
  // Mag grip marks
  for (let i = 0; i < 3; i++) {
    const mk = box(0.062, 0.006, 0.035, metal);
    mk.position.set(0, -0.06 - i * 0.04, -0.04);
    g.add(mk);
  }

  // Pistol grip
  const grip = box(0.068, 0.18, 0.08, dark);
  grip.position.set(0, -0.092, 0.12);
  grip.rotation.x = 0.28;
  g.add(grip);
  stippleGrip(g, metal, 0.036, -0.09, 0.082, 0.0, 0.14, 4, 5);

  // Collapsible stock
  const stockTube = cyl(0.022, 0.022, 0.2, dark);
  stockTube.position.set(0, 0.04, 0.3);
  g.add(stockTube);
  const stockPlate = box(0.068, 0.12, 0.022, dark);
  stockPlate.position.set(0, 0.028, 0.41);
  g.add(stockPlate);
  const stockBrace = box(0.026, 0.008, 0.2, metal);
  stockBrace.position.set(0, 0.09, 0.3);
  g.add(stockBrace);

  // Barrel
  const barrel = cyl(0.019, 0.017, 0.26, metal);
  barrel.position.set(0, 0.05, -0.38);
  g.add(barrel);
  // Flash hider
  const fh = cyl(0.025, 0.019, 0.05, dark);
  fh.position.set(0, 0.05, -0.535);
  g.add(fh);
  // 3-prong cuts on flash hider
  for (let i = 0; i < 3; i++) {
    const prong = box(0.006, 0.022, 0.032, dark);
    prong.position.set(Math.sin(i / 3 * Math.PI * 2) * 0.018, 0.05 + Math.cos(i / 3 * Math.PI * 2) * 0.018, -0.55);
    g.add(prong);
  }

  // Charging handle
  const ch = box(0.022, 0.018, 0.04, metal);
  ch.position.set(0.05, 0.152, 0.14);
  g.add(ch);

  const muzzle = addMuzzle(g, 0, 0.05, -0.565);
  return { group: g, muzzle };
}

// Uzi — stamped steel receiver, pistol-grip mag, folding wire stock.
function buildUzi(color) {
  const g = new THREE.Group();
  const body  = M('body',   color,    { roughness: 0.42, metalness: 0.6  });
  const dark  = M('accent', 0x0e1013, { roughness: 0.58, metalness: 0.22 });
  const metal = M('metal',  0x6c7177, { metalness: 0.82, roughness: 0.28 });

  // Receiver — tall boxy stamped steel
  const recv = box(0.108, 0.135, 0.31, body);
  recv.position.set(0, 0.05, 0.0);
  g.add(recv);

  // Ribbed top cover
  for (let i = 0; i < 5; i++) {
    const rib = box(0.06, 0.01, 0.27, dark);
    rib.position.set(0, 0.12 + i * 0.001, 0.0);
    g.add(rib);
  }

  // Ejection port slot
  const ej = box(0.004, 0.05, 0.1, dark);
  ej.position.set(0.056, 0.05, -0.04);
  g.add(ej);

  // Barrel + barrel nut
  const barrel = cyl(0.019, 0.019, 0.17, metal);
  barrel.position.set(0, 0.05, -0.23);
  g.add(barrel);
  const bNut = cyl(0.03, 0.03, 0.04, body);
  bNut.position.set(0, 0.05, -0.17);
  g.add(bNut);
  knurledCollar(g, metal, 0, 0.05, -0.17, 0.036, 10);

  // Pistol grip (mag goes inside)
  const grip = box(0.083, 0.165, 0.098, dark);
  grip.position.set(0, -0.06, 0.04);
  g.add(grip);
  const mag = box(0.048, 0.24, 0.072, dark);
  mag.position.set(0, -0.22, 0.04);
  g.add(mag);
  // Mag witness holes
  for (let i = 0; i < 4; i++) {
    const wh = box(0.052, 0.01, 0.022, metal);
    wh.position.set(0, -0.11 - i * 0.03, 0.04);
    g.add(wh);
  }

  // Trigger guard
  const tgB = box(0.052, 0.013, 0.09, body);
  tgB.position.set(0, -0.036, -0.04);
  g.add(tgB);
  const tgF = box(0.052, 0.04, 0.013, body);
  tgF.position.set(0, -0.018, -0.09);
  g.add(tgF);
  const trig = box(0.016, 0.045, 0.018, metal);
  trig.position.set(0, -0.014, -0.04);
  g.add(trig);

  // Wire folding stock (2 arms + buttplate)
  const wireL = box(0.009, 0.009, 0.24, metal);
  wireL.position.set(-0.042, 0.08, 0.28);
  g.add(wireL);
  const wireR = box(0.009, 0.009, 0.24, metal);
  wireR.position.set(0.042, 0.08, 0.28);
  g.add(wireR);
  const butt = box(0.105, 0.065, 0.013, metal);
  butt.position.set(0, 0.08, 0.41);
  g.add(butt);

  const muzzle = addMuzzle(g, 0, 0.05, -0.33);
  return { group: g, muzzle };
}

// ===========================================================================
// SHOTGUNS
// ===========================================================================

function buildShotgun(color) {
  const g = new THREE.Group();
  const body  = M('body',   color,    { roughness: 0.62, metalness: 0.2  });
  const dark  = M('accent', 0x14161a, { roughness: 0.68, metalness: 0.15 });
  const metal = M('metal',  0x72787f, { metalness: 0.82, roughness: 0.28 });
  const wood  = M('wood',   0x6b3e20, { roughness: 0.72, metalness: 0.05 });

  // Main barrel
  const barrel = cyl(0.031, 0.029, 0.58, metal);
  barrel.position.set(0, 0.075, -0.2);
  g.add(barrel);
  // Magazine tube under barrel
  const tube = cyl(0.019, 0.019, 0.52, metal);
  tube.position.set(0, 0.032, -0.18);
  g.add(tube);
  // Barrel-to-tube brace rings
  for (let i = 0; i < 3; i++) {
    const ring = cyl(0.038, 0.038, 0.018, dark);
    ring.position.set(0, 0.056, -0.06 - i * 0.16);
    g.add(ring);
  }

  // Pump forend (wood)
  const pump = box(0.082, 0.078, 0.22, wood);
  pump.position.set(0, 0.038, -0.2);
  g.add(pump);
  for (let i = 0; i < 5; i++) {
    const groove = box(0.086, 0.012, 0.008, dark);
    groove.position.set(0, 0.078, -0.14 - i * 0.036);
    g.add(groove);
  }

  // Receiver
  const recv = box(0.088, 0.105, 0.22, body);
  recv.position.set(0, 0.055, 0.06);
  g.add(recv);
  // Ejection port
  const ej = box(0.004, 0.055, 0.09, dark);
  ej.position.set(0.046, 0.072, 0.04);
  g.add(ej);
  // Loading port
  const lp = box(0.006, 0.03, 0.06, dark);
  lp.position.set(0, -0.015, 0.08);
  g.add(lp);

  // Wood stock
  const stock = box(0.068, 0.11, 0.32, wood);
  stock.position.set(0, 0.025, 0.34);
  stock.rotation.x = -0.07;
  g.add(stock);
  const buttplate = box(0.074, 0.135, 0.02, dark);
  buttplate.position.set(0, 0.022, 0.5);
  g.add(buttplate);

  // Pistol grip
  const grip = box(0.068, 0.175, 0.078, wood);
  grip.position.set(0, -0.088, 0.14);
  grip.rotation.x = 0.28;
  g.add(grip);

  // Trigger guard + trigger
  const tgB = box(0.055, 0.013, 0.095, dark);
  tgB.position.set(0, -0.042, 0.1);
  g.add(tgB);
  const trig = box(0.014, 0.045, 0.016, metal);
  trig.position.set(0, -0.018, 0.1);
  g.add(trig);

  // Bead front sight
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), metal);
  bead.position.set(0, 0.085, -0.47);
  g.add(bead);

  const muzzle = addMuzzle(g, 0, 0.075, -0.5);
  return { group: g, muzzle };
}

// Lever-action shotgun
function buildLeverShotgun(color) {
  const g = new THREE.Group();
  const wood  = M('wood',   0x8b5c2a, { roughness: 0.68, metalness: 0.06 });
  const dark  = M('accent', 0x12141a, { roughness: 0.58, metalness: 0.3  });
  const metal = M('metal',  0x6e7479, { metalness: 0.84, roughness: 0.26 });

  // Receiver
  const recv = box(0.082, 0.135, 0.24, dark);
  recv.position.set(0, 0.052, 0.05);
  g.add(recv);
  // Receiver side-plate detail
  const sp = box(0.004, 0.1, 0.2, metal);
  sp.position.set(0.043, 0.055, 0.04);
  g.add(sp);

  // Barrel
  const barrel = cyl(0.026, 0.024, 0.52, metal);
  barrel.position.set(0, 0.082, -0.32);
  g.add(barrel);
  // Magazine tube
  const tube = cyl(0.017, 0.017, 0.46, metal);
  tube.position.set(0, 0.034, -0.3);
  g.add(tube);

  // Forend (dark polymer with M-LOK slots)
  const forend = box(0.068, 0.062, 0.26, dark);
  forend.position.set(0, 0.04, -0.22);
  g.add(forend);
  railSlats(g, metal, 4, 0, 0.075, -0.12, 0.065, 0.072, 0.01);

  // Wood stock
  const stock = box(0.068, 0.122, 0.35, wood);
  stock.position.set(0, 0.022, 0.34);
  stock.rotation.x = -0.055;
  g.add(stock);
  const buttplate = box(0.072, 0.145, 0.02, metal);
  buttplate.position.set(0, 0.018, 0.52);
  g.add(buttplate);

  // Pistol grip (wood)
  const grip = box(0.062, 0.16, 0.075, wood);
  grip.position.set(0, -0.078, 0.16);
  grip.rotation.x = 0.24;
  g.add(grip);

  // Lever loop (3-piece)
  const leverFront = box(0.018, 0.11, 0.018, metal);
  leverFront.position.set(0, -0.072, 0.02);
  g.add(leverFront);
  const leverBottom = box(0.018, 0.018, 0.13, metal);
  leverBottom.position.set(0, -0.128, 0.08);
  g.add(leverBottom);
  const leverBack = box(0.018, 0.08, 0.018, metal);
  leverBack.position.set(0, -0.082, 0.15);
  g.add(leverBack);
  const leverBridge = box(0.018, 0.018, 0.04, metal);
  leverBridge.position.set(0, -0.038, 0.01);
  g.add(leverBridge);

  // Muzzle brake
  const mb = cyl(0.03, 0.022, 0.04, metal);
  mb.position.set(0, 0.082, -0.6);
  g.add(mb);

  // Bead front sight
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), metal);
  bead.position.set(0, 0.098, -0.54);
  g.add(bead);

  const muzzle = addMuzzle(g, 0, 0.082, -0.625);
  return { group: g, muzzle };
}

// ===========================================================================
// RIFLES
// ===========================================================================

function buildRifle(color) {
  const g = new THREE.Group();
  const body  = M('body',   color,    { roughness: 0.55, metalness: 0.32 });
  const dark  = M('accent', 0x13151a, { roughness: 0.62, metalness: 0.2  });
  const metal = M('metal',  0x80868e, { metalness: 0.78, roughness: 0.3  });

  // Receivers
  const upper = box(0.085, 0.075, 0.42, dark);
  upper.position.set(0, 0.09, 0.0);
  g.add(upper);
  const lower = box(0.082, 0.075, 0.4, body);
  lower.position.set(0, 0.02, 0.0);
  g.add(lower);

  // Dust cover
  const dc = box(0.06, 0.018, 0.11, metal);
  dc.position.set(0, 0.018, -0.04);
  g.add(dc);

  // Picatinny top rail
  const rail = box(0.038, 0.02, 0.36, metal);
  rail.position.set(0, 0.138, -0.01);
  g.add(rail);
  picRail(g, dark, 0, 0.15, 0.14, 0.36);

  // Magazine
  const mag = box(0.058, 0.245, 0.09, dark);
  mag.position.set(0, -0.14, -0.06);
  mag.rotation.x = -0.18;
  g.add(mag);
  for (let i = 0; i < 4; i++) {
    const w = box(0.062, 0.008, 0.038, metal);
    w.position.set(0, -0.07 - i * 0.038, -0.06);
    g.add(w);
  }

  // Pistol grip
  const grip = box(0.068, 0.175, 0.08, dark);
  grip.position.set(0, -0.1, 0.15);
  grip.rotation.x = 0.3;
  g.add(grip);
  stippleGrip(g, metal, 0.036, -0.1, 0.082, 0.0, 0.14, 4, 5);

  // Fixed stock
  const stock = box(0.068, 0.095, 0.28, dark);
  stock.position.set(0, 0.038, 0.34);
  g.add(stock);
  const butt = box(0.072, 0.12, 0.022, dark);
  butt.position.set(0, 0.038, 0.48);
  g.add(butt);

  // Barrel
  const barrel = cyl(0.019, 0.016, 0.35, metal);
  barrel.position.set(0, 0.068, -0.42);
  g.add(barrel);
  // Gas block
  const gb = box(0.032, 0.03, 0.04, dark);
  gb.position.set(0, 0.068, -0.3);
  g.add(gb);
  // Gas tube
  const gtube = cyl(0.007, 0.007, 0.28, metal);
  gtube.position.set(0, 0.11, -0.17);
  g.add(gtube);
  // Flash hider
  const fh = cyl(0.024, 0.018, 0.055, dark);
  fh.position.set(0, 0.068, -0.61);
  g.add(fh);

  // Charging handle
  const ch = box(0.024, 0.016, 0.04, metal);
  ch.position.set(0, 0.138, 0.12);
  g.add(ch);

  const muzzle = addMuzzle(g, 0, 0.068, -0.645);
  return { group: g, muzzle };
}

// M4 carbine — flat-top upper, free-float M-LOK handguard, collapsible stock.
function buildM4(color) {
  const g = new THREE.Group();
  const body  = M('body',   color,    { roughness: 0.58, metalness: 0.28 });
  const dark  = M('accent', 0x101318, { roughness: 0.6,  metalness: 0.22 });
  const metal = M('metal',  0x80868e, { metalness: 0.75, roughness: 0.32 });

  // Upper receiver
  const upper = box(0.082, 0.08, 0.36, dark);
  upper.position.set(0, 0.092, 0.04);
  g.add(upper);
  // Lower receiver
  const lower = box(0.082, 0.07, 0.32, body);
  lower.position.set(0, 0.022, 0.04);
  g.add(lower);

  // M-LOK handguard
  const hg = box(0.072, 0.082, 0.46, dark);
  hg.position.set(0, 0.075, -0.32);
  g.add(hg);
  railSlats(g, metal, 6, 0, 0.12, -0.14, 0.072, 0.08);
  // Side slots
  railSlats(g, metal, 4, 0.038, 0.068, -0.16, 0.09, 0.007, 0.038);
  railSlats(g, metal, 4, -0.038, 0.068, -0.16, 0.09, 0.007, 0.038);

  // Picatinny top rail
  const topRail = box(0.038, 0.02, 0.78, metal);
  topRail.position.set(0, 0.14, -0.15);
  g.add(topRail);
  picRail(g, dark, 0, 0.152, 0.18, 0.78);

  // Front sight post (flip-up)
  const fsb = box(0.03, 0.055, 0.028, dark);
  fsb.position.set(0, 0.158, -0.56);
  g.add(fsb);
  const fsp = cyl(0.006, 0.006, 0.038, metal, 8, 0);
  fsp.position.set(0, 0.19, -0.56);
  g.add(fsp);

  // Barrel
  const barrel = cyl(0.016, 0.015, 0.22, metal);
  barrel.position.set(0, 0.075, -0.62);
  g.add(barrel);
  // Gas block
  const gb = box(0.03, 0.03, 0.04, dark);
  gb.position.set(0, 0.075, -0.52);
  g.add(gb);
  // Gas tube
  const gtube = cyl(0.007, 0.007, 0.44, metal);
  gtube.position.set(0, 0.118, -0.37);
  g.add(gtube);
  // Flash hider (A2 birdcage)
  const fhBase = cyl(0.022, 0.016, 0.055, dark);
  fhBase.position.set(0, 0.075, -0.74);
  g.add(fhBase);
  for (let i = 0; i < 5; i++) {
    const slot = box(0.005, 0.012, 0.04, metal);
    slot.position.set(Math.cos(i / 5 * Math.PI * 2) * 0.02, 0.075 + Math.sin(i / 5 * Math.PI * 2) * 0.02, -0.74);
    g.add(slot);
  }

  // Magazine — PMAG style with curved polymer
  const mag = box(0.054, 0.268, 0.088, body);
  mag.position.set(0, -0.136, 0.03);
  mag.rotation.x = -0.12;
  g.add(mag);
  const magFloor = box(0.058, 0.02, 0.092, dark);
  magFloor.position.set(0, -0.276, 0.03);
  g.add(magFloor);
  for (let i = 0; i < 3; i++) {
    const w = box(0.058, 0.007, 0.04, metal);
    w.position.set(0, -0.1 - i * 0.042, 0.03);
    g.add(w);
  }

  // Pistol grip
  const grip = box(0.068, 0.17, 0.082, dark);
  grip.position.set(0, -0.092, 0.2);
  grip.rotation.x = 0.3;
  g.add(grip);
  stippleGrip(g, metal, 0.036, -0.09, 0.084, 0.0, 0.14, 4, 5);

  // Buffer tube
  const btube = cyl(0.025, 0.025, 0.22, dark);
  btube.position.set(0, 0.062, 0.32);
  g.add(btube);
  knurledCollar(g, metal, 0, 0.062, 0.22, 0.03, 10);

  // Collapsible stock
  const stockBody = box(0.072, 0.135, 0.13, dark);
  stockBody.position.set(0, 0.03, 0.38);
  g.add(stockBody);
  const stockCheek = box(0.06, 0.02, 0.12, dark);
  stockCheek.position.set(0, 0.1, 0.38);
  g.add(stockCheek);

  // Bolt catch, mag release, selector (detail bumps)
  const bc = box(0.005, 0.018, 0.032, metal);
  bc.position.set(-0.043, 0.04, 0.06);
  g.add(bc);
  const sel = cyl(0.01, 0.01, 0.012, metal, 8, 0);
  sel.position.set(-0.043, 0.034, 0.14);
  g.add(sel);

  const muzzle = addMuzzle(g, 0, 0.075, -0.77);
  return { group: g, muzzle };
}

// AR-10 .308 — beefier M4 variant, 20-rd PMAG, red dot optic.
function buildAR10(color) {
  const g = new THREE.Group();
  const body  = M('body',   color,    { roughness: 0.55, metalness: 0.3  });
  const dark  = M('accent', 0x0f1116, { roughness: 0.6,  metalness: 0.22 });
  const metal = M('metal',  0x7c8289, { metalness: 0.76, roughness: 0.3  });
  const glass = M('special', 0x163b2a, { metalness: 0.15, roughness: 0.1,
                                         emissive: 0x0a2a1c, emissiveIntensity: 0.2 });

  // Upper + lower receivers
  const upper = box(0.092, 0.085, 0.4, dark);
  upper.position.set(0, 0.095, 0.06);
  g.add(upper);
  const lower = box(0.092, 0.075, 0.38, body);
  lower.position.set(0, 0.022, 0.06);
  g.add(lower);

  // M-LOK handguard (longer/beefier)
  const hg = box(0.082, 0.092, 0.52, dark);
  hg.position.set(0, 0.078, -0.36);
  g.add(hg);
  railSlats(g, metal, 7, 0, 0.13, -0.16, 0.068, 0.09);
  railSlats(g, metal, 5, 0.043, 0.072, -0.18, 0.086, 0.007, 0.04);

  // Top rail
  const topRail = box(0.042, 0.022, 0.88, metal);
  topRail.position.set(0, 0.148, -0.19);
  g.add(topRail);
  picRail(g, dark, 0, 0.16, 0.22, 0.88);

  // Red-dot optic (Aimpoint-style)
  const base = box(0.052, 0.042, 0.115, dark);
  base.position.set(0, 0.178, 0.03);
  g.add(base);
  const tube = cyl(0.032, 0.032, 0.105, dark, 16, 0);
  tube.position.set(0, 0.225, 0.03);
  g.add(tube);
  const lens1 = cyl(0.028, 0.028, 0.012, glass, 16, 0);
  lens1.position.set(0, 0.225, -0.045);
  g.add(lens1);
  const lens2 = cyl(0.028, 0.028, 0.012, glass, 16, 0);
  lens2.position.set(0, 0.225, 0.105);
  g.add(lens2);
  const adjKnob = cyl(0.01, 0.01, 0.03, metal, 8, 0);
  adjKnob.position.set(0, 0.258, 0.03);
  g.add(adjKnob);

  // Barrel (heavier .308 profile)
  const barrel = cyl(0.021, 0.019, 0.24, metal);
  barrel.position.set(0, 0.078, -0.72);
  g.add(barrel);
  // Muzzle brake
  const mbBody = cyl(0.032, 0.028, 0.076, dark);
  mbBody.position.set(0, 0.078, -0.878);
  g.add(mbBody);
  for (let i = 0; i < 3; i++) {
    const port = box(0.007, 0.022, 0.018, metal);
    port.position.set(Math.cos(i / 3 * Math.PI * 2) * 0.028, 0.078 + Math.sin(i / 3 * Math.PI * 2) * 0.028, -0.87);
    g.add(port);
  }

  // Magazine — 20-rd PMAG
  const mag = box(0.059, 0.305, 0.094, body);
  mag.position.set(0, -0.16, 0.04);
  mag.rotation.x = -0.1;
  g.add(mag);
  const magFloor = box(0.063, 0.022, 0.098, dark);
  magFloor.position.set(0, -0.318, 0.04);
  g.add(magFloor);

  // Pistol grip
  const grip = box(0.073, 0.176, 0.086, dark);
  grip.position.set(0, -0.098, 0.22);
  grip.rotation.x = 0.3;
  g.add(grip);
  stippleGrip(g, metal, 0.038, -0.095, 0.088, 0.0, 0.14, 4, 5);

  // Buffer tube + collapsible stock
  const btube = cyl(0.027, 0.027, 0.22, dark);
  btube.position.set(0, 0.065, 0.36);
  g.add(btube);
  const stockBody = box(0.075, 0.14, 0.135, dark);
  stockBody.position.set(0, 0.034, 0.42);
  g.add(stockBody);

  const muzzle = addMuzzle(g, 0, 0.078, -0.92);
  return { group: g, muzzle };
}

// M16A2 — full-length barrel, triangular handguard, carry handle, fixed stock.
function buildM16(color) {
  const g = new THREE.Group();
  const body      = M('body',   color,    { roughness: 0.58, metalness: 0.28 });
  const furniture = M('accent', 0x14161c, { roughness: 0.72, metalness: 0.18 });
  const metal     = M('metal',  0x7c8289, { metalness: 0.74, roughness: 0.3  });

  // Upper receiver
  const upper = box(0.082, 0.082, 0.36, body);
  upper.position.set(0, 0.092, 0.06);
  g.add(upper);
  // Lower receiver
  const lower = box(0.08, 0.07, 0.34, furniture);
  lower.position.set(0, 0.022, 0.06);
  g.add(lower);

  // Carry handle (integral A2 style)
  const handleBase = box(0.04, 0.03, 0.26, body);
  handleBase.position.set(0, 0.148, 0.06);
  g.add(handleBase);
  const handleTop = box(0.03, 0.024, 0.28, body);
  handleTop.position.set(0, 0.168, 0.05);
  g.add(handleTop);
  // Rear sight aperture
  const rearApt = box(0.028, 0.045, 0.04, furniture);
  rearApt.position.set(0, 0.178, 0.15);
  g.add(rearApt);

  // Triangular ribbed handguard
  const hg = box(0.087, 0.092, 0.44, furniture);
  hg.position.set(0, 0.055, -0.34);
  g.add(hg);
  for (let i = 0; i < 6; i++) {
    const rib = box(0.092, 0.015, 0.022, furniture);
    rib.position.set(0, 0.098, -0.16 - i * 0.064);
    g.add(rib);
  }
  // Heat shield vents
  for (let i = 0; i < 5; i++) {
    const vent = box(0.022, 0.009, 0.04, metal);
    vent.position.set(0, 0.035, -0.18 - i * 0.068);
    g.add(vent);
  }

  // Full-length barrel
  const barrel = cyl(0.016, 0.014, 0.46, metal);
  barrel.position.set(0, 0.06, -0.77);
  g.add(barrel);
  // Gas tube
  const gtube = cyl(0.007, 0.007, 0.44, metal);
  gtube.position.set(0, 0.1, -0.56);
  g.add(gtube);
  // A2 flash hider
  const fh = cyl(0.022, 0.018, 0.065, furniture);
  fh.position.set(0, 0.06, -1.02);
  g.add(fh);

  // A-frame front sight base
  const fsb = box(0.038, 0.072, 0.048, furniture);
  fsb.position.set(0, 0.106, -0.6);
  g.add(fsb);
  // Front sight ears
  const fsL = box(0.004, 0.068, 0.044, metal);
  fsL.position.set(-0.022, 0.106, -0.6);
  g.add(fsL);
  const fsR = box(0.004, 0.068, 0.044, metal);
  fsR.position.set(0.022, 0.106, -0.6);
  g.add(fsR);
  const fsp = cyl(0.006, 0.006, 0.04, metal, 8, 0);
  fsp.position.set(0, 0.148, -0.6);
  g.add(fsp);

  // Magazine
  const mag = box(0.054, 0.228, 0.088, furniture);
  mag.position.set(0, -0.115, 0.02);
  mag.rotation.x = -0.12;
  g.add(mag);

  // Pistol grip
  const grip = box(0.068, 0.17, 0.08, furniture);
  grip.position.set(0, -0.088, 0.2);
  grip.rotation.x = 0.3;
  g.add(grip);
  stippleGrip(g, metal, 0.036, -0.088, 0.082, 0.0, 0.13, 4, 5);

  // Fixed solid A2 stock
  const stock = box(0.073, 0.124, 0.36, furniture);
  stock.position.set(0, 0.054, 0.38);
  g.add(stock);
  const buttplate = box(0.078, 0.17, 0.022, furniture);
  buttplate.position.set(0, 0.054, 0.565);
  g.add(buttplate);
  // Trapdoor
  const td = box(0.03, 0.06, 0.005, metal);
  td.position.set(0, 0.075, 0.556);
  g.add(td);

  const muzzle = addMuzzle(g, 0, 0.06, -1.055);
  return { group: g, muzzle };
}

// ===========================================================================
// HEAVY WEAPONS
// ===========================================================================

// M240-style belt-fed LMG
function buildLMG(color) {
  const g = new THREE.Group();
  const body  = M('body',   color,    { roughness: 0.52, metalness: 0.38 });
  const dark  = M('accent', 0x0f1216, { roughness: 0.58, metalness: 0.22 });
  const metal = M('metal',  0x6c7177, { metalness: 0.78, roughness: 0.32 });

  // Receiver
  const recv = box(0.118, 0.162, 0.52, body);
  recv.position.set(0, 0.052, 0.02);
  g.add(recv);

  // Feed cover
  const fc = box(0.118, 0.052, 0.36, body);
  fc.position.set(0, 0.158, -0.02);
  g.add(fc);
  // Feed cover latch
  const fcl = box(0.05, 0.018, 0.03, metal);
  fcl.position.set(0, 0.186, 0.14);
  g.add(fcl);

  // Carry handle
  const handle = box(0.038, 0.052, 0.15, dark);
  handle.position.set(0, 0.21, -0.04);
  g.add(handle);
  const handleBar = cyl(0.012, 0.012, 0.155, metal);
  handleBar.position.set(0, 0.21, -0.035);
  g.add(handleBar);

  // Long heavy barrel with fluted section
  const barrel = cyl(0.026, 0.022, 0.52, metal);
  barrel.position.set(0, 0.082, -0.58);
  g.add(barrel);
  // Flute cuts on barrel
  for (let i = 0; i < 6; i++) {
    const flute = box(0.006, 0.048, 0.44, dark);
    flute.rotation.z = i / 6 * Math.PI * 2;
    flute.position.set(Math.cos(i / 6 * Math.PI * 2) * 0.024, 0.082 + Math.sin(i / 6 * Math.PI * 2) * 0.024, -0.56);
    g.add(flute);
  }
  // Cooling rings
  for (let i = 0; i < 5; i++) {
    const ring = cyl(0.034, 0.034, 0.022, dark);
    ring.position.set(0, 0.082, -0.42 - i * 0.085);
    g.add(ring);
  }
  // Flash suppressor
  const fsup = cyl(0.035, 0.026, 0.08, dark);
  fsup.position.set(0, 0.082, -0.86);
  g.add(fsup);

  // Pistol grip
  const grip = box(0.073, 0.182, 0.09, dark);
  grip.position.set(0, -0.114, 0.22);
  grip.rotation.x = 0.28;
  g.add(grip);
  stippleGrip(g, metal, 0.038, -0.11, 0.092, 0.0, 0.15, 4, 5);

  // Butt stock (tubular)
  const sTop = box(0.048, 0.03, 0.26, dark);
  sTop.position.set(0, 0.13, 0.36);
  g.add(sTop);
  const sBot = box(0.048, 0.03, 0.26, dark);
  sBot.position.set(0, -0.02, 0.36);
  g.add(sBot);
  const sSpine = box(0.022, 0.185, 0.024, dark);
  sSpine.position.set(0, 0.055, 0.24);
  g.add(sSpine);
  const butt = box(0.058, 0.195, 0.028, dark);
  butt.position.set(0, 0.055, 0.49);
  g.add(butt);

  // Bipod (folded down position)
  const legL = cyl(0.011, 0.011, 0.3, metal, 8, Math.PI / 2.3);
  legL.position.set(-0.065, -0.085, -0.56);
  legL.rotation.z = 0.48;
  g.add(legL);
  const legR = cyl(0.011, 0.011, 0.3, metal, 8, Math.PI / 2.3);
  legR.position.set(0.065, -0.085, -0.56);
  legR.rotation.z = -0.48;
  g.add(legR);
  // Bipod hinge
  const bipodBase = box(0.072, 0.022, 0.035, dark);
  bipodBase.position.set(0, 0.04, -0.58);
  g.add(bipodBase);

  const muzzle = addMuzzle(g, 0, 0.082, -0.9);
  return { group: g, muzzle };
}

// RPG-7
function buildRPG(color) {
  const g = new THREE.Group();
  const tubeMat = M('body',    color,    { roughness: 0.42, metalness: 0.58 });
  const dark    = M('accent',  0x0f1215, { roughness: 0.58, metalness: 0.2  });
  const metal   = M('metal',   0x6c7177, { metalness: 0.82, roughness: 0.28 });
  const wood    = M('wood',    0xb58a4a, { roughness: 0.62, metalness: 0.05 });
  const warhead = M('special', 0x3f6b34, { roughness: 0.48, metalness: 0.32 });

  // Main launch tube
  const mainTube = cyl(0.052, 0.052, 0.98, tubeMat);
  mainTube.position.set(0, 0.062, -0.12);
  g.add(mainTube);
  knurledCollar(g, metal, 0, 0.062, -0.12, 0.058, 12);

  // Wood heat guard (central grip section)
  const woodGuard = cyl(0.064, 0.064, 0.32, wood);
  woodGuard.position.set(0, 0.062, -0.02);
  g.add(woodGuard);
  // Metal retaining rings
  const ringA = cyl(0.068, 0.068, 0.022, dark);
  ringA.position.set(0, 0.062, 0.14);
  g.add(ringA);
  const ringB = cyl(0.068, 0.068, 0.022, dark);
  ringB.position.set(0, 0.062, -0.18);
  g.add(ringB);

  // Flared venturi (opens rearward)
  const venturi = cone(0.1, 0.22, dark, 10, Math.PI / 2);
  venturi.position.set(0, 0.062, 0.46);
  g.add(venturi);
  // Rear blast shield ring
  const blastRing = cyl(0.072, 0.068, 0.02, metal);
  blastRing.position.set(0, 0.062, 0.36);
  g.add(blastRing);

  // Warhead — PG-7VL type
  const wShaft = cyl(0.032, 0.032, 0.14, metal);
  wShaft.position.set(0, 0.062, -0.62);
  g.add(wShaft);
  // Piezo nose fuse
  const piezo = cyl(0.014, 0.012, 0.05, metal);
  piezo.position.set(0, 0.062, -0.7);
  g.add(piezo);
  // Warhead body (ogive)
  const wBody = new THREE.Mesh(new THREE.SphereGeometry(0.062, 16, 14), warhead);
  wBody.scale.set(1, 1, 1.5);
  wBody.position.set(0, 0.062, -0.72);
  g.add(wBody);
  const wNose = cone(0.026, 0.14, warhead, 10, -Math.PI / 2);
  wNose.position.set(0, 0.062, -0.855);
  g.add(wNose);
  // Fins (4 boattail fins)
  for (let i = 0; i < 4; i++) {
    const fin = box(0.006, 0.045, 0.1, metal);
    fin.rotation.z = i / 4 * Math.PI * 2;
    fin.position.set(Math.cos(i / 4 * Math.PI * 2) * 0.036, 0.062 + Math.sin(i / 4 * Math.PI * 2) * 0.036, -0.57);
    g.add(fin);
  }

  // Pistol grip + trigger housing
  const grip = box(0.068, 0.17, 0.082, dark);
  grip.position.set(0, -0.082, 0.06);
  grip.rotation.x = 0.16;
  g.add(grip);
  stippleGrip(g, metal, 0.036, -0.08, 0.084, 0.0, 0.13, 3, 5);
  // Trigger guard
  const tgB = box(0.042, 0.013, 0.088, dark);
  tgB.position.set(0, -0.036, 0.04);
  g.add(tgB);
  const tgF = box(0.042, 0.038, 0.013, dark);
  tgF.position.set(0, -0.016, 0.0);
  g.add(tgF);
  const trig = box(0.014, 0.044, 0.016, metal);
  trig.position.set(0, -0.014, 0.03);
  g.add(trig);

  // Forward wood grip
  const foreGrip = box(0.058, 0.14, 0.07, wood);
  foreGrip.position.set(0, -0.042, -0.18);
  g.add(foreGrip);

  // Iron sights
  const sightFront = box(0.01, 0.065, 0.01, metal);
  sightFront.position.set(0, 0.146, -0.24);
  g.add(sightFront);
  const sightRear = box(0.04, 0.052, 0.01, dark);
  sightRear.position.set(0, 0.136, 0.02);
  g.add(sightRear);
  const sightRearApt = box(0.01, 0.036, 0.014, metal);
  sightRearApt.position.set(0, 0.148, 0.022);
  g.add(sightRearApt);

  const muzzle = addMuzzle(g, 0, 0.062, -0.94);
  return { group: g, muzzle };
}

// ===========================================================================
// SNIPER RIFLES
// ===========================================================================

function buildSniper(color) {
  const g = new THREE.Group();
  const body  = M('body',   color,    { roughness: 0.52, metalness: 0.32 });
  const dark  = M('accent', 0x101316, { roughness: 0.58, metalness: 0.22 });
  const metal = M('metal',  0x8a9097, { metalness: 0.82, roughness: 0.22 });

  // Upper/lower receivers
  const upper = box(0.078, 0.078, 0.52, dark);
  upper.position.set(0, 0.092, 0.0);
  g.add(upper);
  const lower = box(0.076, 0.068, 0.46, body);
  lower.position.set(0, 0.022, 0.02);
  g.add(lower);

  // Scope rail
  const rail = box(0.038, 0.02, 0.46, metal);
  rail.position.set(0, 0.144, -0.02);
  g.add(rail);
  picRail(g, dark, 0, 0.156, 0.2, 0.46);

  // Scope — variable magnification
  const scopeTube = cyl(0.027, 0.027, 0.35, dark, 16, 0);
  scopeTube.position.set(0, 0.188, -0.06);
  g.add(scopeTube);
  const obj = cyl(0.038, 0.034, 0.075, dark, 16, 0);
  obj.position.set(0, 0.188, -0.252);
  g.add(obj);
  const eye = cyl(0.035, 0.031, 0.065, dark, 16, 0);
  eye.position.set(0, 0.188, 0.135);
  g.add(eye);
  // Scope rings
  const ringA = box(0.052, 0.04, 0.025, metal);
  ringA.position.set(0, 0.178, -0.16);
  g.add(ringA);
  const ringB = box(0.052, 0.04, 0.025, metal);
  ringB.position.set(0, 0.178, 0.06);
  g.add(ringB);
  // Elevation + windage turrets
  const elev = cyl(0.012, 0.012, 0.03, metal, 8, 0);
  elev.position.set(0, 0.222, -0.052);
  g.add(elev);
  const wind = cyl(0.012, 0.012, 0.03, metal, 8, 0);
  wind.position.set(-0.032, 0.188, -0.052);
  wind.rotation.z = Math.PI / 2;
  g.add(wind);
  // Scope reticle (glass lens)
  const lensF = cyl(0.025, 0.025, 0.01, M('special', 0x162b1e, { roughness: 0.08, metalness: 0.1, emissive: 0x0a2015, emissiveIntensity: 0.15 }), 16, 0);
  lensF.position.set(0, 0.188, -0.29);
  g.add(lensF);

  // Long barrel
  const barrel = cyl(0.017, 0.013, 0.55, metal);
  barrel.position.set(0, 0.08, -0.56);
  g.add(barrel);
  // Threaded muzzle + brake
  const mB = cyl(0.026, 0.022, 0.065, dark);
  mB.position.set(0, 0.08, -0.86);
  g.add(mB);
  // Brake vents
  for (let i = 0; i < 4; i++) {
    const v = box(0.006, 0.018, 0.042, metal);
    v.position.set(Math.cos(i / 4 * Math.PI * 2) * 0.024, 0.08 + Math.sin(i / 4 * Math.PI * 2) * 0.024, -0.857);
    g.add(v);
  }

  // Pistol grip
  const grip = box(0.068, 0.17, 0.08, dark);
  grip.position.set(0, -0.082, 0.2);
  grip.rotation.x = 0.3;
  g.add(grip);
  stippleGrip(g, metal, 0.036, -0.08, 0.082, 0.0, 0.13, 4, 5);

  // Bolt handle
  const boltBody = box(0.044, 0.024, 0.026, metal);
  boltBody.position.set(0.055, 0.12, 0.08);
  g.add(boltBody);
  const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), metal);
  boltKnob.position.set(0.075, 0.12, 0.08);
  g.add(boltKnob);

  // Stock
  const stock = box(0.068, 0.115, 0.36, dark);
  stock.position.set(0, 0.054, 0.38);
  g.add(stock);
  const cheek = box(0.055, 0.035, 0.24, body);
  cheek.position.set(0, 0.125, 0.36);
  g.add(cheek);
  const buttplate = box(0.072, 0.145, 0.022, dark);
  buttplate.position.set(0, 0.05, 0.565);
  g.add(buttplate);

  const muzzle = addMuzzle(g, 0, 0.08, -0.895);
  return { group: g, muzzle };
}

// Precision bolt-action — chassis stock, big variable optic, bipod.
function buildBoltSniper(color) {
  const g = new THREE.Group();
  const body  = M('body',   color,    { roughness: 0.48, metalness: 0.35 });
  const dark  = M('accent', 0x0d1015, { roughness: 0.58, metalness: 0.22 });
  const metal = M('metal',  0x8a9097, { metalness: 0.84, roughness: 0.2  });

  // Aluminium chassis (flat-dark-earth style, body color)
  const chassis = box(0.082, 0.125, 0.6, body);
  chassis.position.set(0, 0.065, 0.04);
  g.add(chassis);

  // Handguard (aluminum)
  const hg = box(0.068, 0.078, 0.38, dark);
  hg.position.set(0, 0.072, -0.38);
  g.add(hg);
  railSlats(g, metal, 5, 0, 0.116, -0.22, 0.072, 0.075, 0.012);
  railSlats(g, metal, 3, 0.036, 0.065, -0.24, 0.1, 0.007, 0.04);

  // Top rail (full-length)
  const topRail = box(0.04, 0.022, 0.84, metal);
  topRail.position.set(0, 0.154, -0.17);
  g.add(topRail);
  picRail(g, dark, 0, 0.167, 0.2, 0.84);

  // Heavy variable scope (Schmidt & Bender style)
  const scopeTube = cyl(0.032, 0.032, 0.38, dark, 16, 0);
  scopeTube.position.set(0, 0.202, -0.04);
  g.add(scopeTube);
  const scopeObj = cyl(0.048, 0.042, 0.082, dark, 16, 0);
  scopeObj.position.set(0, 0.202, -0.265);
  g.add(scopeObj);
  const scopeEye = cyl(0.044, 0.038, 0.072, dark, 16, 0);
  scopeEye.position.set(0, 0.202, 0.163);
  g.add(scopeEye);
  const scopeRingA = box(0.058, 0.044, 0.028, metal);
  scopeRingA.position.set(0, 0.19, -0.14);
  g.add(scopeRingA);
  const scopeRingB = box(0.058, 0.044, 0.028, metal);
  scopeRingB.position.set(0, 0.19, 0.1);
  g.add(scopeRingB);
  // Turrets
  const elevTur = cyl(0.016, 0.016, 0.038, metal, 8, 0);
  elevTur.position.set(0, 0.24, -0.02);
  g.add(elevTur);
  const windTur = cyl(0.016, 0.016, 0.038, metal, 8, 0);
  windTur.position.set(-0.036, 0.202, -0.02);
  windTur.rotation.z = Math.PI / 2;
  g.add(windTur);
  // Lenses
  const lensGlassMat = M('special', 0x152a1f, { roughness: 0.06, metalness: 0.08, emissive: 0x091a12, emissiveIntensity: 0.18 });
  const lensF = cyl(0.038, 0.038, 0.01, lensGlassMat, 16, 0);
  lensF.position.set(0, 0.202, -0.307);
  g.add(lensF);
  const lensR = cyl(0.034, 0.034, 0.01, lensGlassMat, 16, 0);
  lensR.position.set(0, 0.202, 0.2);
  g.add(lensR);

  // Heavy bull barrel
  const barrel = cyl(0.02, 0.016, 0.52, metal);
  barrel.position.set(0, 0.075, -0.65);
  g.add(barrel);
  // Muzzle brake (large, 3-port)
  const mbBody = cyl(0.034, 0.03, 0.082, dark);
  mbBody.position.set(0, 0.075, -0.93);
  g.add(mbBody);
  for (let i = 0; i < 4; i++) {
    const port = box(0.007, 0.024, 0.022, metal);
    port.position.set(Math.cos(i / 4 * Math.PI * 2) * 0.03, 0.075 + Math.sin(i / 4 * Math.PI * 2) * 0.03, -0.92);
    g.add(port);
  }

  // Pistol grip
  const grip = box(0.07, 0.175, 0.084, dark);
  grip.position.set(0, -0.086, 0.22);
  grip.rotation.x = 0.3;
  g.add(grip);
  stippleGrip(g, metal, 0.037, -0.082, 0.086, 0.0, 0.14, 4, 5);

  // Bolt handle
  const boltBody = box(0.048, 0.026, 0.028, metal);
  boltBody.position.set(0.062, 0.125, 0.1);
  g.add(boltBody);
  const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), metal);
  boltKnob.position.set(0.085, 0.122, 0.1);
  g.add(boltKnob);

  // Folding chassis stock
  const stockFold = box(0.072, 0.145, 0.32, dark);
  stockFold.position.set(0, 0.044, 0.42);
  g.add(stockFold);
  const cheek = box(0.062, 0.038, 0.22, body);
  cheek.position.set(0, 0.132, 0.42);
  g.add(cheek);
  const buttHook = box(0.074, 0.055, 0.035, dark);
  buttHook.position.set(0, 0.01, 0.6);
  g.add(buttHook);

  // Bipod (Harris-style)
  const bipodBase = box(0.066, 0.022, 0.038, dark);
  bipodBase.position.set(0, 0.042, -0.5);
  g.add(bipodBase);
  const legL = cyl(0.01, 0.01, 0.32, metal, 8, Math.PI / 2.5);
  legL.position.set(-0.072, -0.1, -0.5);
  legL.rotation.z = 0.44;
  g.add(legL);
  const legR = cyl(0.01, 0.01, 0.32, metal, 8, Math.PI / 2.5);
  legR.position.set(0.072, -0.1, -0.5);
  legR.rotation.z = -0.44;
  g.add(legR);
  // Leg feet
  const footL = box(0.022, 0.008, 0.022, dark);
  footL.position.set(-0.138, -0.228, -0.48);
  g.add(footL);
  const footR = box(0.022, 0.008, 0.022, dark);
  footR.position.set(0.138, -0.228, -0.48);
  g.add(footR);

  const muzzle = addMuzzle(g, 0, 0.075, -0.975);
  return { group: g, muzzle };
}

// ===========================================================================
// MELEE — Reaver Blade
// ===========================================================================

function buildSword(color) {
  const g = new THREE.Group();
  const bladeMat = M('metal', color,    { metalness: 0.88, roughness: 0.16 });
  const hiltMat  = M('wood',  0x2b1d12, { metalness: 0.08, roughness: 0.78 });
  const guardMat = M('special', 0xb08a3c, { metalness: 0.82, roughness: 0.3 });
  const darkMat  = M('accent', 0x1a1a1a, { metalness: 0.5,  roughness: 0.5 });

  // Handle with wrapped leather look (alternating bands)
  const handle = cyl(0.022, 0.02, 0.2, hiltMat);
  handle.position.set(0, -0.02, 0.16);
  g.add(handle);
  for (let i = 0; i < 7; i++) {
    const wrap = cyl(0.024, 0.024, 0.018, i % 2 === 0 ? darkMat : hiltMat);
    wrap.position.set(0, -0.02, 0.065 + i * 0.025);
    g.add(wrap);
  }

  // Pommel (fluted sphere)
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), guardMat);
  pommel.position.set(0, -0.02, 0.27);
  g.add(pommel);
  // Pommel cap
  const pomCap = cyl(0.018, 0.018, 0.012, darkMat, 8, 0);
  pomCap.position.set(0, -0.02, 0.298);
  g.add(pomCap);

  // Cross-guard (straight, double-sided quillon)
  const guard = box(0.175, 0.026, 0.042, guardMat);
  guard.position.set(0, -0.02, 0.06);
  g.add(guard);
  // Quillon tips
  const qtL = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), guardMat);
  qtL.position.set(-0.094, -0.02, 0.06);
  g.add(qtL);
  const qtR = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), guardMat);
  qtR.position.set(0.094, -0.02, 0.06);
  g.add(qtR);

  // Ricasso (unsharpened base of blade)
  const ricasso = box(0.038, 0.014, 0.12, bladeMat);
  ricasso.position.set(0, -0.02, -0.02);
  g.add(ricasso);

  // Main blade (tapers to edge)
  const blade = box(0.033, 0.011, 0.66, bladeMat);
  blade.position.set(0, -0.02, -0.37);
  g.add(blade);

  // Fuller groove (blood groove along blade)
  const fuller = box(0.011, 0.004, 0.62, darkMat);
  fuller.position.set(0, -0.02, -0.37);
  g.add(fuller);

  // Edge bevel strips (thin strips at angle along both sides)
  const bevelL = box(0.003, 0.014, 0.66, bladeMat);
  bevelL.position.set(-0.018, -0.02, -0.37);
  g.add(bevelL);
  const bevelR = box(0.003, 0.014, 0.66, bladeMat);
  bevelR.position.set(0.018, -0.02, -0.37);
  g.add(bevelR);

  // Blade tip (pointed cone)
  const tip = cone(0.018, 0.09, bladeMat, 8, -Math.PI / 2);
  tip.position.set(0, -0.02, -0.745);
  g.add(tip);

  const muzzle = addMuzzle(g, 0, -0.02, -0.8);
  return { group: g, muzzle };
}

// Tactical combat knife — sci-fi tanto. Roles match the sword so melee skins
// (blade=metal, groove=accent, guard=special, grip=wood) recolor it identically.
function buildKnife(color) {
  const g = new THREE.Group();
  const bladeMat = M('metal',   color,    { metalness: 0.9,  roughness: 0.14 });
  const gripMat  = M('wood',    0x16181c, { metalness: 0.1,  roughness: 0.82 });
  const guardMat = M('special', 0x2a2e34, { metalness: 0.78, roughness: 0.32 });
  const darkMat  = M('accent',  0x101216, { metalness: 0.5,  roughness: 0.5  });

  // Grip — wrapped paracord handle (alternating bands)
  const handle = cyl(0.016, 0.014, 0.13, gripMat);
  handle.position.set(0, -0.02, 0.12);
  g.add(handle);
  for (let i = 0; i < 6; i++) {
    const wrap = cyl(0.018, 0.018, 0.012, i % 2 === 0 ? darkMat : gripMat);
    wrap.position.set(0, -0.02, 0.07 + i * 0.018);
    g.add(wrap);
  }
  // Pommel / lanyard hole cap
  const pommel = box(0.024, 0.024, 0.022, guardMat);
  pommel.position.set(0, -0.02, 0.19);
  g.add(pommel);

  // Finger guard
  const guard = box(0.07, 0.02, 0.022, guardMat);
  guard.position.set(0, -0.02, 0.045);
  g.add(guard);

  // Ricasso (base of blade)
  const ricasso = box(0.028, 0.012, 0.05, bladeMat);
  ricasso.position.set(0, -0.02, 0.01);
  g.add(ricasso);

  // Main blade — tanto profile, tapering
  const blade = box(0.03, 0.01, 0.26, bladeMat);
  blade.position.set(0, -0.02, -0.14);
  g.add(blade);
  // Blade flat / fuller groove
  const groove = box(0.009, 0.0035, 0.22, darkMat);
  groove.position.set(0, -0.014, -0.13);
  g.add(groove);
  // Angled tanto tip
  const tip = cone(0.016, 0.07, bladeMat, 6, -Math.PI / 2);
  tip.position.set(0, -0.02, -0.3);
  g.add(tip);
  // Serration spine detail
  for (let i = 0; i < 5; i++) {
    const serr = box(0.006, 0.012, 0.01, bladeMat);
    serr.position.set(0, -0.012, -0.04 - i * 0.022);
    g.add(serr);
  }

  const muzzle = addMuzzle(g, 0, -0.02, -0.34);
  return { group: g, muzzle };
}

// ===========================================================================
// Energy / Halo-style weapon builder (shared by all new Spartan weapons)
// ===========================================================================

function buildEnergyWeapon(color) {
  const g    = new THREE.Group();
  const body = M('body', color,    { roughness: 0.35, metalness: 0.75 });
  const trim = M('trim', 0x44aaff, { roughness: 0.20, metalness: 0.90,
                                      emissive: 0x003366, emissiveIntensity: 0.4 });
  const glow = M('glow', 0x00ccff, { roughness: 0.10, metalness: 0.50,
                                      emissive: 0x00aaff, emissiveIntensity: 1.2,
                                      transparent: true, opacity: 0.85 });
  const dark = M('dark', 0x080c14, { roughness: 0.60, metalness: 0.50 });

  const frame = box(0.06,  0.11, 0.40, body);  g.add(frame);
  const rail  = box(0.04,  0.04, 0.44, trim);  rail.position.set(0, 0.08, 0); g.add(rail);
  const grip  = box(0.055, 0.14, 0.07, dark);  grip.position.set(0, -0.10, 0.08); g.add(grip);
  const brl   = cyl(0.018, 0.018, 0.14, body, 8, 0); brl.position.set(0, 0.01, -0.27); g.add(brl);
  const core  = box(0.03,  0.07, 0.18, glow);  core.position.set(0, 0.02, 0.02); g.add(core);
  const tg    = box(0.03,  0.03, 0.09, trim);  tg.position.set(0, -0.04, 0.04); g.add(tg);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.01, -0.34); g.add(muzzle);
  g.position.set(0.06, -0.10, -0.30);
  return { group: g, muzzle };
}

function buildGravityHammer(color) {
  const g    = new THREE.Group();
  const body = M('body', color,    { roughness: 0.40, metalness: 0.70 });
  const glow = M('glow', 0xff6600, { roughness: 0.10, metalness: 0.30,
                                      emissive: 0xff4400, emissiveIntensity: 1.5,
                                      transparent: true, opacity: 0.90 });
  const dark = M('dark', 0x0a0804, { roughness: 0.60, metalness: 0.50 });

  const shaft = cyl(0.025, 0.025, 0.70, body, 8, 0); shaft.position.set(0, -0.05, 0.10); g.add(shaft);
  const head  = box(0.22,  0.18, 0.14, body); head.position.set(0,  0.03, -0.28); g.add(head);
  const gl1   = box(0.24,  0.04, 0.16, glow); gl1.position.set(0,   0.10, -0.28); g.add(gl1);
  const gl2   = box(0.24,  0.04, 0.16, glow); gl2.position.set(0,  -0.04, -0.28); g.add(gl2);
  const grip  = box(0.06,  0.14, 0.06, dark); grip.position.set(0, -0.12,  0.18); g.add(grip);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.03, -0.36); g.add(muzzle);
  g.position.set(0.10, -0.12, -0.20);
  return { group: g, muzzle };
}

// ===========================================================================
// Registry + export
// ===========================================================================

const BUILDERS = {
  sidearm:      buildSidearm,
  uzi:          buildUzi,
  levershotgun: buildLeverShotgun,
  m4:           buildM4,
  m16:          buildM16,
  rifle:        buildRifle,
  lmg:          buildLMG,
  rpg:          buildRPG,
  boltsniper:   buildBoltSniper,
  sword:        buildSword,
  knife:        buildKnife,
  // Halo/Destiny expanded arsenal
  magnum:       buildEnergyWeapon,
  battlerifle:  buildEnergyWeapon,
  needler:      buildEnergyWeapon,
  plasmarifle:  buildEnergyWeapon,
  dmr:          buildEnergyWeapon,
  fuelrod:      buildEnergyWeapon,
  concussion:   buildEnergyWeapon,
  energyshotgun: buildEnergyWeapon,
  ghammer:      buildGravityHammer,
};

export function buildWeaponModel(weaponDef) {
  // Prefer Blender GLB when already loaded
  const glb = _buildFromGLB(weaponDef);
  if (glb) return glb;

  // Fall back to procedural
  const builder = BUILDERS[weaponDef.id] ?? buildEnergyWeapon;
  const { group, muzzle } = builder(weaponDef.color);
  group.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return { group, muzzle };
}
