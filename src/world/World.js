import * as THREE from 'three';

const ARENA_HALF = 60;

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

// Asphalt road surface with faded lane markings.
function makeRoadTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101216';
  ctx.fillRect(0, 0, size, size);
  // grain
  for (let i = 0; i < 5000; i++) {
    const v = 16 + Math.random() * 26;
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  // centre dashed line
  ctx.fillStyle = 'rgba(210,200,150,0.55)';
  for (let y = 0; y < size; y += 64) {
    ctx.fillRect(size / 2 - 4, y + 12, 8, 36);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ARENA_HALF / 6, ARENA_HALF / 6);
  return tex;
}

// Concrete sidewalk with expansion-joint lines.
function makeSidewalkTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a2d33';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2500; i++) {
    const v = 38 + Math.random() * 22;
    ctx.fillStyle = `rgb(${v},${v},${v + 3})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo((i / 4) * size, 0);
    ctx.lineTo((i / 4) * size, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, (i / 4) * size);
    ctx.lineTo(size, (i / 4) * size);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Building facade: dark wall with a grid of windows, some lit warm/cool.
function makeFacadeTexture(seed) {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const baseShades = ['#0e1116', '#12151b', '#171a1f', '#0c0f14'];
  ctx.fillStyle = baseShades[seed % baseShades.length];
  ctx.fillRect(0, 0, w, h);

  const cols = 6;
  const rows = 14;
  const padX = 8;
  const padY = 8;
  const cellW = (w - padX * 2) / cols;
  const cellH = (h - padY * 2) / rows;
  const winW = cellW * 0.62;
  const winH = cellH * 0.6;

  const litWarm = ['#ffd9a0', '#ffe7bd', '#ffcf86', '#fff0cf'];
  const litCool = ['#bcd4ff', '#d4e4ff', '#a9c4f5'];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padX + c * cellW + (cellW - winW) / 2;
      const y = padY + r * cellH + (cellH - winH) / 2;
      const lit = Math.random() < 0.42;
      if (lit) {
        const cool = Math.random() < 0.25;
        const pal = cool ? litCool : litWarm;
        ctx.fillStyle = pal[Math.floor(Math.random() * pal.length)];
        ctx.globalAlpha = 0.55 + Math.random() * 0.45;
      } else {
        ctx.fillStyle = '#05070a';
        ctx.globalAlpha = 1;
      }
      ctx.fillRect(x, y, winW, winH);
      ctx.globalAlpha = 1;
    }
  }
  // rooftop band
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, w, padY);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class World {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070d);
    this.scene.fog = new THREE.Fog(0x06080f, 28, 130);

    this.arenaHalf = ARENA_HALF;
    this.colliders = []; // { box, mesh }
    this.spawnPoints = [];

    // a few shared facade textures to keep memory sane
    this._facadeTex = [0, 1, 2, 3, 4, 5].map((i) => makeFacadeTexture(i));

    this._buildLighting();
    this._buildGround();
    this._buildSky();
    this._buildCity();
    this._buildStreetProps();
    this._buildBoundary();
    this._buildSpawnPoints();

    this.previewPedestalPos = new THREE.Vector3(0, 0, -6);
  }

  _buildLighting() {
    // faint sky bounce
    const hemi = new THREE.HemisphereLight(0x2a3550, 0x080808, 0.35);
    this.scene.add(hemi);

    // moonlight — cool, low, casts the scene's shadows
    const moon = new THREE.DirectionalLight(0xaec3e8, 0.5);
    moon.position.set(-50, 70, 40);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -70;
    moon.shadow.camera.right = 70;
    moon.shadow.camera.top = 70;
    moon.shadow.camera.bottom = -70;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 220;
    moon.shadow.bias = -0.0015;
    this.scene.add(moon);

    // warm city skyglow fill from below the horizon
    const fill = new THREE.DirectionalLight(0xff7a3a, 0.12);
    fill.position.set(20, 6, -30);
    this.scene.add(fill);
  }

  _buildGround() {
    // road base
    const roadMat = new THREE.MeshStandardMaterial({
      map: makeRoadTexture(),
      roughness: 0.85,
      metalness: 0.1,
      color: 0x9aa0a8
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2), roadMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _buildSky() {
    // moon disc
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xeef2ff, fog: false });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 24), moonMat);
    moon.position.set(-90, 80, -120);
    this.scene.add(moon);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(11, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.18, fog: false })
    );
    halo.position.copy(moon.position);
    this.scene.add(halo);

    // scattered stars
    const starGeo = new THREE.BufferGeometry();
    const count = 600;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.45 + 0.05;
      pos[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
      pos[i * 3 + 1] = Math.cos(phi) * r + 40;
      pos[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xcfd8ff, size: 0.8, sizeAttenuation: true, fog: false })
    );
    this.scene.add(stars);
  }

  _addCollider(mesh) {
    this.scene.add(mesh);
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    this.colliders.push({ box, mesh });
  }

  _buildCity() {
    // City blocks sit in a grid; the central row (z=0) and column (x=0) are
    // left clear so two wide avenues cross at the plaza, giving long sightlines
    // and somewhere to spawn. Buildings only fill the four quadrants.
    const cell = 18; // centre-to-centre spacing
    const range = 3; // cells out from centre (=> avenues + 6x6 of blocks)

    for (let ix = -range; ix <= range; ix++) {
      for (let iz = -range; iz <= range; iz++) {
        if (ix === 0 || iz === 0) continue; // keep the cross avenues open
        const cx = ix * cell;
        const cz = iz * cell;

        // footprint, leaving room for sidewalks + streets
        const fw = 9 + Math.random() * 4;
        const fd = 9 + Math.random() * 4;
        const height = 10 + Math.random() * 30;

        this._buildBuilding(cx, cz, fw, fd, height);
      }
    }
  }

  _buildBuilding(cx, cz, fw, fd, height) {
    // sidewalk slab under/around the building
    const swMat = new THREE.MeshStandardMaterial({
      map: makeSidewalkTexture(),
      roughness: 0.9,
      metalness: 0.05,
      color: 0xb8bcc4
    });
    swMat.map.repeat.set(Math.round(fw / 2), Math.round(fd / 2));
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(fw + 3, 0.25, fd + 3), swMat);
    sidewalk.position.set(cx, 0.125, cz);
    sidewalk.receiveShadow = true;
    this.scene.add(sidewalk);

    // the tower itself — facade glows with windows
    const tex = this._facadeTex[Math.floor(Math.random() * this._facadeTex.length)].clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(fw / 4)), Math.max(2, Math.round(height / 8)));

    const facadeMat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: 0.9,
      color: 0x20242b,
      roughness: 0.7,
      metalness: 0.25
    });
    const building = new THREE.Mesh(new THREE.BoxGeometry(fw, height, fd), facadeMat);
    building.position.set(cx, height / 2 + 0.25, cz);
    building.castShadow = true;
    building.receiveShadow = true;
    this._addCollider(building);

    // simple rooftop cap / parapet
    const capMat = new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.9 });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.4, 0.6, fd + 0.4), capMat);
    cap.position.set(cx, height + 0.25 + 0.3, cz);
    cap.castShadow = true;
    this.scene.add(cap);

    // occasional rooftop aircraft-warning light
    if (height > 22 && Math.random() < 0.7) {
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff3322 })
      );
      beacon.position.set(cx, height + 1.1, cz);
      this.scene.add(beacon);
    }
  }

  _streetLight(x, z) {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.6, metalness: 0.6 });

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 8), metal);
    pole.position.y = 3;
    pole.castShadow = true;
    group.add(pole);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.12), metal);
    arm.position.set(0.6, 5.9, 0);
    group.add(arm);

    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffd9a0,
      emissive: 0xffb060,
      emissiveIntensity: 2.2
    });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.35), lampMat);
    lamp.position.set(1.25, 5.82, 0);
    group.add(lamp);

    const light = new THREE.PointLight(0xffb86b, 9, 16, 2);
    light.position.set(1.25, 5.7, 0);
    group.add(light);

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  _buildCar(x, z, rotY, color) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.2, metalness: 0.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.2), bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.1), glassMat);
    cabin.position.set(0, 1.15, -0.1);
    group.add(cabin);

    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2cf });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
    for (const sx of [-0.6, 0.6]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), headMat);
      hl.position.set(sx, 0.6, -2.12);
      group.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), tailMat);
      tl.position.set(sx, 0.6, 2.12);
      group.add(tl);
    }
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.9 });
    for (const wx of [-0.85, 0.85]) {
      for (const wz of [-1.4, 1.4]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 12), wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.36, wz);
        group.add(wheel);
      }
    }

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    group.updateMatrixWorld(true);
    this.scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  _buildStreetProps() {
    // streetlights down the two central avenues
    const lampPos = [-50, -34, -18, 18, 34, 50];
    for (const z of lampPos) {
      this._streetLight(-8, z);
      this._streetLight(8, z);
    }
    for (const x of lampPos) {
      this._streetLight(x, -8);
      this._streetLight(x, 8);
    }

    // a scattering of parked cars along the kerbs (also act as cover)
    const carColors = [0x882222, 0x223a66, 0x2c2c30, 0x335533, 0x6a6a70, 0x554433];
    const cars = [
      [-7.2, -40, 0], [7.2, -22, Math.PI], [-7.2, 10, 0], [7.2, 30, Math.PI], [-7.2, 46, 0],
      [-40, 7.2, Math.PI / 2], [-18, -7.2, -Math.PI / 2], [16, 7.2, Math.PI / 2], [44, -7.2, -Math.PI / 2]
    ];
    cars.forEach((c, i) => this._buildCar(c[0], c[1], c[2], carColors[i % carColors.length]));
  }

  _buildBoundary() {
    // low jersey-barrier walls ring the playable area so you can't leave the city
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.9 });
    const h = 2.2;
    const t = 1;
    const half = ARENA_HALF;
    const specs = [
      { w: half * 2, d: t, x: 0, z: -half },
      { w: half * 2, d: t, x: 0, z: half },
      { w: t, d: half * 2, x: -half, z: 0 },
      { w: t, d: half * 2, x: half, z: 0 }
    ];
    for (const s of specs) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, h, s.d), mat);
      mesh.position.set(s.x, h / 2, s.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this._addCollider(mesh);
    }
  }

  _buildSpawnPoints() {
    // spawn out on the streets, never inside a block
    const coords = [
      [0, 0], [0, 20], [0, -20], [20, 0], [-20, 0],
      [7.5, 42], [-7.5, -42], [42, 7.5], [-42, -7.5], [7.5, -50], [-7.5, 50]
    ];
    for (const [x, z] of coords) {
      this.spawnPoints.push(new THREE.Vector3(x, 0, z));
    }
  }

  randomSpawnPoint() {
    return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)].clone();
  }

  /** Resolve horizontal collisions for the player/bot capsule against box colliders. */
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
