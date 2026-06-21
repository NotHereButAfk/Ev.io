import * as THREE from 'three';

const DETECT_RADIUS  = 22;
const ATTACK_RADIUS  = 1.7;
const ATTACK_COOLDOWN = 1.5;
const RADIUS = 0.5;

let _nextId = 5000;

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

  // Arms — outstretched forward (zombie reach pose)
  [[-1, -0.38], [1, 0.38]].forEach(([, ax]) => {
    const uArm = Cap(0.09, 0.34, fleshMat);
    uArm.position.set(ax, 1.56, -0.14);
    uArm.rotation.x = -0.55;
    group.add(uArm);

    const fArm = Cap(0.08, 0.28, fleshMat);
    fArm.position.set(ax, 1.32, -0.32);
    fArm.rotation.x = -0.28;
    group.add(fArm);

    const hand = B(0.17, 0.14, 0.18, fleshMat);
    hand.position.set(ax, 1.13, -0.42);
    group.add(hand);
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

  return { group, bodyMat: ragMat, torso: torsoBg, head };
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

export class Zombie {
  constructor(world, spawnPoint, hpMult = 1, speedMult = 1, wave = 1) {
    this.id           = _nextId++;
    this.world        = world;
    this.maxHealth    = Math.round(80 * hpMult);
    this.health       = this.maxHealth;
    this.alive        = true;
    this.noRespawn    = true;
    this.attackCooldown = 0;
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

    this.position = spawnPoint.clone();

    const { group, bodyMat, torso, head } = buildZombieMesh();
    this.mesh    = group;
    this.bodyMat = bodyMat;
    this.torso   = torso;
    this.head    = head;
    this.mesh.userData.bot = this;
    this.mesh.traverse(obj => { obj.userData.bot = this; });

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
  }

  update(dt, player, camera, onAttack) {
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

    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    const toPlayer = new THREE.Vector3(player.position.x - this.position.x, 0, player.position.z - this.position.z);
    const dist = toPlayer.length();

    let moveDir = null;
    if (!player.isDead && dist < DETECT_RADIUS) {
      this.mesh.lookAt(player.position.x, this.position.y + 1.08, player.position.z);
      if (dist > ATTACK_RADIUS * 0.85) {
        moveDir = toPlayer.normalize();
      } else if (this.attackCooldown <= 0) {
        this.attackCooldown = ATTACK_COOLDOWN;
        this.lungeTimer = 0.2;
        onAttack(this.attackDamage);
      }
    } else {
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
