import * as THREE from 'three';

const DETECT_RADIUS   = 22;
const ATTACK_RADIUS   = 1.7;
const ATTACK_COOLDOWN = 1.5;
const RADIUS          = 0.5;

// Ranged attack configs per weapon type
const ARMED_CFG = {
  pistol:  { stopRange: 7,  chaseRange: 13, cooldown: 2.0,  damage: 8,  accuracy: 0.68, color: 0x2a2a2a },
  rifle:   { stopRange: 11, chaseRange: 17, cooldown: 1.1,  damage: 12, accuracy: 0.80, color: 0x1a1a1a },
  shotgun: { stopRange: 5,  chaseRange: 11, cooldown: 2.4,  damage: 22, accuracy: 0.55, color: 0x3d2a10 },
};

let _nextId = 5000;

// ─── Material factory ─────────────────────────────────────────────────────────

function makeMats() {
  return {
    flesh: new THREE.MeshPhysicalMaterial({ color: 0x5f8048, roughness: 0.90, metalness: 0.0, clearcoat: 0.08, clearcoatRoughness: 0.9 }),
    skin2: new THREE.MeshPhysicalMaterial({ color: 0x4d6e38, roughness: 0.92, metalness: 0.0 }),
    rag:   new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.97, metalness: 0.0 }),
    bone:  new THREE.MeshStandardMaterial({ color: 0xc2ad8a, roughness: 0.80, metalness: 0.04 }),
    eye:   new THREE.MeshStandardMaterial({ color: 0xffee55, emissive: 0xffcc00, emissiveIntensity: 1.3, roughness: 0.1, metalness: 0.0 }),
    dark:  new THREE.MeshStandardMaterial({ color: 0x080402, roughness: 1.0, metalness: 0.0 }),
    blood: new THREE.MeshStandardMaterial({ color: 0x620909, roughness: 0.95, metalness: 0.0 }),
  };
}

// ─── Rig builder ──────────────────────────────────────────────────────────────

function buildZombieRig() {
  const mat = makeMats();

  const B   = (w, h, d, m)    => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const Cap = (r, h, seg, m)  => new THREE.Mesh(new THREE.CapsuleGeometry(r, h, seg || 5, 8), m);
  const S   = (r, seg, m)     => new THREE.Mesh(new THREE.SphereGeometry(r, seg || 7, 6), m);

  // ── root ──────────────────────────────────────────────────────────────────
  const root = new THREE.Group();

  // ── torsoGroup (y=0, handles pelvis bob) ──────────────────────────────────
  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 0;
  root.add(torsoGroup);

  // Pelvis mesh
  const pelvis = B(0.44, 0.16, 0.30, mat.rag);
  pelvis.position.y = 1.18;
  torsoGroup.add(pelvis);

  // ── spineGroup (y=1.24 in torsoGroup) ─────────────────────────────────────
  const spineGroup = new THREE.Group();
  spineGroup.position.set(0, 1.24, 0);
  torsoGroup.add(spineGroup);

  // Belly
  const belly = Cap(0.22, 0.22, 5, mat.flesh);
  belly.position.set(0, 0.14, 0);
  spineGroup.add(belly);

  // Chest
  const chest = Cap(0.26, 0.34, 5, mat.rag);
  chest.position.set(0, 0.54, 0);
  spineGroup.add(chest);

  // Clavicle bar
  const clavicle = B(0.56, 0.07, 0.22, mat.flesh);
  clavicle.position.set(0, 0.82, 0);
  spineGroup.add(clavicle);

  // Blood wound patch
  const wound = B(0.16, 0.11, 0.07, mat.blood);
  wound.position.set(-0.10, 0.32, -0.22);
  spineGroup.add(wound);

  // Rib peek
  const rib = B(0.09, 0.14, 0.05, mat.bone);
  rib.position.set(0.14, 0.22, -0.21);
  rib.rotation.z = 0.18;
  spineGroup.add(rib);

  // ── Left shoulder / arm chain ──────────────────────────────────────────────
  const leftShoulder = new THREE.Group();
  leftShoulder.position.set(-0.34, 0.80, 0);
  spineGroup.add(leftShoulder);

  const lUArm = Cap(0.085, 0.32, 5, mat.flesh);
  lUArm.position.set(0, -0.20, 0);
  leftShoulder.add(lUArm);

  const leftElbow = new THREE.Group();
  leftElbow.position.set(0, -0.40, 0);
  leftShoulder.add(leftElbow);

  const lFArm = Cap(0.075, 0.26, 5, mat.skin2);
  lFArm.position.set(0, -0.16, 0);
  leftElbow.add(lFArm);

  const leftWrist = new THREE.Group();
  leftWrist.position.set(0, -0.32, 0);
  leftElbow.add(leftWrist);

  const lHand = B(0.15, 0.11, 0.16, mat.flesh);
  lHand.position.set(0, -0.06, 0);
  leftWrist.add(lHand);

  // Left fingers (3 stumps)
  [-0.045, 0, 0.045].forEach((fx, i) => {
    const f = B(0.035, 0.09, 0.035, mat.bone);
    f.position.set(fx, -0.14 - (i === 1 ? 0.01 : 0), 0);
    leftWrist.add(f);
  });

  // ── Right shoulder / arm chain ─────────────────────────────────────────────
  const rightShoulder = new THREE.Group();
  rightShoulder.position.set(0.34, 0.80, 0);
  spineGroup.add(rightShoulder);

  const rUArm = Cap(0.085, 0.32, 5, mat.flesh);
  rUArm.position.set(0, -0.20, 0);
  rightShoulder.add(rUArm);

  const rightElbow = new THREE.Group();
  rightElbow.position.set(0, -0.40, 0);
  rightShoulder.add(rightElbow);

  const rFArm = Cap(0.075, 0.26, 5, mat.skin2);
  rFArm.position.set(0, -0.16, 0);
  rightElbow.add(rFArm);

  const rightWrist = new THREE.Group();
  rightWrist.position.set(0, -0.32, 0);
  rightElbow.add(rightWrist);

  const rHand = B(0.15, 0.11, 0.16, mat.flesh);
  rHand.position.set(0, -0.06, 0);
  rightWrist.add(rHand);

  // Right fingers (3 stumps)
  [-0.045, 0, 0.045].forEach((fx, i) => {
    const f = B(0.035, 0.09, 0.035, mat.bone);
    f.position.set(fx, -0.14 - (i === 1 ? 0.01 : 0), 0);
    rightWrist.add(f);
  });

  // ── Neck / head chain ─────────────────────────────────────────────────────
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0, 0.93, 0);
  spineGroup.add(neckGroup);

  const neck = Cap(0.09, 0.10, 5, mat.flesh);
  neck.position.set(0, 0.06, 0);
  neckGroup.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.16, 0);
  neckGroup.add(headGroup);

  // Skull
  const skull = B(0.38, 0.38, 0.38, mat.flesh);
  skull.position.set(0, 0.20, 0);
  headGroup.add(skull);

  // Brow ridge
  const brow = B(0.34, 0.07, 0.10, mat.skin2);
  brow.position.set(0, 0.32, -0.18);
  headGroup.add(brow);

  // Jaw (open)
  const jaw = B(0.28, 0.09, 0.25, mat.flesh);
  jaw.position.set(0, 0.03, -0.02);
  jaw.rotation.x = 0.22;
  headGroup.add(jaw);

  // Nose
  const nose = B(0.07, 0.07, 0.10, mat.skin2);
  nose.position.set(0, 0.22, -0.20);
  headGroup.add(nose);

  // Ears
  const earL = B(0.06, 0.10, 0.06, mat.skin2);
  earL.position.set(-0.20, 0.20, 0);
  headGroup.add(earL);
  const earR = B(0.06, 0.10, 0.06, mat.skin2);
  earR.position.set(0.20, 0.20, 0);
  headGroup.add(earR);

  // Eye sockets (dark recesses)
  const sockL = S(0.072, 7, mat.dark);
  sockL.position.set(-0.10, 0.26, -0.18);
  headGroup.add(sockL);
  const sockR = S(0.072, 7, mat.dark);
  sockR.position.set(0.10, 0.26, -0.18);
  headGroup.add(sockR);

  // Glowing pupils
  const eyeL = S(0.045, 7, mat.eye);
  eyeL.position.set(-0.10, 0.26, -0.21);
  headGroup.add(eyeL);
  const eyeR = S(0.045, 7, mat.eye);
  eyeR.position.set(0.10, 0.26, -0.21);
  headGroup.add(eyeR);

  // Maw (open mouth dark interior)
  const maw = B(0.18, 0.05, 0.05, mat.dark);
  maw.position.set(0, 0.08, -0.19);
  headGroup.add(maw);

  // Teeth (3 nubs)
  [-0.05, 0, 0.05].forEach(tx => {
    const tooth = B(0.03, 0.04, 0.03, mat.bone);
    tooth.position.set(tx, 0.06, -0.20);
    headGroup.add(tooth);
  });

  // Matted hair tufts
  [[-0.12, 0.40, 0.04], [0.06, 0.42, -0.10], [0.14, 0.38, 0.08]].forEach(([hx, hy, hz]) => {
    const tuft = B(0.09, 0.06, 0.08, mat.dark);
    tuft.position.set(hx, hy, hz);
    headGroup.add(tuft);
  });

  // Scalp
  const scalp = B(0.34, 0.05, 0.32, mat.dark);
  scalp.position.set(0, 0.40, 0.02);
  headGroup.add(scalp);

  // Eye glow PointLight
  const eyeGlow = new THREE.PointLight(0xffcc00, 0.65, 1.6);
  eyeGlow.position.set(0, 0.26, -0.25);
  headGroup.add(eyeGlow);

  // ── Legs — hip groups directly on root ────────────────────────────────────
  function buildLeg(side) { // side: -1 = left, +1 = right
    const xOff = side * 0.17;

    const hipGroup = new THREE.Group();
    hipGroup.position.set(xOff, 1.06, 0);
    root.add(hipGroup);

    const thigh = Cap(0.12, 0.30, 5, mat.rag);
    thigh.position.set(0, -0.22, 0);
    hipGroup.add(thigh);

    const kneeGroup = new THREE.Group();
    kneeGroup.position.set(0, -0.48, 0);
    hipGroup.add(kneeGroup);

    // Kneecap sphere (exposed bone)
    const kneecap = S(0.065, 7, mat.bone);
    kneecap.position.set(0, 0, -0.04);
    kneeGroup.add(kneecap);

    const shin = Cap(0.09, 0.28, 5, mat.rag);
    shin.position.set(0, -0.20, 0);
    kneeGroup.add(shin);

    // Left shin exposed bone chip
    if (side < 0) {
      const chip = B(0.04, 0.08, 0.03, mat.bone);
      chip.position.set(0.06, -0.18, -0.09);
      chip.rotation.z = 0.3;
      kneeGroup.add(chip);
    }

    const ankleGroup = new THREE.Group();
    ankleGroup.position.set(0, -0.42, 0);
    kneeGroup.add(ankleGroup);

    // Foot block
    const foot = B(0.20, 0.11, 0.30, mat.bone);
    foot.position.set(0, -0.06, 0.04);
    ankleGroup.add(foot);

    // Toe stumps (2)
    [-0.05, 0.05].forEach(tx => {
      const toe = B(0.06, 0.06, 0.08, mat.bone);
      toe.position.set(tx, -0.08, -0.13);
      ankleGroup.add(toe);
    });

    return { hip: hipGroup, knee: kneeGroup, ankle: ankleGroup };
  }

  const legL = buildLeg(-1);
  const legR = buildLeg(+1);

  // Enable shadows on everything
  root.traverse(obj => {
    if (obj.isMesh) {
      obj.castShadow    = true;
      obj.receiveShadow = true;
    }
  });

  return {
    root,
    torsoGroup,
    spineGroup,
    neckGroup,
    headGroup,
    arms: {
      left:  { shoulder: leftShoulder,  elbow: leftElbow,  wrist: leftWrist  },
      right: { shoulder: rightShoulder, elbow: rightElbow, wrist: rightWrist },
    },
    legs: {
      left:  legL,
      right: legR,
    },
    mat,
  };
}

// ─── Gun mesh ─────────────────────────────────────────────────────────────────

function buildGunMesh(type) {
  const group  = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({ color: ARMED_CFG[type].color, roughness: 0.55, metalness: 0.85 });
  const woodMat= new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.88, metalness: 0.05 });
  const B = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

  let muzzleOffset;

  if (type === 'pistol') {
    const body   = B(0.065, 0.075, 0.20, gunMat); body.position.z = -0.04; group.add(body);
    const barrel = B(0.030, 0.028, 0.14, gunMat); barrel.position.set(0, 0.028, -0.17); group.add(barrel);
    const grip   = B(0.052, 0.11,  0.05, gunMat); grip.position.set(0, -0.082, -0.02); group.add(grip);
    muzzleOffset = new THREE.Vector3(0, 0.028, -0.245);
  } else if (type === 'rifle') {
    const body   = B(0.060, 0.065, 0.36, gunMat); body.position.z = -0.07; group.add(body);
    const barrel = B(0.026, 0.026, 0.20, gunMat); barrel.position.set(0, 0.026, -0.29); group.add(barrel);
    const stock  = B(0.055, 0.050, 0.15, woodMat); stock.position.set(0, -0.01, 0.115); group.add(stock);
    const grip   = B(0.044, 0.10,  0.044, gunMat); grip.position.set(0, -0.072, 0.01); group.add(grip);
    const mag    = B(0.030, 0.08,  0.032, gunMat); mag.position.set(0, -0.08, -0.04); group.add(mag);
    muzzleOffset = new THREE.Vector3(0, 0.026, -0.39);
  } else { // shotgun
    const body   = B(0.075, 0.075, 0.28, gunMat); body.position.z = -0.04; group.add(body);
    const barrel = B(0.065, 0.040, 0.12, gunMat); barrel.position.set(0, 0.035, -0.22); group.add(barrel);
    const stock  = B(0.065, 0.055, 0.15, woodMat); stock.position.set(0, -0.01, 0.105); group.add(stock);
    const grip   = B(0.055, 0.10,  0.048, gunMat); grip.position.set(0, -0.082, 0.005); group.add(grip);
    muzzleOffset = new THREE.Vector3(0, 0.035, -0.285);
  }

  // Muzzle flash light (off by default)
  const flash = new THREE.PointLight(0xff8822, 0, 4, 2);
  flash.position.copy(muzzleOffset);
  group.add(flash);

  group.traverse(obj => { if (obj.isMesh) obj.castShadow = false; });

  return { group, flash, muzzleOffset };
}

// ─── Health bar ───────────────────────────────────────────────────────────────

function buildHealthBar() {
  const group = new THREE.Group();
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x14161a, depthTest: false })
  );
  const fg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x44cc22, depthTest: false })
  );
  bg.renderOrder = 10; fg.renderOrder = 11;
  bg.userData.noHit = true; fg.userData.noHit = true;
  group.add(bg); group.add(fg);
  group.position.y = 2.85;
  return { group, fg };
}

// ─── Zombie class ─────────────────────────────────────────────────────────────

export class Zombie {
  /**
   * @param {object}        world
   * @param {THREE.Vector3} spawnPoint
   * @param {number}        hpMult
   * @param {number}        speedMult
   * @param {number}        wave
   * @param {string|null}   armedType  — null | 'pistol' | 'rifle' | 'shotgun'
   */
  constructor(world, spawnPoint, hpMult = 1, speedMult = 1, wave = 1, armedType = null) {
    this.id           = _nextId++;
    this.world        = world;
    this.maxHealth    = Math.round(80 * hpMult);
    this.health       = this.maxHealth;
    this.alive        = true;
    this.noRespawn    = true;
    this.attackCooldown  = 0;
    this.flashTimer      = 0;
    this.wanderTarget    = spawnPoint.clone();
    this.wanderCooldown  = 0;
    this.speed           = (1.6 + Math.random() * 0.7) * speedMult;
    this.attackDamage    = Math.round(14 * (1 + (wave - 1) * 0.12));
    this.lungeTimer      = 0;
    this._dying          = false;
    this._deathT         = 0;
    this._deathSide      = 1;
    this._deathBaseY     = 0;
    this._animPhase      = Math.random() * Math.PI * 2;
    this._muzzleFlashTimer = 0;

    // Armed state
    this.armedType     = armedType;
    this.shootCooldown = 0;
    this._muzzleFlash  = null;

    this.position = spawnPoint.clone();

    // Build rig
    const rig = buildZombieRig();
    this._rig       = rig;
    this._fleshMat  = rig.mat.flesh;

    this.mesh = rig.root;
    this.mesh.userData.bot = this;
    this.mesh.traverse(obj => { obj.userData.bot = this; });

    // Default arm pose — zombie reach (both arms forward-up)
    rig.arms.left.shoulder.rotation.x  = -0.65;
    rig.arms.left.shoulder.rotation.z  =  0.18;
    rig.arms.left.elbow.rotation.x     = -0.30;
    rig.arms.right.shoulder.rotation.x = -0.65;
    rig.arms.right.shoulder.rotation.z = -0.18;
    rig.arms.right.elbow.rotation.x    = -0.30;

    // Attach gun to right wrist if armed
    if (armedType) {
      const { group: gunGroup, flash } = buildGunMesh(armedType);
      gunGroup.position.set(0, -0.10, -0.06);
      gunGroup.rotation.x = 0.12;
      rig.arms.right.wrist.add(gunGroup);
      this._muzzleFlash = flash;

      this.maxHealth = Math.round(this.maxHealth * 1.2);
      this.health    = this.maxHealth;
      this.attackDamage = Math.round(this.attackDamage * 0.6);

      const cfg = ARMED_CFG[armedType];
      this.shootCooldown = cfg.cooldown * (0.5 + Math.random() * 0.5);
    }

    const { group: hpGroup, fg } = buildHealthBar();
    this.healthBarFg    = fg;
    this.healthBarGroup = hpGroup;
    this.mesh.add(hpGroup);
    this.mesh.position.copy(this.position);
  }

  // ─── Animation ──────────────────────────────────────────────────────────────

  _animate(dt, isMoving) {
    const rig = this._rig;
    this._animPhase += dt * (isMoving ? 3.2 : 1.0);
    const t = this._animPhase;

    if (isMoving) {
      // Walk cycle — legs
      rig.legs.left.hip.rotation.x   = -Math.sin(t) * 0.18;  // limp
      rig.legs.right.hip.rotation.x  =  Math.sin(t) * 0.30;  // strong stride
      rig.legs.left.knee.rotation.x  =  Math.max(0,  Math.sin(t)) * 0.28;
      rig.legs.right.knee.rotation.x =  Math.max(0, -Math.sin(t)) * 0.38;
      rig.legs.left.ankle.rotation.x = -Math.sin(t) * 0.08;
      rig.legs.right.ankle.rotation.x=  Math.sin(t) * 0.10;

      // Pelvis bob
      rig.torsoGroup.position.y = Math.abs(Math.sin(t)) * -0.035;

      // Torso sway
      rig.spineGroup.rotation.z = Math.sin(t * 1.3) * 0.065;

      // Arms sway opposite legs (only when unarmed)
      if (!this.armedType) {
        rig.arms.left.shoulder.rotation.x  = -0.65 + Math.sin(t) * 0.18;
        rig.arms.right.shoulder.rotation.x = -0.65 - Math.sin(t) * 0.18;
      }
    } else {
      // Idle — zero leg rotations
      rig.legs.left.hip.rotation.x    = 0;
      rig.legs.right.hip.rotation.x   = 0;
      rig.legs.left.knee.rotation.x   = 0;
      rig.legs.right.knee.rotation.x  = 0;
      rig.legs.left.ankle.rotation.x  = 0;
      rig.legs.right.ankle.rotation.x = 0;
      rig.torsoGroup.position.y       = 0;
      rig.spineGroup.rotation.z       = Math.sin(t * 1.3) * 0.025;

      if (!this.armedType) {
        rig.arms.left.shoulder.rotation.x  = -0.65;
        rig.arms.right.shoulder.rotation.x = -0.65;
      }
    }

    // Always: forward lean + rock
    rig.spineGroup.rotation.x = 0.18 + Math.sin(t * 0.8) * 0.04;

    // Head loll
    rig.headGroup.rotation.z = Math.sin(t * 0.9 + 0.4) * 0.14;
    rig.headGroup.rotation.x = -0.06 + Math.sin(t * 1.1) * 0.05;

    // Armed zombie — override right arm to aiming pose
    if (this.armedType) {
      rig.arms.right.shoulder.rotation.x = -0.78;
      rig.arms.right.shoulder.rotation.z = -0.30;
      rig.arms.right.elbow.rotation.x    = -0.65;
    }

    // Lunge attack
    if (this.lungeTimer > 0) {
      const p      = this.lungeTimer / 0.20;
      const strike = Math.sin(p * Math.PI) * 0.5;
      rig.arms.left.shoulder.rotation.x  -= strike;
      rig.arms.right.shoulder.rotation.x -= strike;
      rig.spineGroup.rotation.x          += strike * 0.3;
    }

    // Hit flinch
    if (this.flashTimer > 0) {
      const flinch = (this.flashTimer / 0.12) * 0.12;
      rig.spineGroup.rotation.x -= flinch;
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  takeDamage(amount) {
    if (!this.alive) return false;
    this.health = Math.max(0, this.health - amount);
    this.flashTimer = 0.12;
    this.healthBarFg.scale.x    = Math.max(0.001, this.health / this.maxHealth);
    this.healthBarFg.position.x = -((1 - this.healthBarFg.scale.x) * 0.33);
    if (this.health <= 0) { this.die(); return true; }
    return false;
  }

  die() {
    this.alive      = false;
    this._dying     = true;
    this._deathT    = 0;
    this._deathSide = Math.random() < 0.5 ? 1 : -1;
    this._deathBaseY= this.mesh.position.y;
    this.healthBarGroup.visible = false;
    if (this._muzzleFlash) this._muzzleFlash.intensity = 0;
  }

  _fireAt(player, onAttack) {
    const cfg = ARMED_CFG[this.armedType];
    if (Math.random() < cfg.accuracy) {
      onAttack(cfg.damage);
    }
    if (this._muzzleFlash) {
      this._muzzleFlash.intensity = 5.5;
      this._muzzleFlashTimer = 0.09;
    }
    this.shootCooldown = cfg.cooldown;
  }

  update(dt, player, camera, onAttack) {
    // Muzzle flash decay (use separate _muzzleFlashTimer)
    if (this._muzzleFlash && this._muzzleFlashTimer > 0) {
      this._muzzleFlashTimer -= dt;
      if (this._muzzleFlashTimer <= 0) this._muzzleFlash.intensity = 0;
    }

    // Death animation
    if (this._dying) {
      this._deathT += dt;
      const p = Math.min(1, this._deathT / 0.65);
      const e = p * p;
      this.mesh.rotation.z = e * (Math.PI / 2) * this._deathSide;
      this.mesh.rotation.x = e * 0.25;
      this.mesh.position.y = this._deathBaseY - e * 0.55;

      // Enhanced crumple
      if (this._rig) {
        this._rig.spineGroup.rotation.x += e * 0.4;
        this._rig.headGroup.rotation.x  += e * 0.3;
      }

      if (p > 0.55) {
        const fade = 1 - (p - 0.55) / 0.45;
        this.mesh.traverse(o => {
          if (o.isMesh && o.material) {
            o.material.transparent = true;
            o.material.opacity     = fade;
          }
        });
      }
      if (p >= 1) {
        this._dying      = false;
        this.mesh.visible= false;
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.position.y = this._deathBaseY;
        this.mesh.traverse(o => {
          if (o.isMesh && o.material) {
            o.material.transparent = false;
            o.material.opacity     = 1;
          }
        });
      }
      return;
    }

    if (!this.alive) return;

    // Hit flash on flesh mat
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this._fleshMat.emissive.setRGB(0.4, 1, 0.2);
      this._fleshMat.emissiveIntensity = Math.max(0, this.flashTimer / 0.12) * 0.7;
    } else {
      this._fleshMat.emissiveIntensity = 0;
    }

    // Lunge scale pulse
    if (this.lungeTimer > 0) {
      this.lungeTimer -= dt;
      const s = 1 + Math.sin((this.lungeTimer / 0.2) * Math.PI) * 0.12;
      this.mesh.scale.setScalar(s);
    } else {
      this.mesh.scale.setScalar(1);
    }

    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.shootCooldown  > 0) this.shootCooldown  -= dt;

    const toPlayer = new THREE.Vector3(
      player.position.x - this.position.x,
      0,
      player.position.z - this.position.z
    );
    const dist = toPlayer.length();
    let moveDir  = null;
    let isMoving = false;

    if (!player.isDead && dist < (this.armedType ? ARMED_CFG[this.armedType].chaseRange : DETECT_RADIUS)) {
      this.mesh.lookAt(player.position.x, this.position.y + 1.08, player.position.z);

      if (this.armedType) {
        const cfg = ARMED_CFG[this.armedType];

        if (dist < ATTACK_RADIUS * 0.9) {
          // Melee fallback when too close
          if (this.attackCooldown <= 0) {
            this.attackCooldown = ATTACK_COOLDOWN;
            this.lungeTimer     = 0.2;
            onAttack(this.attackDamage);
          }
        } else if (dist <= cfg.stopRange) {
          // Stand and shoot
          if (this.shootCooldown <= 0) {
            this._fireAt(player, onAttack);
          }
          // Slight strafe
          const strafe = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize();
          const strafeSign = Math.sin(Date.now() * 0.0007 + this.id) > 0 ? 1 : -1;
          moveDir  = strafe.multiplyScalar(strafeSign * 0.35);
          isMoving = true;
        } else {
          // Chase
          moveDir  = toPlayer.normalize();
          isMoving = true;
        }
      } else {
        // Pure melee
        if (dist > ATTACK_RADIUS * 0.85) {
          moveDir  = toPlayer.normalize();
          isMoving = true;
        } else if (this.attackCooldown <= 0) {
          this.attackCooldown = ATTACK_COOLDOWN;
          this.lungeTimer     = 0.2;
          onAttack(this.attackDamage);
        }
      }
    } else if (!this.armedType) {
      // Melee wander
      this.wanderCooldown -= dt;
      if (this.wanderCooldown <= 0 || this.position.distanceTo(this.wanderTarget) < 1.5) {
        const r = this.world.arenaHalf - 4;
        this.wanderTarget.set(
          (Math.random() * 2 - 1) * r,
          0,
          (Math.random() * 2 - 1) * r
        );
        this.wanderCooldown = 2 + Math.random() * 2;
      }
      const dir = new THREE.Vector3().subVectors(this.wanderTarget, this.position);
      if (dir.lengthSq() > 0.04) {
        moveDir  = dir.normalize();
        isMoving = true;
        this.mesh.lookAt(this.wanderTarget.x, this.position.y + 1.08, this.wanderTarget.z);
      }
    }

    if (moveDir) {
      this.position.addScaledVector(moveDir, this.speed * dt);
      this.world.resolveCollisions(this.position, RADIUS);
    }
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);

    // Run bone animation
    this._animate(dt, isMoving);

    // Billboard health bar
    if (this.healthBarGroup) {
      const lq = this.mesh.quaternion.clone().invert().multiply(camera.quaternion);
      this.healthBarGroup.quaternion.copy(lq);
    }
  }
}
