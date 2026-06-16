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

const BUILDERS = {
  sidearm: buildSidearm,
  smg: buildSMG,
  shotgun: buildShotgun,
  rifle: buildRifle,
  sniper: buildSniper,
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
