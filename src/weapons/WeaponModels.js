import * as THREE from 'three';

// Material factory. `role` tags the material so the weapon-skin system can
// recolor it: 'body' (main shell), 'accent' (furniture/grips), 'metal'
// (barrels/rails), 'wood' and 'special' (left untouched by skins).
function M(role, color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.5, ...opts });
  m.userData.role = role;
  return m;
}

function addMuzzle(group, x, y, z) {
  const muzzle = new THREE.Object3D();
  muzzle.position.set(x, y, z);
  group.add(muzzle);
  return muzzle;
}

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  return m;
}

function cyl(r1, r2, h, material, rotX = Math.PI / 2) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 12), material);
  m.rotation.x = rotX;
  return m;
}

function cone(r, h, material, rotX = -Math.PI / 2) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), material);
  m.rotation.x = rotX;
  return m;
}

// Add evenly spaced slats along Z to fake an M-LOK / vented handguard.
function railSlats(group, mat, count, x, y, zStart, zStep, w = 0.08, t = 0.012) {
  for (let i = 0; i < count; i++) {
    const slat = box(w, t, 0.03, mat);
    slat.position.set(x, y, zStart - i * zStep);
    group.add(slat);
  }
}

function buildSidearm(color) {
  const group = new THREE.Group();
  const body = M('body', color, { roughness: 0.55, metalness: 0.35 });
  const slideMat = M('accent', 0x1a1c20, { roughness: 0.4, metalness: 0.65 });
  const metal = M('metal', 0x6c7177, { metalness: 0.8, roughness: 0.3 });

  const slide = box(0.082, 0.085, 0.34, slideMat);
  slide.position.set(0, 0.06, -0.05);
  group.add(slide);

  const frame = box(0.07, 0.05, 0.26, body);
  frame.position.set(0, 0.0, -0.02);
  group.add(frame);

  const grip = box(0.08, 0.2, 0.1, body);
  grip.position.set(0, -0.1, 0.12);
  grip.rotation.x = 0.22;
  group.add(grip);

  const barrel = cyl(0.016, 0.016, 0.06, metal);
  barrel.position.set(0, 0.06, -0.24);
  group.add(barrel);

  const trigger = box(0.018, 0.05, 0.025, slideMat);
  trigger.position.set(0, -0.02, 0.02);
  group.add(trigger);

  const muzzle = addMuzzle(group, 0, 0.06, -0.28);
  return { group, muzzle };
}

// Glock 17 — blocky polymer frame, slim slide with serrations, no hammer.
function buildGlock(color) {
  const group = new THREE.Group();
  const frameMat = M('body', color, { roughness: 0.7, metalness: 0.15 });
  const slideMat = M('accent', 0x141619, { roughness: 0.42, metalness: 0.6 });
  const metal = M('metal', 0x6c7177, { metalness: 0.8, roughness: 0.3 });

  const slide = box(0.078, 0.09, 0.36, slideMat);
  slide.position.set(0, 0.07, -0.05);
  group.add(slide);

  // rear slide serrations
  for (let i = 0; i < 5; i++) {
    const s = box(0.082, 0.07, 0.008, metal);
    s.position.set(0, 0.07, 0.08 + i * 0.018);
    group.add(s);
  }

  const frame = box(0.072, 0.055, 0.32, frameMat);
  frame.position.set(0, 0.0, -0.02);
  group.add(frame);

  const grip = box(0.078, 0.22, 0.1, frameMat);
  grip.position.set(0, -0.13, 0.1);
  grip.rotation.x = 0.16;
  group.add(grip);

  const triggerGuard = box(0.05, 0.018, 0.09, frameMat);
  triggerGuard.position.set(0, -0.045, 0.0);
  group.add(triggerGuard);

  const trigger = box(0.016, 0.045, 0.02, slideMat);
  trigger.position.set(0, -0.02, 0.0);
  group.add(trigger);

  const barrel = cyl(0.015, 0.015, 0.05, metal);
  barrel.position.set(0, 0.07, -0.25);
  group.add(barrel);

  const sight = box(0.02, 0.018, 0.02, metal);
  sight.position.set(0, 0.12, -0.18);
  group.add(sight);

  const muzzle = addMuzzle(group, 0, 0.07, -0.3);
  return { group, muzzle };
}

function buildSMG(color) {
  const group = new THREE.Group();
  const body = M('body', color);
  const dark = M('accent', 0x14161a, { roughness: 0.7 });
  const metal = M('metal', 0x71777e, { metalness: 0.8, roughness: 0.32 });

  const receiver = box(0.1, 0.12, 0.42, body);
  receiver.position.set(0, 0.04, -0.05);
  group.add(receiver);

  const rail = box(0.04, 0.022, 0.34, metal);
  rail.position.set(0, 0.105, -0.08);
  group.add(rail);

  const mag = box(0.06, 0.22, 0.08, dark);
  mag.position.set(0, -0.13, -0.05);
  mag.rotation.x = -0.15;
  group.add(mag);

  const stock = box(0.06, 0.07, 0.22, dark);
  stock.position.set(0, 0.04, 0.27);
  group.add(stock);

  const grip = box(0.07, 0.18, 0.08, dark);
  grip.position.set(0, -0.09, 0.12);
  grip.rotation.x = 0.3;
  group.add(grip);

  const barrel = cyl(0.02, 0.02, 0.22, metal);
  barrel.position.set(0, 0.05, -0.36);
  group.add(barrel);

  const muzzle = addMuzzle(group, 0, 0.05, -0.5);
  return { group, muzzle };
}

// Uzi — boxy stamped receiver, magazine through the pistol grip, folding stock.
function buildUzi(color) {
  const group = new THREE.Group();
  const body = M('body', color, { roughness: 0.45, metalness: 0.55 });
  const dark = M('accent', 0x0f1013, { roughness: 0.6 });
  const metal = M('metal', 0x6c7177, { metalness: 0.8, roughness: 0.32 });

  const receiver = box(0.11, 0.13, 0.3, body);
  receiver.position.set(0, 0.05, 0.0);
  group.add(receiver);

  // ribbed top cover
  for (let i = 0; i < 4; i++) {
    const rib = box(0.06, 0.012, 0.26, dark);
    rib.position.set(0, 0.118 + i * 0.001, 0.0);
    group.add(rib);
  }

  const barrel = cyl(0.02, 0.02, 0.16, metal);
  barrel.position.set(0, 0.05, -0.22);
  group.add(barrel);
  const barrelNut = cyl(0.03, 0.03, 0.04, body);
  barrelNut.position.set(0, 0.05, -0.16);
  group.add(barrelNut);

  const grip = box(0.085, 0.16, 0.1, dark);
  grip.position.set(0, -0.06, 0.04);
  group.add(grip);
  const mag = box(0.05, 0.24, 0.075, dark);
  mag.position.set(0, -0.22, 0.04);
  group.add(mag);

  const trigger = box(0.018, 0.045, 0.025, metal);
  trigger.position.set(0, -0.02, -0.05);
  group.add(trigger);

  const stockArm = box(0.028, 0.022, 0.2, metal);
  stockArm.position.set(0, 0.06, 0.24);
  group.add(stockArm);
  const buttplate = box(0.09, 0.07, 0.025, dark);
  buttplate.position.set(0, 0.06, 0.35);
  group.add(buttplate);

  const muzzle = addMuzzle(group, 0, 0.05, -0.32);
  return { group, muzzle };
}

function buildShotgun(color) {
  const group = new THREE.Group();
  const body = M('body', color, { roughness: 0.6 });
  const dark = M('accent', 0x16181c, { roughness: 0.7 });
  const metal = M('metal', 0x71777e, { metalness: 0.8, roughness: 0.3 });

  const barrel = cyl(0.032, 0.03, 0.55, metal);
  barrel.position.set(0, 0.07, -0.2);
  group.add(barrel);

  const tube = cyl(0.02, 0.02, 0.5, metal);
  tube.position.set(0, 0.035, -0.18);
  group.add(tube);

  const pump = box(0.085, 0.08, 0.18, dark);
  pump.position.set(0, 0.03, -0.18);
  group.add(pump);

  const receiver = box(0.09, 0.1, 0.2, body);
  receiver.position.set(0, 0.05, 0.06);
  group.add(receiver);

  const stock = box(0.07, 0.1, 0.3, body);
  stock.position.set(0, 0.02, 0.32);
  stock.rotation.x = -0.08;
  group.add(stock);

  const grip = box(0.07, 0.18, 0.08, dark);
  grip.position.set(0, -0.09, 0.13);
  grip.rotation.x = 0.3;
  group.add(grip);

  const muzzle = addMuzzle(group, 0, 0.07, -0.48);
  return { group, muzzle };
}

// Lever-action shotgun — wood stock + receiver, M-LOK rail forend, lever loop.
function buildLeverShotgun(color) {
  const group = new THREE.Group();
  const wood = M('wood', color, { roughness: 0.7, metalness: 0.08 });
  const dark = M('accent', 0x14161a, { roughness: 0.6 });
  const metal = M('metal', 0x71777e, { metalness: 0.8, roughness: 0.3 });

  const receiver = box(0.085, 0.13, 0.22, dark);
  receiver.position.set(0, 0.05, 0.05);
  group.add(receiver);

  const barrel = cyl(0.026, 0.024, 0.5, metal);
  barrel.position.set(0, 0.08, -0.32);
  group.add(barrel);

  const tube = cyl(0.018, 0.018, 0.46, metal);
  tube.position.set(0, 0.035, -0.3);
  group.add(tube);

  const forend = box(0.07, 0.06, 0.24, dark);
  forend.position.set(0, 0.04, -0.22);
  group.add(forend);
  railSlats(group, metal, 3, 0, 0.075, -0.14, 0.07, 0.075, 0.01);

  const stock = box(0.07, 0.12, 0.32, wood);
  stock.position.set(0, 0.02, 0.32);
  stock.rotation.x = -0.06;
  group.add(stock);

  // lever loop
  const leverFront = box(0.02, 0.1, 0.02, metal);
  leverFront.position.set(0, -0.07, 0.0);
  group.add(leverFront);
  const leverBottom = box(0.02, 0.02, 0.12, metal);
  leverBottom.position.set(0, -0.12, 0.05);
  group.add(leverBottom);
  const leverBack = box(0.02, 0.08, 0.02, metal);
  leverBack.position.set(0, -0.08, 0.1);
  group.add(leverBack);

  const muzzle = addMuzzle(group, 0, 0.08, -0.6);
  return { group, muzzle };
}

function buildRifle(color) {
  const group = new THREE.Group();
  const body = M('body', color);
  const dark = M('accent', 0x15171b, { roughness: 0.65 });
  const metal = M('metal', 0x80868d, { metalness: 0.75, roughness: 0.32 });

  const receiver = box(0.09, 0.13, 0.46, body);
  receiver.position.set(0, 0.06, -0.02);
  group.add(receiver);

  const barrel = cyl(0.02, 0.018, 0.32, metal);
  barrel.position.set(0, 0.07, -0.42);
  group.add(barrel);

  const mag = box(0.06, 0.24, 0.09, dark);
  mag.position.set(0, -0.14, -0.08);
  mag.rotation.x = -0.2;
  group.add(mag);

  const stock = box(0.07, 0.09, 0.26, dark);
  stock.position.set(0, 0.04, 0.32);
  group.add(stock);

  const grip = box(0.07, 0.18, 0.08, dark);
  grip.position.set(0, -0.1, 0.13);
  grip.rotation.x = 0.3;
  group.add(grip);

  const rail = box(0.04, 0.03, 0.3, metal);
  rail.position.set(0, 0.135, -0.05);
  group.add(rail);

  const muzzle = addMuzzle(group, 0, 0.07, -0.6);
  return { group, muzzle };
}

// M4 carbine — flat-top upper, free-float M-LOK handguard, collapsible stock.
function buildM4(color) {
  const group = new THREE.Group();
  const body = M('body', color);
  const dark = M('accent', 0x121418, { roughness: 0.6 });
  const metal = M('metal', 0x80868d, { metalness: 0.7, roughness: 0.35 });

  const receiver = box(0.085, 0.12, 0.34, body);
  receiver.position.set(0, 0.06, 0.04);
  group.add(receiver);

  const handguard = box(0.075, 0.085, 0.42, dark);
  handguard.position.set(0, 0.07, -0.32);
  group.add(handguard);
  railSlats(group, metal, 5, 0, 0.115, -0.18, 0.075, 0.082);

  const barrel = cyl(0.017, 0.016, 0.2, metal);
  barrel.position.set(0, 0.07, -0.6);
  group.add(barrel);
  const flashHider = cyl(0.026, 0.022, 0.06, dark);
  flashHider.position.set(0, 0.07, -0.71);
  group.add(flashHider);

  const rail = box(0.04, 0.022, 0.74, metal);
  rail.position.set(0, 0.13, -0.16);
  group.add(rail);
  const frontSight = box(0.018, 0.05, 0.03, dark);
  frontSight.position.set(0, 0.165, -0.5);
  group.add(frontSight);

  const mag = box(0.055, 0.26, 0.085, dark);
  mag.position.set(0, -0.13, 0.02);
  mag.rotation.x = -0.12;
  group.add(mag);

  const grip = box(0.07, 0.17, 0.08, dark);
  grip.position.set(0, -0.09, 0.18);
  grip.rotation.x = 0.32;
  group.add(grip);

  const tube = cyl(0.024, 0.024, 0.22, dark);
  tube.position.set(0, 0.06, 0.3);
  group.add(tube);
  const stock = box(0.07, 0.13, 0.12, dark);
  stock.position.set(0, 0.03, 0.36);
  group.add(stock);

  const muzzle = addMuzzle(group, 0, 0.07, -0.76);
  return { group, muzzle };
}

// AR-10 .308 — like an M4 but beefier: longer M-LOK rail, 20-rd PMAG, red dot.
function buildAR10(color) {
  const group = new THREE.Group();
  const body = M('body', color);
  const dark = M('accent', 0x101216, { roughness: 0.6 });
  const metal = M('metal', 0x7c8289, { metalness: 0.72, roughness: 0.34 });
  const glass = M('special', 0x163b2a, { metalness: 0.2, roughness: 0.15, emissive: 0x0b2a1c });

  const receiver = box(0.095, 0.135, 0.38, body);
  receiver.position.set(0, 0.06, 0.06);
  group.add(receiver);

  const handguard = box(0.085, 0.095, 0.5, dark);
  handguard.position.set(0, 0.07, -0.36);
  group.add(handguard);
  railSlats(group, metal, 6, 0, 0.125, -0.18, 0.072, 0.09);

  const barrel = cyl(0.02, 0.019, 0.22, metal);
  barrel.position.set(0, 0.07, -0.68);
  group.add(barrel);
  const muzzleBrake = cyl(0.03, 0.026, 0.07, dark);
  muzzleBrake.position.set(0, 0.07, -0.82);
  group.add(muzzleBrake);

  const rail = box(0.045, 0.024, 0.84, metal);
  rail.position.set(0, 0.142, -0.2);
  group.add(rail);

  // red dot optic
  const opticBase = box(0.05, 0.04, 0.1, dark);
  opticBase.position.set(0, 0.17, 0.0);
  group.add(opticBase);
  const opticTube = cyl(0.03, 0.03, 0.09, dark, 0);
  opticTube.position.set(0, 0.22, 0.0);
  group.add(opticTube);
  const lens = cyl(0.026, 0.026, 0.012, glass, 0);
  lens.position.set(0, 0.22, -0.04);
  group.add(lens);

  const mag = box(0.06, 0.3, 0.095, dark);
  mag.position.set(0, -0.15, 0.04);
  mag.rotation.x = -0.1;
  group.add(mag);

  const grip = box(0.075, 0.18, 0.085, dark);
  grip.position.set(0, -0.1, 0.2);
  grip.rotation.x = 0.32;
  group.add(grip);

  const tube = cyl(0.026, 0.026, 0.22, dark);
  tube.position.set(0, 0.06, 0.32);
  group.add(tube);
  const stock = box(0.075, 0.15, 0.14, dark);
  stock.position.set(0, 0.03, 0.4);
  group.add(stock);

  const muzzle = addMuzzle(group, 0, 0.07, -0.88);
  return { group, muzzle };
}

// M16A2 — full-length barrel, triangular handguard, carry handle, fixed stock.
function buildM16(color) {
  const group = new THREE.Group();
  const body = M('body', color);
  const furniture = M('accent', 0x16181c, { roughness: 0.75, metalness: 0.2 });
  const metal = M('metal', 0x7c8289, { metalness: 0.72, roughness: 0.34 });

  const receiver = box(0.085, 0.1, 0.34, body);
  receiver.position.set(0, 0.06, 0.06);
  group.add(receiver);

  // carry handle with sight bridge
  const handleFront = box(0.03, 0.05, 0.03, body);
  handleFront.position.set(0, 0.13, -0.02);
  group.add(handleFront);
  const handleRear = box(0.04, 0.06, 0.05, body);
  handleRear.position.set(0, 0.135, 0.14);
  group.add(handleRear);
  const handleTop = box(0.03, 0.022, 0.22, body);
  handleTop.position.set(0, 0.155, 0.06);
  group.add(handleTop);

  // ribbed triangular handguard
  const handguard = box(0.09, 0.09, 0.42, furniture);
  handguard.position.set(0, 0.05, -0.34);
  group.add(handguard);
  for (let i = 0; i < 5; i++) {
    const rib = box(0.095, 0.012, 0.02, furniture);
    rib.position.set(0, 0.095, -0.18 - i * 0.07);
    group.add(rib);
  }

  const barrel = cyl(0.017, 0.015, 0.4, metal);
  barrel.position.set(0, 0.06, -0.72);
  group.add(barrel);
  const flashHider = cyl(0.024, 0.02, 0.06, furniture);
  flashHider.position.set(0, 0.06, -0.94);
  group.add(flashHider);

  // A-frame front sight post
  const sightBase = box(0.04, 0.07, 0.05, furniture);
  sightBase.position.set(0, 0.1, -0.56);
  group.add(sightBase);
  const sightPost = box(0.012, 0.05, 0.012, metal);
  sightPost.position.set(0, 0.15, -0.56);
  group.add(sightPost);

  const mag = box(0.055, 0.22, 0.085, furniture);
  mag.position.set(0, -0.1, 0.02);
  mag.rotation.x = -0.12;
  group.add(mag);

  const grip = box(0.07, 0.17, 0.08, furniture);
  grip.position.set(0, -0.085, 0.18);
  grip.rotation.x = 0.32;
  group.add(grip);

  // fixed solid stock
  const stock = box(0.075, 0.12, 0.34, furniture);
  stock.position.set(0, 0.05, 0.36);
  group.add(stock);
  const buttplate = box(0.08, 0.16, 0.03, furniture);
  buttplate.position.set(0, 0.05, 0.53);
  group.add(buttplate);

  const muzzle = addMuzzle(group, 0, 0.06, -0.99);
  return { group, muzzle };
}

// M240-style belt-fed LMG — feed cover, carry handle, long barrel, bipod.
function buildLMG(color) {
  const group = new THREE.Group();
  const body = M('body', color, { roughness: 0.55 });
  const dark = M('accent', 0x101216, { roughness: 0.6 });
  const metal = M('metal', 0x6c7177, { metalness: 0.75, roughness: 0.35 });

  const receiver = box(0.12, 0.16, 0.5, body);
  receiver.position.set(0, 0.05, 0.02);
  group.add(receiver);

  const feedCover = box(0.12, 0.05, 0.34, body);
  feedCover.position.set(0, 0.15, -0.02);
  group.add(feedCover);

  const handle = box(0.04, 0.05, 0.14, dark);
  handle.position.set(0, 0.2, -0.06);
  group.add(handle);

  const barrel = cyl(0.024, 0.022, 0.46, metal);
  barrel.position.set(0, 0.08, -0.52);
  group.add(barrel);
  for (let i = 0; i < 4; i++) {
    const ring = cyl(0.03, 0.03, 0.02, dark);
    ring.position.set(0, 0.08, -0.4 - i * 0.07);
    group.add(ring);
  }
  const flash = cyl(0.034, 0.026, 0.07, dark);
  flash.position.set(0, 0.08, -0.78);
  group.add(flash);

  const grip = box(0.075, 0.18, 0.09, dark);
  grip.position.set(0, -0.11, 0.2);
  grip.rotation.x = 0.3;
  group.add(grip);

  const stockTop = box(0.05, 0.03, 0.24, dark);
  stockTop.position.set(0, 0.12, 0.34);
  group.add(stockTop);
  const stockBot = box(0.05, 0.03, 0.24, dark);
  stockBot.position.set(0, -0.02, 0.34);
  group.add(stockBot);
  const buttplate = box(0.06, 0.18, 0.03, dark);
  buttplate.position.set(0, 0.05, 0.46);
  group.add(buttplate);

  const legL = cyl(0.01, 0.01, 0.26, metal, Math.PI / 2.4);
  legL.position.set(-0.06, -0.08, -0.5);
  legL.rotation.z = 0.5;
  group.add(legL);
  const legR = cyl(0.01, 0.01, 0.26, metal, Math.PI / 2.4);
  legR.position.set(0.06, -0.08, -0.5);
  legR.rotation.z = -0.5;
  group.add(legR);

  const muzzle = addMuzzle(group, 0, 0.08, -0.84);
  return { group, muzzle };
}

// RPG-7 — long launch tube, flared rear venturi, wood grips, green warhead.
function buildRPG(color) {
  const group = new THREE.Group();
  const tube = M('body', color, { roughness: 0.45, metalness: 0.55 });
  const dark = M('accent', 0x111316, { roughness: 0.6 });
  const metal = M('metal', 0x6c7177, { metalness: 0.8, roughness: 0.3 });
  const wood = M('wood', 0xb58a4a, { roughness: 0.6, metalness: 0.05 });
  const warhead = M('special', 0x3f6b34, { roughness: 0.5, metalness: 0.3 });

  // main launch tube
  const mainTube = cyl(0.05, 0.05, 0.9, tube);
  mainTube.position.set(0, 0.06, -0.12);
  group.add(mainTube);

  // central wood heat guard
  const woodGuard = cyl(0.062, 0.062, 0.3, wood);
  woodGuard.position.set(0, 0.06, -0.02);
  group.add(woodGuard);
  const ringA = cyl(0.066, 0.066, 0.02, dark);
  ringA.position.set(0, 0.06, 0.12);
  group.add(ringA);
  const ringB = cyl(0.066, 0.066, 0.02, dark);
  ringB.position.set(0, 0.06, -0.16);
  group.add(ringB);

  // flared rear venturi (cone opening backwards)
  const venturi = cone(0.09, 0.18, dark, Math.PI / 2);
  venturi.position.set(0, 0.06, 0.42);
  group.add(venturi);

  // warhead at the front: shaft + bulbous body + pointed nose
  const wShaft = cyl(0.03, 0.03, 0.12, metal);
  wShaft.position.set(0, 0.06, -0.58);
  group.add(wShaft);
  const wBody = new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 12), warhead);
  wBody.scale.set(1, 1, 1.4);
  wBody.position.set(0, 0.06, -0.68);
  group.add(wBody);
  const wNose = cone(0.03, 0.12, warhead, -Math.PI / 2);
  wNose.position.set(0, 0.06, -0.82);
  group.add(wNose);

  // pistol grip + trigger
  const grip = box(0.07, 0.17, 0.08, dark);
  grip.position.set(0, -0.08, 0.06);
  grip.rotation.x = 0.18;
  group.add(grip);
  const triggerGuard = box(0.04, 0.06, 0.04, metal);
  triggerGuard.position.set(0, -0.01, 0.02);
  group.add(triggerGuard);
  // forward wood grip
  const foreGrip = box(0.06, 0.14, 0.07, wood);
  foreGrip.position.set(0, -0.04, -0.16);
  group.add(foreGrip);

  // iron sights
  const sightFront = box(0.012, 0.06, 0.012, metal);
  sightFront.position.set(0, 0.14, -0.22);
  group.add(sightFront);
  const sightRear = box(0.012, 0.05, 0.012, metal);
  sightRear.position.set(0, 0.13, 0.0);
  group.add(sightRear);

  const muzzle = addMuzzle(group, 0, 0.06, -0.9);
  return { group, muzzle };
}

function buildSniper(color) {
  const group = new THREE.Group();
  const body = M('body', color);
  const dark = M('accent', 0x111316, { roughness: 0.6 });
  const metal = M('metal', 0x8a9097, { metalness: 0.8, roughness: 0.25 });

  const receiver = box(0.08, 0.1, 0.5, body);
  receiver.position.set(0, 0.07, 0);
  group.add(receiver);

  const barrel = cyl(0.016, 0.014, 0.5, metal);
  barrel.position.set(0, 0.08, -0.5);
  group.add(barrel);

  const scopeTube = cyl(0.025, 0.025, 0.3, dark);
  scopeTube.position.set(0, 0.16, -0.08);
  group.add(scopeTube);
  const scopeRingA = cyl(0.032, 0.032, 0.02, dark);
  scopeRingA.position.set(0, 0.16, -0.2);
  group.add(scopeRingA);
  const scopeRingB = cyl(0.032, 0.032, 0.02, dark);
  scopeRingB.position.set(0, 0.16, 0.04);
  group.add(scopeRingB);

  const stock = box(0.07, 0.11, 0.34, dark);
  stock.position.set(0, 0.05, 0.34);
  group.add(stock);

  const grip = box(0.07, 0.16, 0.08, dark);
  grip.position.set(0, -0.08, 0.18);
  grip.rotation.x = 0.3;
  group.add(grip);

  const bolt = box(0.04, 0.025, 0.025, metal);
  bolt.position.set(0.06, 0.1, 0.08);
  group.add(bolt);

  const muzzle = addMuzzle(group, 0, 0.08, -0.74);
  return { group, muzzle };
}

// Bolt-action precision rifle — chassis stock, big variable optic, bipod.
function buildBoltSniper(color) {
  const group = new THREE.Group();
  const body = M('body', color);
  const dark = M('accent', 0x0e1013, { roughness: 0.6 });
  const metal = M('metal', 0x8a9097, { metalness: 0.8, roughness: 0.25 });

  const chassis = box(0.085, 0.12, 0.56, body);
  chassis.position.set(0, 0.06, 0.04);
  group.add(chassis);

  const handguard = box(0.07, 0.075, 0.34, dark);
  handguard.position.set(0, 0.07, -0.34);
  group.add(handguard);

  const barrel = cyl(0.018, 0.015, 0.46, metal);
  barrel.position.set(0, 0.07, -0.58);
  group.add(barrel);
  const brake = cyl(0.03, 0.026, 0.07, dark);
  brake.position.set(0, 0.07, -0.82);
  group.add(brake);

  const scopeTube = cyl(0.03, 0.03, 0.34, dark);
  scopeTube.position.set(0, 0.18, -0.04);
  group.add(scopeTube);
  const objective = cyl(0.042, 0.038, 0.07, dark);
  objective.position.set(0, 0.18, -0.22);
  group.add(objective);
  const eyepiece = cyl(0.038, 0.034, 0.06, dark);
  eyepiece.position.set(0, 0.18, 0.13);
  group.add(eyepiece);
  const turret = cyl(0.018, 0.018, 0.04, metal, 0);
  turret.position.set(0, 0.21, -0.04);
  group.add(turret);

  const stock = box(0.075, 0.14, 0.3, dark);
  stock.position.set(0, 0.04, 0.4);
  group.add(stock);
  const cheek = box(0.06, 0.04, 0.2, body);
  cheek.position.set(0, 0.12, 0.36);
  group.add(cheek);

  const grip = box(0.07, 0.16, 0.08, dark);
  grip.position.set(0, -0.08, 0.2);
  grip.rotation.x = 0.32;
  group.add(grip);

  const bolt = box(0.045, 0.025, 0.025, metal);
  bolt.position.set(0.07, 0.1, 0.1);
  group.add(bolt);

  const legL = cyl(0.009, 0.009, 0.3, metal, Math.PI / 2.6);
  legL.position.set(-0.07, -0.09, -0.42);
  legL.rotation.z = 0.45;
  group.add(legL);
  const legR = cyl(0.009, 0.009, 0.3, metal, Math.PI / 2.6);
  legR.position.set(0.07, -0.09, -0.42);
  legR.rotation.z = -0.45;
  group.add(legR);

  const muzzle = addMuzzle(group, 0, 0.07, -0.88);
  return { group, muzzle };
}

function buildSword(color) {
  const group = new THREE.Group();
  const bladeMat = M('metal', color, { metalness: 0.85, roughness: 0.2 });
  const hiltMat = M('wood', 0x2b1d12, { metalness: 0.1, roughness: 0.8 });
  const guardMat = M('special', 0xb08a3c, { metalness: 0.8, roughness: 0.35 });

  const handle = cyl(0.022, 0.022, 0.18, hiltMat);
  handle.position.set(0, -0.02, 0.16);
  group.add(handle);

  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), hiltMat);
  pommel.position.set(0, -0.02, 0.26);
  group.add(pommel);

  const guard = box(0.16, 0.025, 0.04, guardMat);
  guard.position.set(0, -0.02, 0.06);
  group.add(guard);

  const blade = box(0.035, 0.012, 0.62, bladeMat);
  blade.position.set(0, -0.02, -0.26);
  group.add(blade);

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 6), bladeMat);
  tip.rotation.x = -Math.PI / 2;
  tip.position.set(0, -0.02, -0.61);
  group.add(tip);

  const fuller = box(0.012, 0.004, 0.58, M('accent', 0x222428));
  fuller.position.set(0, -0.02, -0.26);
  group.add(fuller);

  const muzzle = addMuzzle(group, 0, -0.02, -0.65);
  return { group, muzzle };
}

const BUILDERS = {
  glock: buildGlock,
  sidearm: buildSidearm,
  uzi: buildUzi,
  smg: buildSMG,
  levershotgun: buildLeverShotgun,
  shotgun: buildShotgun,
  m4: buildM4,
  ar10: buildAR10,
  m16: buildM16,
  rifle: buildRifle,
  lmg: buildLMG,
  rpg: buildRPG,
  sniper: buildSniper,
  boltsniper: buildBoltSniper,
  sword: buildSword
};

export function buildWeaponModel(weaponDef) {
  const builder = BUILDERS[weaponDef.id];
  const { group, muzzle } = builder(weaponDef.color);
  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
    }
  });
  return { group, muzzle };
}
