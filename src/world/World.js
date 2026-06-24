import * as THREE from 'three';

const ARENA_HALF = 85;
const TAXI_YELLOW = 0xffcf3d;

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

function makeTechFloorTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#04070d';
  ctx.fillRect(0, 0, size, size);
  // minor grid
  ctx.strokeStyle = 'rgba(0,130,190,0.11)';
  ctx.lineWidth = 0.7;
  for (let i = 0; i < size; i += 16) {
    ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(size,i); ctx.stroke();
  }
  // major grid
  ctx.strokeStyle = 'rgba(0,200,255,0.42)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < size; i += 64) {
    ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(size,i); ctx.stroke();
  }
  // intersection dots
  ctx.fillStyle = 'rgba(0,230,255,0.72)';
  for (let x = 0; x < size; x += 64)
    for (let y = 0; y < size; y += 64) {
      ctx.beginPath(); ctx.arc(x,y,2.4,0,Math.PI*2); ctx.fill();
    }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ARENA_HALF / 8, ARENA_HALF / 8);
  return tex;
}

function makeTechFloorEmissiveTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 2;
  for (let i = 0; i < size; i += 64) {
    ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(size,i); ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  for (let x = 0; x < size; x += 64)
    for (let y = 0; y < size; y += 64) {
      ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
    }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ARENA_HALF / 8, ARENA_HALF / 8);
  return tex;
}

// (removed — replaced by tech floor)
function makeWetRoughnessTexture() { return null; }

// Vertical gradient skydome — deep indigo zenith fading to a warm neon-haze
// horizon, so the city sits under a moody, colorful night sky instead of flat black.
function makeSkyGradientTexture() {
  const w = 16, h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0,  '#010208');
  grad.addColorStop(0.35, '#01050f');
  grad.addColorStop(0.65, '#020814');
  grad.addColorStop(0.85, '#040b1e');
  grad.addColorStop(1.0,  '#070e28');
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
  ctx.fillText(['NEURAL LINK', 'VOID RUNNER', 'QUANTUM', 'NEXUS', 'SYNAPSE'][seed % 5], w / 2, h * 0.5);
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

// Sci-fi mega-sign: cyan-on-black "KYX.IO // FORERUNNER DISTRICT" marquee
function makeTimesSquareSignTexture() {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#020b14';
  ctx.fillRect(0, 0, w, h);
  // outer glow border
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 20;
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  // inner accent line
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0,229,255,0.35)';
  ctx.strokeRect(16, 16, w - 32, h - 32);
  // main text
  ctx.font = 'bold 46px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 28;
  ctx.fillStyle = '#00e5ff';
  ctx.fillText('KYX.IO  //  FORERUNNER DISTRICT', w / 2, h / 2 - 8);
  // subtitle
  ctx.font = 'bold 18px Arial';
  ctx.shadowBlur = 12;
  ctx.fillStyle = 'rgba(0,229,255,0.65)';
  ctx.fillText('HALO OF WEB3  ·  PVP  ·  PVE  ·  5 GAME MODES', w / 2, h / 2 + 28);
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
    this.scene.background = new THREE.Color(0x020308);
    // Deep cyber-indigo haze; pushed back so the neon skyline reads, with a soft
    // near-field so distant holograms and signage glow through the atmosphere.
    this.scene.fog = new THREE.Fog(0x040a18, 30, 160);

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
    // Sci-fi neon accent palette + cached emissive materials (bloom does the glow,
    // so these are cheap unlit-looking emissives, no extra point lights).
    this._neonColors = [0x00e5ff, 0xff2db4, 0xb24bff, 0x39ff9e, 0xffc400, 0x2a6bff];
    this._neonMats = new Map();

    this._buildLighting();
    this._buildGround();
    this._buildSky();
    this._buildCity();
    this._buildCrosswalks();
    this._buildStreetProps();
    this._buildGreenery();
    this._buildObstacles();
    this._buildBoundary();
    this._buildOrbitalRing();
    this._buildArenaCore();
    this._buildLandingPads();
    this._buildGroundChannels();
    this._buildSpawnPoints();

    this.previewPedestalPos = new THREE.Vector3(0, 0, -6);

    // Lock world matrix on every static mesh built above so Three.js skips
    // recomputing it on every frame. Dynamic objects (bots, player, pickups)
    // are added later by Game.js and are not affected.
    this.scene.traverse((obj) => {
      if (obj.isMesh && obj.matrixAutoUpdate) {
        obj.matrixAutoUpdate = false;
        obj.updateMatrix();
      }
    });
  }

  _buildLighting() {
    // Cold star-field ambient — deep space tech bounce
    const hemi = new THREE.HemisphereLight(0x1a2a4a, 0x030806, 0.40);
    this.scene.add(hemi);

    // Primary star light — cold white-blue key, casts shadows
    const star = new THREE.DirectionalLight(0xb8d4ff, 0.72);
    star.position.set(-50, 70, 40);
    star.castShadow = true;
    star.shadow.mapSize.set(1024, 1024);
    star.shadow.camera.left   = -95;
    star.shadow.camera.right  =  95;
    star.shadow.camera.top    =  95;
    star.shadow.camera.bottom = -95;
    star.shadow.camera.near   =  1;
    star.shadow.camera.far    = 260;
    star.shadow.bias        = -0.0012;
    star.shadow.normalBias  =  0.02;
    this.scene.add(star);

    // Deep-violet fill from the opposite side — energy field bounce
    const fill = new THREE.DirectionalLight(0x4428cc, 0.18);
    fill.position.set(20, 8, -30);
    this.scene.add(fill);

    // Cyan rim — sculpts silhouettes against the dark background
    const rim = new THREE.DirectionalLight(0x00e5ff, 0.30);
    rim.position.set(60, 18, 50);
    this.scene.add(rim);
  }

  _buildGround() {
    const floorTex  = makeTechFloorTexture();
    const emitTex   = makeTechFloorEmissiveTexture();
    const roadMat = new THREE.MeshStandardMaterial({
      map:          floorTex,
      emissiveMap:  emitTex,
      emissive:     new THREE.Color(0x003448),
      emissiveIntensity: 0.14,
      roughness:    0.85,
      metalness:    0.22,
      color:        0x07111a,
      envMapIntensity: 0.7,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2), roadMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
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
    sky.matrixAutoUpdate = false;
    sky.updateMatrix();
    this.scene.add(sky);

    // moon disc — bright enough to bloom
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xf4f8ff, fog: false });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 32), moonMat);
    moon.position.set(-130, 95, -170);
    moon.matrixAutoUpdate = false;
    moon.updateMatrix();
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
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
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

  _neonMat(c) {
    let m = this._neonMats.get(c);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: c, emissive: c, emissiveIntensity: 2.4, roughness: 0.4, metalness: 0.3
      });
      this._neonMats.set(c, m);
    }
    return m;
  }

  _randNeon() {
    return this._neonColors[Math.floor(Math.random() * this._neonColors.length)];
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

        // Randomized sci-fi skyline: ~18% of lots are left as empty plazas so
        // the city no longer reads as a perfect grid, and every tower is jittered
        // off its cell centre (clamped so it never spills into an avenue).
        if (Math.random() < 0.18) continue;
        const jx = (Math.random() - 0.5) * 4.2;
        const jz = (Math.random() - 0.5) * 4.2;
        const cx = ix * cell + jx;
        const cz = iz * cell + jz;

        // footprint, leaving room for sidewalks + streets
        const fw = 8 + Math.random() * 4;
        const fd = 8 + Math.random() * 4;

        // Mostly sleek glass arcologies; a few squat brick relics for contrast.
        // Heights vary hard — from low blocks to the odd mega-spire.
        const brick = false;
        let height;
        if (brick)                       height = 9  + Math.random() * 9;
        else if (Math.random() < 0.16)   height = 56 + Math.random() * 28; // mega-tower
        else                             height = 20 + Math.random() * 28;
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

    // ── Sci-fi neon trim (emissive only — bloom makes it glow, no extra lights) ──
    const neon = this._randNeon();
    const neonMat = this._neonMat(neon);

    // glowing roof band wrapping the parapet
    const roofBand = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.5, 0.16, fd + 0.5), neonMat);
    roofBand.position.set(cx, height + base + 0.65, cz);
    this.scene.add(roofBand);

    // vertical neon edge strips up the four corners of glass towers
    if (style === 'glass') {
      const hx = fw / 2, hz = fd / 2;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, height * 0.96, 0.12), neonMat);
          strip.position.set(cx + sx * hx, base + height / 2, cz + sz * hz);
          this.scene.add(strip);
        }
      }
      // a couple of horizontal accent bands partway up
      const bandY = base + height * (0.4 + Math.random() * 0.3);
      const accent = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.18, 0.1, fd + 0.18), neonMat);
      accent.position.set(cx, bandY, cz);
      this.scene.add(accent);
    }

    // antenna spire with a glowing tip on the taller towers
    if (height > 26) {
      const spireH = 2 + Math.random() * 4;
      const spire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.16, spireH, 6), this._mats.poleMetal);
      spire.position.set(cx, height + base + spireH / 2, cz);
      this.scene.add(spire);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), neonMat);
      tip.position.set(cx, height + base + spireH, cz);
      this.scene.add(tip);
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
    // Plasma lamp — replaces old street light
    const group = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x080e18, roughness: 0.28, metalness: 0.92 });
    const color    = this._randNeon();
    const nm       = this._neonMat(color);

    // Tapered shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.10, 7.2, 8), metalMat);
    shaft.position.y = 3.6;
    shaft.castShadow = true;
    group.add(shaft);

    // Collar rings
    for (const ry of [1.6, 3.8]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 6, 16), nm);
      ring.position.y = ry;
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }

    // Plasma orb on top
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), nm);
    orb.position.y = 7.5;
    group.add(orb);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.40, 0.04, 6, 16), nm);
    halo.position.y = 7.5;
    halo.rotation.x = Math.PI / 2;
    group.add(halo);

    const light = new THREE.PointLight(color, 7, 20, 2);
    light.position.y = 7.4;
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
    // Plasma lamps lining both central avenues
    const lampPos = [-72, -50, -34, -18, 18, 34, 50, 72];
    for (const z of lampPos) {
      this._streetLight(-8, z);
      this._streetLight(8, z);
    }
    for (const x of lampPos) {
      this._streetLight(x, -8);
      this._streetLight(x, 8);
    }
    // No ground vehicles — this is a Forerunner arena, not a city street
  }

  // Ladder-style zebra crossing. `axis` 'x' paints bars spanning the X road
  // width (a crossing over the north-south avenue); 'z' spans the Z width.
  _crosswalk(cx, cz, axis) {
    if (!this._crosswalkMat) {
      this._crosswalkMat = new THREE.MeshStandardMaterial({
        color: 0x00c8e8,
        emissive: 0x00c8e8,
        emissiveIntensity: 1.6,
        roughness: 0.4,
        metalness: 0.2
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
    // Energy crystal spire — replaces organic tree
    const group      = new THREE.Group();
    const color      = this._randNeon();
    const nm         = this._neonMat(color);
    const metalMat   = new THREE.MeshStandardMaterial({ color: 0x07101a, roughness: 0.30, metalness: 0.88 });

    // Hex base pad
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 0.28, 6), metalMat);
    base.position.y = 0.14;
    group.add(base);

    // Lower shaft (thicker)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 2.8, 6), metalMat);
    shaft.position.y = 1.54;
    shaft.castShadow = true;
    group.add(shaft);

    // Crystal upper section (tapers to point)
    const crystal = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.11, 2.2, 6), nm);
    crystal.position.y = 4.0;
    group.add(crystal);

    // Orbital rings at different heights + rotations
    [[1.4, 0.0], [2.4, Math.PI / 3], [3.2, Math.PI * 0.7]].forEach(([ry, rot]) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.026, 6, 20), nm);
      ring.position.y = ry;
      ring.rotation.y  = rot;
      group.add(ring);
    });

    const light = new THREE.PointLight(color, 3.5, 14, 2);
    light.position.y = 3.5;
    group.add(light);

    group.position.set(x, 0, z);
    group.updateMatrixWorld(true);
    this.scene.add(group);

    const box = new THREE.Box3(
      new THREE.Vector3(x - 0.55, 0, z - 0.55),
      new THREE.Vector3(x + 0.55, 5.2, z + 0.55)
    );
    this.colliders.push({ box, mesh: base });
  }

  _buildPlanter(x, z) {
    // Holographic data terminal — replaces organic planter
    const group   = new THREE.Group();
    const color   = this._randNeon();
    const nm      = this._neonMat(color);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x080f18, roughness: 0.38, metalness: 0.82 });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 0.72), bodyMat);
    chassis.position.y = 0.375;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    group.add(chassis);

    // Glowing screen panel
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.44, 0.04), nm);
    screen.position.set(0, 0.60, 0.38);
    group.add(screen);

    // Edge trim strips
    [-0.98, 0.98].forEach(ex => {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.78, 0.04), nm);
      trim.position.set(ex, 0.375, 0);
      group.add(trim);
    });

    group.position.set(x, 0.25, z);
    group.updateMatrixWorld(true);
    this.scene.add(group);

    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  _buildFlowerBed(x, z) {
    // Glowing hex ground pad — replaces organic flower bed
    const color = this._randNeon();
    const nm = this._neonMat(color);
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x06101a, roughness: 0.35, metalness: 0.85 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.12, 6), metalMat);
    pad.position.set(x, 0.06, z);
    pad.receiveShadow = true;
    this.scene.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 6, 18), nm);
    ring.position.set(x, 0.14, z);
    ring.rotation.x = Math.PI / 2;
    this.scene.add(ring);
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 6), nm);
    dot.position.set(x, 0.13, z);
    this.scene.add(dot);
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

    // glowing hex pads dotted around the plaza (center reserved for arena core)
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

  // Sci-fi energy barrier: two emitter pylons holding a translucent glowing
  // force-field, with horizontal scan lines. Solid cover (full collider).
  _buildEnergyBarrier(x, z, rotY, length = 4) {
    const group = new THREE.Group();
    const neon = this._randNeon();
    const nm = this._neonMat(neon);
    const h = 1.7;
    for (const lx of [-length / 2, length / 2]) {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, h, 8), this._mats.poleMetal);
      pylon.position.set(lx, h / 2, 0);
      pylon.castShadow = true;
      group.add(pylon);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), nm);
      cap.position.set(lx, h, 0);
      group.add(cap);
    }
    const fieldMat = new THREE.MeshStandardMaterial({
      color: neon, emissive: neon, emissiveIntensity: 1.3,
      transparent: true, opacity: 0.26, roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide
    });
    const field = new THREE.Mesh(new THREE.BoxGeometry(length, h * 0.82, 0.08), fieldMat);
    field.position.set(0, h * 0.5, 0);
    group.add(field);
    for (let i = 0; i < 3; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(length, 0.05, 0.1), nm);
      line.position.set(0, 0.45 + i * 0.42, 0);
      group.add(line);
    }
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    group.updateMatrixWorld(true);
    this.scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  // Sci-fi supply crate: dark metallic box with glowing neon edge banding and a
  // lit data panel, plus a smaller stacked crate. Solid cover.
  _buildSciCrate(x, z, rotY) {
    const group = new THREE.Group();
    const neon = this._randNeon();
    const nm = this._neonMat(neon);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14171e, roughness: 0.5, metalness: 0.7 });
    const s = 1.1;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), bodyMat);
    crate.position.y = s / 2;
    crate.castShadow = true;
    group.add(crate);
    for (const dy of [0.08, s - 0.08]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(s + 0.04, 0.05, s + 0.04), nm);
      band.position.y = dy;
      group.add(band);
    }
    const panel = new THREE.Mesh(new THREE.BoxGeometry(s * 0.5, s * 0.5, 0.04), nm);
    panel.position.set(0, s * 0.5, s / 2 + 0.01);
    group.add(panel);
    const small = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), bodyMat);
    small.position.set(0.55, 0.35, 0.15);
    small.rotation.y = 0.4;
    small.castShadow = true;
    group.add(small);

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    group.updateMatrixWorld(true);
    this.scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  // Scattered cover down the two main avenues — civilian street furniture plus
  // sci-fi energy barriers and supply crates, kept within the open corridors so
  // nothing clips into a building footprint. Glowing energy checkpoints seal
  // each avenue's far end.
  _buildObstacles() {
    // Mid-avenue energy barriers — staggered pairs give cover without blocking LOS
    this._buildEnergyBarrier( 3, -22, 0, 3.4);
    this._buildEnergyBarrier(-3,  38, 0, 3.4);
    this._buildEnergyBarrier( 3,  22, 0, 3.4);
    this._buildEnergyBarrier(-3, -38, 0, 3.4);
    this._buildEnergyBarrier( 22, -3, Math.PI / 2, 3.4);
    this._buildEnergyBarrier(-22,  3, Math.PI / 2, 3.4);
    this._buildEnergyBarrier( 22,  3, Math.PI / 2, 3.4);
    this._buildEnergyBarrier(-22, -3, Math.PI / 2, 3.4);
    this._buildEnergyBarrier( 3,  50, 0, 3.4);
    this._buildEnergyBarrier(-3, -50, 0, 3.4);
    this._buildEnergyBarrier( 50, -3, Math.PI / 2, 3.4);
    this._buildEnergyBarrier(-50,  3, Math.PI / 2, 3.4);

    // Glowing energy checkpoints seal each avenue's far end
    this._buildEnergyBarrier(0,  76, 0, 6);
    this._buildEnergyBarrier(0, -76, 0, 6);
    this._buildEnergyBarrier( 76, 0, Math.PI / 2, 6);
    this._buildEnergyBarrier(-76, 0, Math.PI / 2, 6);

    // Sci-fi supply crates — primary low-profile cover in and around the plaza
    this._buildSciCrate( 4,   4, 0.2);
    this._buildSciCrate(-4,  -4, 0.2 + Math.PI);
    this._buildSciCrate(-4,  54, -0.3);
    this._buildSciCrate( 4, -52, -0.3 + Math.PI);
    this._buildSciCrate( 54, -4, Math.PI / 2);
    this._buildSciCrate(-54,  4, -Math.PI / 2);
    this._buildSciCrate( 30,  5, 0.8);
    this._buildSciCrate(-30, -5, 0.8 + Math.PI);
    this._buildSciCrate(  5, -30, -0.5);
    this._buildSciCrate( -5,  30, -0.5 + Math.PI);
    this._buildSciCrate( 42,  42, 1.2);
    this._buildSciCrate(-42, -42, 1.2 + Math.PI);
    this._buildSciCrate( 42, -42, 0.6);
    this._buildSciCrate(-42,  42, 0.6 + Math.PI);
  }

  _buildBoundary() {
    // Force-field boundary: translucent glowing panels anchored by neon pylons
    const half = ARENA_HALF;
    const fieldColor = 0x00e5ff;
    const h = 5.0;
    const fieldMat = new THREE.MeshStandardMaterial({
      color: fieldColor, emissive: fieldColor, emissiveIntensity: 0.8,
      transparent: true, opacity: 0.15, roughness: 0.2, metalness: 0.1,
      side: THREE.DoubleSide
    });
    const pylonNm  = this._neonMat(fieldColor);
    const pylonMetal = new THREE.MeshStandardMaterial({ color: 0x060d16, roughness: 0.25, metalness: 0.95 });

    // Four thin force-field panels (collidable)
    const wallSpecs = [
      { w: half * 2, d: 0.2, x: 0, z: -half },
      { w: half * 2, d: 0.2, x: 0, z:  half },
      { w: 0.2, d: half * 2, x: -half, z: 0 },
      { w: 0.2, d: half * 2, x:  half, z: 0 }
    ];
    for (const s of wallSpecs) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, h, s.d), fieldMat);
      mesh.position.set(s.x, h / 2, s.z);
      this._addCollider(mesh);
    }

    // Anchor pylons along each wall edge
    const pylonH = h + 1.0;
    const offsets = [-80, -60, -40, -20, 0, 20, 40, 60, 80];
    for (const off of offsets) {
      for (const side of [-1, 1]) {
        // North / South boundary
        const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, pylonH, 8), pylonMetal);
        p1.position.set(off, pylonH / 2, side * half);
        this.scene.add(p1);
        const c1 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), pylonNm);
        c1.position.set(off, pylonH, side * half);
        this.scene.add(c1);

        // East / West boundary
        const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, pylonH, 8), pylonMetal);
        p2.position.set(side * half, pylonH / 2, off);
        this.scene.add(p2);
        const c2 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), pylonNm);
        c2.position.set(side * half, pylonH, off);
        this.scene.add(c2);
      }
    }
  }

  _buildOrbitalRing() {
    // Massive Forerunner ring structure floating overhead — the signature landmark
    const ringColor = 0x00e5ff;
    const nm        = this._neonMat(ringColor);
    const accentNm  = this._neonMat(0xff2db4);
    const metalMat  = new THREE.MeshStandardMaterial({ color: 0x060d18, roughness: 0.22, metalness: 0.92 });

    // Main structural torus — slightly tilted for visual dynamism
    const ring = new THREE.Mesh(new THREE.TorusGeometry(95, 2.4, 10, 80), metalMat);
    ring.position.y = 120;
    ring.rotation.x = Math.PI / 2 + 0.08;
    ring.rotation.y = 0.3;
    this.scene.add(ring);

    // Inner cyan glow band
    const glow = new THREE.Mesh(new THREE.TorusGeometry(94, 0.55, 8, 80), nm);
    glow.position.y = 120;
    glow.rotation.x = Math.PI / 2 + 0.08;
    glow.rotation.y = 0.3;
    this.scene.add(glow);

    // Outer accent ring (magenta)
    const accent = new THREE.Mesh(new THREE.TorusGeometry(97.5, 0.35, 6, 80), accentNm);
    accent.position.y = 120;
    accent.rotation.x = Math.PI / 2 + 0.08;
    accent.rotation.y = 0.3;
    this.scene.add(accent);

    // Eight structural nodules evenly spaced around the ring
    const nodeR = 95;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const nx = Math.cos(angle) * nodeR;
      const nz = Math.sin(angle) * nodeR;
      const node = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 10), metalMat);
      node.position.set(nx, 120, nz);
      this.scene.add(node);
      const nodeTip = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8), nm);
      nodeTip.position.set(nx, 122.4, nz);
      this.scene.add(nodeTip);
    }
  }

  _buildArenaCore() {
    // Central Forerunner energy spire — dominant landmark visible from everywhere
    const color    = 0x00e5ff;
    const nm       = this._neonMat(color);
    const accentNm = this._neonMat(0xb24bff);
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x040c14, roughness: 0.20, metalness: 0.95 });

    // Base platform (collidable)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.2, 0.6, 8), metalMat);
    base.position.y = 0.3;
    base.receiveShadow = true;
    this._addCollider(base);

    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.14, 8, 32), nm);
    baseRing.position.y = 0.65;
    baseRing.rotation.x = Math.PI / 2;
    this.scene.add(baseRing);

    // Lower shaft (collidable — blocks movement)
    const shaft1 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 6, 8), metalMat);
    shaft1.position.y = 3.6;
    shaft1.castShadow = true;
    this._addCollider(shaft1);

    // Mid shaft
    const shaft2 = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.2, 8, 8), metalMat);
    shaft2.position.y = 10.0;
    shaft2.castShadow = true;
    this.scene.add(shaft2);

    // Upper shaft
    const shaft3 = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 10, 8), metalMat);
    shaft3.position.y = 19.0;
    this.scene.add(shaft3);

    // Crystal tip
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.35, 8, 8), nm);
    tip.position.y = 28.0;
    this.scene.add(tip);

    // Energy rings at intervals along the spire
    [[3.0, 3.0, color], [7.0, 2.2, 0xff2db4], [12.0, 1.6, color], [18.5, 1.2, 0xb24bff], [24.0, 0.8, color]].forEach(([y, r, c]) => {
      const energyRing = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 8, 32), this._neonMat(c));
      energyRing.position.y = y;
      energyRing.rotation.x = Math.PI / 2;
      this.scene.add(energyRing);
    });

    // Apex light — illuminates the surrounding plaza
    const light = new THREE.PointLight(color, 12, 45, 2);
    light.position.y = 28;
    this.scene.add(light);

    // Orbiting satellite rings (tilted for dynamism)
    const orb1 = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.18, 8, 40), nm);
    orb1.position.y = 8;
    orb1.rotation.x = Math.PI * 0.35;
    orb1.rotation.y = Math.PI * 0.2;
    this.scene.add(orb1);

    const orb2 = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.14, 8, 40), accentNm);
    orb2.position.y = 8;
    orb2.rotation.x = -Math.PI * 0.25;
    orb2.rotation.z =  Math.PI * 0.15;
    this.scene.add(orb2);
  }

  // Circular landing pads with neon edge markings scattered around the arena
  _buildLandingPad(x, z, radius = 5.5, color) {
    const c     = color || this._randNeon();
    const nm    = this._neonMat(c);
    const metal = new THREE.MeshStandardMaterial({ color: 0x050d18, roughness: 0.35, metalness: 0.85 });

    // Pad disc
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.3, 0.14, 16), metal);
    pad.position.set(x, 0.07, z);
    pad.receiveShadow = true;
    this.scene.add(pad);

    // Outer glow ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.14, 8, 40), nm);
    ring.position.set(x, 0.18, z);
    ring.rotation.x = Math.PI / 2;
    this.scene.add(ring);

    // Inner dashed circle (8 arc segments)
    const innerR = radius * 0.6;
    for (let i = 0; i < 8; i++) {
      if (i % 2 === 0) continue;
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(innerR, 0.06, 6, 8, Math.PI / 4),
        nm
      );
      arc.position.set(x, 0.18, z);
      arc.rotation.x = Math.PI / 2;
      arc.rotation.z = (i / 8) * Math.PI * 2;
      this.scene.add(arc);
    }

    // Corner triangle markers
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const mx = x + Math.cos(angle) * (radius - 0.8);
      const mz = z + Math.sin(angle) * (radius - 0.8);
      const marker = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 3), nm);
      marker.position.set(mx, 0.32, mz);
      marker.rotation.y = angle;
      this.scene.add(marker);
    }

    // Ambient pad light
    const light = new THREE.PointLight(c, 3, 18, 2);
    light.position.set(x, 1.2, z);
    this.scene.add(light);
  }

  _buildLandingPads() {
    this._buildLandingPad( 36,   0, 5.5, 0x00e5ff);
    this._buildLandingPad(-36,   0, 5.5, 0x00e5ff);
    this._buildLandingPad(  0,  36, 5.5, 0xff2db4);
    this._buildLandingPad(  0, -36, 5.5, 0xff2db4);
    this._buildLandingPad( 60,  60, 4.5, 0xb24bff);
    this._buildLandingPad(-60, -60, 4.5, 0xb24bff);
    this._buildLandingPad( 60, -60, 4.5, 0x39ff9e);
    this._buildLandingPad(-60,  60, 4.5, 0x39ff9e);
  }

  // Glowing energy channels running down both main avenues, like runway strips
  _buildGroundChannels() {
    const channelMat = (c) => new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 2.0, roughness: 0.3, metalness: 0.1
    });
    const cyan   = channelMat(0x00b4d8);
    const violet = channelMat(0x8844ff);

    // N-S avenue channel strips (parallel to Z axis, offset ±1.5 from centre)
    for (const xOff of [-1.5, 1.5]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, ARENA_HALF * 1.8), cyan);
      strip.position.set(xOff, 0.02, 0);
      this.scene.add(strip);
    }

    // E-W avenue strips
    for (const zOff of [-1.5, 1.5]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(ARENA_HALF * 1.8, 0.02, 0.18), violet);
      strip.position.set(0, 0.02, zOff);
      this.scene.add(strip);
    }

    // Intersection diamond at the plaza centre
    const diag = Math.sqrt(2);
    const pts = [
      [0,  0.02,  3.5],
      [3.5, 0.02,  0],
      [0,  0.02, -3.5],
      [-3.5, 0.02,  0],
    ];
    pts.forEach(([px, py, pz]) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.5 * diag, 0.025, 0.22), cyan);
      bar.position.set(px / 2, py, pz / 2);
      bar.rotation.y = Math.atan2(pz, px) + Math.PI / 4;
      this.scene.add(bar);
    });
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
