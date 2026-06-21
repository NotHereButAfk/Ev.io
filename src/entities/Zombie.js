import * as THREE from 'three';

const DETECT_RADIUS  = 22;
const ATTACK_RADIUS  = 1.7;
const ATTACK_COOLDOWN = 1.5;
const RADIUS = 0.5;

// Ranged attack configs per weapon type
const ARMED_CFG = {
  pistol:  { stopRange: 7,  chaseRange: 13, cooldown: 2.0,  damage: 8,  accuracy: 0.68, color: 0x2a2a2a },
  rifle:   { stopRange: 11, chaseRange: 17, cooldown: 1.1,  damage: 12, accuracy: 0.80, color: 0x1a1a1a },
  shotgun: { stopRange: 5,  chaseRange: 11, cooldown: 2.4,  damage: 22, accuracy: 0.55, color: 0x3d2a10 },
};

let _nextId = 5000;

// ─── Mesh builders ────────────────────────────────────────────────────────────

function buildZombieMesh() {
  const group = new THREE.Group();

  const fleshMat = new THREE.MeshStandardMaterial({ color: 0x6e8f5a, roughness: 0.92, metalness: 0.0 });
  const ragMat   = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.97, metalness: 0.0 });
  const boneMat  = new THREE.MeshStandardMaterial({ color: 0xc2ad8a, roughness: 0.85, metalness: 0.0 });
  const eyeMat   = new THREE.MeshStandardMaterial({ color: 0xffee55, roughness: 0.2, metalness: 0.0,
                                                    emissive: 0xffcc00, emissiveIntensity: 0.9 });
  const darkMat  = new THREE.MeshStandardMaterial({ color: 0x0e0704, roughness: 1.0, metalness: 0.0 });

  const B = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const Cap = (r, h, m)  => new THREE.Mesh(new THREE.CapsuleGeometry(r, h, 5, 8), m);
  const S = (r, m)       => new THREE.Mesh(new THREE.SphereGeometry(r, 7, 6), m);

  // Bare feet
  [[-0.15], [0.15]].forEach(([bx]) => {
    const foot = B(0.21, 0.13, 0.34, boneMat); foot.position.set(bx, 0.065, 0.04); group.add(foot);
  });

  // Lower legs — tattered rags
  [[-0.15], [0.15]].forEach(([lx]) => {
    const shin = Cap(0.1, 0.42, ragMat); shin.position.set(lx, 0.52, 0); group.add(shin);
  });

  // Thighs
  [[-0.15], [0.15]].forEach(([tx]) => {
    const thigh = Cap(0.13, 0.38, ragMat); thigh.position.set(tx, 1.04, 0); group.add(thigh);
  });

  // Hips
  const hip = B(0.42, 0.13, 0.28, ragMat); hip.position.set(0, 1.24, 0); group.add(hip);

  // Torso — slouched
  const torsoBg = Cap(0.28, 0.48, ragMat); torsoBg.position.y = 1.56; group.add(torsoBg);
  const wound   = B(0.14, 0.09, 0.06, darkMat); wound.position.set(-0.09, 1.61, -0.17); group.add(wound);

  // Arms — outstretched for melee, adjusted at arm attachment point for armed
  const armGroups = [];
  [[-1, -0.38], [1, 0.38]].forEach(([side, ax]) => {
    const armGroup = new THREE.Group();
    armGroup.position.set(ax, 1.56, -0.14);

    const uArm = Cap(0.09, 0.34, fleshMat);
    uArm.position.set(0, 0, 0);
    uArm.rotation.x = -0.55;
    armGroup.add(uArm);

    const fArm = Cap(0.08, 0.28, fleshMat);
    fArm.position.set(0, -0.24, -0.18);
    fArm.rotation.x = -0.28;
    armGroup.add(fArm);

    const hand = B(0.17, 0.14, 0.18, fleshMat);
    hand.position.set(0, -0.43, -0.28);
    armGroup.add(hand);

    group.add(armGroup);
    armGroups.push({ side, group: armGroup });
  });

  // Neck
  const neck = Cap(0.1, 0.1, fleshMat); neck.position.y = 1.88; group.add(neck);

  // Head — bloated zombie skull
  const head = B(0.38, 0.40, 0.38, fleshMat); head.position.y = 2.12; group.add(head);
  const jaw  = B(0.30, 0.11, 0.28, fleshMat); jaw.position.set(0, 1.94, -0.03); group.add(jaw);

  // Hollow eye sockets
  const sockL = S(0.075, darkMat); sockL.position.set(-0.10, 2.17, -0.17); group.add(sockL);
  const sockR = S(0.075, darkMat); sockR.position.set( 0.10, 2.17, -0.17); group.add(sockR);
  const eyeL  = S(0.045, eyeMat);  eyeL.position.set(-0.10, 2.17, -0.20);  group.add(eyeL);
  const eyeR  = S(0.045, eyeMat);  eyeR.position.set( 0.10, 2.17, -0.20);  group.add(eyeR);

  // Open maw
  const mouth = B(0.20, 0.05, 0.05, darkMat); mouth.position.set(0, 1.98, -0.19); group.add(mouth);

  // Matted scalp
  const scalp = B(0.35, 0.055, 0.34, darkMat); scalp.position.set(0, 2.34, 0.02); group.add(scalp);

  group.traverse(obj => { if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; } });

  // Right arm group = index 1 (side=1)
  const rightArmGroup = armGroups[1].group;

  return { group, bodyMat: ragMat, torso: torsoBg, head, rightArmGroup };
}

function buildGunMesh(type) {
  const group = new THREE.Group();
  const gunMat  = new THREE.MeshStandardMaterial({ color: ARMED_CFG[type].color, roughness: 0.55, metalness: 0.85 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.88, metalness: 0.05 });
  const B = (w, h, d, m) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); return mesh; };

  let muzzleOffset; // local Z of barrel tip (negative = forward)

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

  group.traverse(obj => { if (obj.isMesh) { obj.castShadow = false; } });

  return { group, flash, muzzleOffset };
}

function buildHealthBar() {
  const group = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x14161a, depthTest: false }));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x44cc22, depthTest: false }));
  bg.renderOrder = 10; fg.renderOrder = 11;
  bg.userData.noHit = true; fg.userData.noHit = true;
  group.add(bg); group.add(fg);
  group.position.y = 2.6;
  return { group, fg };
}

// ─── Zombie class ─────────────────────────────────────────────────────────────

export class Zombie {
  /**
   * @param {object}       world
   * @param {THREE.Vector3} spawnPoint
   * @param {number}       hpMult
   * @param {number}       speedMult
   * @param {number}       wave
   * @param {string|null}  armedType  — null | 'pistol' | 'rifle' | 'shotgun'
   */
  constructor(world, spawnPoint, hpMult = 1, speedMult = 1, wave = 1, armedType = null) {
    this.id           = _nextId++;
    this.world        = world;
    this.maxHealth    = Math.round(80 * hpMult);
    this.health       = this.maxHealth;
    this.alive        = true;
    this.noRespawn    = true;
    this.attackCooldown  = 0;
    this.flashTimer   = 0;
    this.wanderTarget = spawnPoint.clone();
    this.wanderCooldown = 0;
    this.speed        = (1.6 + Math.random() * 0.7) * speedMult;
    this.attackDamage = Math.round(14 * (1 + (wave - 1) * 0.12));
    this.lungeTimer   = 0;
    this._dying       = false;
    this._deathT      = 0;
    this._deathSide   = 1;
    this._deathBaseY  = 0;

    // Armed state
    this.armedType     = armedType;
    this.shootCooldown = 0;
    this._muzzleFlash  = null; // PointLight ref

    this.position = spawnPoint.clone();

    const { group, bodyMat, torso, head, rightArmGroup } = buildZombieMesh();
    this.mesh         = group;
    this.bodyMat      = bodyMat;
    this.torso        = torso;
    this.head         = head;
    this.mesh.userData.bot = this;
    this.mesh.traverse(obj => { obj.userData.bot = this; });

    // Attach gun to right arm if armed
    if (armedType) {
      const { group: gunGroup, flash } = buildGunMesh(armedType);
      // Position gun at hand level, pointing forward (-Z in arm-local space)
      gunGroup.position.set(0.0, -0.52, -0.32);
      gunGroup.rotation.set(-0.18, 0, 0);
      rightArmGroup.add(gunGroup);
      this._muzzleFlash = flash;

      // Raise right arm into aiming pose
      rightArmGroup.rotation.x = 0.3;

      // Armed zombies have a bit more HP
      this.maxHealth = Math.round(this.maxHealth * 1.2);
      this.health    = this.maxHealth;

      // Armed zombies deal less melee damage (they prefer to shoot)
      this.attackDamage = Math.round(this.attackDamage * 0.6);

      const cfg = ARMED_CFG[armedType];
      this.shootCooldown = cfg.cooldown * (0.5 + Math.random() * 0.5); // stagger initial shot
    }

    const { group: hpGroup, fg } = buildHealthBar();
    this.healthBarFg    = fg;
    this.healthBarGroup = hpGroup;
    this.mesh.add(hpGroup);
    this.mesh.position.copy(this.position);
  }

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
    this.alive       = false;
    this._dying      = true;
    this._deathT     = 0;
    this._deathSide  = Math.random() < 0.5 ? 1 : -1;
    this._deathBaseY = this.mesh.position.y;
    this.healthBarGroup.visible = false;
    if (this._muzzleFlash) this._muzzleFlash.intensity = 0;
  }

  _fireAt(player, onAttack) {
    const cfg = ARMED_CFG[this.armedType];
    if (Math.random() < cfg.accuracy) {
      onAttack(cfg.damage);
    }
    // Muzzle flash
    if (this._muzzleFlash) {
      this._muzzleFlash.intensity = 5.5;
      this._flashTimer = 0.09;
    }
    this.shootCooldown = cfg.cooldown;
  }

  update(dt, player, camera, onAttack) {
    // Muzzle flash decay
    if (this._muzzleFlash && this._flashTimer > 0) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) this._muzzleFlash.intensity = 0;
    }

    if (this._dying) {
      this._deathT += dt;
      const p = Math.min(1, this._deathT / 0.65);
      const e = p * p;
      this.mesh.rotation.z = e * (Math.PI / 2) * this._deathSide;
      this.mesh.rotation.x = e * 0.25;
      this.mesh.position.y = this._deathBaseY - e * 0.55;
      if (p > 0.55) {
        const fade = 1 - (p - 0.55) / 0.45;
        this.mesh.traverse(o => { if (o.isMesh && o.material) {
          o.material.transparent = true; o.material.opacity = fade;
        }});
      }
      if (p >= 1) {
        this._dying = false;
        this.mesh.visible = false;
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.position.y = this._deathBaseY;
        this.mesh.traverse(o => { if (o.isMesh && o.material) {
          o.material.transparent = false; o.material.opacity = 1;
        }});
      }
      return;
    }

    if (!this.alive) return;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.bodyMat.emissive.setRGB(0.4, 1, 0.2);
      this.bodyMat.emissiveIntensity = Math.max(0, this.flashTimer / 0.12) * 0.7;
    } else {
      this.bodyMat.emissiveIntensity = 0;
    }

    if (this.lungeTimer > 0) {
      this.lungeTimer -= dt;
      const s = 1 + Math.sin((this.lungeTimer / 0.2) * Math.PI) * 0.12;
      this.mesh.scale.setScalar(s);
    } else {
      this.mesh.scale.setScalar(1);
    }

    if (this.attackCooldown  > 0) this.attackCooldown  -= dt;
    if (this.shootCooldown   > 0) this.shootCooldown   -= dt;

    const toPlayer = new THREE.Vector3(player.position.x - this.position.x, 0, player.position.z - this.position.z);
    const dist = toPlayer.length();

    let moveDir = null;

    if (!player.isDead && dist < (this.armedType ? ARMED_CFG[this.armedType].chaseRange : DETECT_RADIUS)) {
      this.mesh.lookAt(player.position.x, this.position.y + 1.08, player.position.z);

      if (this.armedType) {
        const cfg = ARMED_CFG[this.armedType];

        if (dist < ATTACK_RADIUS * 0.9) {
          // Too close — melee fallback
          if (this.attackCooldown <= 0) {
            this.attackCooldown = ATTACK_COOLDOWN;
            this.lungeTimer = 0.2;
            onAttack(this.attackDamage);
          }
        } else if (dist <= cfg.stopRange) {
          // In shooting range — stand and fire
          if (this.shootCooldown <= 0) {
            this._fireAt(player, onAttack);
          }
          // Strafe slightly for realism (small sideways drift)
          const strafe = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize();
          const strafeSign = Math.sin(Date.now() * 0.0007 + this.id) > 0 ? 1 : -1;
          moveDir = strafe.multiplyScalar(strafeSign * 0.35);
        } else {
          // Out of range — chase
          moveDir = toPlayer.normalize();
        }
      } else {
        // Pure melee
        if (dist > ATTACK_RADIUS * 0.85) {
          moveDir = toPlayer.normalize();
        } else if (this.attackCooldown <= 0) {
          this.attackCooldown = ATTACK_COOLDOWN;
          this.lungeTimer = 0.2;
          onAttack(this.attackDamage);
        }
      }
    } else if (!this.armedType) {
      // Melee wander
      this.wanderCooldown -= dt;
      if (this.wanderCooldown <= 0 || this.position.distanceTo(this.wanderTarget) < 1.5) {
        const r = this.world.arenaHalf - 4;
        this.wanderTarget.set((Math.random() * 2 - 1) * r, 0, (Math.random() * 2 - 1) * r);
        this.wanderCooldown = 2 + Math.random() * 2;
      }
      const dir = new THREE.Vector3().subVectors(this.wanderTarget, this.position);
      if (dir.lengthSq() > 0.04) {
        moveDir = dir.normalize();
        this.mesh.lookAt(this.wanderTarget.x, this.position.y + 1.08, this.wanderTarget.z);
      }
    }

    if (moveDir) {
      this.position.addScaledVector(moveDir, this.speed * dt);
      this.world.resolveCollisions(this.position, RADIUS);
    }
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);

    if (this.healthBarGroup) {
      const lq = this.mesh.quaternion.clone().invert().multiply(camera.quaternion);
      this.healthBarGroup.quaternion.copy(lq);
    }
  }
}
