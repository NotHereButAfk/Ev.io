import * as THREE from 'three';

const DETECT_RADIUS = 15;
const ATTACK_RADIUS = 1.9;
const ATTACK_DAMAGE = 9;
const ATTACK_COOLDOWN = 1.1;
const RESPAWN_DELAY = 4;
const RADIUS = 0.5;

let nextId = 1;

function buildBotMesh() {
  const group = new THREE.Group();

  // Corrupted sci-fi trooper — dark armour, cracked red visor
  const armorMat  = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.58, metalness: 0.55 });
  const suitMat   = new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.82, metalness: 0.08 });
  const eyeMat    = new THREE.MeshStandardMaterial({ color: 0xff2200, roughness: 0.1,  metalness: 0.0,
                                                     emissive: 0xff2200, emissiveIntensity: 1.2 });
  const trimMat   = new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.4,  metalness: 0.7  });

  function B(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
  function Cap(r, h, mat)  { return new THREE.Mesh(new THREE.CapsuleGeometry(r, h, 6, 10), mat); }
  function C(r, h, mat)    { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), mat); return m; }

  // Boots
  [[-0.15], [0.15]].forEach(([bx]) => {
    const boot = B(0.2, 0.22, 0.3, armorMat); boot.position.set(bx, 0.11, 0.02); group.add(boot);
    const sole = B(0.22, 0.04, 0.32, trimMat); sole.position.set(bx, 0.01, 0.02); group.add(sole);
    const ankle = B(0.22, 0.09, 0.28, armorMat); ankle.position.set(bx, 0.23, 0.01); group.add(ankle);
  });

  // Lower legs
  [[-0.15], [0.15]].forEach(([lx]) => {
    const shin = Cap(0.1, 0.38, suitMat); shin.position.set(lx, 0.54, 0); group.add(shin);
    const greave = B(0.18, 0.38, 0.07, armorMat); greave.position.set(lx, 0.54, -0.1); group.add(greave);
    const knee = B(0.22, 0.14, 0.16, armorMat); knee.position.set(lx, 0.77, -0.06); group.add(knee);
  });

  // Thighs
  [[-0.15, -1], [0.15, 1]].forEach(([tx, side]) => {
    const thigh = Cap(0.13, 0.36, suitMat); thigh.position.set(tx, 1.04, 0); group.add(thigh);
    const plate = B(0.14, 0.34, 0.1, armorMat); plate.position.set(tx - side * 0.12, 1.04, 0); group.add(plate);
  });

  // Hips
  const hip = B(0.46, 0.12, 0.28, armorMat); hip.position.set(0, 1.22, 0); group.add(hip);
  const belt = B(0.48, 0.07, 0.3, suitMat);  belt.position.set(0, 1.27, 0); group.add(belt);

  // Torso — hunched slightly (rotation applied to whole group later)
  const torsoBg = Cap(0.3, 0.52, suitMat);  torsoBg.position.y = 1.57; group.add(torsoBg);
  const chest   = B(0.52, 0.52, 0.1, armorMat); chest.position.set(0, 1.57, -0.18); group.add(chest);
  const groove  = B(0.024, 0.48, 0.014, trimMat); groove.position.set(0, 1.57, -0.238); group.add(groove);
  const back    = B(0.5, 0.46, 0.09, armorMat);  back.position.set(0, 1.57, 0.18); group.add(back);
  const collar  = B(0.32, 0.09, 0.32, armorMat); collar.position.set(0, 1.86, 0); group.add(collar);

  // Pauldrons
  [[-1, -0.35], [1, 0.35]].forEach(([side, ax]) => {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), suitMat);
    socket.position.set(ax, 1.77, 0); group.add(socket);
    const pau = B(0.24, 0.22, 0.34, armorMat); pau.position.set(ax * 1.26, 1.77, 0); group.add(pau);
    const pauTop = B(0.26, 0.07, 0.36, armorMat); pauTop.position.set(ax * 1.26, 1.88, 0); group.add(pauTop);
  });

  // Arms — extended slightly outward (zombie menace pose)
  [[-1, -0.4], [1, 0.4]].forEach(([side, ax]) => {
    const uArm = Cap(0.095, 0.34, suitMat); uArm.position.set(ax, 1.52, 0); group.add(uArm);
    const elbow = B(0.18, 0.12, 0.18, armorMat); elbow.position.set(ax, 1.3, 0); group.add(elbow);
    const fArm = Cap(0.085, 0.28, suitMat); fArm.position.set(ax, 1.1, 0); group.add(fArm);
    const vambrace = B(0.17, 0.28, 0.06, armorMat); vambrace.position.set(ax, 1.1, -0.09); group.add(vambrace);
    const glove = B(0.19, 0.15, 0.17, suitMat); glove.position.set(ax, 0.86, 0); group.add(glove);
  });

  // Helmet — boxy, battle-scarred
  const helmMain = B(0.4, 0.44, 0.42, armorMat); helmMain.position.y = 2.05; group.add(helmMain);
  const helmTop  = B(0.34, 0.1, 0.38, armorMat); helmTop.position.y  = 2.27; group.add(helmTop);
  const crest    = B(0.05, 0.09, 0.4, trimMat);  crest.position.set(0, 2.33, 0); group.add(crest);
  [-1, 1].forEach((s) => {
    const cheek = B(0.07, 0.22, 0.32, armorMat); cheek.position.set(s * 0.235, 2.0, 0); group.add(cheek);
  });
  const chin = B(0.3, 0.1, 0.1, armorMat); chin.position.set(0, 1.84, -0.17); group.add(chin);
  const helmBack = B(0.36, 0.4, 0.08, armorMat); helmBack.position.set(0, 2.05, 0.25); group.add(helmBack);
  const neckSeal = C(0.145, 0.06, suitMat); neckSeal.position.y = 1.88; group.add(neckSeal);

  // Red cracked visor — enemy signature
  const visor = B(0.36, 0.11, 0.06, eyeMat); visor.position.set(0, 2.1, -0.22); group.add(visor);
  const visorSlot = B(0.38, 0.13, 0.02, suitMat); visorSlot.position.set(0, 2.1, -0.2); group.add(visorSlot);
  // Crack detail
  const crack = B(0.006, 0.13, 0.008, suitMat); crack.position.set(0.08, 2.1, -0.228); crack.rotation.z = 0.3; group.add(crack);

  // Expose bodyMat alias so health-damage tinting still works
  const bodyMat = armorMat;
  const torso   = torsoBg;
  const head    = helmMain;

  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow   = true;
      obj.receiveShadow = true;
    }
  });

  return { group, bodyMat, torso, head };
}

function buildHealthBar() {
  const group = new THREE.Group();
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x14161a, depthTest: false })
  );
  const fg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.06),
    new THREE.MeshBasicMaterial({ color: 0xff4d4d, depthTest: false })
  );
  bg.renderOrder = 10;
  fg.renderOrder = 11;
  bg.userData.noHit = true;
  fg.userData.noHit = true;
  group.add(bg);
  group.add(fg);
  group.position.y = 2.25;
  return { group, fg };
}

export class Bot {
  constructor(world, spawnPoint) {
    this.id = nextId++;
    this.world = world;
    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.alive = true;
    this.respawnTimer = 0;
    this.attackCooldown = 0;
    this.flashTimer = 0;
    this.wanderTarget = spawnPoint.clone();
    this.wanderCooldown = 0;
    this.speed = 2.6 + Math.random() * 1.2;
    this.lungeTimer = 0;

    this.position = spawnPoint.clone();

    const { group, bodyMat, torso, head } = buildBotMesh();
    this.mesh = group;
    this.bodyMat = bodyMat;
    this.torso = torso;
    this.head = head;
    this.mesh.userData.bot = this;
    this.mesh.traverse((obj) => {
      obj.userData.bot = this;
    });

    const { group: hpGroup, fg } = buildHealthBar();
    this.healthBarFg = fg;
    this.mesh.add(hpGroup);
    this.healthBarGroup = hpGroup;

    this.mesh.position.copy(this.position);
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    this.health = Math.max(0, this.health - amount);
    this.flashTimer = 0.12;
    this.healthBarFg.scale.x = Math.max(0.001, this.health / this.maxHealth);
    this.healthBarFg.position.x = -((1 - this.healthBarFg.scale.x) * 0.33);
    if (this.health <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    this.alive = false;
    this._dying      = true;
    this._deathT     = 0;
    this._deathSide  = Math.random() < 0.5 ? 1 : -1;
    this._deathBaseY = this.mesh.position.y;
    this.healthBarGroup.visible = false;
  }

  respawnAt(point) {
    this.position.copy(point);
    this.mesh.position.set(point.x, point.y, point.z);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.scale.setScalar(1);
    this.health = this.maxHealth;
    this.healthBarFg.scale.x = 1;
    this.healthBarFg.position.x = 0;
    this.healthBarGroup.visible = true;
    this._dying = false;
    this.alive = true;
    this.mesh.visible = true;
  }

  update(dt, player, camera, onAttack) {
    // ── death animation ──────────────────────────────────────────────────────
    if (this._dying) {
      this._deathT += dt;
      const p = Math.min(1, this._deathT / 0.65);
      // ease-in fall
      const eased = p * p;
      this.mesh.rotation.z = eased * (Math.PI / 2) * this._deathSide;
      this.mesh.rotation.x = eased * 0.25;
      this.mesh.position.y = this._deathBaseY - eased * 0.55;
      // fade out
      if (p > 0.55) {
        const fade = 1 - (p - 0.55) / 0.45;
        this.mesh.traverse(o => { if (o.isMesh && o.material) {
          o.material.transparent = true;
          o.material.opacity = fade;
        }});
      }
      if (p >= 1) {
        this._dying = false;
        this.mesh.visible = false;
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.position.y = this._deathBaseY;
        // restore opacity on all meshes for next respawn
        this.mesh.traverse(o => { if (o.isMesh && o.material) {
          o.material.transparent = false; o.material.opacity = 1;
        }});
        if (!this.noRespawn) this.respawnTimer = RESPAWN_DELAY;
      }
      return;
    }

    if (!this.alive) {
      if (!this.noRespawn) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.respawnAt(this.world.randomSpawnPoint());
      }
      return;
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.bodyMat.emissive.setRGB(1, 1, 1);
      this.bodyMat.emissiveIntensity = Math.max(0, this.flashTimer / 0.12) * 0.8;
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

    const toPlayer = new THREE.Vector3(player.position.x - this.position.x, 0, player.position.z - this.position.z);
    const distToPlayer = toPlayer.length();

    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    let moveTarget = null;
    if (!player.isDead && distToPlayer < DETECT_RADIUS) {
      this.mesh.lookAt(player.position.x, this.position.y + 1.08, player.position.z);
      if (distToPlayer > ATTACK_RADIUS * 0.85) {
        moveTarget = toPlayer.normalize();
      } else if (this.attackCooldown <= 0) {
        this.attackCooldown = ATTACK_COOLDOWN;
        this.lungeTimer = 0.2;
        onAttack(ATTACK_DAMAGE);
      }
    } else {
      this.wanderCooldown -= dt;
      if (this.wanderCooldown <= 0 || this.position.distanceTo(this.wanderTarget) < 1.5) {
        const r = this.world.arenaHalf - 4;
        this.wanderTarget.set((Math.random() * 2 - 1) * r, 0, (Math.random() * 2 - 1) * r);
        this.wanderCooldown = 3 + Math.random() * 3;
      }
      const dir = new THREE.Vector3().subVectors(this.wanderTarget, this.position);
      if (dir.lengthSq() > 0.04) {
        moveTarget = dir.normalize();
        this.mesh.lookAt(this.wanderTarget.x, this.position.y + 1.08, this.wanderTarget.z);
      }
    }

    if (moveTarget) {
      this.position.addScaledVector(moveTarget, this.speed * dt);
      this.world.resolveCollisions(this.position, RADIUS);
    }

    this.mesh.position.set(this.position.x, this.position.y, this.position.z);

    if (this.healthBarGroup) {
      const localQuat = this.mesh.quaternion.clone().invert().multiply(camera.quaternion);
      this.healthBarGroup.quaternion.copy(localQuat);
    }
  }
}
