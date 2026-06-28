import * as THREE from 'three';

const THROW_SPEED = 16;
const THROW_ARC   = 4.5;
const GRAVITY     = -18;
const BOUNCE_DAMP = 0.40;
const FRAG_FUSE   = 2.5;
const SMOKE_FUSE  = 1.2;
const FRAG_RADIUS = 5;
const FRAG_DMG    = 80;

export class GrenadeSystem {
  constructor(scene) {
    this.scene       = scene;
    this.frags       = 2;
    this.smokes      = 2;
    this.throwables  = [];
    this.smokeClouds = [];
    this.explosions  = [];

    this.onExplode = null; // (point, radius, damage) => void
  }

  throwFrag(camera) {
    if (this.frags <= 0) return;
    this.frags--;
    this._spawn(camera, 'frag');
  }

  throwSmoke(camera) {
    if (this.smokes <= 0) return;
    this.smokes--;
    this._spawn(camera, 'smoke');
  }

  _spawn(camera, type) {
    const pos = new THREE.Vector3();
    camera.getWorldPosition(pos);
    pos.y -= 0.15;

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);

    const vel = dir.clone().multiplyScalar(THROW_SPEED);
    vel.y += THROW_ARC;

    const mesh = this._buildMesh(type);
    mesh.position.copy(pos);
    this.scene.add(mesh);

    this.throwables.push({ mesh, pos: pos.clone(), vel, type, life: type === 'frag' ? FRAG_FUSE : SMOKE_FUSE });
  }

  _buildMesh(type) {
    const g = new THREE.Group();
    if (type === 'frag') {
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2e3d1f, roughness: 0.7, metalness: 0.45 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), bodyMat);
      g.add(body);
      // segmented surface bands
      for (let i = -1; i <= 1; i++) {
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(0.065, 0.009, 6, 14),
          new THREE.MeshStandardMaterial({ color: 0x1a2410, roughness: 0.8, metalness: 0.3 })
        );
        band.rotation.x = Math.PI / 2;
        band.position.y = i * 0.03;
        g.add(band);
      }
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.022, 0.005, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0xb0a890, roughness: 0.4, metalness: 0.75 })
      );
      ring.position.y = 0.075;
      g.add(ring);
    } else {
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a5068, roughness: 0.55, metalness: 0.35 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.14, 10), bodyMat);
      g.add(body);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.046, 0.046, 0.028, 10),
        new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.5, metalness: 0.2 })
      );
      band.position.y = 0.028;
      g.add(band);
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.030, 0.042, 0.018, 10),
        new THREE.MeshStandardMaterial({ color: 0x2a3d4f, roughness: 0.6, metalness: 0.4 })
      );
      cap.position.y = 0.079;
      g.add(cap);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  update(dt, player) {
    // in-flight throwables
    for (let i = this.throwables.length - 1; i >= 0; i--) {
      const t = this.throwables[i];
      t.vel.y += GRAVITY * dt;
      t.pos.addScaledVector(t.vel, dt);
      t.life -= dt;
      t.mesh.position.copy(t.pos);
      t.mesh.rotation.x += dt * 5;
      t.mesh.rotation.z += dt * 3.5;

      if (t.pos.y <= 0.07 && t.vel.y < 0) {
        t.pos.y = 0.07;
        t.vel.y *= -BOUNCE_DAMP;
        t.vel.x *= 0.72;
        t.vel.z *= 0.72;
      }

      if (t.life <= 0) {
        this._detonate(t, player);
        this.scene.remove(t.mesh);
        t.mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
        this.throwables.splice(i, 1);
      }
    }

    // smoke clouds
    for (let i = this.smokeClouds.length - 1; i >= 0; i--) {
      const s = this.smokeClouds[i];
      s.t += dt;
      const p = s.t / s.life;
      if (p >= 1) {
        for (const m of s.meshes) {
          this.scene.remove(m);
          m.geometry.dispose();
          m.material.dispose();
        }
        this.smokeClouds.splice(i, 1);
        continue;
      }
      const scale   = p < 0.25 ? THREE.MathUtils.lerp(0.05, 1, p / 0.25) : 1;
      const opacity = p > 0.72 ? THREE.MathUtils.lerp(0.7, 0, (p - 0.72) / 0.28) : 0.7;
      for (const m of s.meshes) {
        m.scale.setScalar(scale);
        m.material.opacity = opacity;
      }
    }

    // frag explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.t += dt;
      const p = e.t / e.life;
      if (p >= 1) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.scene.remove(e.light);
        this.explosions.splice(i, 1);
        continue;
      }
      e.mesh.scale.setScalar(THREE.MathUtils.lerp(0.3, 4, p));
      e.mesh.material.opacity = 0.9 * (1 - p);
      e.light.intensity = 12 * (1 - p);
    }
  }

  _detonate(t, player) {
    if (t.type === 'frag') this._fragExplode(t.pos.clone(), player);
    else                   this._smokeExplode(t.pos.clone());
  }

  _fragExplode(point, player) {
    const fireball = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.92 })
    );
    fireball.position.copy(point);
    this.scene.add(fireball);

    const light = new THREE.PointLight(0xff8a3a, 12, FRAG_RADIUS * 3.5, 2);
    light.position.copy(point);
    // (sky-only lighting) explosion light not added to scene
    this.explosions.push({ mesh: fireball, light, t: 0, life: 0.5 });

    if (this.onExplode) this.onExplode(point, FRAG_RADIUS, FRAG_DMG);

    // self-damage
    if (player) {
      const d = player.position.distanceTo(point);
      if (d <= FRAG_RADIUS) {
        const f = THREE.MathUtils.lerp(1, 0.1, THREE.MathUtils.clamp(d / FRAG_RADIUS, 0, 1));
        player.takeDamage(FRAG_DMG * f);
      }
    }
  }

  _smokeExplode(point) {
    const RADIUS = 4.2;
    const meshes = [];
    for (let i = 0; i < 6; i++) {
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * RADIUS * 0.9,
        Math.random() * RADIUS * 0.55,
        (Math.random() - 0.5) * RADIUS * 0.9
      );
      const r = RADIUS * (0.55 + Math.random() * 0.45);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xd0d0d0, transparent: true, opacity: 0, depthWrite: false })
      );
      mesh.position.copy(point).add(offset);
      this.scene.add(mesh);
      meshes.push(mesh);
    }
    this.smokeClouds.push({ meshes, t: 0, life: 9 });
  }

  getHudInfo() {
    return { frags: this.frags, smokes: this.smokes };
  }

  reset() {
    for (const t of this.throwables) {
      this.scene.remove(t.mesh);
      t.mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    this.throwables.length = 0;
    for (const s of this.smokeClouds) {
      for (const m of s.meshes) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    }
    this.smokeClouds.length = 0;
    for (const e of this.explosions) {
      this.scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose();
      this.scene.remove(e.light);
    }
    this.explosions.length = 0;
    this.frags  = 2;
    this.smokes = 2;
  }
}
