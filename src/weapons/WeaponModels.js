import * as THREE from 'three';

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.55, ...opts });
}

function addMuzzle(group, x, y, z) {
  const muzzle = new THREE.Object3D();
  muzzle.position.set(x, y, z);
  group.add(muzzle);
  return muzzle;
}

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = false;
  return m;
}

function cyl(r1, r2, h, material, rotX = Math.PI / 2) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 10), material);
  m.rotation.x = rotX;
  return m;
}

function buildSidearm(color) {
  const group = new THREE.Group();
  const body = mat(color);
  const dark = mat(0x1c1f24);

  const slide = box(0.09, 0.09, 0.34, body);
  slide.position.set(0, 0.06, -0.05);
  group.add(slide);

  const grip = box(0.085, 0.22, 0.1, dark);
  grip.position.set(0, -0.1, 0.12);
  grip.rotation.x = 0.25;
  group.add(grip);

  const barrel = cyl(0.018, 0.018, 0.16, dark);
  barrel.position.set(0, 0.06, -0.28);
  group.add(barrel);

  const trigger = box(0.02, 0.06, 0.03, dark);
  trigger.position.set(0, -0.02, 0.02);
  group.add(trigger);

  const muzzle = addMuzzle(group, 0, 0.06, -0.42);
  return { group, muzzle };
}

function buildSMG(color) {
  const group = new THREE.Group();
  const body = mat(color);
  const dark = mat(0x14161a);

  const receiver = box(0.1, 0.12, 0.42, body);
  receiver.position.set(0, 0.04, -0.05);
  group.add(receiver);

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

  const barrel = cyl(0.02, 0.02, 0.22, dark);
  barrel.position.set(0, 0.05, -0.36);
  group.add(barrel);

  const muzzle = addMuzzle(group, 0, 0.05, -0.5);
  return { group, muzzle };
}

function buildShotgun(color) {
  const group = new THREE.Group();
  const body = mat(color, { roughness: 0.7 });
  const dark = mat(0x16181c);
  const metal = mat(0x71777e, { metalness: 0.8, roughness: 0.3 });

  const barrel = cyl(0.034, 0.03, 0.55, metal);
  barrel.position.set(0, 0.07, -0.2);
  group.add(barrel);

  const pump = box(0.085, 0.08, 0.18, body);
  pump.position.set(0, 0.03, -0.18);
  group.add(pump);

  const receiver = box(0.09, 0.1, 0.2, dark);
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

function buildRifle(color) {
  const group = new THREE.Group();
  const body = mat(color);
  const dark = mat(0x15171b);
  const metal = mat(0x80868d, { metalness: 0.7, roughness: 0.35 });

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

function buildSniper(color) {
  const group = new THREE.Group();
  const body = mat(color);
  const dark = mat(0x111316);
  const metal = mat(0x8a9097, { metalness: 0.8, roughness: 0.25 });

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

function buildSword(color) {
  const group = new THREE.Group();
  const bladeMat = mat(color, { metalness: 0.85, roughness: 0.2 });
  const hiltMat = mat(0x2b1d12, { metalness: 0.1, roughness: 0.8 });
  const guardMat = mat(0xb08a3c, { metalness: 0.8, roughness: 0.35 });

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

  const fuller = box(0.012, 0.004, 0.58, mat(0x222428));
  fuller.position.set(0, -0.02, -0.26);
  group.add(fuller);

  const muzzle = addMuzzle(group, 0, -0.02, -0.65);
  return { group, muzzle };
}

// --- M4 / AR-15 carbine: long M-LOK handguard, flip sight, collapsible stock ---
function buildM4(color) {
  const group = new THREE.Group();
  const body = mat(color);
  const dark = mat(0x121418);
  const metal = mat(0x80868d, { metalness: 0.7, roughness: 0.35 });

  const receiver = box(0.085, 0.12, 0.34, body);
  receiver.position.set(0, 0.06, 0.04);
  group.add(receiver);

  // slim free-float handguard with vent holes implied by the slats
  const handguard = box(0.075, 0.085, 0.42, dark);
  handguard.position.set(0, 0.07, -0.32);
  group.add(handguard);
  for (let i = 0; i < 5; i++) {
    const slat = box(0.082, 0.012, 0.03, metal);
    slat.position.set(0, 0.115, -0.18 - i * 0.075);
    group.add(slat);
  }

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

  // collapsible buffer tube + stock
  const tube = cyl(0.024, 0.024, 0.22, dark);
  tube.position.set(0, 0.06, 0.3);
  group.add(tube);
  const stock = box(0.07, 0.13, 0.12, dark);
  stock.position.set(0, 0.03, 0.36);
  group.add(stock);

  const muzzle = addMuzzle(group, 0, 0.07, -0.76);
  return { group, muzzle };
}

// --- M240-style belt-fed LMG: feed cover, long barrel, carry handle, bipod ---
function buildLMG(color) {
  const group = new THREE.Group();
  const body = mat(color, { roughness: 0.55 });
  const dark = mat(0x101216);
  const metal = mat(0x6c7177, { metalness: 0.75, roughness: 0.35 });

  const receiver = box(0.12, 0.16, 0.5, body);
  receiver.position.set(0, 0.05, 0.02);
  group.add(receiver);

  // feed cover on top
  const feedCover = box(0.12, 0.05, 0.34, body);
  feedCover.position.set(0, 0.15, -0.02);
  group.add(feedCover);

  // carry handle
  const handle = box(0.04, 0.05, 0.14, dark);
  handle.position.set(0, 0.2, -0.06);
  group.add(handle);

  const barrel = cyl(0.024, 0.022, 0.46, metal);
  barrel.position.set(0, 0.08, -0.52);
  group.add(barrel);
  // barrel heat shroud slats
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

  // skeletal tube stock
  const stockTop = box(0.05, 0.03, 0.24, dark);
  stockTop.position.set(0, 0.12, 0.34);
  group.add(stockTop);
  const stockBot = box(0.05, 0.03, 0.24, dark);
  stockBot.position.set(0, -0.02, 0.34);
  group.add(stockBot);
  const buttplate = box(0.06, 0.18, 0.03, dark);
  buttplate.position.set(0, 0.05, 0.46);
  group.add(buttplate);

  // folded bipod legs near the muzzle
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

// --- Bolt-action precision rifle: big scope, chassis stock, bipod ---
function buildBoltSniper(color) {
  const group = new THREE.Group();
  const body = mat(color);
  const dark = mat(0x0e1013);
  const metal = mat(0x8a9097, { metalness: 0.8, roughness: 0.25 });

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

  // large variable scope
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

  // adjustable skeleton stock
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

  // deployed bipod
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

// --- Uzi SMG: boxy receiver, magazine through the grip, folding stock ---
function buildUzi(color) {
  const group = new THREE.Group();
  const body = mat(color, { roughness: 0.4, metalness: 0.6 });
  const dark = mat(0x0f1013);

  const receiver = box(0.11, 0.13, 0.3, body);
  receiver.position.set(0, 0.05, 0.0);
  group.add(receiver);

  // ribbed top, suggested with a raised strip
  const topStrip = box(0.06, 0.02, 0.28, dark);
  topStrip.position.set(0, 0.12, 0.0);
  group.add(topStrip);

  const barrel = cyl(0.02, 0.02, 0.16, dark);
  barrel.position.set(0, 0.05, -0.22);
  group.add(barrel);
  const barrelNut = cyl(0.03, 0.03, 0.04, body);
  barrelNut.position.set(0, 0.05, -0.16);
  group.add(barrelNut);

  // grip with the magazine running straight through it
  const grip = box(0.085, 0.16, 0.1, dark);
  grip.position.set(0, -0.06, 0.04);
  group.add(grip);
  const mag = box(0.05, 0.22, 0.075, dark);
  mag.position.set(0, -0.2, 0.04);
  group.add(mag);

  const trigger = box(0.02, 0.05, 0.03, dark);
  trigger.position.set(0, -0.02, -0.05);
  group.add(trigger);

  // folding metal stock (extended)
  const stockArm = box(0.03, 0.025, 0.2, dark);
  stockArm.position.set(0, 0.06, 0.24);
  group.add(stockArm);
  const buttplate = box(0.09, 0.07, 0.03, dark);
  buttplate.position.set(0, 0.06, 0.35);
  group.add(buttplate);

  const muzzle = addMuzzle(group, 0, 0.05, -0.32);
  return { group, muzzle };
}

// --- Lever-action shotgun: wood stock + forend, lever loop, M-LOK rail ---
function buildLeverShotgun(color) {
  const group = new THREE.Group();
  const wood = mat(color, { roughness: 0.7, metalness: 0.1 });
  const dark = mat(0x14161a);
  const metal = mat(0x71777e, { metalness: 0.8, roughness: 0.3 });

  const receiver = box(0.085, 0.13, 0.22, dark);
  receiver.position.set(0, 0.05, 0.05);
  group.add(receiver);

  const barrel = cyl(0.026, 0.024, 0.5, metal);
  barrel.position.set(0, 0.08, -0.32);
  group.add(barrel);

  // tube magazine under the barrel
  const tube = cyl(0.018, 0.018, 0.46, metal);
  tube.position.set(0, 0.035, -0.3);
  group.add(tube);

  // synthetic / rail forend with slats
  const forend = box(0.07, 0.06, 0.24, dark);
  forend.position.set(0, 0.04, -0.22);
  group.add(forend);
  for (let i = 0; i < 3; i++) {
    const slat = box(0.075, 0.01, 0.03, metal);
    slat.position.set(0, 0.075, -0.14 - i * 0.07);
    group.add(slat);
  }

  // wooden stock
  const stock = box(0.07, 0.12, 0.32, wood);
  stock.position.set(0, 0.02, 0.32);
  stock.rotation.x = -0.06;
  group.add(stock);

  // the distinctive lever loop
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

const BUILDERS = {
  sidearm: buildSidearm,
  smg: buildSMG,
  uzi: buildUzi,
  shotgun: buildShotgun,
  levershotgun: buildLeverShotgun,
  rifle: buildRifle,
  m4: buildM4,
  lmg: buildLMG,
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
