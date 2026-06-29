import * as THREE from 'three';
import { GameSettings } from '../core/GameSettings.js';

const ARENA_HALF = 85;
const TAXI_YELLOW = 0xffcf3d;

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

function makeTechFloorTexture() {
  // Winter-Bishop snow: soft white with subtle blue-grey drift + sparkle, no grid.
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e9eef4';
  ctx.fillRect(0, 0, size, size);
  // gentle blue-grey drifts (wind-blown snow)
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 30 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const blue = Math.random() < 0.5;
    g.addColorStop(0, blue ? 'rgba(176,196,214,0.18)' : 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // fine speckle (compacted snow / sparkle)
  for (let i = 0; i < 1800; i++) {
    const v = 200 + Math.random() * 55;
    ctx.fillStyle = `rgba(${v},${v + 4},${Math.min(255, v + 10)},0.5)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ARENA_HALF / 10, ARENA_HALF / 10);
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

// Vertical gradient skydome — deep space zenith bleeding into a vivid
// purple/cyan city-glow horizon. The neon mega-city light-pollutes the sky.
function makeSkyGradientTexture() {
  const w = 16, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  // Winter-Bishop overcast: muted blue-grey zenith melting into a pale warm haze.
  grad.addColorStop(0.00, '#7d93a8'); // soft overcast blue-grey
  grad.addColorStop(0.40, '#9fb1c0');
  grad.addColorStop(0.70, '#c8cdd0');
  grad.addColorStop(0.88, '#e4dcd6'); // warm pale band near horizon
  grad.addColorStop(1.00, '#efe7e0'); // hazy warm horizon
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

  // Clean light panelled facades (ev.io style) — pale grey/teal walls with
  // teal-tinted glass and the odd orange accent pane. No glowing night windows.
  const baseShades = ['#a4afb6', '#aeb9bf', '#98a4ab', '#b2bcc2'];
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

  const glass  = ['#7fa6b2', '#8cb2bd', '#9ac0c8', '#6f99a5', '#86acb6'];
  const accent = ['#ff9c42', '#ffab5a', '#ff8c2e']; // occasional orange pane

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padX + c * cellW + (cellW - winW) / 2;
      const y = padY + r * cellH + (cellH - winH) / 2;
      const isAccent = Math.random() < 0.08;
      const pal = isAccent ? accent : glass;
      ctx.fillStyle = pal[Math.floor(Math.random() * pal.length)];
      ctx.fillRect(x, y, winW, winH);
    }
  }
  // rooftop trim band
  ctx.fillStyle = '#9aa4aa';
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
  // Clean signage: teal / orange / white over a light panel (no neon night ads).
  const neon = [
    ['#ff8a2c', '#ffc08a', '#e8eef0'],  // orange on light
    ['#37c4d4', '#9fe0e8', '#eef4f5'],  // teal on light
    ['#2f9fb0', '#bfe6ec', '#f0f5f6'],  // deep teal
    ['#ffa850', '#ffd6a8', '#eceff0'],  // amber
    ['#4a7d8a', '#a9ccd4', '#f2f6f7'],  // slate-teal
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
    // Clean, bright ev.io-style arena: a light cool-grey sky and a soft, far
    // haze (not a dark moody fog) so distant structure fades cleanly to white.
    this.scene.background = new THREE.Color(0x9fb1c0);
    this.scene.fog = new THREE.Fog(0xc9ccce, 120, 420); // cold snow haze

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
    // Iconic ev.io accent palette: glowing blue first, with orange + teal.
    this._neonColors = [0x33a8ec, 0xff8a2c, 0x37c4d4, 0x6cc4f0, 0xffa850, 0x2f9fb0];
    this._neonMats = new Map();

    // ── Performance budget (the big lever for low-end laptops) ────────────────
    // A forward renderer pays for every dynamic light on every lit pixel, so the
    // ~100 decorative point-lights this map used to spawn were the #1 cost. We
    // now cap them hard by quality and let the emissive materials + bloom carry
    // the glow. Shadows and prop counts also scale with quality.
    const q = GameSettings.get('quality');
    this._quality = q;
    this._maxAccentLights = 0;  // sky-only lighting: NO point lights at any quality
    this._accentLights = 0;
    this._shadows = false;      // no directional light -> no shadows anywhere
    this._lod = q === 'high' ? 1 : q === 'medium' ? 0.7 : 0.4; // scales prop counts

    // Animated props ticked by update(dt): flying vehicles + pulsing energy.
    this._airVehicles = [];
    this._pulseMats   = [];
    this._spinRings   = []; // grav-lift / teleporter rings spun in update(dt)
    this._clock       = 0;

    // ev.io-style arena structures: walkable surfaces (platforms + ramps you can
    // stand on), grav-lift launch columns, and teleporter pairs.
    this.platforms   = []; // { minX,maxX,minZ,maxZ, y0,y1, axis } walkable tops
    this.gravLifts   = []; // { x,z, r, topY, power }
    this.teleporters = []; // { x,z, r, dest:Vector3 }

    // A focused ev.io ARENA — not a city. The old city builders (building grid,
    // skyline, holograms, flying traffic, crosswalks, street lamps, greenery) are
    // intentionally gone; what remains is the arena: enclosing walls, a central
    // landmark, multi-level platforms/ramps, pillars, grav-lifts, teleporters,
    // and cover.
    this._buildLighting();
    this._buildGround();
    this._buildSky();
    this._buildArenaWalls();      // solid perimeter walls (replaces the force-field boundary)
    this._buildObstacles();       // mid-field cover (energy barriers + crates)
    this._buildOrbitalRing();     // overhead sci-fi landmark
    this._buildArenaCore();       // central spire landmark
    this._buildLandingPads();     // accent pads
    this._buildGroundChannels();  // glowing floor lane markings
    this._buildArenaStructures(); // central deck, ramps, wing platforms, grav-lifts, teleporters
    this._buildArenaPillars();    // tall pillars (cover + verticality)
    this._buildSnowProps();       // crates + festive string lights (Winter-Bishop)
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
    // Re-enable matrix updates on meshes we animate every frame (the lock above
    // would otherwise freeze their spin).
    for (const r of this._spinRings) r.mesh.matrixAutoUpdate = true;
  }

  _buildLighting() {
    // SKY LIGHT ONLY. Per request, the scene has no other lights anywhere — no
    // directional key/fill, no point lights, no shadows. Surfaces are lit by this
    // single hemisphere (sky) light plus the scene's environment map (IBL) and
    // emissive accents, which is the cheapest possible lighting to render.
    // Winter overcast: cool soft sky light + a gentle warm sun for low contrast.
    const hemi = new THREE.HemisphereLight(0xe3ecf3, 0x6b7480, 1.15);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffe9d2, 0.8);
    key.position.set(50, 110, 30);
    key.castShadow = false;
    this.scene.add(key);
  }

  _buildGround() {
    const floorTex  = makeTechFloorTexture();
    const roadMat = new THREE.MeshStandardMaterial({
      map:          floorTex,
      roughness:    0.96,
      metalness:    0.0,
      color:        0xeef3f8, // snow
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2), roadMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
    this.scene.add(ground);
  }

  _buildSky() {
    // Clean bright skydome — light blue zenith fading to near-white horizon.
    // No stars / moon: this is a daylit arena, not a neon night city.
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
  }

  _addCollider(mesh) {
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    this.colliders.push({ box, mesh });
  }

  // Add a decorative point light only if we're under the per-quality budget;
  // otherwise the emissive material + bloom still carry the glow for free.
  // `important` lights (e.g. the central arena core) bypass the cap.
  _accentLight(parent, color, intensity, distance, x, y, z, important = false) {
    // Sky-only lighting: never add a point light (budget is 0 for all qualities).
    if (this._accentLights >= this._maxAccentLights) return null;
    this._accentLights++;
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(x, y, z);
    parent.add(light);
    return light;
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
    // Winter-Bishop theme: the map has no neon. Re-purpose every "glowing edge"
    // as a matte dark-wood trim so platforms/walls get a wooden rim instead.
    let m = this._neonMats.get('wood');
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.92, metalness: 0.05 });
      this._neonMats.set('wood', m);
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
    // and somewhere to spawn. Buildings only fill the four quadrants.
    const cell = 18; // centre-to-centre spacing
    const range = 4; // cells out from centre

    for (let ix = -range; ix <= range; ix++) {
      for (let iz = -range; iz <= range; iz++) {
        if (ix === 0 || iz === 0) continue; // keep the cross avenues open

        // ~18% of lots left as empty plazas for breathing room + sightlines.
        if (Math.random() < 0.18) continue;
        const jx = (Math.random() - 0.5) * 4.2;
        const jz = (Math.random() - 0.5) * 4.2;
        const cx = ix * cell + jx;
        const cz = iz * cell + jz;
        const ring = Math.max(Math.abs(ix), Math.abs(iz));

        const fw = 8 + Math.random() * 4;
        const fd = 8 + Math.random() * 4;

        // Three sci-fi archetypes: glass slab, cylinder tower, stepped spire.
        const roll = Math.random();
        let height;
        if (roll < 0.22) {
          // Cylindrical glass tower
          const radius = 3.0 + Math.random() * 2.5;
          height = Math.random() < 0.18
            ? 52 + Math.random() * 32
            : 22 + Math.random() * 28;
          this._buildCylinderTower(cx, cz, radius, height, ring);
        } else if (roll < 0.46) {
          // Stepped / tiered Art-Deco-in-space spire
          height = Math.random() < 0.15
            ? 50 + Math.random() * 32
            : 22 + Math.random() * 28;
          this._buildSteppedTower(cx, cz, fw, fd, height, ring);
        } else {
          // Standard glass curtain-wall tower
          height = Math.random() < 0.16
            ? 56 + Math.random() * 28
            : 20 + Math.random() * 28;
          this._buildBuilding(cx, cz, fw, fd, height, 'glass', ring);
        }
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
        color: 0xffffff,   // clean light panels, lit by scene light (no self-glow)
        roughness: 0.55,
        metalness: 0.15,
        envMapIntensity: 0.5,
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
      emissiveIntensity: special ? 0.7 : 0.5,
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
    const glowColors = [0xff8a2c, 0x37c4d4, 0x37c4d4, 0xff8a2c, 0xffcc00];
    const gc = special ? 0xff3a4a : glowColors[Math.floor(Math.random() * glowColors.length)];
    this._accentLight(this.scene, gc, special ? 3.0 : 2.2, 22,
      cx + ox * (half + 2.5), y, cz + oz * (half + 2.5));
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

    this._accentLight(group, color, 7, 20, 0, 7.4, 0);

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

  // ── Cylindrical glass tower ─────────────────────────────────────────────────
  _buildCylinderTower(cx, cz, radius, height, ring = 1) {
    const base = 0.25;
    const neon  = this._randNeon();
    const nm    = this._neonMat(neon);
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x0c1824, roughness: 0.22, metalness: 0.76,
      emissive: 0x000c18, emissiveIntensity: 0.28, envMapIntensity: 1.4,
    });

    // Circular sidewalk slab
    const sidewalk = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 1.9, radius + 2.2, base, 20),
      new THREE.MeshStandardMaterial({ color: 0xb0b4bc, roughness: 0.9, metalness: 0.05 })
    );
    sidewalk.position.set(cx, base / 2, cz);
    sidewalk.receiveShadow = true;
    this.scene.add(sidewalk);

    // Stone plinth ring
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 0.3, radius + 0.5, 1.0, 20), this._mats.glassPlinth
    );
    plinth.position.set(cx, base + 0.5, cz);
    this.scene.add(plinth);

    // Main tower
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.93, radius, height, 20), metalMat
    );
    tower.position.set(cx, height / 2 + base, cz);
    tower.castShadow = true;
    tower.receiveShadow = true;
    this._addCollider(tower);

    // Neon horizontal ring bands
    const numBands = Math.max(2, Math.floor(height / 11));
    for (let i = 1; i <= numBands; i++) {
      const t  = i / (numBands + 1);
      const by = base + height * t;
      const br = radius * (1.0 - t * 0.07);
      const band = new THREE.Mesh(new THREE.TorusGeometry(br + 0.2, 0.065, 8, 32), nm);
      band.position.set(cx, by, cz);
      band.rotation.x = Math.PI / 2;
      this.scene.add(band);
    }

    // Glowing rooftop cap
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 0.28, radius * 0.93, 0.38, 20), nm
    );
    cap.position.set(cx, base + height + 0.19, cz);
    this.scene.add(cap);

    // Antenna spire on taller towers
    if (height > 22) {
      const spireH = 2.5 + Math.random() * 5;
      const spire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.12, spireH, 6), this._mats.poleMetal
      );
      spire.position.set(cx, base + height + spireH / 2 + 0.38, cz);
      this.scene.add(spire);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), nm);
      tip.position.set(cx, base + height + spireH + 0.38, cz);
      this.scene.add(tip);
    }

    // Billboard panel on inner-ring towers
    if (ring <= 2 && Math.random() < 0.55) {
      const panelAngle = Math.random() * Math.PI * 2;
      const panelX = cx + Math.cos(panelAngle) * (radius + 0.2);
      const panelZ = cz + Math.sin(panelAngle) * (radius + 0.2);
      const panelH = Math.min(height * 0.30, 9);
      const panelW = panelH * 0.62;
      const tex = this._billboardTex[Math.floor(Math.random() * this._billboardTex.length)];
      const panelMat = new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: 0xffffff,
        emissiveIntensity: 0.5, color: 0x303030, roughness: 0.5,
      });
      const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, 0.12), panelMat);
      panel.position.set(panelX, base + height * 0.36, panelZ);
      panel.rotation.y = -panelAngle;
      this.scene.add(panel);
      const glowCols = [0xff8a2c, 0x37c4d4, 0x37c4d4, 0xff8a2c, 0xffcc00];
      const gc = glowCols[Math.floor(Math.random() * glowCols.length)];
      this._accentLight(this.scene, gc, 2.0, 18,
        panelX + Math.cos(panelAngle) * 2.5, base + height * 0.36,
        panelZ + Math.sin(panelAngle) * 2.5);
    }
  }

  // ── Stepped / tiered Art-Deco-in-space tower ────────────────────────────────
  _buildSteppedTower(cx, cz, fw, fd, height, ring = 1) {
    const base = 0.25;
    const neon  = this._randNeon();
    const nm    = this._neonMat(neon);

    // Sidewalk slab
    const swTex = this._sidewalkTex.clone();
    swTex.needsUpdate = true;
    swTex.repeat.set(Math.round(fw / 2), Math.round(fd / 2));
    const sidewalk = new THREE.Mesh(
      new THREE.BoxGeometry(fw + 3, base, fd + 3),
      new THREE.MeshStandardMaterial({ map: swTex, roughness: 0.9, metalness: 0.05, color: 0xb8bcc4 })
    );
    sidewalk.position.set(cx, base / 2, cz);
    sidewalk.receiveShadow = true;
    this.scene.add(sidewalk);

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(fw + 0.32, 1.2, fd + 0.32), this._mats.glassPlinth
    );
    plinth.position.set(cx, base + 0.6, cz);
    this.scene.add(plinth);

    // Three setback tiers
    const h1 = height * 0.54;                          // base block
    const h2 = height * 0.26;                          // mid setback
    const h3 = height * 0.20;                          // top spire block
    this._addGlassBlock(cx, cz, fw,        fd,        h1, base,           nm, true);
    this._addGlassBlock(cx, cz, fw * 0.72, fd * 0.72, h2, base + h1,     nm, false);
    this._addGlassBlock(cx, cz, fw * 0.46, fd * 0.46, h3, base + h1 + h2, nm, false);

    // Antenna
    const spireH = 2 + Math.random() * 5;
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.13, spireH, 6), this._mats.poleMetal
    );
    spire.position.set(cx, base + h1 + h2 + h3 + spireH / 2, cz);
    this.scene.add(spire);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), nm);
    tip.position.set(cx, base + h1 + h2 + h3 + spireH, cz);
    this.scene.add(tip);

    // Inner-core billboard
    if (ring <= 2 && Math.random() < 0.5) {
      const front = this._frontFace(cx, cz);
      this._buildBillboard(cx, cz, fw, fd, front, height, base, false);
    }
  }

  // Shared glass block used by stepped tower — one facade-textured box with
  // neon roof band + corner strips. isCollider=true registers it in the collider list.
  _addGlassBlock(cx, cz, fw, fd, height, yBase, nm, isCollider) {
    const tex = this._facadeTex[Math.floor(Math.random() * this._facadeTex.length)].clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(fw / 4)), Math.max(2, Math.round(height / 8)));
    const facadeMat = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.6,
      color: 0x161a20, roughness: 0.35, metalness: 0.6, envMapIntensity: 1.2,
    });
    const block = new THREE.Mesh(new THREE.BoxGeometry(fw, height, fd), facadeMat);
    block.position.set(cx, yBase + height / 2, cz);
    block.castShadow = true;
    block.receiveShadow = true;
    if (isCollider) {
      this._addCollider(block);
    } else {
      block.matrixAutoUpdate = false;
      block.updateMatrix();
      this.scene.add(block);
    }
    // Neon roof band
    const roofBand = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.5, 0.14, fd + 0.5), nm);
    roofBand.position.set(cx, yBase + height + 0.07, cz);
    this.scene.add(roofBand);
    // Vertical neon corner strips
    const hx = fw / 2, hz = fd / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, height * 0.92, 0.1), nm);
        strip.position.set(cx + sx * hx, yBase + height / 2, cz + sz * hz);
        this.scene.add(strip);
      }
    }
  }

  // ── Elevated glass skyway bridges ───────────────────────────────────────────
  _buildSkyways() {
    // Pedestrian bridges spanning the cross-avenues at height, connecting
    // inner-ring building clusters. Positions chosen so bridges clear the
    // 16-unit-wide avenue floor and don't clip into building mass.
    const specs = [
      // [x1, z1, x2, z2, bridgeHeight]
      [  9, -20,   9,  20, 13],
      [ -9, -20,  -9,  20, 13],
      [-20,   9,  20,   9, 13],
      [-20,  -9,  20,  -9, 13],
      [  9,  27,   9,  46, 10],
      [ -9, -27,  -9, -46, 10],
      [ 27,   9,  46,   9, 10],
      [-27,  -9, -46,  -9, 10],
      [ 10, -38,  32, -38, 16],
      [-10,  38, -32,  38, 16],
    ];
    for (const [x1, z1, x2, z2, h] of specs) {
      this._buildSkyway(x1, z1, x2, z2, h);
    }
  }

  _buildSkyway(x1, z1, x2, z2, height) {
    const dx = x2 - x1, dz = z2 - z1;
    const length = Math.sqrt(dx * dx + dz * dz);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const angle = Math.atan2(dz, dx);

    const neon = this._randNeon();
    const nm   = this._neonMat(neon);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1a3550, transparent: true, opacity: 0.52,
      roughness: 0.08, metalness: 0.65, side: THREE.DoubleSide,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x080e18, roughness: 0.28, metalness: 0.90,
    });

    const group = new THREE.Group();

    // Floor slab
    const floor = new THREE.Mesh(new THREE.BoxGeometry(length, 0.22, 2.4), frameMat);
    floor.position.y = -0.68;
    group.add(floor);

    // Glass side walls
    for (const sz of [-1.18, 1.18]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(length, 2.2, 0.07), glassMat);
      panel.position.set(0, 0.42, sz);
      group.add(panel);
    }

    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(length, 0.15, 2.44), frameMat);
    ceiling.position.y = 1.42;
    group.add(ceiling);

    // Neon underside strip
    const strip = new THREE.Mesh(new THREE.BoxGeometry(length - 0.5, 0.05, 2.08), nm);
    strip.position.y = -0.54;
    group.add(strip);

    // Structural ribs at intervals
    const ribCount = Math.max(2, Math.round(length / 7));
    for (let i = 0; i <= ribCount; i++) {
      const lx = -length / 2 + (i / ribCount) * length;
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 2.46), frameMat);
      rib.position.set(lx, 0.32, 0);
      group.add(rib);
    }

    // Diagonal tension cables
    for (const s of [-1, 1]) {
      const cable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 2.6, 4), this._mats.poleMetal
      );
      cable.position.set(s * length * 0.28, 0.44, 0);
      cable.rotation.z = s * 0.28;
      group.add(cable);
    }

    group.position.set(cx, height, cz);
    group.rotation.y = -angle;
    group.updateMatrixWorld(true);
    this.scene.add(group);

    const box = new THREE.Box3().setFromObject(group);
    this.colliders.push({ box, mesh: group });
  }

  // ── Holographic projection pillars ──────────────────────────────────────────
  _buildHologramPillars() {
    const positions = [
      // staggered pairs down each avenue arm so they don't block the centreline
      [  5, -28], [-5,  28], [-28,  5], [ 28, -5],
      [  5, -55], [-5,  55], [-55,  5], [ 55, -5],
    ];
    for (const [x, z] of positions) this._buildHologramPillar(x, z);
  }

  _buildHologramPillar(x, z) {
    const group   = new THREE.Group();
    const color   = this._randNeon();
    const nm      = this._neonMat(color);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x06101e, roughness: 0.26, metalness: 0.92,
    });

    // Hex base pad
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.18, 6), bodyMat);
    pad.position.y = 0.09;
    pad.receiveShadow = true;
    group.add(pad);

    // Tapered column
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 2.8, 8), bodyMat);
    pillar.position.y = 1.49;
    pillar.castShadow = true;
    group.add(pillar);

    // Neon collar rings
    for (const py of [0.72, 1.52, 2.6]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.042, 6, 18), nm);
      ring.position.y = py;
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }

    // Floating hologram panel
    const holoMat = new THREE.MeshStandardMaterial({
      color: color, emissive: color, emissiveIntensity: 1.0,
      transparent: true, opacity: 0.28, side: THREE.DoubleSide,
      roughness: 0.2, metalness: 0.1,
    });
    const holo = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.7, 0.04), holoMat);
    holo.position.set(0, 4.25, 0);
    group.add(holo);

    // Frame edges
    for (const ex of [-1.02, 1.02]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.74, 0.06), nm);
      edge.position.set(ex, 4.25, 0);
      group.add(edge);
    }
    for (const ey of [2.875, 5.625]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.05, 0.06), nm);
      edge.position.set(0, ey, 0);
      group.add(edge);
    }

    // Stalk connecting column top to hologram base
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), this._mats.poleMetal
    );
    stalk.position.set(0, 3.25, 0);
    group.add(stalk);

    this._accentLight(group, color, 2.8, 15, 0, 4.5, 0);

    group.position.set(x, 0, z);
    group.updateMatrixWorld(true);
    this.scene.add(group);
  }

  // ── Flying traffic ──────────────────────────────────────────────────────────
  // Hover-vehicles and dropships drifting on looping paths high over the city —
  // the single biggest "this is the future" cue. Built as Groups (which keep
  // matrixAutoUpdate on) so update(dt) can reposition them every frame.
  _buildAirTraffic() {
    const colors = [0x37c4d4, 0xff8a2c, 0x37c4d4, 0xffc400, 0x3aa0b0];
    // Circling hover-cars at varied altitude/radius/speed/direction.
    const orbitCount = Math.max(2, Math.round(9 * this._lod));
    for (let i = 0; i < orbitCount; i++) {
      const color  = colors[i % colors.length];
      const veh    = this._buildHoverVehicle(color, 0.8 + Math.random() * 0.7);
      const radius = 50 + Math.random() * 70;
      const y      = 26 + Math.random() * 60;
      const speed  = (0.06 + Math.random() * 0.10) * (Math.random() < 0.5 ? 1 : -1);
      const phase  = Math.random() * Math.PI * 2;
      veh.matrixAutoUpdate = true;
      this.scene.add(veh);
      this._airVehicles.push({ group: veh, kind: 'orbit', radius, y, speed, phase, bob: Math.random() * Math.PI * 2 });
    }
    // A couple of big slow dropships on straight cross-city passes.
    for (let i = 0; i < 3; i++) {
      const color = 0x9fe8ff;
      const ship  = this._buildHoverVehicle(color, 2.0 + Math.random() * 0.8);
      const y     = 70 + Math.random() * 30;
      const axis  = i % 2 === 0 ? 'x' : 'z';
      const off   = (Math.random() - 0.5) * 80;
      const speed = (6 + Math.random() * 5) * (Math.random() < 0.5 ? 1 : -1);
      ship.matrixAutoUpdate = true;
      this.scene.add(ship);
      this._airVehicles.push({ group: ship, kind: 'cross', axis, off, y, speed, pos: (Math.random() - 0.5) * 360 });
    }
  }

  _buildHoverVehicle(color, scale = 1) {
    const group = new THREE.Group();
    const nm    = this._neonMat(color);
    const hull  = new THREE.MeshStandardMaterial({ color: 0x0a121e, roughness: 0.3, metalness: 0.85 });

    // Sleek elongated body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 3.6), hull);
    group.add(body);
    // Cockpit canopy
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.4, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x0a1c2a, roughness: 0.1, metalness: 0.6,
        emissive: color, emissiveIntensity: 0.3 })
    );
    canopy.position.set(0, 0.38, 0.5);
    group.add(canopy);
    // Glowing engine pods at the rear
    for (const sx of [-0.62, 0.62]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.5, 10), nm);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(sx, -0.02, -1.85);
      group.add(pod);
    }
    // Underglow strip
    const under = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 3.0), nm);
    under.position.y = -0.28;
    group.add(under);
    // Wingtip nav lights
    for (const sx of [-0.95, 0.95]) {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), nm);
      tip.position.set(sx, 0, 0.2);
      group.add(tip);
    }

    group.scale.setScalar(scale);
    return group;
  }

  // ── Background city silhouette ───────────────────────────────────────────────
  // Simplified buildings ringing the arena far beyond the boundary — makes the
  // sci-fi city feel limitless rather than stopping at the force field.
  _buildBackgroundSkyline() {
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xff1a00, emissive: 0xff1a00, emissiveIntensity: 3.0,
    });
    const winColors = [0x1840c0, 0xd01060, 0x00a0d8, 0xff5010, 0x5018d0, 0x37c4d4, 0xff2080];

    const bgCount = Math.max(20, Math.round(64 * this._lod));
    for (let i = 0; i < bgCount; i++) {
      const angle  = (i / bgCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
      const dist   = 108 + Math.random() * 38;
      const bx     = Math.cos(angle) * dist;
      const bz     = Math.sin(angle) * dist;
      const height = 10 + Math.random() * 75;
      const width  = 3.5 + Math.random() * 9;
      const depth  = 3.5 + Math.random() * 9;

      // Dark silhouette body — barely picks up ambient
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x03060d, roughness: 0.95, metalness: 0.08,
        emissive: 0x010308, emissiveIntensity: 0.18,
      });
      const bld = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bodyMat);
      bld.position.set(bx, height / 2, bz);
      this.scene.add(bld);

      // Lit window band partway up
      if (Math.random() < 0.68) {
        const wc = winColors[Math.floor(Math.random() * winColors.length)];
        const winMat = new THREE.MeshStandardMaterial({
          color: 0x040710, emissive: wc,
          emissiveIntensity: 0.35 + Math.random() * 0.55,
        });
        const wh = 0.6 + Math.random() * 2.0;
        const win = new THREE.Mesh(
          new THREE.BoxGeometry(width - 0.4, wh, depth - 0.4), winMat
        );
        win.position.set(bx, height * (0.28 + Math.random() * 0.44), bz);
        this.scene.add(win);
      }

      // Second lit band for taller buildings
      if (height > 40 && Math.random() < 0.5) {
        const wc2 = winColors[Math.floor(Math.random() * winColors.length)];
        const winMat2 = new THREE.MeshStandardMaterial({
          color: 0x040710, emissive: wc2,
          emissiveIntensity: 0.3 + Math.random() * 0.45,
        });
        const wh2 = 0.5 + Math.random() * 1.4;
        const win2 = new THREE.Mesh(
          new THREE.BoxGeometry(width - 0.6, wh2, depth - 0.6), winMat2
        );
        win2.position.set(bx, height * (0.55 + Math.random() * 0.25), bz);
        this.scene.add(win2);
      }

      // Rooftop beacon on tall towers
      if (height > 50) {
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.38, 6, 6), beaconMat);
        beacon.position.set(bx, height + 0.4, bz);
        this.scene.add(beacon);
      }

      // Neon rooftop band on some buildings
      if (Math.random() < 0.42) {
        const neon = this._randNeon();
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(width + 0.3, 0.22, depth + 0.3), this._neonMat(neon)
        );
        band.position.set(bx, height + 0.11, bz);
        this.scene.add(band);
      }
    }
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

    this._accentLight(group, color, 3.5, 14, 0, 3.5, 0);

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

  // Solid perimeter walls that enclose the arena (replaces the old force-field).
  // Clean light panels with glowing blue trim + corner towers — the ev.io
  // "you're inside a built arena" feel, and the backdrop now that the city is gone.
  _buildArenaWalls() {
    const half = ARENA_HALF;
    const H = 24, T = 2.5;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xa9663f, roughness: 0.92, metalness: 0.03 });  // terracotta
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.9, metalness: 0.04 });  // darker clay
    const trimMat = this._neonMat(0x4a3320);

    const specs = [
      { w: half * 2 + T * 2, d: T, x: 0, z: -half },
      { w: half * 2 + T * 2, d: T, x: 0, z:  half },
      { w: T, d: half * 2 + T * 2, x: -half, z: 0 },
      { w: T, d: half * 2 + T * 2, x:  half, z: 0 },
    ];
    for (const s of specs) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(s.w, H, s.d), wallMat);
      wall.position.set(s.x, H / 2, s.z);
      wall.receiveShadow = true;
      this._addCollider(wall);
      // inset panel stripe for paneling detail
      const panel = new THREE.Mesh(new THREE.BoxGeometry(s.w * 0.98, H * 0.5, s.d + 0.2), panelMat);
      panel.position.set(s.x, H * 0.5, s.z);
      this.scene.add(panel);
      // glowing blue trim bands near the top and base
      for (const ty of [H - 3.0, 1.0]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.15, 0.4, s.d + 0.15), trimMat);
        band.position.set(s.x, ty, s.z);
        this.scene.add(band);
      }
    }

    // Corner towers tie the walls together.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, H + 5, 14), wallMat);
        tower.position.set(sx * half, (H + 5) / 2, sz * half);
        tower.receiveShadow = true;
        this._addCollider(tower);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.18, 8, 26), trimMat);
        ring.position.set(sx * half, H + 1.5, sz * half);
        ring.rotation.x = Math.PI / 2;
        this.scene.add(ring);
      }
    }
  }

  _buildOrbitalRing() {
    // Massive Forerunner ring structure floating overhead — the signature landmark
    const ringColor = 0x37c4d4;
    const nm        = this._neonMat(ringColor);
    const accentNm  = this._neonMat(0xff8a2c);
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
    const color    = 0x37c4d4;
    const nm       = this._neonMat(color);
    const accentNm = this._neonMat(0x3aa0b0);
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
    [[3.0, 3.0, color], [7.0, 2.2, 0xff8a2c], [12.0, 1.6, color], [18.5, 1.2, 0x3aa0b0], [24.0, 0.8, color]].forEach(([y, r, c]) => {
      const energyRing = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 8, 32), this._neonMat(c));
      energyRing.position.y = y;
      energyRing.rotation.x = Math.PI / 2;
      this.scene.add(energyRing);
    });

    // Apex light — illuminates the surrounding plaza (central landmark; always on)
    this._accentLight(this.scene, color, 12, 45, 0, 28, 0, true);

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
    this._accentLight(this.scene, c, 3, 18, x, 1.2, z);
  }

  _buildLandingPads() {
    this._buildLandingPad( 36,   0, 5.5, 0x37c4d4);
    this._buildLandingPad(-36,   0, 5.5, 0x37c4d4);
    this._buildLandingPad(  0,  36, 5.5, 0xff8a2c);
    this._buildLandingPad(  0, -36, 5.5, 0xff8a2c);
    this._buildLandingPad( 60,  60, 4.5, 0x3aa0b0);
    this._buildLandingPad(-60, -60, 4.5, 0x3aa0b0);
    this._buildLandingPad( 60, -60, 4.5, 0x37c4d4);
    this._buildLandingPad(-60,  60, 4.5, 0x37c4d4);
  }

  // Glowing energy channels running down both main avenues, like runway strips
  _buildGroundChannels() {
    const channelMat = (c) => new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 2.0, roughness: 0.3, metalness: 0.1
    });
    const cyan   = channelMat(0x00b4d8);
    const violet = channelMat(0x3aa0b0);

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
      [0, 22], [0, -22], [22, 0], [-22, 0], [14, 14], [-14, -14],
      [7.5, 42], [-7.5, -42], [42, 7.5], [-42, -7.5], [7.5, -50], [-7.5, 50],
      [0, 60], [0, -60], [60, 0], [-60, 0]
    ];
    for (const [x, z] of coords) {
      this.spawnPoints.push(new THREE.Vector3(x, 0, z));
    }
  }

  // Animate the living city: drive flying traffic along its looping paths.
  // Called every frame by Game.js (both gameplay and the menu fly-through).
  update(dt) {
    this._clock += dt;
    for (const v of this._airVehicles) {
      const g = v.group;
      if (v.kind === 'orbit') {
        v.phase += v.speed * dt;
        const x = Math.cos(v.phase) * v.radius;
        const z = Math.sin(v.phase) * v.radius;
        const y = v.y + Math.sin(this._clock * 0.6 + v.bob) * 1.2; // gentle bob
        g.position.set(x, y, z);
        // Face along the tangent of travel.
        g.rotation.y = -v.phase + (v.speed > 0 ? -Math.PI / 2 : Math.PI / 2);
      } else { // cross
        v.pos += v.speed * dt;
        if (v.pos >  220) v.pos = -220;
        if (v.pos < -220) v.pos =  220;
        if (v.axis === 'x') {
          g.position.set(v.pos, v.y, v.off);
          g.rotation.y = v.speed > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          g.position.set(v.off, v.y, v.pos);
          g.rotation.y = v.speed > 0 ? 0 : Math.PI;
        }
      }
    }
    // Spin grav-lift / teleporter rings for a live, energised look.
    for (const r of this._spinRings) {
      r.mesh.rotation.z = this._clock * r.speed;
    }
  }

  // ── Arena pillars ────────────────────────────────────────────────────────────
  // Tall clean columns with glowing blue rings — the single most iconic ev.io
  // arena element: cover, sightline breaks, and verticality anchors. Symmetric
  // placement keeps the map balanced for TDM/CTF.
  _buildArenaPillars() {
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0xb79c78, roughness: 0.9, metalness: 0.04, envMapIntensity: 0.4, // stone column
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x8f7a5c, roughness: 0.9, metalness: 0.05, // weathered stone cap
    });
    const ringMat = this._neonMat(0x4a3320); // wooden band

    // Symmetric ring of pillars around the central courtyard + outer pairs,
    // placed in open lanes so they read as cover, not clutter.
    const spots = [
      [16, 16], [-16, 16], [16, -16], [-16, -16],
      [27, 0], [-27, 0], [0, 27], [0, -27],
      [50, 50], [-50, 50], [50, -50], [-50, -50],
    ];
    for (const [x, z] of spots) {
      const h = 11 + ((Math.abs(x) + Math.abs(z)) % 5);
      const group = new THREE.Group();

      // base plinth
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 0.5, 16), capMat);
      base.position.y = 0.25;
      base.receiveShadow = true;
      group.add(base);

      // tapered shaft
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, h, 16), pillarMat);
      shaft.position.y = h / 2 + 0.5;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      group.add(shaft);

      // top cap
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.95, 0.6, 16), capMat);
      cap.position.y = h + 0.8;
      cap.castShadow = true;
      group.add(cap);

      // glowing blue rings near the base and top
      for (const ry of [1.6, h - 1.0]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 8, 28), ringMat);
        ring.position.y = ry;
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
      }
      // a vertical accent groove up one face
      const groove = new THREE.Mesh(new THREE.BoxGeometry(0.1, h - 2.4, 0.1), ringMat);
      groove.position.set(0, h / 2 + 0.5, 1.0);
      group.add(groove);

      group.position.set(x, 0, z);
      group.updateMatrixWorld(true);
      this.scene.add(group);
      // collide against the shaft (solid cover)
      const box = new THREE.Box3(
        new THREE.Vector3(x - 1.05, 0, z - 1.05),
        new THREE.Vector3(x + 1.05, h + 1.4, z + 1.05)
      );
      this.colliders.push({ box, mesh: shaft });
    }
  }

  // Winter-Bishop props: stacked wooden crates for cover + festive string lights
  // strung between the perimeter wall tops (the colored bulbs from the map).
  _buildSnowProps() {
    const wood  = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.95 });
    const band  = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 });
    const snow  = new THREE.MeshStandardMaterial({ color: 0xeef3f8, roughness: 0.95 });

    const crate = (x, z, s, y = 0) => {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), wood);
      box.position.y = s / 2; g.add(box);
      // edge bands
      for (const ax of ['x', 'z']) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(ax === 'x' ? s + 0.04 : 0.12, 0.12, ax === 'z' ? s + 0.04 : 0.12), band);
        b.position.set(0, s / 2, 0); g.add(b);
      }
      // snow cap
      const cap = new THREE.Mesh(new THREE.BoxGeometry(s + 0.05, 0.12, s + 0.05), snow);
      cap.position.y = s + 0.02; g.add(cap);
      g.position.set(x, y, z);
      g.updateMatrixWorld(true);
      this.scene.add(g);
      const half = s / 2;
      this.colliders.push({ box: new THREE.Box3(
        new THREE.Vector3(x - half, y, z - half),
        new THREE.Vector3(x + half, y + s, z + half)), mesh: box });
    };

    // Crate clusters scattered in the lanes (cover), clear of the centre + ramps.
    const clusters = [
      [22, 40], [-22, 40], [40, 22], [-40, 22],
      [22, -40], [-22, -40], [40, -22], [-40, -22],
      [58, 8], [-58, 8], [8, 58], [-8, -58],
    ];
    for (const [x, z] of clusters) {
      crate(x, z, 1.9);
      crate(x + 1.95, z, 1.6);
      if ((x + z) % 3 === 0) crate(x, z, 1.4, 1.9); // a stacked one
    }

    // Festive string lights along the inner top of the four perimeter walls.
    const half = ARENA_HALF;
    const bulbColors = [0xff4040, 0x40c060, 0xffd23b, 0x4090ff, 0xff8a3b, 0xffffff];
    const strand = (x0, z0, x1, z1) => {
      const segs = 26, y0 = 21;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const droop = Math.sin(t * Math.PI) * 2.2; // catenary sag
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        const c = bulbColors[i % bulbColors.length];
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 6, 5),
          new THREE.MeshBasicMaterial({ color: c })
        );
        bulb.position.set(x, y0 - droop, z);
        bulb.matrixAutoUpdate = false; bulb.updateMatrix();
        this.scene.add(bulb);
      }
    };
    const e = half - 1.6;
    strand(-e, -e,  e, -e);
    strand( e, -e,  e,  e);
    strand( e,  e, -e,  e);
    strand(-e,  e, -e, -e);
  }

  // ── ev.io-style arena structures ────────────────────────────────────────────
  // Walkable raised platforms + ramps (strong verticality), grav-lift launch
  // columns, and teleporter pads — the structural language that defines ev.io
  // arenas: a high-ground control centre, connecting catwalks, fast vertical
  // travel, and cross-map teleports.
  _buildArenaStructures() {
    // Iconic ev.io look: clean near-white platforms with glowing blue edges.
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0xc9a878, roughness: 0.9, metalness: 0.04, envMapIntensity: 0.4, // warm sandstone
    });
    const trimColor = 0x4a3320; // wooden edge trim

    // 1) Central command deck around the spire (the high-ground power position).
    const DECK = 8, DECK_Y = 4.5;
    this._platformBox(0, 0, DECK * 2, DECK * 2, DECK_Y, deckMat, trimColor);

    // 4 ramps from the avenues up onto the deck.
    // +X / -X (axis 'x'), +Z / -Z (axis 'z'); each 5 wide, rising to the deck.
    this._rampBox( 8, 18, -2.5, 2.5, DECK_Y, 0, 'x', deckMat, trimColor); // east, high at minX
    this._rampBox(-18, -8, -2.5, 2.5, 0, DECK_Y, 'x', deckMat, trimColor); // west, high at maxX
    this._rampBox(-2.5, 2.5,  8, 18, DECK_Y, 0, 'z', deckMat, trimColor); // north
    this._rampBox(-2.5, 2.5, -18, -8, 0, DECK_Y, 'z', deckMat, trimColor); // south

    // 2) Four wing platforms on the avenue arms, each fed by its own grav-lift
    //    (lofts you up onto the deck) and topped with a power-weapon marker.
    const WING_Y = 6.5;
    const wings = [
      { x:  34, z:   0, axis: 'x', inX: -3, inZ:  0, outX:  3, outZ:  0 },
      { x: -34, z:   0, axis: 'x', inX:  3, inZ:  0, outX: -3, outZ:  0 },
      { x:   0, z:  34, axis: 'z', inX:  0, inZ: -3, outX:  0, outZ:  3 },
      { x:   0, z: -34, axis: 'z', inX:  0, inZ:  3, outX:  0, outZ: -3 },
    ];
    for (const w of wings) {
      const ww = w.axis === 'x' ? 11 : 9;
      const wd = w.axis === 'x' ? 9  : 11;
      this._platformBox(w.x, w.z, ww, wd, WING_Y, deckMat, trimColor);
      // Grav-lift sits under the wing's inner half and lifts you onto the deck.
      this._gravLift(w.x + w.inX, w.z + w.inZ, WING_Y - 0.5, 14);
      // Power-weapon spawn marker on the wing's outer half.
      this._spawnPadMarker(w.x + w.outX, w.z + w.outZ, WING_Y, 0xffc400);
    }

    // 3) Teleporter pairs near the diagonal corners — cross-map jumps.
    this._teleporterPair( 60,  60, -60, -60, 0x3aa0b0);
    this._teleporterPair(-60,  60,  60, -60, 0x37c4d4);
  }

  // Solid walkable platform: a deck box with a glowing neon edge band. Registers
  // a flat walkable surface in this.platforms (stand-on-top, not a wall).
  _platformBox(cx, cz, w, d, y, mat, trimColor) {
    const thick = 0.5;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(w, thick, d), mat);
    deck.position.set(cx, y - thick / 2, cz);
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.scene.add(deck);
    // glowing edge trim
    const nm = this._neonMat(trimColor);
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.08, d + 0.3), nm);
    band.position.set(cx, y + 0.02, cz);
    this.scene.add(band);
    // support pillar(s) down to the ground for a grounded look
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0c1420, roughness: 0.4, metalness: 0.8 });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, y, 8), pillarMat);
    pillar.position.set(cx, y / 2, cz);
    this.scene.add(pillar);
    this.platforms.push({
      minX: cx - w / 2, maxX: cx + w / 2,
      minZ: cz - d / 2, maxZ: cz + d / 2,
      y0: y, y1: y, axis: 'x',
    });
  }

  // Sloped walkable ramp from y0 (at the min end of `axis`) to y1 (at the max end).
  _rampBox(minX, maxX, minZ, maxZ, y0, y1, axis, mat, trimColor) {
    const w = maxX - minX, d = maxZ - minZ;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const run = axis === 'x' ? w : d;
    const rise = y1 - y0;
    const len = Math.hypot(run, rise);
    const thick = 0.4;
    const geo = axis === 'x'
      ? new THREE.BoxGeometry(len, thick, d)
      : new THREE.BoxGeometry(w, thick, len);
    const ramp = new THREE.Mesh(geo, mat);
    ramp.position.set(cx, (y0 + y1) / 2, cz);
    const angle = Math.atan2(rise, run);
    if (axis === 'x') ramp.rotation.z = -angle;
    else              ramp.rotation.x = angle;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    this.scene.add(ramp);
    // neon side rails
    const nm = this._neonMat(trimColor);
    for (const s of [-1, 1]) {
      const railGeo = axis === 'x'
        ? new THREE.BoxGeometry(len, 0.07, 0.12)
        : new THREE.BoxGeometry(0.12, 0.07, len);
      const rail = new THREE.Mesh(railGeo, nm);
      const off = (axis === 'x' ? d : w) / 2;
      rail.position.set(
        cx + (axis === 'x' ? 0 : s * off),
        (y0 + y1) / 2 + 0.24,
        cz + (axis === 'x' ? s * off : 0)
      );
      if (axis === 'x') rail.rotation.z = -angle;
      else              rail.rotation.x = angle;
      this.scene.add(rail);
    }
    this.platforms.push({ minX, maxX, minZ, maxZ, y0, y1, axis });
  }

  // A glowing weapon/power-up spawn marker resting on a platform.
  _spawnPadMarker(x, z, y, color) {
    const nm = this._neonMat(color);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.07, 8, 24), nm);
    ring.position.set(x, y + 0.1, z);
    ring.rotation.x = Math.PI / 2;
    this.scene.add(ring);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), nm);
    core.position.set(x, y + 0.8, z);
    this.scene.add(core);
    this._spinRings.push({ mesh: core, speed: 1.4 });
  }

  // Grav-lift: a translucent energy column that launches the player upward.
  _gravLift(x, z, topY, power) {
    const color = 0x37c4d4;
    const nm = this._neonMat(color);
    const metal = new THREE.MeshStandardMaterial({ color: 0x07101c, roughness: 0.3, metalness: 0.85 });

    // base ring pad
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, 0.18, 20), metal);
    pad.position.set(x, 0.09, z);
    pad.receiveShadow = true;
    this.scene.add(pad);
    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.1, 8, 28), nm);
    baseRing.position.set(x, 0.2, z);
    baseRing.rotation.x = Math.PI / 2;
    this.scene.add(baseRing);

    // translucent updraft column
    const colMat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.8,
      transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false,
    });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, topY, 20, 1, true), colMat);
    col.position.set(x, topY / 2, z);
    this.scene.add(col);

    // floating accelerator rings up the column (spin for energy feel)
    for (let i = 1; i <= 4; i++) {
      const ry = (topY / 5) * i;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 6, 24), nm);
      ring.position.set(x, ry, z);
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
      this._spinRings.push({ mesh: ring, speed: 0.8 + i * 0.3 });
    }
    this._accentLight(this.scene, color, 3, 16, x, 2.5, z);

    this.gravLifts.push({ x, z, r: 1.9, topY, power });
  }

  // A linked pair of teleporter pads (A↔B): stepping on one drops you at the other.
  _teleporterPair(ax, az, bx, bz, color) {
    this._teleporter(ax, az, bx, bz, color);
    this._teleporter(bx, bz, ax, az, color);
  }

  _teleporter(x, z, destX, destZ, color) {
    const nm = this._neonMat(color);
    const metal = new THREE.MeshStandardMaterial({ color: 0x09121e, roughness: 0.3, metalness: 0.85 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.2, 0.16, 20), metal);
    pad.position.set(x, 0.08, z);
    pad.receiveShadow = true;
    this.scene.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.12, 8, 28), nm);
    ring.position.set(x, 0.18, z);
    ring.rotation.x = Math.PI / 2;
    this.scene.add(ring);
    // vertical portal hoop
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.14, 10, 32), nm);
    hoop.position.set(x, 1.7, z);
    this.scene.add(hoop);
    this._spinRings.push({ mesh: hoop, speed: 1.0 });
    const portalMat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 1.2,
      transparent: true, opacity: 0.3, side: THREE.DoubleSide,
    });
    const portal = new THREE.Mesh(new THREE.CircleGeometry(1.45, 28), portalMat);
    portal.position.set(x, 1.7, z);
    this.scene.add(portal);
    this._accentLight(this.scene, color, 2.5, 14, x, 1.7, z);
    // Arrive ~3m toward centre from the destination pad so the player lands just
    // OFF the partner's trigger ring — prevents instant teleport ping-pong.
    const dest = new THREE.Vector3(destX, 0, destZ);
    const inward = new THREE.Vector3(-destX, 0, -destZ);
    if (inward.lengthSq() > 0) dest.addScaledVector(inward.normalize(), 3.2);
    this.teleporters.push({ x, z, r: 1.6, dest });
  }

  // ── Player-physics queries ──────────────────────────────────────────────────

  // Highest walkable surface under (x,z) that the player (moving prevY→newY this
  // frame) should stand on. Uses a swept test (no fast-fall tunnelling) plus a
  // small step-up so ramps and low ledges are climbable. Returns 0 for the base
  // ground floor.
  groundHeightAt(x, z, prevY, newY) {
    const STEP_UP = 0.55, GRACE = 0.06;
    let support = 0;
    for (const p of this.platforms) {
      if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
      let top;
      if (p.y0 === p.y1) {
        top = p.y0;
      } else {
        const t = p.axis === 'x'
          ? (x - p.minX) / (p.maxX - p.minX)
          : (z - p.minZ) / (p.maxZ - p.minZ);
        top = p.y0 + (p.y1 - p.y0) * t;
      }
      const crossed = prevY >= top - GRACE && newY <= top + GRACE;        // fell onto/through top
      const stepping = newY <= top + STEP_UP && newY >= top - 0.8;        // walking up onto it
      if ((crossed || stepping) && top > support) support = top;
    }
    return support;
  }

  // If (x,z) is inside a grav-lift column below its top, return the launch
  // velocity to apply this frame, else 0.
  queryGravLift(x, z, y) {
    for (const L of this.gravLifts) {
      const dx = x - L.x, dz = z - L.z;
      if (dx * dx + dz * dz < L.r * L.r && y < L.topY) return L.power;
    }
    return 0;
  }

  // If (x,z) is on a teleporter pad, return its destination (foot position), else null.
  queryTeleport(x, z) {
    for (const T of this.teleporters) {
      const dx = x - T.x, dz = z - T.z;
      if (dx * dx + dz * dz < T.r * T.r) return T.dest;
    }
    return null;
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
