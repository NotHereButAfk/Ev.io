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
  const skinTone = 0xd9572f;
  const bodyMat = new THREE.MeshStandardMaterial({ color: skinTone, roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a1410, roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.7, 4, 8), bodyMat);
  torso.position.y = 1.08;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 10), bodyMat);
  head.position.y = 1.78;
  group.add(head);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.06), darkMat);
  visor.position.set(0, 1.8, 0.24);
  group.add(visor);

  const armGeo = new THREE.CapsuleGeometry(0.1, 0.5, 4, 6);
  const armL = new THREE.Mesh(armGeo, darkMat);
  armL.position.set(-0.46, 1.05, 0);
  armL.rotation.z = 0.25;
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, darkMat);
  armR.position.set(0.46, 1.05, 0);
  armR.rotation.z = -0.25;
  group.add(armR);

  const legGeo = new THREE.CapsuleGeometry(0.13, 0.55, 4, 6);
  const legL = new THREE.Mesh(legGeo, darkMat);
  legL.position.set(-0.16, 0.32, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, darkMat);
  legR.position.set(0.16, 0.32, 0);
  group.add(legR);

  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
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
    this.mesh.visible = false;
    this.respawnTimer = RESPAWN_DELAY;
  }

  respawnAt(point) {
    this.position.copy(point);
    this.health = this.maxHealth;
    this.healthBarFg.scale.x = 1;
    this.healthBarFg.position.x = 0;
    this.alive = true;
    this.mesh.visible = true;
  }

  update(dt, player, camera, onAttack) {
    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.respawnAt(this.world.randomSpawnPoint());
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
