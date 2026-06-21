import * as THREE from 'three';

const ARENA_HALF = 85;
const TAXI_YELLOW = 0xffcf3d;

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

// Roughness map for wet asphalt: dark = glossy puddle, light = dry. Big soft
// blobs of low roughness scattered across the road give realistic wet patches.
function makeWetRoughnessTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  // base = mostly damp (mid roughness)
  ctx.fillStyle = '#888888';
  ctx.fillRect(0, 0, size, size);
  // puddles — very dark = very glossy/reflective
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const r = 22 + Math.random() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(20,20,20,0.92)');
    g.addColorStop(0.6, 'rgba(60,60,60,0.5)');
    g.addColorStop(1, 'rgba(136,136,136,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
  }
  // dry scuffs (high roughness)
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    ctx.fillStyle = `rgba(200,200,200,${0.2 + Math.random() * 0.3})`;
    ctx.fillRect(x, y, 8 + Math.random() * 30, 4 + Math.random() * 12);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ARENA_HALF / 12, ARENA_HALF / 12);
  return tex;
}

// Vertical gradient skydome — deep indigo zenith fading to a warm neon-haze
// horizon, so the city sits under a moody, colorful night sky instead of flat black.
function makeSkyGradientTexture() {
  const w = 16, h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, '#05060f');   // zenith — near black indigo
  grad.addColorStop(0.45, '#0a0e1e');  // upper
  grad.addColorStop(0.72, '#1a1430');  // mid — purple
  grad.addColorStop(0.88, '#3a1c3e');  // lower — magenta haze
  grad.addColorStop(1.0, '#5a2438');   // horizon — warm city glow
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
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

  const litWarm = ['#ffd9a0', '#ffe7bd', '#ffcf86', '#fff0cf', '#ffb84d'];
  const litCool = ['#bcd4ff', '#d4e4ff', '#a9c4f5'];
  const litNeon = ['#ff3d8a', '#33e0ff', '#39ff9e', '#c46bff', '#ffcc00']; // occasional vivid office/sign

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padX + c * cellW + (cellW - winW) / 2;
      const y = padY + r * cellH + (cellH - winH) / 2;
      // A living city at night — a healthy fraction of windows glow, with the
      // occasional vivid neon office to catch the eye (and the bloom pass).
      const lit = Math.random() < 0.16;
      if (lit) {
        const roll = Math.random();
        const pal = roll < 0.12 ? litNeon : (roll < 0.38 ? litCool : litWarm);
        ctx.fillStyle = pal[Math.floor(Math.random() * pal.length)];
        ctx.globalAlpha = 0.6 + Math.random() * 0.4;
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

// Brick facade: a real masonry course pattern with framed windows that have
// stone lintels + sills. Returns separate colour and emissive maps so only lit
// windows glow (the brick itself stays matte).
function makeBrickFacadeTexture(seed) {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const em = document.createElement('canvas');
  em.width = w;
  em.height = h;
  const ectx = em.getContext('2d');
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, w, h);

  // mortar base
  ctx.fillStyle = '#2c2622';
  ctx.fillRect(0, 0, w, h);

  // brick courses (running bond)
  const brickH = 9;
  const brickW = 26;
  const gap = 2;
  const palettes = [
    ['#7a3f30', '#86452f', '#6e3a2c', '#92503a', '#693528'], // red brick
    ['#6b5240', '#765a45', '#5f4a3a', '#82654e', '#5a463a'], // tan brick
    ['#585860', '#666670', '#4f4f56', '#727278', '#4a4a50'] // grey brick
  ];
  const pal = palettes[seed % palettes.length];
  let row = 0;
  for (let y = 0; y < h; y += brickH) {
    const off = (row % 2) * (brickW / 2);
    for (let x = -brickW; x < w + brickW; x += brickW) {
      ctx.fillStyle = pal[Math.floor(Math.random() * pal.length)];
      ctx.fillRect(x + off + gap / 2, y + gap / 2, brickW - gap, brickH - gap);
    }
    row++;
  }

  // windows with stone surrounds
  const cols = 5;
  const rows = 11;
  const padX = 16;
  const padY = 18;
  const cellW = (w - padX * 2) / cols;
  const cellH = (h - padY * 2) / rows;
  const winW = cellW * 0.58;
  const winH = cellH * 0.6;
  const litWarm = ['#ffd9a0', '#ffe7bd', '#ffcf86', '#fff0cf'];
  const litCool = ['#bcd4ff', '#d4e4ff'];
  const litNeon = ['#ff3d8a', '#33e0ff', '#39ff9e'];
  const stone = '#5c5648'; // grimy, weathered trim
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padX + c * cellW + (cellW - winW) / 2;
      const y = padY + r * cellH + (cellH - winH) / 2;
      // lintel + sill
      ctx.fillStyle = stone;
      ctx.fillRect(x - 4, y - 4, winW + 8, 4);
      ctx.fillRect(x - 5, y + winH, winW + 10, 5);
      // frame
      ctx.fillStyle = '#191310';
      ctx.fillRect(x - 2, y - 2, winW + 4, winH + 4);
      // glazing — a warm, lived-in low-rise: many windows lit
      const lit = Math.random() < 0.14;
      if (lit) {
        const roll = Math.random();
        const pic = roll < 0.1 ? litNeon : (roll < 0.3 ? litCool : litWarm);
        const col = pic[Math.floor(Math.random() * pic.length)];
        ctx.fillStyle = col;
        ctx.fillRect(x, y, winW, winH);
        ectx.fillStyle = col;
        ectx.globalAlpha = 0.6 + Math.random() * 0.4;
        ectx.fillRect(x, y, winW, winH);
        ectx.globalAlpha = 1;
      } else {
        ctx.fillStyle = '#0a0c10';
        ctx.fillRect(x, y, winW, winH);
      }
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const emissiveMap = new THREE.CanvasTexture(em);
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  return { map, emissiveMap };
}

// Dead/dying jumbotron ad panel: mostly powered-down, sickly desaturated
// colour blocks instead of the old vivid neon, plus a faint LED pixel grid.
// Vivid neon jumbotron — bright saturated ad screens that bloom hard. The same
// canvas serves as both colour and emissive map.
function makeBillboardTexture(seed) {
  const w = 256;
  const h = 384;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Each billboard is a dominant neon hue over near-black.
  const neon = [
    ['#ff1d68', '#ff7ab0', '#3a0018'],  // hot pink
    ['#18e0ff', '#9bf3ff', '#001a26'],  // cyan
    ['#39ff9e', '#bfffd9', '#002616'],  // green
    ['#c46bff', '#e7c2ff', '#1a0030'],  // violet
    ['#ffcc00', '#fff0a0', '#241a00'],  // amber
  ];
  const pal = neon[seed % neon.length];
  ctx.fillStyle = pal[2];
  ctx.fillRect(0, 0, w, h);

  // big glowing color blocks
  ctx.shadowBlur = 18;
  for (let i = 0; i < 5; i++) {
    const c = pal[i % 2];
    ctx.fillStyle = c; ctx.shadowColor = c;
    const bw = 60 + Math.random() * 130;
    const bh = 26 + Math.random() * 70;
    ctx.fillRect(Math.random() * (w - bw), Math.random() * (h - bh), bw, bh);
  }
  // big bold "ad text"
  ctx.shadowBlur = 22;
  ctx.font = 'bold 70px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal[1]; ctx.shadowColor = pal[0];
  ctx.fillText(['SALE', 'NEON', 'CITY', '24/7', 'LIVE'][seed % 5], w / 2, h * 0.5);
  // glowing accent stripes
  ctx.shadowBlur = 14;
  ctx.fillStyle = pal[0]; ctx.shadowColor = pal[0];
  for (let i = 0; i < 3; i++) {
    const y = h * 0.78 + i * 22;
    ctx.fillRect(16, y, w - 32, 8);
  }
  ctx.shadowBlur = 0;

  // faint LED pixel grid over the top
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  return new THREE.CanvasTexture(canvas);
}

// Bright neon "TIMES SQUARE" marquee — glowing red-and-gold, blooms strongly.
function makeTimesSquareSignTexture() {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0205';
  ctx.fillRect(0, 0, w, h);
  // glowing border
  ctx.shadowColor = '#ff2a4a';
  ctx.shadowBlur = 18;
  ctx.strokeStyle = '#ff2a4a';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  // neon text
  ctx.font = 'bold 62px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ffd24a';
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#ffe27a';
  ctx.fillText('TIMES SQUARE', w / 2, h / 2);
  ctx.shadowBlur = 0;
  return new THREE.CanvasTexture(canvas);
}

// Barbed-wire strand: a tileable, mostly-transparent strip with a zigzag
// wire line and X-shaped barb ticks, alpha-mapped onto a thin strand mesh
// strung between posts.
function makeBarbedWireTexture() {
  const w = 128;
  const h = 32;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const midY = h / 2;
  ctx.strokeStyle = '#9a958a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  for (let x = 6; x <= w; x += 6) {
    ctx.lineTo(x, midY + (x % 12 === 0 ? -3 : 3));
  }
  ctx.stroke();
  ctx.lineWidth = 1.2;
  for (let x = 4; x < w; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x - 3, midY - 5);
    ctx.lineTo(x + 3, midY + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 3, midY + 5);
    ctx.lineTo(x + 3, midY - 5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export class World {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0814);
    // Purple-magenta night haze; pushed back so the skyline reads, with a soft
    // near-field so distant neon glows through atmosphere.
    this.scene.fog = new THREE.Fog(0x1a1228, 26, 165);

    this.arenaHalf = ARENA_HALF;
    this.colliders = []; // { box, mesh }
    this.spawnPoints = [];

    // a few shared facade textures to keep memory sane
    this._facadeTex = [0, 1, 2, 3, 4, 5].map((i) => makeFacadeTexture(i));
    this._brickTex = [0, 1, 2].map((i) => makeBrickFacadeTexture(i));
    this._sidewalkTex = makeSidewalkTexture();
    this._billboardTex = [0, 1, 2, 3].map((i) => makeBillboardTexture(i));
    this._timesSquareSignTex = makeTimesSquareSignTexture();
    this._barbedWireTex = makeBarbedWireTexture();
    this._signPlaced = false;
    this._flowerColors = [0xff5d8f, 0xffd23f, 0xff7a3d, 0xb481ff, 0xffffff, 0xff4d4d, 0xff9ec4];

    // Shared geometry + materials. The city spawns hundreds of small props
    // (flowers, hedges, lamps); reusing one geometry/material per kind keeps
    // GPU memory and draw-state low enough to run smoothly.
    this._geo = {
      flower: new THREE.SphereGeometry(0.07, 6, 6),
      bush: new THREE.SphereGeometry(0.32, 8, 7)
    };
    this._mats = {
      hedge: new THREE.MeshStandardMaterial({ color: 0x1f3d1b, roughness: 0.95 }),
      bush: new THREE.MeshStandardMaterial({ color: 0x24471f, roughness: 0.95 }),
      planter: new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 }),
      planterBox: new THREE.MeshStandardMaterial({ color: 0x4a4036, roughness: 0.9 }),
      soil: new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 1 }),
      grass: new THREE.MeshStandardMaterial({ color: 0x1f3b1a, roughness: 1 }),
      stem: new THREE.MeshStandardMaterial({ color: 0x2c5a22 }),
      stone: new THREE.MeshStandardMaterial({ color: 0xc9bfa8, roughness: 0.8 }),
      door: new THREE.MeshStandardMaterial({ color: 0x10161c, roughness: 0.3, metalness: 0.5, emissive: 0x24343f, emissiveIntensity: 0.35 }),
      awning: new THREE.MeshStandardMaterial({ color: 0x6a2230, roughness: 0.7 }),
      lamp: new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffd27a, emissiveIntensity: 2.2 }),
      poleMetal: new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.6, metalness: 0.6 }),
      streetLamp: new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb060, emissiveIntensity: 2.2 }),
      treeTrunk: new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.9 }),
      treeLeaf: new THREE.MeshStandardMaterial({ color: 0x213a1c, roughness: 0.95 }),
      carGlass: new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.2, metalness: 0.4 }),
      carHead: new THREE.MeshBasicMaterial({ color: 0x8a8470 }),
      carTail: new THREE.MeshBasicMaterial({ color: 0x5a1a18 }),
      carWheel: new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.9 }),
      beacon: new THREE.MeshBasicMaterial({ color: 0xff3322 }),
      brickPlinth: new THREE.MeshStandardMaterial({ color: 0x3a342c, roughness: 0.9 }),
      glassPlinth: new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 0.9 }),
      brickCornice: new THREE.MeshStandardMaterial({ color: 0x4a4236, roughness: 0.85 }),
      glassCornice: new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.85 }),
      // street-cover obstacles
      cartBody: new THREE.MeshStandardMaterial({ color: 0xb8333a, roughness: 0.6, metalness: 0.3 }),
      cartMetal: new THREE.MeshStandardMaterial({ color: 0xd8dadd, roughness: 0.35, metalness: 0.7 }),
      umbrella: new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.7 }),
      newsstandBody: new THREE.MeshStandardMaterial({ color: 0x1f5c3a, roughness: 0.7 }),
      newsstandRoof: new THREE.MeshStandardMaterial({ color: 0x123322, roughness: 0.6 }),
      scaffoldPole: new THREE.MeshStandardMaterial({ color: 0x6a6f78, roughness: 0.5, metalness: 0.7 }),
      scaffoldBoard: new THREE.MeshStandardMaterial({ color: 0x9a7a3a, roughness: 0.85 }),
      dumpsterBody: new THREE.MeshStandardMaterial({ color: 0x2c5c34, roughness: 0.8, metalness: 0.2 }),
      mailboxBody: new THREE.MeshStandardMaterial({ color: 0x1f3f8c, roughness: 0.5, metalness: 0.4 }),
      barrierBody: new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.8 }),
      barrierStripe: new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0x6a2c00, emissiveIntensity: 0.3, roughness: 0.6 }),
      tktsRed: new THREE.MeshStandardMaterial({ color: 0xcc132c, emissive: 0x3a0008, emissiveIntensity: 0.5, roughness: 0.6 }),
      subwayDark: new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.95 }),
      subwayRail: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.6 }),
      subwayGlobe: new THREE.MeshStandardMaterial({ color: 0x1fae4a, emissive: 0x2dff7a, emissiveIntensity: 2.4 }),
      taxiSign: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff7c2, emissiveIntensity: 0.3 }),
      // zombie-apocalypse debris: abandoned trucks, crates, barbed wire
      truckBody: new THREE.MeshStandardMaterial({ color: 0x4a5240, roughness: 0.92, metalness: 0.12 }),
      truckBody2: new THREE.MeshStandardMaterial({ color: 0x5c4630, roughness: 0.95, metalness: 0.08 }),
      truckCab: new THREE.MeshStandardMaterial({ color: 0x33362f, roughness: 0.85, metalness: 0.2 }),
      crateWood: new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.95 }),
      crateBand: new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.6, metalness: 0.4 }),
      barbedPost: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8, metalness: 0.4 })
    };
    this._flowerMats = new Map();
    this._carMats = new Map();

    this._buildLighting();
    this._buildGround();
    this._buildSky();
    this._buildCity();
    this._buildCrosswalks();
    this._buildStreetProps();
    this._buildGreenery();
    this._buildObstacles();
    this._buildBoundary();
    this._buildSpawnPoints();

    this.previewPedestalPos = new THREE.Vector3(0, 0, -6);
  }

  _buildLighting() {
    // Cool sky bounce — a teal-blue night ambient that lets neon read against it
    const hemi = new THREE.HemisphereLight(0x2a3a52, 0x0a0806, 0.34);
    this.scene.add(hemi);

    // moonlight — cool blue key light, casts the scene's shadows
    const moon = new THREE.DirectionalLight(0xaec4e8, 0.55);
    moon.position.set(-50, 70, 40);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -95;
    moon.shadow.camera.right = 95;
    moon.shadow.camera.top = 95;
    moon.shadow.camera.bottom = -95;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 260;
    moon.shadow.bias = -0.0012;
    moon.shadow.normalBias = 0.02;
    this.scene.add(moon);

    // Warm magenta city-glow fill from the horizon — the neon haze of a
    // living city bouncing back up. Reads beautifully once bloom is on.
    const fill = new THREE.DirectionalLight(0xff5a9c, 0.16);
    fill.position.set(20, 8, -30);
    this.scene.add(fill);

    // Cyan rim light from the opposite side to sculpt silhouettes
    const rim = new THREE.DirectionalLight(0x33d4ff, 0.12);
    rim.position.set(60, 18, 50);
    this.scene.add(rim);
  }

  _buildGround() {
    // Rain-slicked asphalt: low roughness + a roughness map of "puddles" makes
    // the road wet and mirror-like in patches, so neon and lamps reflect off it.
    const roadTex = makeRoadTexture();
    const roughTex = makeWetRoughnessTexture();
    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      roughnessMap: roughTex,
      roughness: 0.5,
      metalness: 0.55,
      color: 0x6b7178,
      envMapIntensity: 1.4,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2), roadMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _buildSky() {
    // Gradient skydome — a huge inward-facing sphere with a vertical gradient.
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(420, 32, 16),
      new THREE.MeshBasicMaterial({
        map: makeSkyGradientTexture(),
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      })
    );
    this.scene.add(sky);

    // moon disc — bright enough to bloom
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xf4f8ff, fog: false });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 32), moonMat);
    moon.position.set(-130, 95, -170);
    this.scene.add(moon);
    // Layered halo glow (blooms into a soft moon corona)
    [[14, 0x9fb4d8, 0.22], [22, 0x6a86c8, 0.12], [34, 0x4a5fa8, 0.06]].forEach(([r, c, o]) => {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(r, 24, 24),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, fog: false, depthWrite: false })
      );
      halo.position.copy(moon.position);
      this.scene.add(halo);
    });

    // scattered stars — more of them, with size + brightness variation
    const count = 1400;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const starColors = [
      [0.81, 0.85, 1.0], [1.0, 0.95, 0.85], [0.85, 0.92, 1.0],
      [1.0, 0.82, 0.78], [0.92, 0.88, 1.0],
    ];
    for (let i = 0; i < count; i++) {
      const r = 300;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.48 + 0.02;
      pos[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
      pos[i * 3 + 1] = Math.cos(phi) * r + 40;
      pos[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r;
      const sc = starColors[Math.floor(Math.random() * starColors.length)];
      const b = 0.5 + Math.random() * 0.9;
      col[i * 3] = sc[0] * b; col[i * 3 + 1] = sc[1] * b; col[i * 3 + 2] = sc[2] * b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ size: 1.1, sizeAttenuation: true, fog: false, vertexColors: true })
    );
    this.scene.add(stars);
  }

  _addCollider(mesh) {
    this.scene.add(mesh);
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    this.colliders.push({ box, mesh });
  }

  _flowerMat(c) {
    let m = this._flowerMats.get(c);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.3, roughness: 0.6 });
      this._flowerMats.set(c, m);
    }
    return m;
  }

  _carMat(c) {
    let m = this._carMats.get(c);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.6 });
      this._carMats.set(c, m);
    }
    return m;
  }

  _flower(x, y, z, scale = 1) {
    const c = this._flowerColors[Math.floor(Math.random() * this._flowerColors.length)];
    const f = new THREE.Mesh(this._geo.flower, this._flowerMat(c));
    f.position.set(x, y, z);
    if (scale !== 1) f.scale.setScalar(scale);
    this.scene.add(f);
    return f;
  }

  _buildCity() {
    // City blocks sit in a grid; the central row (z=0) and column (x=0) are
    // left clear so two wide avenues cross at the plaza, giving long sightlines
    // and somewhere to spawn. Buildings only fill the four quadrants. The
    // outer ring (ring 4) gets simplified detail and the inner two rings
    // (the "Times Square" core) get jumbotron billboards, keeping the bigger
    // map's prop count under control.
    const cell = 18; // centre-to-centre spacing
    const range = 4; // cells out from centre

    for (let ix = -range; ix <= range; ix++) {
      for (let iz = -range; iz <= range; iz++) {
        if (ix === 0 || iz === 0) continue; // keep the cross avenues open
        const cx = ix * cell;
        const cz = iz * cell;

        // footprint, leaving room for sidewalks + streets
        const fw = 9 + Math.random() * 4;
        const fd = 9 + Math.random() * 4;

        // mix of tall glass towers and shorter brick low-rises
        const brick = Math.random() < 0.5;
        const height = brick ? 8 + Math.random() * 10 : 20 + Math.random() * 22;
        const ring = Math.max(Math.abs(ix), Math.abs(iz));

        this._buildBuilding(cx, cz, fw, fd, height, brick ? 'brick' : 'glass', ring);
      }
    }
  }

  _buildBuilding(cx, cz, fw, fd, height, style, ring = 1) {
    const base = 0.25; // sits on the sidewalk slab

    // sidewalk slab under/around the building (shared texture, cloned for repeat)
    const swTex = this._sidewalkTex.clone();
    swTex.needsUpdate = true;
    swTex.repeat.set(Math.round(fw / 2), Math.round(fd / 2));
    const swMat = new THREE.MeshStandardMaterial({ map: swTex, roughness: 0.9, metalness: 0.05, color: 0xb8bcc4 });
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(fw + 3, base, fd + 3), swMat);
    sidewalk.position.set(cx, base / 2, cz);
    sidewalk.receiveShadow = true;
    this.scene.add(sidewalk);

    // facade material differs by style
    let facadeMat;
    if (style === 'brick') {
      const v = this._brickTex[Math.floor(Math.random() * this._brickTex.length)];
      const map = v.map.clone();
      const emi = v.emissiveMap.clone();
      map.needsUpdate = emi.needsUpdate = true;
      const rx = Math.max(1, Math.round(fw / 7));
      const ry = Math.max(1, Math.round(height / 10));
      map.repeat.set(rx, ry);
      emi.repeat.set(rx, ry);
      facadeMat = new THREE.MeshStandardMaterial({
        map,
        emissiveMap: emi,
        emissive: 0xffffff,
        emissiveIntensity: 1.7,
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.0
      });
    } else {
      const tex = this._facadeTex[Math.floor(Math.random() * this._facadeTex.length)].clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(fw / 4)), Math.max(2, Math.round(height / 8)));
      facadeMat = new THREE.MeshStandardMaterial({
        map: tex,
        emissiveMap: tex,
        emissive: 0xffffff,
        emissiveIntensity: 1.6,
        color: 0x161a20,
        roughness: 0.35,
        metalness: 0.6,
        envMapIntensity: 1.2
      });
    }

    const building = new THREE.Mesh(new THREE.BoxGeometry(fw, height, fd), facadeMat);
    building.position.set(cx, height / 2 + base, cz);
    building.castShadow = true;
    building.receiveShadow = true;
    this._addCollider(building);

    // stone plinth / base course
    const plinthMat = style === 'brick' ? this._mats.brickPlinth : this._mats.glassPlinth;
    const corniceMat = style === 'brick' ? this._mats.brickCornice : this._mats.glassCornice;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.3, 1.2, fd + 0.3), plinthMat);
    plinth.position.set(cx, base + 0.6, cz);
    plinth.receiveShadow = true;
    this.scene.add(plinth);

    // cornice band near the top
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.5, 0.5, fd + 0.5), corniceMat);
    cornice.position.set(cx, base + height - 0.4, cz);
    this.scene.add(cornice);

    // rooftop parapet cap
    const cap = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.4, 0.6, fd + 0.4), corniceMat);
    cap.position.set(cx, height + base + 0.3, cz);
    this.scene.add(cap);

    // rooftop aircraft-warning light on tall towers
    if (height > 22 && Math.random() < 0.7) {
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), this._mats.beacon);
      beacon.position.set(cx, height + base + 0.9, cz);
      this.scene.add(beacon);
    }

    // street-level entrance facing the nearest avenue
    const front = this._frontFace(cx, cz);
    this._buildEntrance(cx, cz, fw, fd, front);

    const simplified = ring >= 4; // outer ring: keep it quieter for performance
    const core = ring <= 2; // inner two rings: the Times Square showpiece

    if (!simplified) {
      if (style === 'brick') {
        // window flower boxes on the lower floors + a planted front garden
        this._buildWindowBoxes(cx, cz, fw, fd, front, height);
        this._buildFrontGarden(cx, cz, fw, fd, front);
      } else if (Math.random() < 0.6) {
        this._buildRoofGarden(cx, cz, fw, fd, height + base);
      }
    }

    if (core && Math.random() < 0.65) {
      const wantSign = !this._signPlaced && style === 'glass' && height > 28;
      this._buildBillboard(cx, cz, fw, fd, front, height, base, wantSign);
      if (wantSign) this._signPlaced = true;
    }
  }

  // Oversized jumbotron/ad panel mounted flush against a building's front
  // face, Times-Square style. One special panel (the first qualifying tall
  // glass tower near the core) gets the "TIMES SQUARE" marquee instead.
  _buildBillboard(cx, cz, fw, fd, front, height, base, special) {
    const { ox, oz, ax, az, half, len } = this._faceVecs(front, fw, fd);
    const panelW = Math.max(2, Math.min(len - 0.6, len * (special ? 0.95 : 0.8)));
    const panelH = special ? panelW * 0.22 : Math.min(height * 0.4, panelW * 1.2);
    const y = special
      ? base + height - panelH * 0.7
      : base + 3.4 + Math.random() * Math.max(1, height * 0.3);
    const tex = special
      ? this._timesSquareSignTex
      : this._billboardTex[Math.floor(Math.random() * this._billboardTex.length)];
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: special ? 2.4 : 2.0,
      color: 0x101010,
      roughness: 0.4,
      metalness: 0.1
    });
    const geo = new THREE.BoxGeometry(ax ? panelW : 0.1, panelH, az ? panelW : 0.1);
    const panel = new THREE.Mesh(geo, mat);
    panel.position.set(cx + ox * (half + 0.1), y, cz + oz * (half + 0.1));
    this.scene.add(panel);

    // Every billboard casts a colored glow onto the street below — a pool of
    // neon light that reflects off the wet asphalt.
    const glowColors = [0xff1d68, 0x18e0ff, 0x39ff9e, 0xc46bff, 0xffcc00];
    const gc = special ? 0xff3a4a : glowColors[Math.floor(Math.random() * glowColors.length)];
    const light = new THREE.PointLight(gc, special ? 3.0 : 2.2, 22, 2);
    light.position.set(cx + ox * (half + 2.5), y, cz + oz * (half + 2.5));
    this.scene.add(light);
  }

  // Which face looks onto the nearest avenue. Returns the outward normal.
  _frontFace(cx, cz) {
    if (Math.abs(cx) <= Math.abs(cz)) return { axis: 'x', sign: cx >= 0 ? -1 : 1 };
    return { axis: 'z', sign: cz >= 0 ? -1 : 1 };
  }

  _faceVecs(front, fw, fd) {
    const { axis, sign } = front;
    return {
      ox: axis === 'x' ? sign : 0,
      oz: axis === 'z' ? sign : 0, // outward normal
      ax: axis === 'x' ? 0 : 1,
      az: axis === 'x' ? 1 : 0, // along-wall unit
      half: (axis === 'x' ? fw : fd) / 2,
      len: axis === 'x' ? fd : fw
    };
  }

  _buildEntrance(cx, cz, fw, fd, front) {
    const { ox, oz, half } = this._faceVecs(front, fw, fd);
    const wx = cx + ox * half;
    const wz = cz + oz * half;
    const isX = front.axis === 'x';
    const doorW = 1.7;
    const doorH = 2.6;

    // recessed frame surround
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(isX ? 0.16 : doorW + 0.4, doorH + 0.4, isX ? doorW + 0.4 : 0.16),
      this._mats.stone
    );
    frame.position.set(wx + ox * 0.04, 0.25 + (doorH + 0.4) / 2, wz + oz * 0.04);
    this.scene.add(frame);

    // glass door
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(isX ? 0.18 : doorW, doorH, isX ? doorW : 0.18),
      this._mats.door
    );
    door.position.set(wx + ox * 0.1, 0.25 + doorH / 2, wz + oz * 0.1);
    this.scene.add(door);

    // awning above the door, sloped outward
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(isX ? 1.0 : doorW + 0.8, 0.12, isX ? doorW + 0.8 : 1.0),
      this._mats.awning
    );
    awning.position.set(wx + ox * 0.55, 0.25 + doorH + 0.2, wz + oz * 0.55);
    if (isX) awning.rotation.z = front.sign * 0.16;
    else awning.rotation.x = -front.sign * 0.16;
    this.scene.add(awning);

    // stoop slab
    const stoop = new THREE.Mesh(
      new THREE.BoxGeometry(isX ? 1.0 : doorW + 1.0, 0.2, isX ? doorW + 1.0 : 1.0),
      this._mats.stone
    );
    stoop.position.set(wx + ox * 0.5, 0.25 + 0.1, wz + oz * 0.5);
    stoop.receiveShadow = true;
    this.scene.add(stoop);

    // a pair of warm entrance lamps
    const { ax, az } = this._faceVecs(front, fw, fd);
    for (const s of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), this._mats.lamp);
      lamp.position.set(
        wx + ox * 0.12 + ax * s * (doorW / 2 + 0.25),
        0.25 + doorH - 0.1,
        wz + oz * 0.12 + az * s * (doorW / 2 + 0.25)
      );
      this.scene.add(lamp);
    }
  }

  _buildWindowBoxes(cx, cz, fw, fd, front, height) {
    const { ox, oz, ax, az, half, len } = this._faceVecs(front, fw, fd);
    const cols = Math.min(3, Math.max(2, Math.floor(len / 4)));
    const y = 2.2;
    for (let c = 0; c < cols; c++) {
      if (Math.random() < 0.4) continue;
      const t = -len / 2 + (len / cols) * (c + 0.5);
      if (Math.abs(t) < 1.1) continue; // skip the doorway column
      const bx = cx + ox * (half + 0.18) + ax * t;
      const bz = cz + oz * (half + 0.18) + az * t;
      this._flowerBox(bx, bz, ax, az, y);
    }
  }

  _flowerBox(x, z, ax, az, y) {
    const w = 1.0;
    const planter = new THREE.Mesh(
      new THREE.BoxGeometry(ax ? w : 0.26, 0.22, az ? w : 0.26),
      this._mats.planter
    );
    planter.position.set(x, y, z);
    this.scene.add(planter);
    for (let i = 0; i < 3; i++) {
      const t = -w / 2 + Math.random() * w;
      this._flower(x + ax * t, y + 0.16, z + az * t, 0.85);
    }
  }

  _buildFrontGarden(cx, cz, fw, fd, front) {
    const { ox, oz, ax, az, half, len } = this._faceVecs(front, fw, fd);
    const dist = half + 0.9;
    const bx = cx + ox * dist;
    const bz = cz + oz * dist;

    const segLen = len / 2 - 1.3;
    if (segLen > 0.6) {
      for (const s of [-1, 1]) {
        const segC = 1.3 + segLen / 2;
        const hedge = new THREE.Mesh(
          new THREE.BoxGeometry(ax ? segLen : 0.55, 0.6, az ? segLen : 0.55),
          this._mats.hedge
        );
        hedge.position.set(bx + ax * s * segC, 0.25 + 0.3, bz + az * s * segC);
        hedge.receiveShadow = true;
        this.scene.add(hedge);
      }
    }

    // flowers in front of the hedges
    for (let i = 0; i < 5; i++) {
      const t = -len / 2 + Math.random() * len;
      if (Math.abs(t) < 1.3) continue;
      this._flower(bx + ax * t + ox * 0.45, 0.5, bz + az * t + oz * 0.45);
    }
  }

  _buildRoofGarden(cx, cz, fw, fd, roofY) {
    const hw = fw - 1.2;
    const hd = fd - 1.2;
    // hedge ring around the roof edge
    const rim = [
      [0, -hd / 2, hw, 0.4],
      [0, hd / 2, hw, 0.4],
      [-hw / 2, 0, 0.4, hd],
      [hw / 2, 0, 0.4, hd]
    ];
    for (const [dx, dz, w, d] of rim) {
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), this._mats.hedge);
      hedge.position.set(cx + dx, roofY + 0.35, cz + dz);
      this.scene.add(hedge);
    }
    // a few potted shrubs
    for (let i = 0; i < 3; i++) {
      const px = cx + (Math.random() - 0.5) * (hw - 1);
      const pz = cz + (Math.random() - 0.5) * (hd - 1);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.5, 8), this._mats.planterBox);
      pot.position.set(px, roofY + 0.35, pz);
      this.scene.add(pot);
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 7), this._mats.bush);
      bush.position.set(px, roofY + 0.9, pz);
      this.scene.add(bush);
    }
  }

  _streetLight(x, z) {
    const group = new THREE.Group();
    const metal = this._mats.poleMetal;

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 8), metal);
    pole.position.y = 3;
    pole.castShadow = true;
    group.add(pole);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.12), metal);
    arm.position.set(0.6, 5.9, 0);
    group.add(arm);

    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.35), this._mats.streetLamp);
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

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.2), this._carMat(color));
    body.position.y = 0.6;
    body.castShadow = true;
    group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.1), this._mats.carGlass);
    cabin.position.set(0, 1.15, -0.1);
    group.add(cabin);

    for (const sx of [-0.6, 0.6]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), this._mats.carHead);
      hl.position.set(sx, 0.6, -2.12);
      group.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), this._mats.carTail);
      tl.position.set(sx, 0.6, 2.12);
      group.add(tl);
    }
    if (color === TAXI_YELLOW) {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.22), this._mats.taxiSign);
      sign.position.set(0, 1.5, -0.1);
      group.add(sign);
    }
    for (const wx of [-0.85, 0.85]) {
      for (const wz of [-1.4, 1.4]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 12), this._mats.carWheel);
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
    const lampPos = [-72, -50, -34, -18, 18, 34, 50, 72];
    for (const z of lampPos) {
      this._streetLight(-8, z);
      this._streetLight(8, z);
    }
    for (const x of lampPos) {
      this._streetLight(x, -8);
      this._streetLight(x, 8);
    }

    // parked + abandoned cars along the avenues and side streets (also
    // cover) — weathered, rusted, grimy tones; only a couple of faded
    // yellow cabs remain as a relic of busier days
    const carColors = [
      0x6b5a3a, 0x3a3f33, 0x5a2a22, 0x4a4d4f, 0x2f3a2a,
      0x705840, 0x33363a, TAXI_YELLOW, 0x5c4a36, 0x26301f,
      0x614b3f, 0x3c372e, 0x4a4438, TAXI_YELLOW, 0x575048, 0x2a2e26
    ];
    const cars = [
      // main north-south avenue, both kerbs
      [-7.2, -46, 0], [-7.2, -28, 0], [-7.2, 12, 0], [-7.2, 30, 0], [-7.2, 48, 0], [-7.2, 64, 0],
      [7.2, -40, Math.PI], [7.2, -16, Math.PI], [7.2, 22, Math.PI], [7.2, 44, Math.PI], [7.2, -64, Math.PI],
      // main east-west avenue, both kerbs
      [-46, 7.2, Math.PI / 2], [-24, 7.2, Math.PI / 2], [18, 7.2, Math.PI / 2], [40, 7.2, Math.PI / 2], [62, 7.2, Math.PI / 2],
      [-38, -7.2, -Math.PI / 2], [-14, -7.2, -Math.PI / 2], [26, -7.2, -Math.PI / 2], [-62, -7.2, -Math.PI / 2],
      // side streets between blocks
      [27, 27, 0], [-27, -27, Math.PI], [27, -45, 0], [-45, 27, Math.PI / 2],
      [63, 63, 0], [-63, -63, Math.PI], [63, -63, Math.PI / 2]
    ];
    cars.forEach((c, i) => this._buildCar(c[0], c[1], c[2], carColors[i % carColors.length]));
  }

  // Ladder-style zebra crossing. `axis` 'x' paints bars spanning the X road
  // width (a crossing over the north-south avenue); 'z' spans the Z width.
  _crosswalk(cx, cz, axis) {
    if (!this._crosswalkMat) {
      this._crosswalkMat = new THREE.MeshStandardMaterial({
        color: 0xe4e7ec,
        emissive: 0x3a3d42,
        emissiveIntensity: 0.4,
        roughness: 0.8
      });
    }
    const mat = this._crosswalkMat;
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
    this._crosswalk(0, 70, 'x');
    this._crosswalk(0, -70, 'x');
    this._crosswalk(70, 0, 'z');
    this._crosswalk(-70, 0, 'z');
  }

  _buildTree(x, z) {
    const group = new THREE.Group();

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 2.2, 8), this._mats.treeTrunk);
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
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), this._mats.treeLeaf);
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

    const planter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.9), this._mats.planterBox);
    planter.position.y = 0.25;
    planter.castShadow = true;
    planter.receiveShadow = true;
    group.add(planter);

    const soil = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.7), this._mats.soil);
    soil.position.y = 0.5;
    group.add(soil);

    // leafy clumps
    for (let i = 0; i < 3; i++) {
      const bush = new THREE.Mesh(this._geo.bush, this._mats.bush);
      bush.position.set(-0.7 + i * 0.7, 0.62, 0);
      bush.scale.set(1, 0.8, 1);
      group.add(bush);
    }

    group.position.set(x, 0.25, z);
    group.updateMatrixWorld(true);
    this.scene.add(group);

    // bright flowers dotted through the greenery (absolute coords)
    for (let i = 0; i < 8; i++) {
      this._flower(x - 0.9 + Math.random() * 1.8, 0.25 + 0.7 + Math.random() * 0.1, z - 0.25 + Math.random() * 0.5);
    }

    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  _buildFlowerBed(x, z) {
    // a low ground bed of grass dotted with flowers — no collider, walkable edge
    const bed = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 1.4), this._mats.grass);
    bed.position.set(x, 0.31, z);
    bed.receiveShadow = true;
    this.scene.add(bed);

    for (let i = 0; i < 12; i++) {
      const fx = x - 1.3 + Math.random() * 2.6;
      const fz = z - 0.55 + Math.random() * 1.1;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4), this._mats.stem);
      stem.position.set(fx, 0.45, fz);
      this.scene.add(stem);
      this._flower(fx, 0.55, fz, 0.85);
    }
  }

  _buildGreenery() {
    // trees lining the central avenues at regular intervals
    const treeRows = [-72, -50, -34, -18, 18, 34, 50, 72];
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

  // TKTS-style red bleacher steps near the plaza.
  _buildTktsSteps(x, z) {
    const group = new THREE.Group();
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const d = 3.6 - i * 0.5;
      const h = 0.34;
      const step = new THREE.Mesh(new THREE.BoxGeometry(6, h, d), this._mats.tktsRed);
      step.position.set(0, h / 2 + i * h, -d / 2 + 1.8);
      step.receiveShadow = true;
      group.add(step);
    }
    group.position.set(x, 0, z);
    group.updateMatrixWorld(true);
    this.scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  // Subway stair entrance with railings and green globe lamps.
  _buildSubwayEntrance(x, z, rotY) {
    const group = new THREE.Group();
    const pit = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 2.4), this._mats.subwayDark);
    pit.position.y = 0.05;
    group.add(pit);

    const railSpecs = [
      [0, -1.2, 3.2, 0.1],
      [0, 1.2, 3.2, 0.1],
      [-1.6, 0, 0.1, 2.4],
      [1.6, 0, 0.1, 2.4]
    ];
    for (const [dx, dz, w, d] of railSpecs) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), this._mats.subwayRail);
      rail.position.set(dx, 0.45, dz);
      group.add(rail);
    }
    for (const sx of [-1.3, 1.3]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), this._mats.poleMetal);
      pole.position.set(sx, 0.8, -1.3);
      group.add(pole);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), this._mats.subwayGlobe);
      globe.position.set(sx, 1.65, -1.3);
      group.add(globe);
    }

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    group.updateMatrixWorld(true);
    this.scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  // NYC street-cart cover: bright umbrella over a boxy cart body.
  _buildHotDogCart(x, z, rotY) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.8), this._mats.cartBody);
    body.position.y = 0.6;
    body.castShadow = true;
    group.add(body);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.9), this._mats.cartMetal);
    counter.position.y = 1.1;
    group.add(counter);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), this._mats.cartMetal);
    pole.position.y = 1.8;
    group.add(pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.5, 10), this._mats.umbrella);
    canopy.position.y = 2.55;
    group.add(canopy);

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    group.updateMatrixWorld(true);
    this.scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  // Green NYC newsstand kiosk — solid chest-height cover.
  _buildNewsstand(x, z, rotY) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 1.2), this._mats.newsstandBody);
    body.position.y = 0.85;
    body.castShadow = true;
    group.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 1.5), this._mats.newsstandRoof);
    roof.position.y = 1.66;
    group.add(roof);

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    group.updateMatrixWorld(true);
    this.scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  // Sidewalk-shed scaffolding tunnel: a row of poles holding up a plank roof,
  // tall and wide enough to run through or duck behind the support poles.
  _buildScaffold(x, z, rotY, length) {
    const group = new THREE.Group();
    const bays = Math.max(2, Math.round(length / 2.5));
    const bayLen = length / bays;
    const rowA = new THREE.Group();
    const rowB = new THREE.Group();
    for (let i = 0; i <= bays; i++) {
      const lx = -length / 2 + i * bayLen;
      const poleA = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), this._mats.scaffoldPole);
      poleA.position.set(lx, 1.3, -1.1);
      rowA.add(poleA);
      const poleB = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), this._mats.scaffoldPole);
      poleB.position.set(lx, 1.3, 1.1);
      rowB.add(poleB);
    }
    group.add(rowA, rowB);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, 2.4), this._mats.scaffoldBoard);
    roof.position.y = 2.65;
    roof.receiveShadow = true;
    group.add(roof);

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    group.updateMatrixWorld(true);
    this.scene.add(group);

    // collide only with the two rows of support poles, leaving the tunnel
    // underneath open so players can actually run through it for cover
    for (const row of [rowA, rowB]) {
      const box = new THREE.Box3().setFromObject(row);
      this.colliders.push({ box, mesh: row });
    }
  }

  // Dumpster: tall, solid, great full-body cover.
  _buildDumpster(x, z, rotY) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.3), this._mats.dumpsterBody);
    body.position.y = 0.6;
    body.castShadow = true;
    group.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.4), this._mats.dumpsterBody);
    lid.position.y = 1.26;
    group.add(lid);

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    group.updateMatrixWorld(true);
    this.scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  // USPS mailbox — small low cover, good for crouching.
  _buildMailbox(x, z, rotY) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.1, 10), this._mats.mailboxBody);
    body.position.y = 0.65;
    body.castShadow = true;
    group.add(body);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), this._mats.mailboxBody);
    top.position.y = 1.2;
    group.add(top);

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    group.updateMatrixWorld(true);
    this.scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  // A short row of concrete construction barriers with a reflective stripe,
  // placed end to end — low crouch cover.
  _buildBarrierRow(x, z, rotY, count = 3) {
    const group = new THREE.Group();
    const spacing = 1.7;
    const start = -((count - 1) * spacing) / 2;
    for (let i = 0; i < count; i++) {
      const lx = start + i * spacing;
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.4), this._mats.barrierBody);
      body.position.set(lx, 0.4, 0);
      body.castShadow = true;
      group.add(body);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.42), this._mats.barrierStripe);
      stripe.position.set(lx, 0.55, 0);
      group.add(stripe);
    }
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    group.updateMatrixWorld(true);
    this.scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  // Abandoned cargo truck left blocking the road — big, solid cover.
  _buildTruck(x, z, rotY, rusty = false) {
    const group = new THREE.Group();
    const bodyMat = rusty ? this._mats.truckBody2 : this._mats.truckBody;

    const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.3, 5.4), bodyMat);
    cargo.position.set(0, 1.3, -0.5);
    cargo.castShadow = true;
    group.add(cargo);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.6, 1.8), this._mats.truckCab);
    cab.position.set(0, 1.0, 3.0);
    cab.castShadow = true;
    group.add(cab);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.55, 0.08), this._mats.carGlass);
    windshield.position.set(0, 1.55, 3.9);
    group.add(windshield);

    for (const wx of [-1.15, 1.15]) {
      for (const wz of [-2.3, -0.1, 2.6]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), this._mats.carWheel);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.42, wz);
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

  // One splintering wood crate with metal corner/edge bands.
  _crateMesh(size) {
    const group = new THREE.Group();
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), this._mats.crateWood);
    crate.position.y = size / 2;
    crate.castShadow = true;
    group.add(crate);
    for (const dy of [size * 0.15, size * 0.85]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(size + 0.04, 0.08, size + 0.04), this._mats.crateBand);
      band.position.y = dy;
      group.add(band);
    }
    return group;
  }

  // A loose stack of two crates, just tall enough to crouch or stand behind.
  _buildCrateStack(x, z, rotY) {
    const group = new THREE.Group();
    group.add(this._crateMesh(1.1));
    const small = this._crateMesh(0.7);
    small.position.set(0.5, 0, 0.15);
    small.rotation.y = 0.4;
    group.add(small);

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    group.updateMatrixWorld(true);
    this.scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  // A short barbed-wire barricade strung between two posts — see-through
  // but still blocks movement, like a hastily thrown-up checkpoint fence.
  _buildBarbedWire(x, z, rotY, length) {
    const group = new THREE.Group();
    const postH = 1.2;
    for (const lx of [-length / 2, length / 2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, postH, 6), this._mats.barbedPost);
      post.position.set(lx, postH / 2, 0);
      post.castShadow = true;
      group.add(post);
    }
    const tex = this._barbedWireTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(length / 1.2)), 1);
    const wireMat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.35,
      color: 0xb8b4a4,
      roughness: 0.7,
      metalness: 0.4
    });
    for (const dy of [0.5, 0.85, 1.15]) {
      const strand = new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, 0.06), wireMat);
      strand.position.y = dy;
      group.add(strand);
    }

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    group.updateMatrixWorld(true);
    this.scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  // Scattered street furniture players can duck behind — carts, newsstands,
  // scaffolding, dumpsters, mailboxes and barrier rows down the two main
  // avenues, on top of the existing parked cars/planters/trees. Kept within
  // the open avenue corridors (small cross-axis offset) so nothing clips
  // into a building footprint. Abandoned trucks and barbed-wire checkpoints
  // guard each avenue's far end, with loose crate stacks for closer cover.
  _buildObstacles() {
    this._buildHotDogCart(3, 16, 0);
    this._buildHotDogCart(-3, -16, Math.PI);
    this._buildHotDogCart(-3, 44, 0.4);
    this._buildHotDogCart(3, -44, -0.4);

    this._buildNewsstand(-3, 22, Math.PI / 2);
    this._buildNewsstand(3, -28, -Math.PI / 2);

    this._buildScaffold(-3.2, -38, Math.PI / 2, 6);
    this._buildScaffold(3.2, 58, -Math.PI / 2, 6);

    this._buildDumpster(3, -58, 0);
    this._buildDumpster(-3, 28, 0.5);

    this._buildMailbox(58, 3, Math.PI / 2);
    this._buildMailbox(-58, -3, -Math.PI / 2);

    this._buildBarrierRow(3, -22, 0, 3);
    this._buildBarrierRow(-3, 38, 0, 3);
    this._buildBarrierRow(22, -3, Math.PI / 2, 3);
    this._buildBarrierRow(-22, 3, Math.PI / 2, 3);

    this._buildTktsSteps(0, -66);
    this._buildSubwayEntrance(0, 66, 0);

    // abandoned trucks blocking each avenue's far end, paired with a
    // barbed-wire barricade — like a checkpoint nobody came back to staff
    this._buildTruck(3, 76, 0, false);
    this._buildTruck(-3, -76, Math.PI, true);
    this._buildTruck(76, -3, Math.PI / 2, true);
    this._buildTruck(-76, 3, -Math.PI / 2, false);

    this._buildBarbedWire(-5, 76, 0, 4);
    this._buildBarbedWire(5, -76, Math.PI, 4);
    this._buildBarbedWire(76, 5, Math.PI / 2, 4);
    this._buildBarbedWire(-76, -5, Math.PI / 2, 4);

    // loose crates dropped for closer-range cover
    this._buildCrateStack(4, 4, 0.2);
    this._buildCrateStack(-4, -4, 0.2 + Math.PI);
    this._buildCrateStack(-4, 54, -0.3);
    this._buildCrateStack(4, -52, -0.3 + Math.PI);
    this._buildCrateStack(54, -4, Math.PI / 2);
    this._buildCrateStack(-54, 4, -Math.PI / 2);
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
      [7.5, 42], [-7.5, -42], [42, 7.5], [-42, -7.5], [7.5, -50], [-7.5, 50],
      [0, 60], [0, -60], [60, 0], [-60, 0]
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
