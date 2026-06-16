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
    this._buildCrosswalks();
    this._buildStreetProps();
    this._buildGreenery();
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

    // parked + stopped cars along the avenues and side streets (also cover)
    const carColors = [0x882222, 0x223a66, 0x2c2c30, 0x335533, 0x6a6a70, 0x554433, 0xb0b4ba, 0x1d1d22];
    const cars = [
      // main north-south avenue, both kerbs
      [-7.2, -46, 0], [-7.2, -28, 0], [-7.2, 12, 0], [-7.2, 30, 0], [-7.2, 48, 0],
      [7.2, -40, Math.PI], [7.2, -16, Math.PI], [7.2, 22, Math.PI], [7.2, 44, Math.PI],
      // main east-west avenue, both kerbs
      [-46, 7.2, Math.PI / 2], [-24, 7.2, Math.PI / 2], [18, 7.2, Math.PI / 2], [40, 7.2, Math.PI / 2],
      [-38, -7.2, -Math.PI / 2], [-14, -7.2, -Math.PI / 2], [26, -7.2, -Math.PI / 2],
      // side streets between blocks
      [27, 27, 0], [-27, -27, Math.PI], [27, -45, 0], [-45, 27, Math.PI / 2]
    ];
    cars.forEach((c, i) => this._buildCar(c[0], c[1], c[2], carColors[i % carColors.length]));
  }

  // Ladder-style zebra crossing. `axis` 'x' paints bars spanning the X road
  // width (a crossing over the north-south avenue); 'z' spans the Z width.
  _crosswalk(cx, cz, axis) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe4e7ec,
      emissive: 0x3a3d42,
      emissiveIntensity: 0.4,
      roughness: 0.8
    });
    const roadW = 15;
    const bars = 6;
    const barLen = roadW;
    const barThk = 0.55;
    const spacing = 0.95;
    const start = -((bars - 1) * spacing) / 2;
    for (let i = 0; i < bars; i++) {
      const off = start + i * spacing;
      const geo = axis === 'x'
        ? new THREE.BoxGeometry(barLen, 0.04, barThk)
        : new THREE.BoxGeometry(barThk, 0.04, barLen);
      const bar = new THREE.Mesh(geo, mat);
      bar.position.set(axis === 'x' ? cx : cx + off, 0.03, axis === 'x' ? cz + off : cz);
      bar.receiveShadow = true;
      this.scene.add(bar);
    }
  }

  _buildCrosswalks() {
    // four crossings around the central intersection, plus a couple further out
    this._crosswalk(0, 11, 'x');
    this._crosswalk(0, -11, 'x');
    this._crosswalk(11, 0, 'z');
    this._crosswalk(-11, 0, 'z');
    this._crosswalk(0, 47, 'x');
    this._crosswalk(0, -47, 'x');
    this._crosswalk(47, 0, 'z');
    this._crosswalk(-47, 0, 'z');
  }

  _buildTree(x, z) {
    const group = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x213a1c, roughness: 0.95 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 2.2, 8), trunkMat);
    trunk.position.y = 1.1;
    trunk.castShadow = true;
    group.add(trunk);

    // layered canopy from a few overlapping spheres
    const blobs = [
      [0, 2.6, 0, 1.05],
      [0.5, 2.3, 0.3, 0.75],
      [-0.5, 2.4, -0.2, 0.7],
      [0.2, 3.1, -0.3, 0.7]
    ];
    for (const [bx, by, bz, r] of blobs) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), leafMat);
      leaf.position.set(bx, by, bz);
      leaf.castShadow = true;
      group.add(leaf);
    }

    group.position.set(x, 0.25, z);
    group.updateMatrixWorld(true);
    this.scene.add(group);

    // slim trunk collider
    const box = new THREE.Box3(
      new THREE.Vector3(x - 0.35, 0, z - 0.35),
      new THREE.Vector3(x + 0.35, 2.5, z + 0.35)
    );
    this.colliders.push({ box, mesh: trunk });
  }

  _buildPlanter(x, z) {
    const group = new THREE.Group();
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x4a4036, roughness: 0.9 });
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 1 });
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x24471f, roughness: 0.95 });

    const planter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.9), boxMat);
    planter.position.y = 0.25;
    planter.castShadow = true;
    planter.receiveShadow = true;
    group.add(planter);

    const soil = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.7), soilMat);
    soil.position.y = 0.5;
    group.add(soil);

    // leafy clumps
    for (let i = 0; i < 3; i++) {
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 7), bushMat);
      bush.position.set(-0.7 + i * 0.7, 0.62, 0);
      bush.scale.y = 0.8;
      bush.castShadow = true;
      group.add(bush);
    }

    // bright flowers dotted through the greenery
    const flowerColors = [0xff5d8f, 0xffd23f, 0xff7a3d, 0xe85d75, 0xb481ff, 0xffffff];
    for (let i = 0; i < 10; i++) {
      const c = flowerColors[Math.floor(Math.random() * flowerColors.length)];
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 6, 6),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, roughness: 0.6 })
      );
      flower.position.set(-0.9 + Math.random() * 1.8, 0.66 + Math.random() * 0.12, -0.25 + Math.random() * 0.5);
      group.add(flower);
    }

    group.position.set(x, 0.25, z);
    group.updateMatrixWorld(true);
    this.scene.add(group);

    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  _buildFlowerBed(x, z) {
    // a low ground bed of grass dotted with flowers — no collider, walkable edge
    const group = new THREE.Group();
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x1f3b1a, roughness: 1 });
    const bed = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 1.4), grassMat);
    bed.position.y = 0.31;
    bed.receiveShadow = true;
    group.add(bed);

    const flowerColors = [0xff5d8f, 0xffd23f, 0xff7a3d, 0xb481ff, 0xffffff, 0xff4d4d];
    for (let i = 0; i < 22; i++) {
      const c = flowerColors[Math.floor(Math.random() * flowerColors.length)];
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4),
        new THREE.MeshStandardMaterial({ color: 0x2c5a22 })
      );
      const fx = -1.3 + Math.random() * 2.6;
      const fz = -0.55 + Math.random() * 1.1;
      stem.position.set(fx, 0.45, fz);
      group.add(stem);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 6, 6),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.3, roughness: 0.6 })
      );
      head.position.set(fx, 0.55, fz);
      group.add(head);
    }

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  _buildGreenery() {
    // trees lining the central avenues at regular intervals
    const treeRows = [-50, -34, -18, 18, 34, 50];
    for (const z of treeRows) {
      this._buildTree(-9.5, z);
      this._buildTree(9.5, z);
    }
    for (const x of treeRows) {
      this._buildTree(x, -9.5);
      this._buildTree(x, 9.5);
    }

    // flower planters near the central plaza corners
    const planters = [
      [-9.2, 4, 0], [9.2, 4, 0], [-9.2, -4, 0], [9.2, -4, 0],
      [4, -9.2, 1], [-4, -9.2, 1], [4, 9.2, 1], [-4, 9.2, 1]
    ];
    for (const [px, pz, rot] of planters) {
      this._buildPlanterRot(px, pz, rot ? Math.PI / 2 : 0);
    }

    // ground flower beds dotted around the plaza
    this._buildFlowerBed(0, 0);
    this._buildFlowerBed(13, 13);
    this._buildFlowerBed(-13, 13);
    this._buildFlowerBed(13, -13);
    this._buildFlowerBed(-13, -13);
  }

  _buildPlanterRot(x, z, rotY) {
    // wrapper so planters along the EW avenue can face the other way
    const before = this.colliders.length;
    this._buildPlanter(x, z);
    if (rotY) {
      const entry = this.colliders[this.colliders.length - 1];
      entry.mesh.rotation.y = rotY;
      entry.mesh.updateMatrixWorld(true);
      entry.box.setFromObject(entry.mesh);
    }
    void before;
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
