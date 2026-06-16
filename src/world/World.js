import * as THREE from 'three';

const ARENA_HALF = 32;

function makeGridTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1b2027';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  const step = size / 16;
  for (let i = 0; i <= 16; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return tex;
}

export class World {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e14);
    this.scene.fog = new THREE.Fog(0x0b0e14, 35, 95);

    this.arenaHalf = ARENA_HALF;
    this.colliders = []; // { box: THREE.Box3, mesh }
    this.spawnPoints = [];

    this._buildLighting();
    this._buildGround();
    this._buildWalls();
    this._buildObstacles();
    this._buildSpawnPoints();
    this.previewPedestalPos = new THREE.Vector3(0, 0, -6);
  }

  _buildLighting() {
    const hemi = new THREE.HemisphereLight(0x9bb7d4, 0x1a1410, 0.65);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1d8, 1.1);
    sun.position.set(28, 42, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 150;
    sun.shadow.bias = -0.0015;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x4a6fa0, 0.25);
    fill.position.set(-20, 15, -25);
    this.scene.add(fill);
  }

  _buildGround() {
    const geo = new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2);
    const mat = new THREE.MeshStandardMaterial({ map: makeGridTexture(), roughness: 0.95, metalness: 0.05 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _addCollider(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    this.colliders.push({ box, mesh });
  }

  _buildWalls() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x262c36, roughness: 0.9 });
    const h = 6;
    const half = ARENA_HALF;
    const thickness = 1;

    const specs = [
      { w: half * 2 + thickness * 2, d: thickness, x: 0, z: -half - thickness / 2 },
      { w: half * 2 + thickness * 2, d: thickness, x: 0, z: half + thickness / 2 },
      { w: thickness, d: half * 2 + thickness * 2, x: -half - thickness / 2, z: 0 },
      { w: thickness, d: half * 2 + thickness * 2, x: half + thickness / 2, z: 0 }
    ];

    for (const s of specs) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, h, s.d), wallMat);
      mesh.position.set(s.x, h / 2, s.z);
      this._addCollider(mesh);
    }
  }

  _buildObstacles() {
    const palette = [0x3a4250, 0x46362c, 0x2f4536, 0x3d3a4d];
    const layout = [
      { x: 10, z: 4, w: 3, h: 2.4, d: 3 },
      { x: -10, z: -6, w: 3, h: 2.4, d: 3 },
      { x: 16, z: -14, w: 4, h: 3, d: 2 },
      { x: -16, z: 14, w: 4, h: 3, d: 2 },
      { x: 0, z: 18, w: 6, h: 1.6, d: 2.5 },
      { x: 0, z: -18, w: 6, h: 1.6, d: 2.5 },
      { x: 20, z: 0, w: 2, h: 2.8, d: 6 },
      { x: -20, z: 0, w: 2, h: 2.8, d: 6 },
      { x: 6, z: -22, w: 2.4, h: 2, d: 2.4 },
      { x: -6, z: 22, w: 2.4, h: 2, d: 2.4 }
    ];

    layout.forEach((spec, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: palette[i % palette.length], roughness: 0.85 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), mat);
      mesh.position.set(spec.x, spec.h / 2, spec.z);
      this._addCollider(mesh);
    });
  }

  _buildSpawnPoints() {
    const r = ARENA_HALF - 6;
    const count = 10;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      this.spawnPoints.push(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r));
    }
  }

  randomSpawnPoint() {
    return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)].clone();
  }

  /** Resolve horizontal collisions for a vertical capsule-ish player against box colliders. */
  resolveCollisions(position, radius) {
    for (const { box } of this.colliders) {
      const closestX = Math.max(box.min.x, Math.min(position.x, box.max.x));
      const closestZ = Math.max(box.min.z, Math.min(position.z, box.max.z));
      const dx = position.x - closestX;
      const dz = position.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius && position.y < box.max.y && position.y + 1.7 > box.min.y) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const overlap = radius - dist;
        position.x += (dx / dist) * overlap;
        position.z += (dz / dist) * overlap;
      }
    }

    const half = this.arenaHalf - 1.2;
    position.x = THREE.MathUtils.clamp(position.x, -half, half);
    position.z = THREE.MathUtils.clamp(position.z, -half, half);
    return position;
  }
}
