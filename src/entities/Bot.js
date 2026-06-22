import * as THREE from 'three';

const DETECT_RADIUS = 15;
const ATTACK_RADIUS = 1.9;
const ATTACK_DAMAGE = 9;
const ATTACK_COOLDOWN = 1.1;
const RESPAWN_DELAY = 4;
const RADIUS = 0.5;

let nextId = 1;

const BOT_TYPES = [
  { primary: 0x0a1a2a, secondary: 0x040810, trim: 0x0e2a3e, visor: 0x00e5ff }, // Sentinel Mk-VII
  { primary: 0x1e0a2a, secondary: 0x0a0418, trim: 0x2e0a42, visor: 0xaa44ff }, // Vex Construct
  { primary: 0x0a1a0a, secondary: 0x030803, trim: 0x102e10, visor: 0x39ff9e }, // Null Enforcer
];
let _botTypeIdx = 0; // round-robin so each new bot picks the next type

function buildBotMesh() {
  const cfg = BOT_TYPES[_botTypeIdx++ % BOT_TYPES.length];

  // Materials
  const suitMat  = new THREE.MeshStandardMaterial({ color: cfg.secondary, roughness: 0.84, metalness: 0.06 });
  const armorMat = new THREE.MeshStandardMaterial({ color: cfg.primary,   roughness: 0.50, metalness: 0.58 });
  const trimMat  = new THREE.MeshStandardMaterial({ color: cfg.trim,      roughness: 0.40, metalness: 0.72 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: cfg.visor, emissive: cfg.visor, emissiveIntensity: 1.4,
    roughness: 0.04, metalness: 0, transparent: true, opacity: 0.86
  });

  const group = new THREE.Group();

  function B(w,h,d,m)  { return new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m); }
  function Cap(r,h,m)  { return new THREE.Mesh(new THREE.CapsuleGeometry(r,h,6,10), m); }
  function Sph(r,m)    { return new THREE.Mesh(new THREE.SphereGeometry(r,10,8), m); }
  function add(mesh,x,y,z){ mesh.position.set(x,y,z); group.add(mesh); return mesh; }

  // ── Boots ─────────────────────────────────────────────────────────────────
  [[-0.15], [0.15]].forEach(([bx]) => {
    add(B(0.21,0.22,0.31,armorMat), bx,  0.11,  0.02);
    add(B(0.23,0.04,0.33,trimMat),  bx,  0.01,  0.02);
    add(B(0.23,0.09,0.29,armorMat), bx,  0.23,  0.01);
  });

  // ── Lower legs ────────────────────────────────────────────────────────────
  [[-0.15],[0.15]].forEach(([lx]) => {
    add(Cap(0.095,0.38,suitMat),    lx,  0.53,  0);
    add(B(0.17,0.38,0.06,armorMat), lx,  0.53, -0.1);
    add(B(0.21,0.13,0.15,armorMat), lx,  0.76, -0.06);
  });

  // ── Thighs ────────────────────────────────────────────────────────────────
  [[-0.15,-1],[0.15,1]].forEach(([tx,s]) => {
    add(Cap(0.12,0.36,suitMat),         tx,             1.04, 0);
    add(B(0.14,0.34,0.1,armorMat),      tx-s*0.13,      1.04, 0);
    add(B(0.12,0.006,0.1,trimMat),      tx-s*0.13,      1.14, 0);
  });

  // ── Hips ──────────────────────────────────────────────────────────────────
  add(B(0.47,0.12,0.29,armorMat), 0, 1.21, 0);
  add(B(0.49,0.07,0.31,suitMat),  0, 1.27, 0);

  // ── Torso (body + layered plates) ─────────────────────────────────────────
  add(Cap(0.28,0.50,suitMat),          0, 1.56,  0);     // undersuit body
  add(B(0.51,0.51,0.10,armorMat),      0, 1.56, -0.18);  // front chest plate
  add(B(0.025,0.47,0.014,trimMat),     0, 1.56, -0.237); // centre groove
  [-0.16,0.16].forEach((px) => add(B(0.17,0.18,0.016,armorMat), px, 1.64, -0.192));
  add(B(0.49,0.44,0.09,armorMat),      0, 1.56,  0.18);  // back plate
  add(B(0.31,0.08,0.31,armorMat),      0, 1.85,  0);     // collar

  // ── Pauldrons ─────────────────────────────────────────────────────────────
  [[-1,-0.35],[1,0.35]].forEach(([s,ax]) => {
    const sock = Sph(0.11,suitMat); sock.position.set(ax,1.76,0); group.add(sock);
    add(B(0.23,0.21,0.33,armorMat), s*0.44, 1.76, 0);
    add(B(0.26,0.06,0.35,armorMat), s*0.44, 1.87, 0);
    add(B(0.008,0.19,0.33,visorMat),s*0.555,1.76, 0);   // coloured shoulder stripe
  });

  // ── Arms ──────────────────────────────────────────────────────────────────
  [[-1,-0.38],[1,0.38]].forEach(([s,ax]) => {
    add(Cap(0.09,0.34,suitMat),     ax, 1.52, 0);
    add(B(0.18,0.12,0.18,armorMat), ax, 1.31, 0);   // elbow guard
    add(Cap(0.08,0.28,suitMat),     ax, 1.10, 0);
    add(B(0.16,0.28,0.06,armorMat), ax, 1.10,-0.09);// vambrace
    add(B(0.18,0.14,0.16,suitMat),  ax, 0.85, 0);   // bare hand / glove
  });

  // ── Android head unit ─────────────────────────────────────────────────────
  // Neck connector (mechanical joints)
  add(B(0.22,0.10,0.20,trimMat),    0, 1.91,  0.00);
  add(B(0.14,0.08,0.14,suitMat),    0, 1.83,  0.00);

  // Main head chassis — angular, box-like
  const headBox = add(B(0.40,0.32,0.38,armorMat), 0, 2.13, 0.00);

  // Brow plate (angled edge)
  add(B(0.42,0.055,0.14,trimMat),   0, 2.30, -0.06);
  // Chin module
  add(B(0.34,0.07,0.32,trimMat),    0, 1.96,  0.00);

  // Full-width sensor visor strip
  add(B(0.38,0.10,0.03,visorMat),   0, 2.13, -0.19);

  // Side sensor nodes
  [-0.20,0.20].forEach(sx => add(Sph(0.028,visorMat), sx, 2.13, -0.18));

  // Side panel detail
  [-1,1].forEach(s => {
    add(B(0.04,0.26,0.36,trimMat),  s*0.21, 2.13,  0.00);
    add(B(0.035,0.055,0.08,visorMat), s*0.21, 2.20, -0.06);
  });

  // Top sensor/antenna array
  add(B(0.10,0.04,0.10,trimMat),    0, 2.30,  0.06);
  add(B(0.025,0.14,0.025,visorMat), 0, 2.39,  0.06);
  add(B(0.06,0.035,0.06,trimMat),   0, 2.47,  0.06);

  // ── Shadow + light casting on all meshes ──────────────────────────────────
  group.traverse((obj) => {
    if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; }
  });

  return { group, bodyMat: armorMat, torso: headBox, head: headBox };
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
      // Tag head-zone parts for headshot detection (y ≥ 1.90 = neck and above)
      if (obj.isMesh && obj.position.y >= 1.90) obj.userData.isHead = true;
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
