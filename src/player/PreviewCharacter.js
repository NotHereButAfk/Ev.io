import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shared fixed materials (not recolored by skins)
// ---------------------------------------------------------------------------
const _visorMat = new THREE.MeshStandardMaterial({
  color: 0x00cfff, roughness: 0.08, metalness: 0.1,
  emissive: 0x00cfff, emissiveIntensity: 0.9,
  transparent: true, opacity: 0.82
});
const _trimMat = new THREE.MeshStandardMaterial({
  color: 0x9aaab4, roughness: 0.22, metalness: 0.88
});
const _darkJointMat = new THREE.MeshStandardMaterial({
  color: 0x0a0b0e, roughness: 0.75, metalness: 0.1
});

function B(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
function C(r, h, mat, segs = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segs), mat);
  return m;
}
function Sph(r, mat, sw = 10, sh = 8) { return new THREE.Mesh(new THREE.SphereGeometry(r, sw, sh), mat); }
function Cap(r, h, mat, segs = 8) { return new THREE.Mesh(new THREE.CapsuleGeometry(r, h, segs, 12), mat); }

// ---------------------------------------------------------------------------
// Build a sci-fi armored humanoid character.
// primary  = armor plates  (main skin color)
// secondary = undersuit + joints (dark accent color)
// ---------------------------------------------------------------------------
export function buildPreviewCharacter(skin) {
  const g  = new THREE.Group();
  const P  = new THREE.MeshStandardMaterial({ color: skin.primary,   roughness: 0.42, metalness: 0.52 });
  const S  = new THREE.MeshStandardMaterial({ color: skin.secondary, roughness: 0.72, metalness: 0.18 });

  // ── BOOTS ──────────────────────────────────────────────────────────────────
  [[-0.15, 1], [0.15, -1]].forEach(([bx, side]) => {
    const boot = B(0.2, 0.2, 0.3, P);
    boot.position.set(bx, 0.1, 0.02);
    g.add(boot);
    // Sole
    const sole = B(0.22, 0.04, 0.32, _trimMat);
    sole.position.set(bx, 0.01, 0.02);
    g.add(sole);
    // Toe cap
    const toe = B(0.18, 0.1, 0.06, _trimMat);
    toe.position.set(bx, 0.1, -0.16);
    g.add(toe);
    // Ankle guard
    const ankle = B(0.22, 0.09, 0.28, P);
    ankle.position.set(bx, 0.22, 0.01);
    g.add(ankle);
  });

  // ── LOWER LEGS / GREAVES ───────────────────────────────────────────────────
  [[-0.15, 1], [0.15, -1]].forEach(([lx]) => {
    // Undersuit shin
    const shin = Cap(0.095, 0.38, S);
    shin.position.set(lx, 0.53, 0);
    g.add(shin);
    // Front greave plate
    const greave = B(0.16, 0.38, 0.06, P);
    greave.position.set(lx, 0.53, -0.1);
    g.add(greave);
    // Greave ridge (vertical centre line detail)
    const ridge = B(0.025, 0.34, 0.014, _trimMat);
    ridge.position.set(lx, 0.53, -0.134);
    g.add(ridge);
    // Knee guard
    const knee = B(0.2, 0.13, 0.15, P);
    knee.position.set(lx, 0.76, -0.06);
    g.add(knee);
    const kneeRidge = B(0.02, 0.1, 0.02, _trimMat);
    kneeRidge.position.set(lx, 0.76, -0.145);
    g.add(kneeRidge);
  });

  // ── THIGHS ─────────────────────────────────────────────────────────────────
  [[-0.15, 1], [0.15, -1]].forEach(([tx, side]) => {
    // Undersuit thigh
    const thigh = Cap(0.12, 0.36, S);
    thigh.position.set(tx, 1.04, 0);
    g.add(thigh);
    // Outer thigh plate
    const thighPlate = B(0.14, 0.34, 0.1, P);
    thighPlate.position.set(tx - side * 0.13, 1.04, 0);
    g.add(thighPlate);
    // Thigh panel line
    const tpl = B(0.12, 0.006, 0.104, _trimMat);
    tpl.position.set(tx - side * 0.13, 1.14, 0);
    g.add(tpl);
  });

  // ── HIPS / BELT ────────────────────────────────────────────────────────────
  const hipPlate = B(0.46, 0.12, 0.28, P);
  hipPlate.position.set(0, 1.21, 0);
  g.add(hipPlate);
  // Belt
  const belt = B(0.48, 0.07, 0.3, S);
  belt.position.set(0, 1.26, 0);
  g.add(belt);
  // Belt buckle
  const buckle = B(0.07, 0.06, 0.04, _trimMat);
  buckle.position.set(0, 1.26, -0.165);
  g.add(buckle);
  // Side pouches
  [-0.2, 0.2].forEach((px) => {
    const pouch = B(0.1, 0.1, 0.1, S);
    pouch.position.set(px, 1.17, 0.08);
    g.add(pouch);
  });

  // ── TORSO ──────────────────────────────────────────────────────────────────
  // Undersuit core
  const torsoBg = Cap(0.28, 0.48, S);
  torsoBg.position.y = 1.56;
  g.add(torsoBg);

  // Main chest plate (front)
  const chest = B(0.5, 0.5, 0.1, P);
  chest.position.set(0, 1.56, -0.18);
  g.add(chest);
  // Chest panel bevel (top/bottom hard edges)
  const chestTop = B(0.5, 0.025, 0.1, _trimMat);
  chestTop.position.set(0, 1.815, -0.18);
  g.add(chestTop);
  const chestBot = B(0.5, 0.025, 0.1, _trimMat);
  chestBot.position.set(0, 1.305, -0.18);
  g.add(chestBot);
  // Chest centre groove
  const groove = B(0.025, 0.46, 0.014, _trimMat);
  groove.position.set(0, 1.56, -0.237);
  g.add(groove);
  // Pec detail panels
  [-0.14, 0.14].forEach((px) => {
    const pec = B(0.17, 0.18, 0.016, P);
    pec.position.set(px, 1.64, -0.192);
    g.add(pec);
  });
  // Chest accent light strips (emissive trim)
  const stripL = B(0.025, 0.28, 0.008, _visorMat);
  stripL.position.set(-0.22, 1.6, -0.236);
  g.add(stripL);
  const stripR = B(0.025, 0.28, 0.008, _visorMat);
  stripR.position.set(0.22, 1.6, -0.236);
  g.add(stripR);

  // Backplate
  const back = B(0.48, 0.44, 0.09, P);
  back.position.set(0, 1.56, 0.18);
  g.add(back);
  // Backpack tech block
  const bpack = B(0.24, 0.22, 0.12, S);
  bpack.position.set(0, 1.62, 0.285);
  g.add(bpack);
  const bpackGlow = B(0.06, 0.06, 0.014, _visorMat);
  bpackGlow.position.set(0, 1.68, 0.347);
  g.add(bpackGlow);

  // Collar/neck guard
  const collar = B(0.3, 0.08, 0.3, P);
  collar.position.set(0, 1.85, 0);
  g.add(collar);

  // ── SHOULDERS / PAULDRONS ─────────────────────────────────────────────────
  [[-1, -0.3], [1, 0.3]].forEach(([side, ox]) => {
    // Socket
    const socket = Sph(0.11, S);
    socket.position.set(side * 0.35, 1.76, 0);
    g.add(socket);
    // Main pauldron plate
    const pauMain = B(0.23, 0.2, 0.32, P);
    pauMain.position.set(side * 0.44, 1.76, 0);
    pauMain.rotation.z = side * -0.12;
    g.add(pauMain);
    // Top flare
    const pauTop = B(0.26, 0.06, 0.34, P);
    pauTop.position.set(side * 0.44, 1.87, 0);
    g.add(pauTop);
    // Accent stripe on pauldron
    const pauStripe = B(0.008, 0.18, 0.32, _visorMat);
    pauStripe.position.set(side * 0.555, 1.76, 0);
    g.add(pauStripe);
  });

  // ── ARMS ──────────────────────────────────────────────────────────────────
  [[-1, -0.38], [1, 0.38]].forEach(([side, ax]) => {
    // Upper arm
    const uArm = Cap(0.09, 0.34, S);
    uArm.position.set(ax, 1.52, 0);
    g.add(uArm);
    // Elbow guard
    const elbow = B(0.18, 0.12, 0.18, P);
    elbow.position.set(ax, 1.31, 0);
    g.add(elbow);
    // Forearm undersuit
    const fArm = Cap(0.08, 0.28, S);
    fArm.position.set(ax, 1.1, 0);
    g.add(fArm);
    // Vambrace (forearm armour plate — front-facing)
    const vambrace = B(0.16, 0.28, 0.06, P);
    vambrace.position.set(ax, 1.1, -0.09);
    g.add(vambrace);
    // Vambrace trim line
    const vTrim = B(0.14, 0.005, 0.064, _trimMat);
    vTrim.position.set(ax, 1.24, -0.09);
    g.add(vTrim);
    // Wrist seal ring
    const wrist = C(0.09, 0.04, _trimMat);
    wrist.position.set(ax, 0.95, 0);
    g.add(wrist);
    // Gauntlet/glove
    const glove = B(0.18, 0.14, 0.16, S);
    glove.position.set(ax, 0.85, 0);
    g.add(glove);
    // Knuckle detail
    const knuckle = B(0.18, 0.05, 0.06, P);
    knuckle.position.set(ax, 0.84, -0.07);
    g.add(knuckle);
  });

  // ── HEAD / HELMET ─────────────────────────────────────────────────────────
  // Helmet main body (slightly boxy, not a sphere)
  const helmBg = B(0.38, 0.42, 0.4, P);
  helmBg.position.y = 2.05;
  g.add(helmBg);
  // Helmet top curve (box on top, slightly narrower)
  const helmTop = B(0.32, 0.1, 0.36, P);
  helmTop.position.y = 2.27;
  g.add(helmTop);
  // Crest/ridge running front to back
  const crest = B(0.05, 0.08, 0.38, _trimMat);
  crest.position.set(0, 2.33, 0);
  g.add(crest);

  // Cheek plates
  [-1, 1].forEach((side) => {
    const cheek = B(0.07, 0.2, 0.3, P);
    cheek.position.set(side * 0.225, 2.0, 0);
    g.add(cheek);
  });
  // Chin guard
  const chin = B(0.28, 0.1, 0.1, P);
  chin.position.set(0, 1.84, -0.16);
  g.add(chin);

  // Visor (bright emissive horizontal band)
  const visor = B(0.36, 0.1, 0.06, _visorMat);
  visor.position.set(0, 2.1, -0.22);
  g.add(visor);
  // Visor inset slot
  const visorSlot = B(0.38, 0.12, 0.02, _darkJointMat);
  visorSlot.position.set(0, 2.1, -0.2);
  g.add(visorSlot);

  // Ear comm units
  [-1, 1].forEach((side) => {
    const ear = B(0.05, 0.13, 0.18, S);
    ear.position.set(side * 0.215, 2.08, 0.03);
    g.add(ear);
    // Comm antenna stub
    const ant = C(0.014, 0.1, _trimMat, 6);
    ant.position.set(side * 0.215, 2.2, 0.03);
    g.add(ant);
  });

  // Back of helmet (rounded)
  const helmBack = B(0.35, 0.38, 0.08, P);
  helmBack.position.set(0, 2.05, 0.24);
  g.add(helmBack);
  // Neck seal (bottom of helmet, connects to collar)
  const neckSeal = C(0.14, 0.06, S, 10);
  neckSeal.position.y = 1.88;
  g.add(neckSeal);

  // ── Shadows ────────────────────────────────────────────────────────────────
  g.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow   = true;
      obj.receiveShadow = true;
    }
  });

  g.userData = { primaryMat: P, secondaryMat: S };
  return g;
}

export function applySkinToCharacter(group, skin) {
  const { primaryMat, secondaryMat } = group.userData;
  primaryMat.color.setHex(skin.primary);
  secondaryMat.color.setHex(skin.secondary);
}
