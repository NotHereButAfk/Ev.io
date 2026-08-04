import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { Octree } from 'three/addons/math/Octree.js';
import { GameSettings } from '../core/GameSettings.js';
import { loadEvMap } from './EvMapLoader.js';

const ARENA_HALF = 128;
const TAXI_YELLOW = 0xffcf3d;

const _boxHit = new THREE.Vector3();   // scratch for raycastBoxHit()

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

function makeTechFloorTexture() {
  // Sci-fi battlefield deck: dark alloy plating with panel seams, scorch marks,
  // scattered grit and the odd hazard chevron strip.
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2b2f36';
  ctx.fillRect(0, 0, size, size);
  // large tonal patches so the plating doesn't tile flat
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 40 + Math.random() * 110;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < 0.5;
    g.addColorStop(0, dark ? 'rgba(0,0,0,0.16)' : 'rgba(120,140,160,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // panel seams (offset plate grid)
  ctx.strokeStyle = 'rgba(0,0,0,0.42)';
  ctx.lineWidth = 3;
  const cell = 128;
  for (let y = 0; y < size; y += cell) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    const off = (y / cell) % 2 ? cell / 2 : 0;
    for (let x = off; x < size + cell; x += cell) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + cell); ctx.stroke();
    }
  }
  // seam highlights (top-lit bevel edge)
  ctx.strokeStyle = 'rgba(160,180,200,0.10)';
  ctx.lineWidth = 1;
  for (let y = 2; y < size; y += cell) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke(); }
  // scorch marks — plasma burns on the plating
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 12 + Math.random() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(8,8,10,0.75)');
    g.addColorStop(0.55, 'rgba(20,16,12,0.42)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // grit + spark speckle
  for (let i = 0; i < 1400; i++) {
    const v = 40 + Math.random() * 50;
    ctx.fillStyle = `rgba(${v},${v + 4},${v + 10},0.5)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }
  // one hazard chevron strip per tile for that military-base read
  const hy = Math.floor(Math.random() * 3) * cell + cell - 10;
  for (let x = 0; x < size; x += 24) {
    ctx.fillStyle = (x / 24) % 2 ? 'rgba(255,170,40,0.28)' : 'rgba(10,10,12,0.35)';
    ctx.fillRect(x, hy, 24, 7);
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
  // Bright clear daytime — a real shopping mall floods with daylight through its
  // glass roof. Soft blue zenith falling to a hazy near-white horizon.
  grad.addColorStop(0.00, '#8fc4f0'); // clear blue zenith
  grad.addColorStop(0.45, '#bcdcf5');
  grad.addColorStop(0.75, '#e2eef8'); // pale haze
  grad.addColorStop(1.00, '#f6f9fb'); // near-white horizon
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Illuminated store-sign lightbox: bold retail lettering with a thin border.
function makeStoreSignTexture(name, bg, fg) {
  const w = 512, h = 96;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.globalAlpha = 0.3; g.lineWidth = 3; g.strokeRect(8, 8, w - 16, h - 16); g.globalAlpha = 1;
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 46px Arial, Helvetica, sans-serif';
  g.fillText(name, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

// High-contrast arena wayfinding. The reference galleries use oversized
// environmental lettering as a landmark, so these panels favour short,
// readable callouts over ad-like decoration.
function makeArenaSignTexture(kicker, label, accent = '#28d4ff') {
  const w = 768, h = 224;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#11161c';
  g.fillRect(0, 0, w, h);

  g.fillStyle = accent;
  g.fillRect(0, 0, 20, h);
  g.fillRect(42, 28, 112, 8);
  g.fillRect(w - 120, h - 38, 82, 8);

  g.strokeStyle = '#60717b';
  g.lineWidth = 5;
  g.strokeRect(10, 10, w - 20, h - 20);
  g.strokeStyle = accent;
  g.lineWidth = 2;
  g.strokeRect(28, 28, w - 56, h - 56);

  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = '#a7b8c1';
  g.font = '700 34px Arial, Helvetica, sans-serif';
  g.fillText(kicker.toUpperCase(), 58, 67);
  g.fillStyle = '#f2f6f7';
  g.font = '900 82px Arial, Helvetica, sans-serif';
  g.fillText(label.toUpperCase(), 55, 142);

  g.fillStyle = accent;
  g.beginPath();
  g.moveTo(w - 96, 70);
  g.lineTo(w - 48, 112);
  g.lineTo(w - 96, 154);
  g.lineTo(w - 80, 112);
  g.closePath();
  g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Vertical promo banner / board: stacked lines of big lettering.
function makeBannerTexture(lines, bg, fg) {
  const w = 256, h = 384;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.globalAlpha = 0.35; g.lineWidth = 5; g.strokeRect(10, 10, w - 20, h - 20); g.globalAlpha = 1;
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 58px Arial, Helvetica, sans-serif';
  lines.forEach((ln, i) => g.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 74));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

// Sci-fi bunker wall: alloy panel plating with seam lines, vents, and a loose
// grid of glowing light-slit windows (cyan, with the odd warning-orange one).
// One texture per palette colour, shared by every building of that colour.
function makeBuildingWallTexture(baseCss, darkCss) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = baseCss;
  g.fillRect(0, 0, S, S);
  // weathering: subtle vertical streaks + tonal patches
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * S, w = 4 + Math.random() * 18;
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + Math.random() * 0.05})`;
    g.fillRect(x, 0, w, S);
  }
  // alloy panel seams: storey bands + vertical joints
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = 84; y < S; y += 84) g.fillRect(0, y, S, 3);
  for (let x = 64; x < S; x += 64) g.fillRect(x, 0, 2, S);
  // rivet dots along the storey bands
  g.fillStyle = 'rgba(0,0,0,0.4)';
  for (let y = 84; y < S; y += 84)
    for (let x = 10; x < S; x += 32) { g.beginPath(); g.arc(x, y + 1.5, 1.6, 0, Math.PI * 2); g.fill(); }
  // light-slit windows: 4 cols x 3 rows, some skipped, glowing cool or warning-orange
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 4; col++) {
      if (Math.random() < 0.28) continue;               // skip some — irregular look
      const x = 18 + col * 60, y = 26 + r * 84;
      const warn = Math.random() < 0.14;
      g.fillStyle = darkCss;                            // recessed frame
      g.fillRect(x, y, 34, 26);
      g.fillStyle = warn ? 'rgba(255,150,50,0.95)' : 'rgba(80,220,255,0.85)';
      g.fillRect(x + 3, y + 9, 28, 8);                  // glowing horizontal slit
      g.fillStyle = warn ? 'rgba(255,150,50,0.35)' : 'rgba(80,220,255,0.3)';
      g.fillRect(x + 3, y + 3, 28, 4);                  // dimmer upper vent line
      g.fillRect(x + 3, y + 19, 28, 4);                 // dimmer lower vent line
    }
  }
  // intake vent near the base row
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (let i = 0; i < 5; i++) g.fillRect(96, 232 + i * 4, 64, 2);
  const tex = new THREE.CanvasTexture(c);
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


// ═══════════════════════════════════════════════════════════════════════════
// Map rotation
// ───────────────────────────────────────────────────────────────────────────
// The world used to build exactly one arena in its constructor and keep it for
// the life of the page. Rotating maps between matches means the arena has to be
// swappable, and the awkward part is not building the new one — it is throwing
// the old one away without taking the rest of the scene with it.
//
// So every map builds into its own root Group rather than straight into the
// scene. Switching is then: detach that root, dispose what it owns, build the
// next one. Everything Game.js puts in the scene — the player camera, bots,
// pickups, the third-person body — hangs off the scene itself and never moves.
//
// The builders all call `this.scene.add(...)` in a few hundred places. Rather
// than rewrite those, `loadMap` points `this.scene` at the map root for the
// duration of the build and puts it back afterwards. A Group takes .add() and
// .traverse() exactly like a Scene does, so nothing else notices; the two
// things that only a Scene has, `background` and `fog`, are set from the map's
// own entry instead.
export const MAPS = [
  {
    // The official ev.io Daytime Rook (node 755), decoded from its native
    // binary. This is the ONLY asynchronous entry, which is why loadMap is a
    // promise: a map that has to fetch and parse 5.7MB cannot pretend to be
    // ready on the same tick as one that is built from primitives, and having
    // the fast maps fake it would just move the stutter somewhere less honest.
    id: 'rook',
    name: 'Daytime Rook',
    region: 'Official',
    background: 0xcfe9ef,
    fog: [0xc8d7dc, 145, 360],
    async build(w) {
      w._buildLighting({
        sky: 0xf4fbff, ground: 0x41464d, hemi: 1.45,
        sunColor: 0xfff4df, sun: 1.58, sunAt: [-82, 118, 66],
        rimColor: 0x8fd7ff, rim: 0.28, rimAt: [72, 42, -64],
      });
      w.spawnPoints.push(new THREE.Vector3(0, 3, 0));
      w.previewPedestalPos.set(0, 3, 0);
      await w._loadOfficialRook();
    },
  },
  {
    id: 'winter-graveyard',
    name: 'Winter-Graveyard',
    region: 'Arctic Sector',
    background: 0xdba5b6,
    fog: [0xd8c4cd, 105, 260],
    build(w) {
      w._buildLighting();
      w._buildGround({ color: 0xeee5ec, roughness: 1, metalness: 0, seams: false });
      w._buildSky();
      w._buildWinterGraveyard();
      w._buildSpawnPoints();
      w.previewPedestalPos.set(0, 0, 52);
    },
  },
  {
    id: 'evio-arena',
    name: 'Sunken Colonnade',
    region: 'Stonework Sector',
    background: 0x9fb2c8,
    fog: [0xb6c3d4, 110, 300],
    build(w) {
      w._buildLighting({
        sky: 0xdce6f2, ground: 0x6b6257, hemi: 1.5,
        sunColor: 0xfff2d8, sun: 1.7, sunAt: [64, 96, 58],
        rimColor: 0x9fc2e8, rim: 0.5, rimAt: [-70, 40, -60],
      });
      w._buildGround({ color: 0xc9c2ba, roughness: 0.9, metalness: 0.03, seams: false });
      w._buildEvioArena();
      w.previewPedestalPos.set(0, 0, 34);
    },
  },
  {
    id: 'legacy-arena',
    name: 'Nightfall Complex',
    region: 'Deep Orbit',
    background: 0x0b0e14,
    fog: [0x10141c, 90, 260],
    build(w) {
      // Cool and much brighter than the snow map's rig: this arena's own
      // materials are near-black, so the light has to carry the read.
      w._buildLighting({
        sky: 0x9fc4e8, ground: 0x1a2030, hemi: 2.1,
        sunColor: 0xdCE8ff, sun: 2.0, sunAt: [58, 90, -70],
        rimColor: 0x35d6ff, rim: 1.0, rimAt: [-70, 34, 62],
      });
      w._buildGround({ color: 0x2a2f38, roughness: 0.7, metalness: 0.25, seams: false });
      w._buildLegacyEvioArena();
      w.previewPedestalPos.set(0, 0, 30);
    },
  },
];

export function mapById(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}

/** The map after `id` in the rotation — wraps at the end. */
export function nextMapId(id) {
  const i = MAPS.findIndex((m) => m.id === id);
  return MAPS[(i + 1 + MAPS.length) % MAPS.length].id;
}

export class World {
  constructor(mapId = MAPS[0].id) {
    this.scene = new THREE.Scene();

    this.arenaHalf = ARENA_HALF;
    this.colliders = []; // { box, mesh }
    this.spawnPoints = [];
    this.weaponSpawnPoints = [];
    this.usesMeshCollision = true;
    this._mapOctree = null;
    this._mapBounds = null;
    this._groundRay = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    this._playerCapsule = new Capsule(
      new THREE.Vector3(),
      new THREE.Vector3(),
      0.45,
    );

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

    // The arena is chosen by the rotation, not fixed here — see MAPS.
    this.previewPedestalPos = new THREE.Vector3(0, 3, 0);


    // Geometry and materials created ONCE in this constructor and reused by
    // every map. loadMap() disposes what a map owns; these must survive it, so
    // they are tagged here rather than recognised by guesswork later — the
    // failure mode is a second match rendering untextured because the first
    // match's teardown freed a shared material out from under it.
    this._sharedDisposables = new Set([
      ...Object.values(this._geo), ...Object.values(this._mats),
    ]);

    this.mapId = null;
    this._mapRoot = null;
    this.ready = this.loadMap(mapId);
  }

  // ── Map rotation ────────────────────────────────────────────────────────────

  /**
   * Swap the arena. Safe to call between matches; leaves everything Game.js
   * owns in the scene untouched.
   *
   * ASYNC because one map in the rotation decodes an official binary. The
   * procedural ones still finish on the same tick — awaiting a promise that is
   * already resolved costs a microtask, not a frame.
   */
  async loadMap(id) {
    const def = mapById(id);
    this._disposeMap();

    // Per-map state. All of it is REBUILT rather than appended to — a stale
    // collider from the previous arena is an invisible wall in the new one, and
    // a stale spawn point drops you inside its geometry.
    this.colliders = [];
    this.platforms = [];
    this.spawnPoints = [];
    this.gravLifts = [];
    this.teleporters = [];
    this._airVehicles = [];
    this._pulseMats = [];
    this._spinRings = [];
    this._raycastMeshes = null;      // cached getter — must not outlive the map
    this._signPlaced = false;
    // From the official-map path: an octree and mesh collision belong to the
    // map that built them, and a stale one collides against geometry that is
    // no longer on screen.
    this.weaponSpawnPoints = [];
    this._mapOctree = null;
    this._evMapRoot = null;
    this._evMapColliderRoot = null;
    this.arenaHalf = ARENA_HALF;

    const root = new THREE.Group();
    root.name = 'map:' + def.id;

    // Point `scene` at the map root for the build (see the note above MAPS).
    // The scene swap has to be restored BEFORE any await inside a builder
    // hands control back, or anything Game.js adds while the map is loading
    // lands inside the map root and is destroyed by the next rotation. So the
    // async builders get the root passed in explicitly and the swap only wraps
    // the synchronous part.
    const scene = this.scene;
    this.scene = root;
    let building;
    try {
      building = def.build(this);
    } finally {
      this.scene = scene;
    }
    if (building && typeof building.then === 'function') {
      // Re-point for the remainder of the async build, then restore again.
      const prev = this.scene;
      this.scene = root;
      try { await building; } finally { this.scene = prev; }
    }
    scene.add(root);
    this._mapRoot = root;

    scene.background = new THREE.Color(def.background);
    scene.fog = new THREE.Fog(def.fog[0], def.fog[1], def.fog[2]);

    // A map that ships no spawn list gets one derived from its own colliders,
    // so adding an arena to the rotation does not also mean hand-placing
    // sixteen safe starts in it.
    this._validateSpawnPoints();

    // Lock world matrices on the static meshes so Three.js skips recomputing
    // them every frame; re-enable the ones we animate.
    root.traverse((obj) => {
      if (obj.isMesh && obj.matrixAutoUpdate) {
        obj.matrixAutoUpdate = false;
        obj.updateMatrix();
      }
    });
    for (const r of this._spinRings) r.mesh.matrixAutoUpdate = true;

    this.mapId = def.id;
    this.mapDef = def;
    return def;
  }

  _disposeMap() {
    const root = this._mapRoot;
    if (!root) return;
    root.parent?.remove(root);
    const seen = new Set();
    root.traverse((o) => {
      if (!o.isMesh && !o.isLine && !o.isPoints) return;
      if (o.geometry && !this._sharedDisposables.has(o.geometry) && !seen.has(o.geometry)) {
        seen.add(o.geometry);
        o.geometry.dispose();
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        // Material.dispose() does NOT free its textures, which is what makes
        // this safe: the facade/brick/billboard atlases are shared across maps
        // and are freed only when the World itself goes.
        if (m && !this._sharedDisposables.has(m) && !seen.has(m)) {
          seen.add(m);
          m.dispose();
        }
      }
    });
    this._mapRoot = null;
  }

  /**
   * Keep only the spawn points you can actually stand in, and derive more if
   * that leaves too few.
   *
   * A hand-authored list is not self-evidently valid: it is authored against
   * the arena as it was, and anything that later changes the geometry — a
   * different ground pass, a moved wall — buries some of it without a word.
   * Cheaper to check every load than to find out by spawning inside a cliff.
   */
  _validateSpawnPoints(want = 12) {
    const box = new THREE.Box3();
    const clear = (p) => {
      box.min.set(p.x - 0.45, p.y + 0.15, p.z - 0.45);
      box.max.set(p.x + 0.45, p.y + 1.7, p.z + 0.45);
      return !this.colliders.some((c) => c.box && c.box.intersectsBox(box));
    };
    const kept = this.spawnPoints.filter(clear);
    if (kept.length >= want) { this.spawnPoints = kept; return; }
    const authored = kept.slice();
    this._deriveSpawnPoints(want - authored.length);
    this.spawnPoints = authored.concat(this.spawnPoints.filter(clear));
    if (!this.spawnPoints.length) this.spawnPoints = [new THREE.Vector3(0, 0, 0)];
  }

  /**
   * Grid-sample the arena floor and keep the points that are clear of every
   * collider. Cheap, and it means a new map in the rotation needs geometry and
   * nothing else.
   */
  _deriveSpawnPoints(want = 16) {
    const half = this.arenaHalf - 8;
    const step = Math.max(6, (half * 2) / 12);
    const CLEAR = 1.2;                 // player half-width plus a margin
    const box = new THREE.Box3();
    const cand = [];
    for (let x = -half; x <= half; x += step) {
      for (let z = -half; z <= half; z += step) {
        box.min.set(x - CLEAR, 0.1, z - CLEAR);
        box.max.set(x + CLEAR, 2.4, z + CLEAR);
        let blocked = false;
        for (const c of this.colliders) {
          if (c.box && c.box.intersectsBox(box)) { blocked = true; break; }
        }
        if (!blocked) cand.push(new THREE.Vector3(x, 0, z));
      }
    }
    // Spread them out rather than taking the first N, which would cluster every
    // start in one corner of the grid.
    cand.sort(() => Math.random() - 0.5);
    const picked = [];
    for (const p of cand) {
      if (picked.length >= want) break;
      if (picked.every((q) => q.distanceTo(p) > step * 0.9)) picked.push(p);
    }
    this.spawnPoints = picked.length ? picked
      : [new THREE.Vector3(0, 0, 0)];   // last resort: never leave it empty
  }


  async _loadOfficialRook() {
    const map = await loadEvMap('/maps/RookLit_0.evmap');
    this.scene.add(map.root);
    this._evMapRoot = map.root;
    this._evMapColliderRoot = map.colliderRoot;
    this._raycastMeshes = map.raycastMeshes;
    this._mapOctree = new Octree().fromGraphNode(map.colliderRoot);
    this._mapBounds = map.bounds;

    if (map.spawnPoints.length) this.spawnPoints = map.spawnPoints;
    this.weaponSpawnPoints = map.weaponSpawnPoints;
    const maxXZ = Math.max(
      Math.abs(map.bounds.min.x),
      Math.abs(map.bounds.max.x),
      Math.abs(map.bounds.min.z),
      Math.abs(map.bounds.max.z),
    );
    this.arenaHalf = Math.ceil(maxXZ + 4);

    const previewSpawn = this.spawnPoints.find((p) => p.y <= 3.1) ?? this.spawnPoints[0];
    this.previewPedestalPos.copy(previewSpawn);

    map.root.traverse((object) => {
      if (object.isMesh && object.matrixAutoUpdate) {
        object.matrixAutoUpdate = false;
        object.updateMatrix();
      }
    });

    return map;
  }

  /**
   * Lighting belongs to the MAP, not to the world.
   *
   * Every arena shared one rig because there was only ever one arena. Rotation
   * broke that immediately: the orbital complex is built from near-black
   * concrete and reads by its neon, and lit like a snowfield at dawn it came
   * out as a black rectangle you could not play in.
   */
  _buildLighting(o = {}) {
    const hemi = new THREE.HemisphereLight(
      o.sky ?? 0xffdfd1, o.ground ?? 0x554956, o.hemi ?? 1.32);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(o.sunColor ?? 0xffd7aa, o.sun ?? 1.45);
    sun.position.set(...(o.sunAt ?? [72, 86, -95]));
    sun.castShadow = false;
    this.scene.add(sun);
    const skyRim = new THREE.DirectionalLight(o.rimColor ?? 0xc99ad5, o.rim ?? 0.38);
    skyRim.position.set(...(o.rimAt ?? [-75, 46, 54]));
    skyRim.castShadow = false;
    this.scene.add(skyRim);
  }

  /**
   * @param {object} o  { color, seams } — the deck seams are Rook's panel
   *   language and belong to Rook. Left on under a snowfield they draw a grid
   *   across the graveyard.
   */
  _buildGround(o = {}) {
    const floor = new THREE.MeshStandardMaterial({
      color: o.color ?? 0xaeb4b8, roughness: o.roughness ?? 0.82,
      metalness: o.metalness ?? 0.12, envMapIntensity: 0.42,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2), floor);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
    this.scene.add(ground);

    if (o.seams === false) return;
    // Rook's floor is made from broad square panels with restrained bevel lines.
    const seam = new THREE.MeshBasicMaterial({ color: 0x727a82, transparent: true, opacity: 0.42 });
    for (let p = -54; p <= 54; p += 12) {
      const sx = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 120), seam);
      sx.rotation.x = -Math.PI / 2;
      sx.position.set(p, 0.026, 0);
      this.scene.add(sx);
      const sz = new THREE.Mesh(new THREE.PlaneGeometry(120, 0.09), seam);
      sz.rotation.x = -Math.PI / 2;
      sz.position.set(0, 0.027, p);
      this.scene.add(sz);
    }
  }

  _buildSky() {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#69bfe3');
    grad.addColorStop(0.42, '#a7ddeb');
    grad.addColorStop(0.76, '#dff4f4');
    grad.addColorStop(1, '#fffdf5');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 512);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(420, 32, 16),
      new THREE.MeshBasicMaterial({
        map: texture, side: THREE.BackSide, fog: false, depthWrite: false,
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
    // Battlefield theme: glowing energy trim is back. One cached emissive
    // material per colour — bloom carries the glow, no point lights needed.
    let m = this._neonMats.get(c);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: 0x0a0d12, emissive: c, emissiveIntensity: 1.6,
        roughness: 0.4, metalness: 0.2,
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
    // The mall's outer shell — pale painted-plaster walls with a warm skirting and
    // a light steel cornice up top. Mostly hidden behind the storefronts; reads as
    // clean bright retail architecture, not a sci-fi bunker.
    const half = ARENA_HALF;
    const H = 26, T = 2.5;
    const wallMat  = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.85, metalness: 0.0 });  // warm plaster
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0xb9b0a0, roughness: 0.7,  metalness: 0.15 }); // stone skirting
    const corniceMat = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.55, metalness: 0.1 }); // light cornice

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
      // stone skirting at the base
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.15, 1.6, s.d + 0.15), skirtMat);
      skirt.position.set(s.x, 0.8, s.z);
      this.scene.add(skirt);
      // light cornice near the top
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.3, 0.7, s.d + 0.3), corniceMat);
      cornice.position.set(s.x, H - 1.5, s.z);
      this.scene.add(cornice);
    }
  }

  // The signature feature: a vaulted GLASS SKYLIGHT ROOF over the atrium on a
  // white steel frame, flooding the concourse with daylight (like the reference
  // mall). A barrel vault whose axis runs along X; the arch curves across Z.
  // Built by explicit arc sampling — robust, no fiddly cylinder-theta guessing.
  // Purely decorative: no colliders (players never reach it).
  _buildGlassRoof() {
    const span   = ARENA_HALF - 2;   // arch reaches ±span across Z, roof runs ±span along X
    const baseY  = 16;               // springing line height (above the shopfronts)
    const arcHalf = 0.85;            // half-angle of the arch (~49°) → a tall airy vault
    const R  = span / Math.sin(arcHalf);         // circle radius so springing lands at ±span
    const cy = baseY - R * Math.cos(arcHalf);    // circle centre Y (below the floor)
    const ridgeY = cy + R;                        // height of the ridge

    // Bright translucent glass — emissive so it reads as glowing daylight.
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xdff0ff, roughness: 0.08, metalness: 0.0,
      transmission: 0.5, thickness: 0.6, transparent: true, opacity: 0.42,
      emissive: 0xeef7ff, emissiveIntensity: 0.6, side: THREE.DoubleSide, depthWrite: false,
    });
    const steel   = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.45, metalness: 0.55 });
    // dark clerestory band with track spotlights, like the reference mall
    const fasciaM = new THREE.MeshStandardMaterial({ color: 0x3f3833, roughness: 0.6, metalness: 0.2 });
    const spotM   = new THREE.MeshStandardMaterial({ color: 0xfff2da, emissive: 0xffe2ae, emissiveIntensity: 1.6, roughness: 0.4 });
    const roof = new THREE.Group();
    const roofLen = span * 2;   // extent along X

    // Arc point at angle a (measured from straight up): across Z / up Y.
    const arcZ = (a) => R * Math.sin(a);
    const arcY = (a) => cy + R * Math.cos(a);

    // ── Glass shell: flat panel strips following the arch ──
    const segs = 20;
    const dz = R * (2 * arcHalf / segs) * 1.06;   // panel depth (slight overlap)
    for (let i = 0; i < segs; i++) {
      const a = -arcHalf + (i + 0.5) / segs * 2 * arcHalf;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(roofLen, 0.1, dz), glass);
      panel.position.set(0, arcY(a), arcZ(a));
      panel.rotation.x = a;                        // tilt to lie tangent to the arch
      roof.add(panel);
    }

    // ── Transverse steel arch ribs (every ~8 units along X) ──
    // Build each rib in the XY plane as a partial torus, then a parent group turns
    // it into the ZY plane so the arch spans Z.
    for (let x = -span; x <= span + 0.01; x += 8) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(R, 0.22, 6, 40, arcHalf * 2), steel);
      rib.rotation.z = Math.PI / 2 - arcHalf;      // centre the arc segment on straight-up
      const g = new THREE.Group();
      g.add(rib);
      g.position.set(x, cy, 0);
      g.rotation.y = Math.PI / 2;                  // XY arch → ZY arch (spans Z)
      roof.add(g);
    }

    // ── Longitudinal purlins running the length of the roof at several heights ──
    for (const frac of [-0.82, -0.5, -0.2, 0.2, 0.5, 0.82]) {
      const a = frac * arcHalf;
      const purlin = new THREE.Mesh(new THREE.BoxGeometry(roofLen, 0.14, 0.14), steel);
      purlin.position.set(0, arcY(a) + 0.12, arcZ(a));
      purlin.rotation.x = a;
      roof.add(purlin);
    }
    // ridge beam
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(roofLen, 0.28, 0.28), steel);
    ridge.position.set(0, ridgeY + 0.1, 0);
    roof.add(ridge);

    // ── End gables: glass tympanum closing the vault at ±X ──
    for (const sx of [-1, 1]) {
      for (let i = 0; i < segs; i++) {
        const a = -arcHalf + (i + 0.5) / segs * 2 * arcHalf;
        const h = arcY(a) - baseY;                 // fill from springing up to the arch
        if (h <= 0) continue;
        const fill = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, dz * 0.98), glass);
        fill.position.set(sx * span, baseY + h / 2, arcZ(a));
        roof.add(fill);
      }
    }

    // ── Clerestory fascia band where the vault meets the walls ──
    for (const sz of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(roofLen + 3, 1.8, 1.6), fasciaM);
      f.position.set(0, baseY - 0.6, sz * span);
      roof.add(f);
    }
    for (const sx of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, roofLen + 3), fasciaM);
      f.position.set(sx * span, baseY - 0.6, 0);
      roof.add(f);
    }
    // rows of warm track spotlights along the underside of the fascia
    for (const sz of [-1, 1]) for (let x = -span + 4; x <= span - 4; x += 8) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), spotM);
      d.position.set(x, baseY - 1.15, sz * (span - 0.9)); roof.add(d);
    }
    for (const sx of [-1, 1]) for (let z = -span + 4; z <= span - 4; z += 8) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), spotM);
      d.position.set(sx * (span - 0.9), baseY - 1.15, z); roof.add(d);
    }

    this.scene.add(roof);
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

  // ═════════════════════════════════════════════════════════════════════════
  // SHOPPING MALL — a bright, daylit two-level retail gallery (modelled on a real
  // mall). Warm-lit glass storefronts with red accents + mannequin displays ring
  // the space; a walkable mezzanine with clear glass railings runs in front of the
  // upper shops (reached by escalators + glass elevators) around a central
  // light-well. A tiered stone fountain, leafy ficus trees and retail kiosks are
  // the cover. Daylight pours in through the vaulted glass roof (_buildGlassRoof).
  // ═════════════════════════════════════════════════════════════════════════
  // Recreated from the observed ev.io match: four black bastions connected by
  // high bridge lanes, a lower command deck, long exposed ramps, red navigation
  // bands and cyan wall modules. Route geometry is registered in platforms[] so
  // the same surfaces are walkable by both the legacy controller and MoveSim.
  _buildLegacyEvioArena() {
    const concrete = new THREE.MeshStandardMaterial({
      color: 0x20242b, roughness: 0.8, metalness: 0.2, envMapIntensity: 0.45,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x0d1015, roughness: 0.72, metalness: 0.42, envMapIntensity: 0.35,
    });
    const deck = new THREE.MeshStandardMaterial({
      color: 0x2d323a, roughness: 0.68, metalness: 0.36, envMapIntensity: 0.5,
    });
    const inset = new THREE.MeshStandardMaterial({
      color: 0x080b10, roughness: 0.5, metalness: 0.62,
    });
    const red = this._neonMat(0xff3b24);
    const cyan = this._neonMat(0x20cfff);
    const amber = this._neonMat(0xffa12c);

    const solid = (x, y, z, w, h, d, mat = concrete) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this._addCollider(mesh);
      return mesh;
    };
    const decor = (x, y, z, w, h, d, mat = dark, ry = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    };
    const strip = (x, y, z, w, h, d, mat = red, ry = 0) => {
      const mesh = decor(x, y, z, w, h, d, mat, ry);
      mesh.userData.noHit = true;
      return mesh;
    };

    // Arena shell: massive dark walls with layered battlements and hot red bands.
    const wallH = 27, wallT = 2.4, half = ARENA_HALF;
    solid(0, wallH / 2, -half, half * 2 + wallT * 2, wallH, wallT, dark);
    solid(0, wallH / 2,  half, half * 2 + wallT * 2, wallH, wallT, dark);
    solid(-half, wallH / 2, 0, wallT, wallH, half * 2 + wallT * 2, dark);
    solid( half, wallH / 2, 0, wallT, wallH, half * 2 + wallT * 2, dark);
    strip(0, 4.2, -half + 1.26, half * 2, 0.24, 0.08);
    strip(0, 4.2,  half - 1.26, half * 2, 0.24, 0.08);
    strip(-half + 1.26, 4.2, 0, 0.08, 0.24, half * 2);
    strip( half - 1.26, 4.2, 0, 0.08, 0.24, half * 2);

    // Wall buttresses make the perimeter read as a city-sized machine.
    for (let p = -52; p <= 52; p += 13) {
      decor(p, 10, -half + 2.1, 3.4, 20, 2.4, concrete);
      decor(p, 10,  half - 2.1, 3.4, 20, 2.4, concrete);
      decor(-half + 2.1, 10, p, 2.4, 20, 3.4, concrete);
      decor( half - 2.1, 10, p, 2.4, 20, 3.4, concrete);
    }

    // Navigation lines mirror the strong red lanes visible on every ramp/roof.
    for (const x of [-7.2, 7.2]) strip(x, 0.045, 0, 0.16, 0.06, 112);
    for (const z of [-30, 30]) strip(0, 0.05, z, 112, 0.07, 0.2);
    for (const x of [-30, 30]) strip(x, 0.05, 0, 0.2, 0.07, 112);
    // Short white/cyan landing ticks break up the long sight lines.
    for (let z = -48; z <= 48; z += 12) {
      strip(-6.5, 0.052, z, 1.2, 0.065, 0.14, cyan);
      strip( 6.5, 0.052, z, 1.2, 0.065, 0.14, cyan);
    }

    const addPanelBank = (x, z, faceX) => {
      const px = x + faceX * 9.08;
      for (const oz of [-6, -2, 2, 6]) {
        strip(px, 4.7, z + oz, 0.1, 4.7, 1.15, cyan);
        decor(px - faceX * 0.08, 4.7, z + oz, 0.16, 5.2, 1.65, inset);
      }
      strip(px + faceX * 0.03, 7.55, z, 0.12, 0.28, 15.8, red);
    };

    const bastion = (x, z) => {
      // Accessible lower roof at y=9; the narrow upper core leaves a fighting ring.
      solid(x, 4.45, z, 20, 8.9, 22, concrete);
      this._platformBox(x, z, 20, 22, 9, deck, 0xff3b24);
      solid(x, 16.5, z, 9.5, 15, 11, dark);
      decor(x, 24.8, z, 12.5, 1.4, 14, concrete);
      decor(x, 27.5, z, 5.5, 6.8, 6.5, dark);
      // Slab collars and fins create the stepped silhouette seen across the map.
      decor(x, 11.0, z, 15.5, 1.1, 16, inset);
      decor(x, 21.0, z, 12.2, 0.9, 13.5, concrete);
      for (const side of [-1, 1]) {
        decor(x + side * 7.8, 14.5, z, 1.1, 13, 15, concrete);
        strip(x + side * 8.36, 14.5, z, 0.12, 9.5, 8.5, red);
      }
      addPanelBank(x, z, x < 0 ? 1 : -1);
      // Roof-edge pickups read as the bright floating nodes from the capture.
      this._spawnPadMarker(x, z + (z < 0 ? 6.5 : -6.5), 9, 0xff8a2c);
    };

    bastion(-32, -30);
    bastion( 32, -30);
    bastion(-32,  30);
    bastion( 32,  30);

    // Twin high bridges are the dominant roof route. Their ends meet the four
    // bastion roofs exactly; outer ramps provide a risky but fast climb.
    this._platformBox(0, -30, 44, 6, 9, deck, 0xff3b24);
    this._platformBox(0,  30, 44, 6, 9, deck, 0xff3b24);
    for (const z of [-30, 30]) {
      this._rampBox(-52, -42, z - 3, z + 3, 0, 9, 'x', deck, 0xff3b24);
      this._rampBox( 42,  52, z - 3, z + 3, 9, 0, 'x', deck, 0xff3b24);
    }

    // Central command deck: four short approaches plus two long spine ramps that
    // climb into the north/south bridge lanes.
    this._platformBox(0, 0, 18, 18, 5.5, deck, 0xff3b24);
    this._rampBox(-19, -9, -3, 3, 0, 5.5, 'x', deck, 0xff3b24);
    this._rampBox(  9, 19, -3, 3, 5.5, 0, 'x', deck, 0xff3b24);
    this._rampBox(-3, 3, -19, -9, 0, 5.5, 'z', deck, 0xff3b24);
    this._rampBox(-3, 3,   9, 19, 5.5, 0, 'z', deck, 0xff3b24);
    this._rampBox(-3, 3, -30, -9, 9, 5.5, 'z', deck, 0xff3b24);
    this._rampBox(-3, 3,   9, 30, 5.5, 9, 'z', deck, 0xff3b24);

    // The centre is cover, not a dead flat tabletop.
    solid(0, 8.5, 0, 5.2, 6, 5.2, inset);
    for (const a of [0, Math.PI / 2]) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.13, 8, 28), cyan);
      halo.position.set(0, 10.8, 0);
      halo.rotation.set(a === 0 ? Math.PI / 2 : 0, a, 0);
      halo.userData.noHit = true;
      this.scene.add(halo);
      this._spinRings.push({ mesh: halo, speed: a === 0 ? 0.28 : -0.22 });
    }

    // Ground-level cover clusters produce the short-range corner fights seen in
    // the recording without sealing the broad rifle lanes.
    const cover = [
      [-18, -15, 5, 3.2, 7], [18, -15, 5, 3.2, 7],
      [-18,  15, 5, 3.2, 7], [18,  15, 5, 3.2, 7],
      [-47,   0, 7, 4.5, 4], [47,   0, 7, 4.5, 4],
      [-12, -46, 4, 3.5, 7], [12, -46, 4, 3.5, 7],
      [-12,  46, 4, 3.5, 7], [12,  46, 4, 3.5, 7],
    ];
    for (const [x, z, w, h, d] of cover) {
      solid(x, h / 2, z, w, h, d, concrete);
      strip(x, h + 0.035, z, w + 0.12, 0.08, d + 0.12, x === 0 ? cyan : red);
    }

    // Corner skyline anchors and glowing server-bank faces frame the open sky.
    for (const [x, z] of [[-53,-52],[53,-52],[-53,52],[53,52]]) {
      solid(x, 11, z, 10, 22, 10, dark);
      decor(x, 23.5, z, 13, 3, 13, concrete);
      for (let i = -1; i <= 1; i++) {
        const towardX = -Math.sign(x);
        strip(x + towardX * 5.06, 9 + i * 4.2, z, 0.1, 1.7, 6.2, cyan);
      }
      strip(x, 25.1, z, 8, 0.22, 8, amber);
    }

    // Vertical shortcuts echo ev.io's ability-driven movement without forcing
    // them: grav lifts land on the two bridge routes, while ramps remain primary.
    const lift = (x, z) => {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.35, 0.34, 20), inset);
      pad.position.set(x, 0.17, z);
      pad.receiveShadow = true;
      this.scene.add(pad);
      for (const y of [0.38, 3.2, 6.0, 8.75]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.09, 8, 24), cyan);
        ring.position.set(x, y, z);
        ring.rotation.x = Math.PI / 2;
        ring.userData.noHit = true;
        this.scene.add(ring);
      }
      for (const [ox, oz] of [[1.8,0],[-1.8,0],[0,1.8],[0,-1.8]]) {
        decor(x + ox, 4.5, z + oz, 0.18, 8.5, 0.18, concrete);
      }
      this.gravLifts.push({ x, z, r: 1.9, topY: 9, power: 15 });
    };
    lift(0, -42);
    lift(0,  42);
  }

  // Jinx is the layout and material anchor. Rook, Depot, Vestige and Momentum
  // contribute the shared ev.io language: chunky low-poly massing, framed wall
  // modules, luminous route cues, multi-height combat loops and open sky canyons.
  _buildEvioArena() {
    const stone = new THREE.MeshStandardMaterial({
      color: 0x827873, roughness: 0.88, metalness: 0.04, envMapIntensity: 0.5,
    });
    const paleStone = new THREE.MeshStandardMaterial({
      color: 0xa1968f, roughness: 0.86, metalness: 0.03, envMapIntensity: 0.48,
    });
    const warmTrim = new THREE.MeshStandardMaterial({
      color: 0x352c2f, roughness: 0.78, metalness: 0.1, envMapIntensity: 0.42,
    });
    const brick = new THREE.MeshStandardMaterial({
      color: 0x5f3a37, roughness: 0.92, metalness: 0.01,
    });
    const brickDark = new THREE.MeshStandardMaterial({
      color: 0x472f31, roughness: 0.94, metalness: 0.01,
    });
    const tech = new THREE.MeshStandardMaterial({
      color: 0x171a20, roughness: 0.64, metalness: 0.5, envMapIntensity: 0.55,
    });
    const techMid = new THREE.MeshStandardMaterial({
      color: 0x2c3038, roughness: 0.62, metalness: 0.42, envMapIntensity: 0.52,
    });
    const inset = new THREE.MeshStandardMaterial({
      color: 0x090c11, roughness: 0.46, metalness: 0.64,
    });
    const bridgeTop = new THREE.MeshStandardMaterial({
      color: 0x866a65, roughness: 0.8, metalness: 0.08,
    });
    const redChannel = new THREE.MeshStandardMaterial({
      color: 0x741f1b, roughness: 0.8, metalness: 0.12,
      emissive: 0x260504, emissiveIntensity: 0.34,
    });
    const ochre = new THREE.MeshStandardMaterial({
      color: 0xa5652f, roughness: 0.84, metalness: 0.05,
    });
    const red = this._neonMat(0xef3828);
    const cyan = this._neonMat(0x18c7ff);
    const gold = this._neonMat(0xd8c83b);
    const orange = this._neonMat(0xff9b35);

    const solid = (x, y, z, w, h, d, mat = stone) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this._addCollider(mesh);
      return mesh;
    };
    const decor = (x, y, z, w, h, d, mat = warmTrim, ry = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.noHit = true;
      this.scene.add(mesh);
      return mesh;
    };
    const strip = (x, y, z, w, h, d, mat = red, ry = 0) =>
      decor(x, y, z, w, h, d, mat, ry);
    const octagon = (x, y, z, radius, h, mat = stone) => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, h, 8),
        mat
      );
      mesh.position.set(x, y, z);
      mesh.rotation.y = Math.PI / 8;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.noHit = true;
      this.scene.add(mesh);
      return mesh;
    };
    const diamond = (x, y, z, axis = 'z', mat = cyan, size = 0.62) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, 0.11), mat);
      mesh.position.set(x, y, z);
      if (axis === 'x') mesh.rotation.y = Math.PI / 2;
      mesh.rotation.z = Math.PI / 4;
      mesh.userData.noHit = true;
      this.scene.add(mesh);
      return mesh;
    };
    const signTextures = new Map();
    const signPanel = (
      kicker, label, accent, x, y, z, w, h, ry = 0
    ) => {
      const key = `${kicker}|${label}|${accent}`;
      let tex = signTextures.get(key);
      if (!tex) {
        tex = makeArenaSignTexture(kicker, label, accent);
        signTextures.set(key, tex);
      }
      const backing = decor(x, y, z, w + 0.7, h + 0.7, 0.38, tech, ry);
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
      );
      panel.position.set(x, y, z);
      panel.rotation.y = ry;
      panel.translateZ(0.22);
      panel.userData.noHit = true;
      this.scene.add(panel);
      return { backing, panel };
    };

    const ribbedBank = (x, y, z, span, h, axis = 'x', cyanEvery = 4) => {
      const alongX = axis === 'x';
      decor(x, y, z, alongX ? span : 0.28, h, alongX ? 0.28 : span, inset);
      const frontX = alongX ? x : x - Math.sign(x) * 0.18;
      const frontZ = alongX ? z - Math.sign(z) * 0.18 : z;
      const count = Math.max(5, Math.floor(span / 1.35));
      for (let i = 0; i < count; i++) {
        const offset = -span / 2 + (i + 0.5) * span / count;
        decor(
          alongX ? frontX + offset : frontX,
          y,
          alongX ? frontZ : frontZ + offset,
          alongX ? 0.28 : 0.24,
          h * 0.92,
          alongX ? 0.24 : 0.28,
          i % cyanEvery === 1 ? cyan : techMid
        );
      }
    };

    const brickBand = (x, y, z, span, h, axis = 'x') => {
      const alongX = axis === 'x';
      decor(x, y, z, alongX ? span : 0.3, h, alongX ? 0.3 : span, brickDark);
      const frontX = alongX ? x : x - Math.sign(x) * 0.18;
      const frontZ = alongX ? z - Math.sign(z) * 0.18 : z;
      const cols = Math.max(4, Math.floor(span / 2.25));
      const rows = Math.max(2, Math.floor(h / 1.35));
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const along = -span / 2 + (col + 0.5) * span / cols +
            (row % 2 ? span / cols / 2 : 0);
          if (along > span / 2 - 0.2) continue;
          const yy = y - h / 2 + (row + 0.5) * h / rows;
          decor(
            alongX ? frontX + along : frontX,
            yy,
            alongX ? frontZ : frontZ + along,
            alongX ? span / cols - 0.12 : 0.08,
            h / rows - 0.1,
            alongX ? 0.08 : span / cols - 0.12,
            (row + col) % 3 === 0 ? brickDark : brick
          );
        }
      }
    };

    const circuitPanel = (x, y, z, w, h, axis = 'z') => {
      const alongX = axis === 'z';
      decor(x, y, z, alongX ? w : 0.24, h, alongX ? 0.24 : w, techMid);
      const frontX = alongX ? x : x - Math.sign(x) * 0.18;
      const frontZ = alongX ? z - Math.sign(z) * 0.18 : z;
      const edge = w / 2 - 0.52;
      for (const s of [-1, 1]) {
        strip(
          alongX ? frontX + s * edge : frontX,
          y,
          alongX ? frontZ : frontZ + s * edge,
          alongX ? 0.12 : 0.08,
          h * 0.76,
          alongX ? 0.08 : 0.12,
          gold
        );
      }
      strip(
        frontX, y + h * 0.27, frontZ,
        alongX ? w * 0.58 : 0.08, 0.1, alongX ? 0.08 : w * 0.58,
        gold
      );
      strip(
        frontX, y - h * 0.27, frontZ,
        alongX ? w * 0.36 : 0.08, 0.1, alongX ? 0.08 : w * 0.36,
        gold
      );
      for (let i = -2; i <= 2; i++) {
        const along = i * (w * 0.105);
        strip(
          alongX ? frontX + along : frontX,
          y,
          alongX ? frontZ : frontZ + along,
          alongX ? 0.12 : 0.08,
          h * (i === 0 ? 0.62 : 0.42),
          alongX ? 0.08 : 0.12,
          cyan
        );
      }
    };

    // The layered city shell frames blue sky instead of reading as a flat box.
    const half = ARENA_HALF;
    const shell = [
      [0, 7, -half, 126, 14, 2.4],
      [0, 7,  half, 126, 14, 2.4],
      [-half, 7, 0, 2.4, 14, 126],
      [ half, 7, 0, 2.4, 14, 126],
    ];
    for (const [x, y, z, w, h, d] of shell) solid(x, y, z, w, h, d, tech);
    for (let p = -52; p <= 52; p += 13) {
      decor(p, 8, -half + 1.3, 2.8, 16, 1.4, stone);
      decor(p, 8,  half - 1.3, 2.8, 16, 1.4, stone);
      decor(-half + 1.3, 8, p, 1.4, 16, 2.8, stone);
      decor( half - 1.3, 8, p, 1.4, 16, 2.8, stone);
    }
    for (const side of [-1, 1]) {
      strip(0, 2.4, side * (half - 1.22), 118, 0.18, 0.08, red);
      strip(side * (half - 1.22), 2.4, 0, 0.08, 0.18, 118, red);
      strip(0, 12.2, side * (half - 1.22), 112, 0.12, 0.08, gold);
      strip(side * (half - 1.22), 12.2, 0, 0.08, 0.12, 112, gold);
    }

    const tower = (x, z, scale = 1, innerX = -Math.sign(x), innerZ = -Math.sign(z)) => {
      const baseW = 17 * scale;
      const baseD = 18 * scale;
      const roofY = 9.5;

      // Playable black technical base and roof ring.
      solid(x, 4.65, z, baseW, 9.3, baseD, tech);
      this._platformBox(x, z, baseW + 2.2, baseD + 2.2, roofY, warmTrim, 0xef3828);
      decor(x, 10.15, z, baseW + 3.6, 1.3, baseD + 3.6, warmTrim);
      decor(x, 11.0, z, baseW + 1.8, 0.55, baseD + 1.8, paleStone);

      // Ribbed server banks face the combat lanes.
      ribbedBank(
        x + innerX * (baseW / 2 + 0.15), 5.0, z,
        baseD * 0.72, 6.4, 'z', 3
      );
      ribbedBank(
        x, 5.0, z + innerZ * (baseD / 2 + 0.15),
        baseW * 0.7, 6.4, 'x', 4
      );

      // Warm octagonal upper towers, brick infill and layered cornices.
      const radius = 7.1 * scale;
      octagon(x, 16.2, z, radius, 10.4, stone);
      octagon(x, 21.8, z, radius + 0.6, 1.0, warmTrim);
      octagon(x, 23.0, z, radius + 0.25, 1.15, paleStone);
      octagon(x, 27.2, z, radius * 0.82, 7.2, brick);
      octagon(x, 31.0, z, radius * 0.98, 0.9, warmTrim);
      octagon(x, 32.0, z, radius * 0.78, 1.05, paleStone);

      brickBand(
        x, 27.1, z + innerZ * (radius * 0.82 + 0.07),
        radius * 1.05, 4.7, 'x'
      );
      circuitPanel(
        x, 16.2, z + innerZ * (radius + 0.08),
        radius * 1.18, 5.0, 'z'
      );
      circuitPanel(
        x + innerX * (radius + 0.08), 16.2, z,
        radius * 1.18, 5.0, 'x'
      );
      diamond(x, 17.0, z + innerZ * (radius + 0.2), 'z', cyan, 0.7);
      diamond(x + innerX * (radius + 0.2), 17.0, z, 'x', cyan, 0.7);

      solid(x - innerX * 2.4, roofY + 1.5, z, 2.2, 3.0, 5.2, stone);
      strip(
        x + innerX * (baseW / 2 + 1.16), roofY + 0.08, z,
        0.14, 0.12, baseD * 0.72, red
      );
      this._spawnPadMarker(
        x + innerX * 2.6, z + innerZ * 3.2, roofY, 0x18c7ff
      );
    };

    tower(-35, -32, 1.03, 1, 1);
    tower( 35, -32, 0.96, -1, 1);
    tower(-35,  32, 0.96, 1, -1);
    tower( 35,  32, 1.03, -1, -1);

    // Slim skyline towers tighten the side canyons without blocking the floor.
    const skylineTower = (x, z, innerX) => {
      solid(x, 5.3, z, 12, 10.6, 15, tech);
      this._platformBox(x, z, 14, 17, 10.65, techMid, 0xef3828);
      ribbedBank(x + innerX * 6.12, 5.2, z, 10.5, 7.8, 'z', 3);
      octagon(x, 18.0, z, 6.4, 14.0, stone);
      octagon(x, 25.4, z, 7.0, 1.0, warmTrim);
      octagon(x, 28.4, z, 5.4, 5.0, brick);
      octagon(x, 31.3, z, 6.3, 0.8, paleStone);
      circuitPanel(x + innerX * 6.35, 17.4, z, 7.4, 4.2, 'x');
    };
    // Pulling these inward opens two compressed outer service canyons. Their
    // narrowness contrasts the broad central court without sealing a flank.
    skylineTower(-48, 0, 1);
    skylineTower( 48, 0, -1);

    // The western service canyon uses the orange/cyan panel language visible
    // across several ev.io arenas. Frames are visual only; the 6.8 m floor
    // gap between tower and perimeter remains fully traversable.
    for (const z of [-8.2, 0, 8.2]) {
      const frame = decor(-57.4, 5.4, z, 6.7, 0.62, 0.72, ochre);
      frame.rotation.z = (z / 8.2) * 0.035;
    }
    for (const z of [-6.0, -2.0, 2.0, 6.0]) {
      strip(-54.12, 3.9, z, 0.12, 4.8, 0.34, z < 0 ? orange : cyan);
      strip(-60.72, 3.9, z, 0.12, 4.8, 0.34, z < 0 ? cyan : orange);
    }
    signPanel('B-12  //  SIDE ROUTE', 'TRANSIT', '#ff9b35',
      -54.18, 8.0, 0, 6.8, 2.0, -Math.PI / 2);
    signPanel('C-07  //  SIDE ROUTE', 'REACTOR', '#28d4ff',
       54.18, 8.0, 0, 6.8, 2.0, Math.PI / 2);

    // Low central deck and four approaches support jump/slide/teleport movement.
    this._platformBox(0, 0, 20, 18, 5.2, bridgeTop, 0xef3828);
    this._rampBox(-20, -10, -4.5, 4.5, 0, 5.2, 'x', techMid, 0xef3828);
    this._rampBox( 10,  20, -4.5, 4.5, 5.2, 0, 'x', techMid, 0xef3828);
    this._rampBox(-4.5, 4.5, -20, -10, 0, 5.2, 'z', techMid, 0xef3828);
    this._rampBox(-4.5, 4.5,  10,  20, 5.2, 0, 'z', techMid, 0xef3828);
    solid(0, 7.7, 0, 5.4, 5.0, 5.4, stone);
    octagon(0, 10.55, 0, 3.9, 0.42, tech);
    const centreRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.85, 0.14, 8, 28),
      cyan
    );
    centreRing.position.set(0, 10.82, 0);
    centreRing.rotation.x = Math.PI / 2;
    centreRing.userData.noHit = true;
    this.scene.add(centreRing);
    this._spinRings.push({ mesh: centreRing, speed: 0.2 });

    // A compact objective beacon gives the central deck a readable focal prop
    // without becoming waist-high cover or breaking the cross-map sightlines.
    const objectiveCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.82, 0),
      new THREE.MeshStandardMaterial({
        color: 0xc9f7ff, roughness: 0.22, metalness: 0.24,
        emissive: 0x18c7ff, emissiveIntensity: 1.8,
      })
    );
    objectiveCore.position.set(0, 12.55, 0);
    objectiveCore.userData.noHit = true;
    this.scene.add(objectiveCore);
    this._spinRings.push({ mesh: objectiveCore, speed: 0.42 });
    for (const [radius, tube, tilt, speed] of [
      [1.52, 0.09, 0, 0.55],
      [1.24, 0.07, Math.PI / 2, -0.72],
    ]) {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(radius, tube, 8, 28),
        radius > 1.4 ? cyan : gold
      );
      halo.position.set(0, 12.55, 0);
      halo.rotation.x = tilt;
      halo.userData.noHit = true;
      this.scene.add(halo);
      this._spinRings.push({ mesh: halo, speed });
    }
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      const fin = decor(
        Math.cos(angle) * 3.2, 11.9, Math.sin(angle) * 3.2,
        0.38, 2.9, 1.1, i % 2 ? warmTrim : paleStone, -angle
      );
      fin.rotation.z = i % 2 ? -0.22 : 0.22;
    }

    // Broad Jinx bridges use muted-rose tops, dark undersides and flared ends.
    for (const z of [-32, 32]) {
      this._platformBox(0, z, 52, 6.4, 9.5, bridgeTop, 0xef3828);
      decor(0, 8.55, z, 50, 1.15, 5.0, tech);
      decor(-25.7, 9.2, z, 4.2, 1.8, 8.4, warmTrim);
      decor( 25.7, 9.2, z, 4.2, 1.8, 8.4, warmTrim);
      for (let x = -21; x <= 21; x += 7) {
        decor(x, 8.1, z, 0.45, 3.2, 4.8, techMid);
      }
      strip(0, 9.62, z - 3.13, 49, 0.13, 0.12, red);
      strip(0, 9.62, z + 3.13, 49, 0.13, 0.12, red);
    }

    // The north/south spine changes level twice rather than making one sniper rail.
    this._platformBox(0, -24, 6.2, 12, 5.2, bridgeTop, 0xef3828);
    this._platformBox(0,  24, 6.2, 12, 5.2, bridgeTop, 0xef3828);
    this._rampBox(-3.1, 3.1, -32, -18, 9.5, 5.2, 'z', bridgeTop, 0xef3828);
    this._rampBox(-3.1, 3.1,  18,  32, 5.2, 9.5, 'z', bridgeTop, 0xef3828);

    // Recessed red lanes are Jinx's navigation signature; cyan ticks mark joins.
    for (const x of [-8.0, 8.0]) strip(x, 0.055, 0, 0.18, 0.08, 112, red);
    for (const z of [-32, 32]) strip(0, 0.055, z, 112, 0.08, 0.18, red);
    for (const x of [-34, 34]) strip(x, 0.058, 0, 0.18, 0.08, 104, red);
    for (let z = -48; z <= 48; z += 12) {
      strip(-7.25, 0.062, z, 1.15, 0.075, 0.16, cyan);
      strip( 7.25, 0.062, z, 1.15, 0.075, 0.16, cyan);
    }

    // The northern approach is a strong red material channel rather than a
    // glowing floor slab. It terminates at the map's halo landmark and doubles
    // as quick route-reading from the centre.
    decor(0, 0.035, 52.0, 7.2, 0.06, 17.2, redChannel);
    strip(-3.62, 0.078, 52.0, 0.12, 0.08, 17.2, red);
    strip( 3.62, 0.078, 52.0, 0.12, 0.08, 17.2, red);
    for (const z of [45.0, 49.5, 54.0, 58.5]) {
      strip(0, 0.082, z, 3.8, 0.06, 0.12, gold);
    }

    // Asymmetric low cover prevents the four quadrants feeling copy-pasted.
    const cover = [
      [-19,-15,6,3.4,4], [17,-14,4,5.2,7],
      [-18, 15,4,5.2,7], [20, 16,6,3.4,4],
      [-49,-18,5,4.5,8], [48,-17,8,3.2,5],
      [-48, 18,8,3.2,5], [49, 18,5,4.5,8],
      [-15,-50,7,3.0,4], [16,-49,4,4.2,7],
      [-16, 49,4,4.2,7], [15, 50,7,3.0,4],
    ];
    for (let i = 0; i < cover.length; i++) {
      const [x, z, w, h, d] = cover[i];
      solid(x, h / 2, z, w, h, d, i % 3 === 0 ? stone : techMid);
      strip(
        x, h + 0.04, z, w + 0.12, 0.08, d + 0.12,
        i % 4 === 1 ? cyan : red
      );
    }

    // Vestige-like geometric punctuation using Jinx's diamond/server motif.
    for (const z of [-52, -39, 39, 52]) {
      circuitPanel(-half + 1.16, 9.4, z, 7.0, 6.0, 'x');
      circuitPanel( half - 1.16, 9.4, z, 7.0, 6.0, 'x');
      diamond(-half + 1.02, 9.4, z, 'x', cyan, 0.76);
      diamond( half - 1.02, 9.4, z, 'x', cyan, 0.76);
    }

    // A giant segmented halo creates the memorable framed vista seen in the
    // reference arena galleries. It is scenic and non-colliding, with the
    // playable red channel remaining open beneath it.
    const gateZ = half - 3.7;
    const gateY = 20.0;
    const haloOuter = new THREE.Mesh(
      new THREE.TorusGeometry(10.6, 0.62, 10, 48),
      ochre
    );
    haloOuter.position.set(0, gateY, gateZ);
    haloOuter.userData.noHit = true;
    this.scene.add(haloOuter);
    const haloInner = new THREE.Mesh(
      new THREE.TorusGeometry(9.65, 0.13, 8, 48),
      gold
    );
    haloInner.position.set(0, gateY, gateZ - 0.38);
    haloInner.userData.noHit = true;
    this.scene.add(haloInner);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const segment = decor(
        Math.cos(a) * 10.55,
        gateY + Math.sin(a) * 10.55,
        gateZ + 0.25,
        1.4, 2.5, 1.2,
        i % 3 === 0 ? paleStone : warmTrim
      );
      segment.rotation.z = a + Math.PI / 2;
    }
    decor(-11.2, 9.2, gateZ, 3.0, 18.4, 3.2, stone);
    decor( 11.2, 9.2, gateZ, 3.0, 18.4, 3.2, stone);
    for (const x of [-11.2, 11.2]) {
      strip(x, 8.7, gateZ - 1.64, 0.22, 11.5, 0.1, cyan);
    }
    signPanel('A-03  //  CENTRAL ROUTE', 'NEXUS', '#28d4ff',
      0, 14.0, gateZ - 1.75, 10.6, 2.45, Math.PI);

    // Optional lifts land on the central deck; all destinations also have ramps.
    const lift = (x, z, topY) => {
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(2.05, 2.35, 0.34, 12),
        tech
      );
      pad.position.set(x, 0.17, z);
      pad.receiveShadow = true;
      this.scene.add(pad);
      for (const y of [0.45, topY * 0.38, topY * 0.7, topY - 0.35]) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1.72, 0.09, 8, 20),
          cyan
        );
        ring.position.set(x, y, z);
        ring.rotation.x = Math.PI / 2;
        ring.userData.noHit = true;
        this.scene.add(ring);
      }
      for (const [ox, oz] of [[1.85,0],[-1.85,0],[0,1.85],[0,-1.85]]) {
        decor(x + ox, topY / 2, z + oz, 0.16, topY - 0.4, 0.16, paleStone);
      }
      this.gravLifts.push({ x, z, r: 1.9, topY, power: 15 });
    };
    lift(-13, 0, 5.2);
    lift( 13, 0, 5.2);
  }

  _buildMall() {
    // Bright retail palette.
    const frameM  = new THREE.MeshStandardMaterial({ color: 0xeef0f1, roughness: 0.55, metalness: 0.15 }); // white shopfront frame
    const wallBack= new THREE.MeshStandardMaterial({ color: 0xe4e0d6, roughness: 0.85, metalness: 0.0 });  // pale shop back wall
    const deckM   = new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.7,  metalness: 0.05 }); // mezzanine deck (pale stone)
    const soffitM = new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.6,  metalness: 0.05 }); // white ceiling soffit
    const steelM  = new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.35, metalness: 0.8 });  // brushed steel
    const redM    = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5,  metalness: 0.1, emissive: 0x360d08, emissiveIntensity: 0.3 }); // retail red accent
    const dispM   = new THREE.MeshStandardMaterial({ color: 0x394049, roughness: 0.6,  metalness: 0.2 });  // mannequin / display silhouette
    const potM    = new THREE.MeshStandardMaterial({ color: 0xd7d0c1, roughness: 0.85, metalness: 0.05 }); // stone planter
    const trunkM  = new THREE.MeshStandardMaterial({ color: 0x6d5a3c, roughness: 0.9,  metalness: 0.0 });  // tree trunk
    const leafM   = new THREE.MeshStandardMaterial({ color: 0x4f9245, roughness: 0.9,  metalness: 0.0 });  // foliage
    const water   = new THREE.MeshPhysicalMaterial({ color: 0x7fd0ea, roughness: 0.12, metalness: 0, transmission: 0.55, transparent: true, opacity: 0.7, emissive: 0x2a7fa6, emissiveIntensity: 0.25 });
    const glassClear = new THREE.MeshPhysicalMaterial({ color: 0xeaf4fb, roughness: 0.05, metalness: 0, transmission: 0.92, thickness: 0.4, transparent: true, opacity: 0.32, clearcoat: 1 });
    // bright lit shop interiors (glow warm/cool so the shopfronts read as "open")
    const litWarm = new THREE.MeshStandardMaterial({ color: 0xfff3df, roughness: 0.4, metalness: 0, emissive: 0xffe4bc, emissiveIntensity: 1.4 });
    const litCool = new THREE.MeshStandardMaterial({ color: 0xf2f7ff, roughness: 0.4, metalness: 0, emissive: 0xd8eaff, emissiveIntensity: 1.25 });
    const litRed  = new THREE.MeshStandardMaterial({ color: 0xffe6e0, roughness: 0.4, metalness: 0, emissive: 0xde6252, emissiveIntensity: 1.1 });
    const litSet  = [litWarm, litCool, litRed, litWarm, litCool, litRed];
    const signM   = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.85 }); // illuminated lightbox sign
    const dot     = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, emissive: 0xfff2da, emissiveIntensity: 1.2 });  // recessed downlight

    const F = 54;        // storefront distance from centre
    const MEZ_Y = 6.6;   // mezzanine floor height
    const MEZ_IN = 34;   // mezzanine inner edge (atrium half-size)

    // solid collider box
    const solid = (cx, cy, cz, w, h, d, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(cx, cy, cz); m.castShadow = true; m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true);
      this.scene.add(m);
      this.colliders.push({ box: new THREE.Box3(
        new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
        new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2)), mesh: m });
      return m;
    };
    const deco = (geo, mat, x, y, z, ry = 0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry;
      m.castShadow = true; this.scene.add(m); return m;
    };
    // A leafy ficus tree in a stone pot (the reference mall's planters).
    const tree = (x, z, scale = 1) => {
      deco(new THREE.CylinderGeometry(1.3 * scale, 1.6 * scale, 1.1 * scale, 16), potM, x, 0.55 * scale, z);
      deco(new THREE.CylinderGeometry(0.22 * scale, 0.32 * scale, 2.4 * scale, 8), trunkM, x, (1.1 + 1.2) * scale, z);
      deco(new THREE.SphereGeometry(1.9 * scale, 12, 10), leafM, x, (3.6) * scale, z);
      deco(new THREE.SphereGeometry(1.3 * scale, 12, 10), leafM, x + 0.9 * scale, (4.4) * scale, z + 0.4 * scale);
      deco(new THREE.SphereGeometry(1.2 * scale, 12, 10), leafM, x - 0.8 * scale, (4.2) * scale, z - 0.6 * scale);
      this.colliders.push({ box: new THREE.Box3(new THREE.Vector3(x - 1.5 * scale, 0, z - 1.5 * scale), new THREE.Vector3(x + 1.5 * scale, 1.3 * scale, z + 1.5 * scale)), mesh: null });
    };

    // ── Storefronts: pale back wall + warm-lit glass shopfronts, 2 storeys ──
    const sides = [
      { c: [0,  F], n: [0, -1], r: [1, 0] },   // N wall
      { c: [0, -F], n: [0,  1], r: [1, 0] },   // S wall
      { c: [ F, 0], n: [-1, 0], r: [0, 1] },   // E wall
      { c: [-F, 0], n: [ 1, 0], r: [0, 1] },   // W wall
    ];
    // Store branding: names + sign styles, cached canvas lightbox textures.
    const STORE_NAMES = ['NOVA', 'KYRA & CO', 'APEX SPORT', 'LUMEN', 'VELA CAFE', 'ORBIT',
                         'STELLA', 'URBANE', 'AURUM', 'VERDE', 'MODA', 'PIXEL'];
    const SIGN_STYLES = [
      { bg: '#f5f2ec', fg: '#2b2b2e' },   // white lightbox, dark lettering
      { bg: '#b8352a', fg: '#ffffff' },   // retail red, white lettering
      { bg: '#26262a', fg: '#ffd9a0' },   // dark box, warm glowing lettering
    ];
    const signTexCache = new Map();
    const storeSign = (name, style, w, x, y, z, ry) => {
      const key = name + '|' + style.bg;
      let tex = signTexCache.get(key);
      if (!tex) { tex = makeStoreSignTexture(name, style.bg, style.fg); signTexCache.set(key, tex); }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.05), new THREE.MeshBasicMaterial({ map: tex }));
      m.position.set(x, y, z); m.rotation.y = ry; this.scene.add(m);
      return m;
    };
    // Shop-window merchandise materials.
    const productM = [0xb8352a, 0x2e4a6b, 0xc9a227, 0x3d7a68, 0x8a5f9e, 0x6b4a2e]
      .map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.05 }));
    const shelfM  = new THREE.MeshStandardMaterial({ color: 0xf0ede6, roughness: 0.6, metalness: 0.05 });
    const matRedM = new THREE.MeshStandardMaterial({ color: 0x7a2e28, roughness: 0.95, metalness: 0 });

    let sideIx = 0;
    for (const s of sides) {
      const [cx, cz] = s.c, [nx, nz] = s.n, [rx, rz] = s.r;
      const len = F * 2 + 8;
      const ax = Math.abs(rx), az = Math.abs(rz), bx = Math.abs(nx), bz = Math.abs(nz);
      const faceRy = Math.atan2(nx, nz);   // plane rotation to face into the mall
      // A box spanning `alongW` along the wall and `depth` through it, centred at
      // (along, offN) in the wall's local frame — cuts the axis-juggling noise.
      const unitBox = (alongW, h, depth, along, offN, y, mat) =>
        deco(new THREE.BoxGeometry(ax * alongW + bx * depth, h, az * alongW + bz * depth),
             mat, cx + rx * along + nx * offN, y, cz + rz * along + nz * offN);
      // Invisible display-window collider running a0→a1 along the wall at offN.
      const wallCollider = (a0, a1, offN, y0, y1) => {
        const p0x = cx + rx * a0 + nx * offN, p0z = cz + rz * a0 + nz * offN;
        const p1x = cx + rx * a1 + nx * offN, p1z = cz + rz * a1 + nz * offN;
        this.colliders.push({ box: new THREE.Box3(
          new THREE.Vector3(Math.min(p0x, p1x) - 0.15 * bx, y0, Math.min(p0z, p1z) - 0.15 * bz),
          new THREE.Vector3(Math.max(p0x, p1x) + 0.15 * bx, y1, Math.max(p0z, p1z) + 0.15 * bz)), mesh: null });
      };

      solid(cx, 8, cz, ax * len + bx * 4, 16, az * len + bz * 4, wallBack);   // 2-storey pale back wall
      // Floor-slab canopy splitting the storeys (comes proud over the shopfronts,
      // like a real mall's balcony edge) + a red accent line along its underside.
      unitBox(len + 0.4, 0.8, 7.6, 0, 0, MEZ_Y - 0.2, soffitM);
      unitBox(len + 0.5, 0.18, 7.7, 0, 0, MEZ_Y - 0.62, redM);
      // Solid white bulkhead band under the upper shop glass.
      unitBox(len - 6, 1.4, 0.3, 0, 3.5, MEZ_Y + 0.75, frameM);

      const N = 6;
      const entIx = (sideIx % 4 === 0) ? 2 : 3;   // one open shop entrance per side
      const entAlong = ((entIx + 0.5) / N - 0.5) * (len - 6);
      for (let i = 0; i < N; i++) {
        const along = ((i + 0.5) / N - 0.5) * (len - 6);
        const isEntrance = i === entIx;
        const nameG  = STORE_NAMES[(i + sideIx) % STORE_NAMES.length];
        const nameU  = STORE_NAMES[(i + sideIx + 6) % STORE_NAMES.length];
        const style  = SIGN_STYLES[(i + sideIx) % SIGN_STYLES.length];
        const styleU = SIGN_STYLES[(i + sideIx + 1) % SIGN_STYLES.length];

        // warm-lit interior wash against the back wall (both floors)
        unitBox(12, 4.6, 0.15, along, 2.1, 2.9, litSet[(i + sideIx) % litSet.length]);
        unitBox(12, 3.8, 0.15, along, 2.1, MEZ_Y + 3.3, litSet[(i + sideIx + 1) % litSet.length]);

        if (!isEntrance) {
          // stocked display window: two shelves of goods + a pair of mannequins
          for (const sy of [1.05, 2.05]) unitBox(8.6, 0.12, 0.85, along, 2.6, sy, shelfM);
          for (let k = 0; k < 5; k++) {
            const boxAlong = along + (k - 2) * 1.45 + ((i + k) % 3 - 1) * 0.22;
            const sy = (k % 2) ? 1.05 : 2.05;
            unitBox(0.62, 0.55, 0.5, boxAlong, 2.6, sy + 0.34, productM[(i * 7 + k + sideIx) % productM.length]);
          }
          for (const so of [-1, 1]) {
            const mAlong = along + so * 3.6;
            unitBox(0.24, 0.9, 0.24, mAlong, 2.95, 0.45, steelM);   // stand
            const mx = cx + rx * mAlong + nx * 2.95, mz = cz + rz * mAlong + nz * 2.95;
            deco(new THREE.CapsuleGeometry(0.28, 0.7, 4, 8), dispM, mx, 1.55, mz);
            deco(new THREE.SphereGeometry(0.22, 10, 8), dispM, mx, 2.2, mz);
          }
          // clear glass shopfront pane (movement is blocked by wallCollider below)
          unitBox(12.4, 4.6, 0.12, along, 3.5, 2.9, glassClear);
        } else {
          // OPEN shop entrance: welcome mat + flanking shrubs; the alcove doubles
          // as a shallow cover niche on the concourse. Glass side panes seal the
          // display run on either side of the doorway.
          unitBox(5.2, 0.06, 1.6, along, 3.3, 0.04, matRedM);
          for (const so of [-1, 1]) {
            const px2 = cx + rx * (along + so * 4.6) + nx * 3.2, pz2 = cz + rz * (along + so * 4.6) + nz * 3.2;
            deco(new THREE.CylinderGeometry(0.34, 0.42, 0.5, 10), potM, px2, 0.25, pz2);
            deco(new THREE.SphereGeometry(0.5, 10, 8), leafM, px2, 0.95, pz2);
            const da = along + so * 6.2;
            unitBox(0.18, 5.2, 1.5, da, 2.8, 2.6, glassClear);     // alcove side pane
            const p0x = cx + rx * da + nx * 2.0, p0z = cz + rz * da + nz * 2.0;
            const p1x = cx + rx * da + nx * 3.6, p1z = cz + rz * da + nz * 3.6;
            this.colliders.push({ box: new THREE.Box3(
              new THREE.Vector3(Math.min(p0x, p1x) - 0.2 * ax, 0, Math.min(p0z, p1z) - 0.2 * az),
              new THREE.Vector3(Math.max(p0x, p1x) + 0.2 * ax, 5.3, Math.max(p0z, p1z) + 0.2 * az)), mesh: null });
          }
        }
        // ground-floor illuminated store-name lightbox
        unitBox(11.8, 1.25, 0.35, along, 3.55, 5.32, frameM);
        storeSign(nameG, style, 11.2, cx + rx * along + nx * 3.78, 5.32, cz + rz * along + nz * 3.78, faceRy);

        // upper floor: a mannequin + glass + its own sign
        const uAlong = along + ((i % 2) ? 2.2 : -2.2);
        unitBox(0.24, 0.9, 0.24, uAlong, 2.95, MEZ_Y + 0.45, steelM);
        const ux = cx + rx * uAlong + nx * 2.95, uz = cz + rz * uAlong + nz * 2.95;
        deco(new THREE.CapsuleGeometry(0.28, 0.7, 4, 8), dispM, ux, MEZ_Y + 1.55, uz);
        deco(new THREE.SphereGeometry(0.22, 10, 8), dispM, ux, MEZ_Y + 2.2, uz);
        unitBox(12.4, 4.0, 0.12, along, 3.5, MEZ_Y + 3.3, glassClear);
        unitBox(11.8, 1.15, 0.35, along, 3.55, MEZ_Y + 5.75, frameM);
        storeSign(nameU, styleU, 11.2, cx + rx * along + nx * 3.78, MEZ_Y + 5.75, cz + rz * along + nz * 3.78, faceRy);
      }
      // Continuous display colliders: ground floor is broken only at the entrance
      // alcove; the upper run is sealed end to end.
      wallCollider(-(len / 2), entAlong - 6.2, 3.5, 0, 5.3);
      wallCollider(entAlong + 6.2, len / 2, 3.5, 0, 5.3);
      wallCollider(-(len / 2), len / 2, 3.5, MEZ_Y, 12);

      // white pilasters between the shop units, framing the glass
      for (let i = 0; i <= N; i++) {
        const along = (i / N - 0.5) * (len - 6);
        unitBox(1.0, 12.6, 1.6, along, 2.9, 6.3, frameM);
      }
      sideIx += 2;
    }

    // ── Mezzanine balcony ring (walkable upper floor) + glass railings ──
    // Four strips from the facade (±F) inward to ±MEZ_IN; the centre atrium is an
    // open light-well (double-height). Pale decks + white soffit ceiling below +
    // recessed downlights + support columns.
    const bW = F * 2, bD = F - MEZ_IN;
    const mzc = MEZ_IN + bD / 2;
    // N & S (run along x)
    for (const sgn of [1, -1]) {
      const cz = sgn * mzc;
      deco(new THREE.BoxGeometry(bW + 8, 0.5, bD), deckM, 0, MEZ_Y - 0.25, cz);          // walking deck
      deco(new THREE.BoxGeometry(bW + 8, 0.25, bD - 0.6), soffitM, 0, MEZ_Y - 0.62, cz); // white soffit ceiling below
      this.platforms.push({ minX: -(F + 4), maxX: F + 4, minZ: cz - bD / 2, maxZ: cz + bD / 2, y0: MEZ_Y + 0.05, y1: MEZ_Y + 0.05 });
      this._mallRailing(0, sgn * MEZ_IN, bW, 'x', MEZ_Y);
      for (let x = -F + 8; x <= F - 8; x += 9) deco(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 14), dot, x, MEZ_Y - 0.76, sgn * (MEZ_IN + 2)); // downlights
      for (let x = -F + 8; x <= F - 8; x += 20) deco(new THREE.CylinderGeometry(0.5, 0.5, MEZ_Y, 12), frameM, x, MEZ_Y / 2, cz + sgn * (bD / 2 - 2)); // columns
    }
    // E & W (run along z)
    for (const sgn of [1, -1]) {
      const cx = sgn * mzc;
      deco(new THREE.BoxGeometry(bD, 0.5, bW + 8), deckM, cx, MEZ_Y - 0.25, 0);
      deco(new THREE.BoxGeometry(bD - 0.6, 0.25, bW + 8), soffitM, cx, MEZ_Y - 0.62, 0);
      this.platforms.push({ minX: cx - bD / 2, maxX: cx + bD / 2, minZ: -(F + 4), maxZ: F + 4, y0: MEZ_Y + 0.05, y1: MEZ_Y + 0.05 });
      this._mallRailing(sgn * MEZ_IN, 0, bW, 'z', MEZ_Y);
      for (let z = -F + 8; z <= F - 8; z += 9) deco(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 14), dot, sgn * (MEZ_IN + 2), MEZ_Y - 0.76, z);
      for (let z = -F + 8; z <= F - 8; z += 20) deco(new THREE.CylinderGeometry(0.5, 0.5, MEZ_Y, 12), frameM, cx + sgn * (bD / 2 - 2), MEZ_Y / 2, z);
    }

    // ── Escalators (dark steel treads, glass balustrades) at the four mid-sides ──
    // Each rises from the atrium floor at ±(MEZ_IN-10) up to the deck edge at
    // ±MEZ_IN, meeting it exactly through the railing gap (so you can actually
    // ride them onto the mezzanine).
    const escM = new THREE.MeshStandardMaterial({ color: 0x353a42, roughness: 0.5, metalness: 0.7 });
    const escSpecs = [
      [-5, 5,  MEZ_IN - 10, MEZ_IN, 0, MEZ_Y, 'z'],       // N: up toward +z
      [-5, 5, -MEZ_IN, -(MEZ_IN - 10), MEZ_Y, 0, 'z'],    // S: up toward -z
      [MEZ_IN - 10, MEZ_IN, -5, 5, 0, MEZ_Y, 'x'],        // E: up toward +x
      [-MEZ_IN, -(MEZ_IN - 10), -5, 5, MEZ_Y, 0, 'x'],    // W: up toward -x
    ];
    for (const [x0, x1, z0, z1, y0, y1, runAxis] of escSpecs) {
      this._rampBox(x0, x1, z0, z1, y0, y1, runAxis, escM, 0xffe6c2);
      // glass balustrade panels down both sides of the run
      const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
      const runLen = runAxis === 'x' ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
      const midY = (y0 + y1) / 2 + 0.9;
      for (const so of [-1, 1]) {
        const off = so * (runAxis === 'x' ? Math.abs(z1 - z0) : Math.abs(x1 - x0)) / 2;
        const px2 = runAxis === 'x' ? cxm : cxm + off;
        const pz2 = runAxis === 'x' ? czm + off : czm;
        const gw = runAxis === 'x' ? runLen : 0.14;
        const gd = runAxis === 'x' ? 0.14 : runLen;
        const pane = new THREE.Mesh(new THREE.BoxGeometry(gw, 1.5, gd), glassClear);
        pane.position.set(px2, midY, pz2); this.scene.add(pane);
      }
    }

    // ── Glass scenic elevators at the atrium corners (traversal up to mezzanine) ──
    this._gravLift( 28,  28, MEZ_Y, 12);
    this._gravLift(-28,  28, MEZ_Y, 12);
    this._gravLift( 28, -28, MEZ_Y, 12);
    this._gravLift(-28, -28, MEZ_Y, 12);

    // ── Central tiered stone fountain (landmark + cover) ──
    deco(new THREE.CylinderGeometry(6.0, 6.6, 0.7, 32), potM, 0, 0.35, 0);      // basin rim
    deco(new THREE.CylinderGeometry(5.5, 5.5, 0.4, 32), water, 0, 0.72, 0);      // lower water
    deco(new THREE.CylinderGeometry(2.3, 2.7, 1.5, 24), potM, 0, 1.1, 0);        // pedestal
    deco(new THREE.CylinderGeometry(2.0, 2.0, 0.35, 24), water, 0, 1.95, 0);     // upper water
    deco(new THREE.CylinderGeometry(0.28, 0.32, 2.6, 12), steelM, 0, 3.2, 0);    // jet column
    deco(new THREE.SphereGeometry(0.95, 16, 12), steelM, 0, 4.7, 0);            // finial sphere
    // four ficus trees + benches ringing the fountain
    for (const [tx, tz] of [[9, 0], [-9, 0], [0, 9], [0, -9]]) tree(tx, tz, 1.05);

    // ── Retail kiosks (bright glass display islands) as concourse cover ──
    for (const [x, z, accent] of [[20, 20, redM], [-20, 20, litCool], [20, -20, signM], [-20, -20, redM]]) {
      solid(x, 1.4, z, 5, 2.8, 5, frameM);                                       // white body
      deco(new THREE.BoxGeometry(5.2, 0.5, 5.2), accent, x, 0.5, z);             // accent base band
      deco(new THREE.BoxGeometry(4.4, 1.5, 4.4), glassClear, x, 2.4, z);        // glass display top
      deco(new THREE.BoxGeometry(5.8, 0.55, 5.8), signM, x, 3.35, z);           // illuminated canopy sign
      this.platforms.push({ minX: x - 2.5, maxX: x + 2.5, minZ: z - 2.5, maxZ: z + 2.5, y0: 2.85, y1: 2.85 });
    }
    // ── Leafy trees along the concourse avenues ──
    // (outer four sit on the diagonals, clear of the escalator runs)
    for (const [x, z] of [[12, 0], [-12, 0], [0, 12], [0, -12], [26, 10], [-26, -10], [10, -26], [-10, 26]]) tree(x, z, 1);

    // ── Concourse decorations ──
    const woodM = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.8, metalness: 0 });
    const binM  = new THREE.MeshStandardMaterial({ color: 0x5a6066, roughness: 0.4, metalness: 0.7 });
    // bench: stone ends + wood slat seat (axis-aligned; collider only at ground level)
    const bench = (x, z, alongX, y = 0) => {
      const ex2 = alongX ? 1.05 : 0, ez2 = alongX ? 0 : 1.05;
      for (const so of [-1, 1])
        deco(new THREE.BoxGeometry(alongX ? 0.3 : 0.66, 0.5, alongX ? 0.66 : 0.3), potM, x + so * ex2, y + 0.25, z + so * ez2);
      deco(new THREE.BoxGeometry(alongX ? 2.6 : 0.6, 0.14, alongX ? 0.6 : 2.6), woodM, x, y + 0.57, z);
      if (y === 0) this.colliders.push({ box: new THREE.Box3(
        new THREE.Vector3(x - (alongX ? 1.35 : 0.4), 0, z - (alongX ? 0.4 : 1.35)),
        new THREE.Vector3(x + (alongX ? 1.35 : 0.4), 0.65, z + (alongX ? 0.4 : 1.35))), mesh: null });
    };

    // fountain plaza: inlaid floor medallion rings + benches facing the water
    const medM = new THREE.MeshStandardMaterial({ color: 0xc4b394, roughness: 0.55, metalness: 0.05 });
    for (const [r, w] of [[7.6, 0.55], [10.6, 0.35]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - w, r, 56), medM);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; this.scene.add(ring);
    }
    bench( 7.6,  7.6, true); bench(-7.6,  7.6, true);
    bench( 7.6, -7.6, true); bench(-7.6, -7.6, true);
    bench( 24,  8, true); bench(-24, -8, true);
    bench( 8, -22, false); bench(-8,  22, false);

    // trash bins by the kiosks
    for (const [x, z] of [[17, 23], [-23, 17], [23, -17], [-17, -23]]) {
      deco(new THREE.CylinderGeometry(0.34, 0.3, 0.95, 12), binM, x, 0.48, z);
      deco(new THREE.CylinderGeometry(0.38, 0.38, 0.09, 12), dispM, x, 0.99, z);
    }

    // café terrace by the south-west kiosk: tables, stools, red umbrellas
    for (const [x, z] of [[-15.5, -19], [-19.5, -15], [-13, -16]]) {
      deco(new THREE.CylinderGeometry(0.07, 0.07, 1.05, 8), steelM, x, 0.52, z);
      deco(new THREE.CylinderGeometry(0.8, 0.8, 0.06, 16), frameM, x, 1.05, z);
      deco(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6), steelM, x, 2.1, z);
      deco(new THREE.ConeGeometry(1.55, 0.55, 10), redM, x, 3.2, z);
      for (let k = 0; k < 3; k++) {
        const aa = k * 2.1 + x + z;
        deco(new THREE.CylinderGeometry(0.26, 0.3, 0.52, 10), woodM, x + Math.cos(aa) * 1.35, 0.26, z + Math.sin(aa) * 1.35);
      }
      this.colliders.push({ box: new THREE.Box3(new THREE.Vector3(x - 0.85, 0, z - 0.85), new THREE.Vector3(x + 0.85, 1.1, z + 0.85)), mesh: null });
    }

    // mall directory boards near the north/south under-balcony shops
    const dirTex = makeBannerTexture(['MALL', 'MAP'], '#26262a', '#ffd9a0');
    for (const [x, z, ry] of [[10, 40, Math.PI], [-10, -40, 0]]) {
      deco(new THREE.BoxGeometry(0.5, 0.2, 0.5), binM, x, 0.1, z);
      deco(new THREE.BoxGeometry(0.12, 2.5, 0.12), binM, x, 1.35, z);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.0), new THREE.MeshBasicMaterial({ map: dirTex, side: THREE.DoubleSide }));
      board.position.set(x, 1.85, z); board.rotation.y = ry; this.scene.add(board);
      this.colliders.push({ box: new THREE.Box3(new THREE.Vector3(x - 0.4, 0, z - 0.4), new THREE.Vector3(x + 0.4, 1.2, z + 0.4)), mesh: null });
    }

    // hanging promo banners on the light-well railings
    const bannerTex = [
      makeBannerTexture(['SALE', '-50%'], '#b8352a', '#ffffff'),
      makeBannerTexture(['NEW', 'SEASON'], '#f5f2ec', '#2b2b2e'),
      makeBannerTexture(['KYX', 'GALLERIA'], '#26262a', '#ffd9a0'),
    ];
    let bIx = 0;
    const IN_B = MEZ_IN - 0.6;
    for (const [bx2, bz2, bry] of [
      [ 14,  IN_B, Math.PI], [-14,  IN_B, Math.PI], [ 26,  IN_B, Math.PI], [-26,  IN_B, Math.PI],
      [ 14, -IN_B, 0], [-14, -IN_B, 0], [ 26, -IN_B, 0], [-26, -IN_B, 0],
      [ IN_B,  14, -Math.PI / 2], [ IN_B, -14, -Math.PI / 2], [ IN_B,  26, -Math.PI / 2], [ IN_B, -26, -Math.PI / 2],
      [-IN_B,  14,  Math.PI / 2], [-IN_B, -14,  Math.PI / 2], [-IN_B,  26,  Math.PI / 2], [-IN_B, -26,  Math.PI / 2],
    ]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 3.0),
        new THREE.MeshBasicMaterial({ map: bannerTex[bIx++ % 3], side: THREE.DoubleSide }));
      banner.position.set(bx2, 4.7, bz2); banner.rotation.y = bry;
      this.scene.add(banner);
      const alongZ = Math.abs(bry) === Math.PI / 2;
      const rod = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 0.08 : 2.3, 0.08, alongZ ? 2.3 : 0.08), steelM);
      rod.position.set(bx2, 6.28, bz2); this.scene.add(rod);
    }

    // mezzanine: railing planter hedges + a couple of benches
    const HG = MEZ_IN + 1.3;
    for (const [hx2, hz2, alongX] of [[20, HG, true], [-20, HG, true], [20, -HG, true], [-20, -HG, true],
                                      [HG, 20, false], [HG, -20, false], [-HG, 20, false], [-HG, -20, false]]) {
      deco(new THREE.BoxGeometry(alongX ? 4.2 : 1.0, 0.62, alongX ? 1.0 : 4.2), potM, hx2, MEZ_Y + 0.36, hz2);
      deco(new THREE.BoxGeometry(alongX ? 3.8 : 0.8, 0.55, alongX ? 0.8 : 3.8), leafM, hx2, MEZ_Y + 0.9, hz2);
    }
    bench(20, 44, true, MEZ_Y + 0.05); bench(-20, -44, true, MEZ_Y + 0.05);
    bench(44, -20, false, MEZ_Y + 0.05); bench(-44, 20, false, MEZ_Y + 0.05);
  }

  // Glass railing along a mezzanine inner edge (with a central gap for the
  // escalator). `axis` is the edge's run direction; (ex,ez) is the edge line.
  _mallRailing(ex, ez, len, axis, y) {
    // Clear glass balustrade with a brushed-steel top handrail — like a real mall.
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xeaf4fb, roughness: 0.05, metalness: 0, transmission: 0.92, thickness: 0.5, transparent: true, opacity: 0.32, clearcoat: 1 });
    const nm = new THREE.MeshStandardMaterial({ color: 0xd2d7dc, roughness: 0.3, metalness: 0.85 });
    const seg = (len - 16) / 2;   // two segments, 16-wide gap in the middle for the escalator
    for (const s of [-1, 1]) {
      const off = s * (8 + seg / 2);
      const cx = axis === 'x' ? ex + off : ex;
      const cz = axis === 'x' ? ez : ez + off;
      const gw = axis === 'x' ? seg : 0.2;
      const gd = axis === 'x' ? 0.2 : seg;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(gw, 1.1, gd), glass);
      panel.position.set(cx, y + 0.55, cz); this.scene.add(panel);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(gw + 0.12, 0.14, gd + 0.12), nm);
      rail.position.set(cx, y + 1.18, cz); this.scene.add(rail);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // GLASS FIELD — a flat glass floor dotted with translucent glass pillars.
  // Clean and minimal: the pillars are the only cover / sightline breaks.
  // (Unused — the mall above replaced it; kept for reference.)
  // ═════════════════════════════════════════════════════════════════════════
  _buildGlassField() {
    const colors = [0x37c4d4, 0x33a8ec, 0x8fe6ff, 0x6cc4f0];
    // One shared translucent glass material for all pillars (transmission = real
    // see-through glass; clearcoat gives the wet, polished highlight).
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xaee9ff, roughness: 0.05, metalness: 0.0,
      transmission: 0.9, thickness: 3.0, ior: 1.45,
      transparent: true, clearcoat: 1.0, clearcoatRoughness: 0.04,
    });

    // A loose, jittered grid of pillars with wave-varied heights — reads as a
    // glass forest. Centre stays open; mirrored so the field is balanced.
    const spacing = 22, range = 3;
    for (let gx = -range; gx <= range; gx++) {
      for (let gz = -range; gz <= range; gz++) {
        if (Math.abs(gx) + Math.abs(gz) === 0) continue;   // keep spawn centre open
        if (Math.abs(gx) === range && Math.abs(gz) === range) continue; // trim far corners
        // deterministic jitter/heights so left/right stay roughly symmetric
        const jitter = ((gx * 7 + gz * 13) % 5) - 2;
        const x = gx * spacing + jitter;
        const z = gz * spacing - jitter;
        const w = 2.6 + (Math.abs((gx * 3 + gz) % 3)) * 0.7;
        const h = 8 + Math.abs(Math.sin(gx * 0.8) * Math.cos(gz * 0.8)) * 18 + ((gx + gz) % 3) * 2;
        this._glassPillar(x, z, w, h, glass, colors[Math.abs(gx * 2 + gz) % colors.length]);
      }
    }
  }

  // A single translucent glass pillar: a see-through column with a glowing top
  // cap, base ring and an inner light core so it reads clearly against the floor.
  _glassPillar(x, z, w, h, glassMat, glowColor) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), glassMat);
    p.position.set(x, h / 2, z); p.castShadow = true; p.receiveShadow = true;
    p.matrixAutoUpdate = false; p.updateMatrix(); p.updateMatrixWorld(true);
    this.scene.add(p);
    this.colliders.push({ box: new THREE.Box3(
      new THREE.Vector3(x - w / 2, 0, z - w / 2),
      new THREE.Vector3(x + w / 2, h, z + w / 2)), mesh: p });
    const nm = this._neonMat(glowColor);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.3, w + 0.3), nm);
    cap.position.set(x, h + 0.06, z); this.scene.add(cap);
    const ring = new THREE.Mesh(new THREE.BoxGeometry(w + 0.45, 0.22, w + 0.45), nm);
    ring.position.set(x, 0.12, z); this.scene.add(ring);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.3, h * 0.9, 0.3), nm);
    core.position.set(x, h / 2, z); this.scene.add(core);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // THE ARENA — a compact, symmetric ev.io-style combat space with three levels
  // (ground / mid deck / high core + flank platforms), connected by ramps,
  // bridges and jump-pads, with teleporters and cover for flow and gunfights.
  // (Unused — the glass field above replaced it; kept for reference.)
  // ═════════════════════════════════════════════════════════════════════════
  _buildArena() {
    const BLUE = 0x33a8ec, ORANGE = 0xff8a2c, TEAL = 0x37c4d4;
    const deck  = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.5, metalness: 0.6 });
    const deckL = new THREE.MeshStandardMaterial({ color: 0x525d6c, roughness: 0.5, metalness: 0.55 });
    const cover = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.55, metalness: 0.5 });

    // Solid box collider with optional neon top-trim + optional walkable top.
    const box = (cx, cy, cz, w, h, d, mat, trim, walk) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(cx, cy, cz); m.castShadow = true; m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true);
      this.scene.add(m);
      this.colliders.push({ box: new THREE.Box3(
        new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
        new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2)), mesh: m });
      if (trim != null) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.12, d + 0.2), this._neonMat(trim));
        t.position.set(cx, cy + h / 2 + 0.02, cz); this.scene.add(t);
      }
      if (walk) this.platforms.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, y0: cy + h / 2 + 0.05, y1: cy + h / 2 + 0.05 });
      return m;
    };

    // ── Central high-ground: mid deck (y9) + king-of-the-hill core (y12) ──
    this._platformBox(0, 0, 34, 34, 9, deck, TEAL);
    this._platformBox(0, 0, 13, 13, 12, deckL, ORANGE);
    // direct ground → mid-deck ramps (one per cardinal, offset to one half of
    // the edge so they don't collide with that side's bridge)
    this._rampBox(-13, -5,  17, 31, 9, 0, 'z', deck, TEAL);   // N
    this._rampBox(-13, -5, -31,-17, 0, 9, 'z', deck, TEAL);   // S
    this._rampBox( 17, 31, -13, -5, 9, 0, 'x', deck, TEAL);   // E
    this._rampBox(-31,-17, -13, -5, 0, 9, 'x', deck, TEAL);   // W
    // short ramps mid-deck → core (2 sides)
    this._rampBox(-3, 3,  6.5, 12, 12, 9, 'z', deckL, ORANGE);
    this._rampBox(-3, 3, -12,-6.5, 9, 12, 'z', deckL, ORANGE);
    // cover on the mid deck + a power-weapon marker on the core
    for (const [cx, cz] of [[11, 11],[-11, 11],[11, -11],[-11, -11]]) box(cx, 10.4, cz, 3.4, 2.8, 3.4, cover, BLUE, true);
    this._spawnPadMarker(0, 0, 12.1, ORANGE);

    // ── Four cardinal flank platforms (y13): bridge in, ramp down, jump-pad up ──
    // N
    this._platformBox(0, 48, 16, 16, 13, deck, ORANGE);
    this._rampBox(5, 13, 17, 40, 9, 13, 'z', deck, ORANGE);   // bridge deck→platform
    this._rampBox(-4, 4, 56, 68, 13, 0, 'z', deck, ORANGE);   // platform→ground
    this._gravLift(0, 48, 13, 15);
    // S
    this._platformBox(0, -48, 16, 16, 13, deck, ORANGE);
    this._rampBox(5, 13, -40, -17, 13, 9, 'z', deck, ORANGE);
    this._rampBox(-4, 4, -68, -56, 0, 13, 'z', deck, ORANGE);
    this._gravLift(0, -48, 13, 15);
    // E
    this._platformBox(48, 0, 16, 16, 13, deck, ORANGE);
    this._rampBox(17, 40, 5, 13, 9, 13, 'x', deck, ORANGE);
    this._rampBox(56, 68, -4, 4, 13, 0, 'x', deck, ORANGE);
    this._gravLift(48, 0, 13, 15);
    // W
    this._platformBox(-48, 0, 16, 16, 13, deck, ORANGE);
    this._rampBox(-40, -17, 5, 13, 13, 9, 'x', deck, ORANGE);
    this._rampBox(-68, -56, -4, 4, 0, 13, 'x', deck, ORANGE);
    this._gravLift(-48, 0, 13, 15);

    // ── Diagonal cover: corner pillars + waist-high cover chunks (walkable) ──
    for (const [sx, sz] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
      box(sx * 40, 6, sz * 40, 3, 12, 3, deck, TEAL, false);          // tall corner pillar
      box(sx * 26, 2.5, sz * 26, 6, 5, 6, cover, BLUE, true);         // cover chunk
      box(sx * 70, 2.5, sz * 70, 5, 5, 5, cover, ORANGE, true);      // outer cover
    }
    // lane-breaking cover walls between the deck and each flank platform
    box( 0, 2, 30, 12, 4, 2, cover, BLUE, false);
    box( 0, 2,-30, 12, 4, 2, cover, BLUE, false);
    box( 30, 2, 0, 2, 4, 12, cover, BLUE, false);
    box(-30, 2, 0, 2, 4, 12, cover, BLUE, false);
    // cover under the mid-deck (the covered "basement" passage)
    for (const [cx, cz] of [[10, 0],[-10, 0],[0, 10],[0, -10]]) box(cx, 1.6, cz, 3, 3.2, 3, cover, TEAL, false);

    // ── Teleporters across the diagonals (fast rotations) ──
    this._teleporterPair( 66,  66, -66, -66, TEAL);
    this._teleporterPair(-66,  66,  66, -66, BLUE);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // THE MONUMENT — "The Warden": a colossal seated guardian on a stepped
  // ziggurat, crowned by a glowing obelisk. A climbable central landmark with
  // tiered plazas (ramps + grav-lifts), a walkable lap and shoulders for perches,
  // corner shrines linked by teleporters, and ruined-pillar cover. (Unused — the
  // arena above replaced it; kept for reference.)
  // ═════════════════════════════════════════════════════════════════════════
  _buildMonument() {
    const BLUE = 0x33a8ec, ORANGE = 0xff8a2c, TEAL = 0x37c4d4;
    const mats = {
      stone:  new THREE.MeshStandardMaterial({ color: 0xd6c398, roughness: 0.92, metalness: 0.04 }),
      stone2: new THREE.MeshStandardMaterial({ color: 0xc2ad80, roughness: 0.94, metalness: 0.03 }),
      dark:   new THREE.MeshStandardMaterial({ color: 0x33353c, roughness: 0.6,  metalness: 0.45 }),
      bronze: new THREE.MeshStandardMaterial({ color: 0xa38a55, roughness: 0.6,  metalness: 0.35, emissive: 0x2a1d09, emissiveIntensity: 0.5 }),
      bronzeD:new THREE.MeshStandardMaterial({ color: 0x74613c, roughness: 0.64, metalness: 0.32, emissive: 0x1e1507, emissiveIntensity: 0.5 }),
      visor:  new THREE.MeshStandardMaterial({ color: 0x0a0e14, roughness: 0.12, metalness: 0.92 }),
    };

    // ── Stepped ziggurat: four solid stone tiers you climb via ramps ──────────
    this._tier(0, 0, 64, 64,  3.5, mats.stone,  BLUE);
    this._tier(0, 0, 48, 48,  7.0, mats.stone2, TEAL);
    this._tier(0, 0, 34, 34, 10.5, mats.stone,  BLUE);
    this._tier(0, 0, 22, 22, 14.0, mats.stone2, ORANGE);   // pedestal for the colossus

    // Tier tops sit a hair above the solid box so the ramp lips read clean.
    const A = 3.58, B = 7.08, C = 10.58, D = 14.08;

    // ── Climbing ramps (mirrored pairs so both flanks have access) ────────────
    this._rampBox(-3, 3,  32, 39,  A, 0, 'z', mats.stone, BLUE);   // ground → A (+Z)
    this._rampBox(-3, 3, -39,-32,  0, A, 'z', mats.stone, BLUE);   // ground → A (−Z)
    this._rampBox( 24, 31, -3, 3,  B, A, 'x', mats.stone, TEAL);   // A → B (+X)
    this._rampBox(-31,-24, -3, 3,  A, B, 'x', mats.stone, TEAL);   // A → B (−X)
    this._rampBox(-3, 3,  17, 24,  C, B, 'z', mats.stone, BLUE);   // B → C (+Z)
    this._rampBox(-3, 3, -24,-17,  B, C, 'z', mats.stone, BLUE);   // B → C (−Z)
    this._rampBox( 11, 17, -3, 3,  D, C, 'x', mats.stone, ORANGE); // C → D (+X)
    this._rampBox(-17,-11, -3, 3,  C, D, 'x', mats.stone, ORANGE); // C → D (−X)

    // ── The colossus on the pedestal ──────────────────────────────────────────
    this._colossus(14, mats, { BLUE, ORANGE, TEAL });

    // ── Verticality: grav-lifts (corners onto the tiers; two to the shoulders) ─
    this._gravLift( 44,  44, 7.5, 14);
    this._gravLift(-44,  44, 7.5, 14);
    this._gravLift( 44, -44, 7.5, 14);
    this._gravLift(-44, -44, 7.5, 14);
    this._gravLift( 8, 15, 25.1, 17);    // ride up onto the guardian's chest deck
    this._gravLift(-8, 15, 25.1, 17);

    // ── Corner shrines linked by teleporters (cross-map jumps) ────────────────
    this._shrine( 86,  86, TEAL);
    this._shrine(-86,  86, BLUE);
    this._shrine( 86, -86, BLUE);
    this._shrine(-86, -86, TEAL);
    this._teleporterPair( 82,  82, -82, -82, TEAL);
    this._teleporterPair(-82,  82,  82, -82, BLUE);

    // ── Grand colonnade ring: tall clean columns framing the monument ─────────
    this._colonnade(46, 12, mats.stone, BLUE);

    // ── Braziers flanking the main stairs + on the plaza — warm glowing pools ──
    for (const [x, z] of [[10, 40],[-10, 40],[10,-40],[-10,-40],[40,10],[40,-10],[-40,10],[-40,-10]]) {
      this._brazier(x, z, ORANGE);
    }

    // ── Broken ruins + low cover blocks out in the long lanes ─────────────────
    const ruinMat = new THREE.MeshStandardMaterial({ color: 0xb5a582, roughness: 0.94 });
    for (const [x, z, ry] of [[72, 26, 0.5],[-72,-26, 1.1],[26,72, 2.0],[-26,-72, 0.2],[72,-26, 1.6],[-72,26, 2.6]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 7), ruinMat);
      b.position.set(x, 1.7, z); b.rotation.y = ry; b.castShadow = b.receiveShadow = true;
      this._addCollider(b);
      const t = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.2, 7.2), this._neonMat(ORANGE));
      t.position.set(x, 3.45, z); t.rotation.y = ry; this.scene.add(t);
      this.platforms.push({ minX: x - 3.4, maxX: x + 3.4, minZ: z - 3.4, maxZ: z + 3.4, y0: 3.45, y1: 3.45 });
      // a toppled drum beside it
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 4, 12), ruinMat);
      drum.position.set(x + 5, 1.5, z + 3); drum.rotation.z = Math.PI / 2; drum.rotation.y = ry;
      this._addCollider(drum);
    }
  }

  // A ring of tall, clean temple columns (base + fluted shaft + capital + glow).
  _colonnade(radius, count, shaftMat, glowColor) {
    const capMat = new THREE.MeshStandardMaterial({ color: 0xcbb890, roughness: 0.88 });
    const nm = this._neonMat(glowColor);
    const H = 19;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.PI / count;
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.0, H, 16), shaftMat);
      shaft.position.set(x, H / 2 + 0.6, z); shaft.castShadow = shaft.receiveShadow = true;
      this._addCollider(shaft);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 1.2, 16), capMat);
      base.position.set(x, 0.6, z); this.scene.add(base);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.6, 5.2), capMat);
      cap.position.set(x, H + 1.4, z); this.scene.add(cap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.12, 8, 22), nm);
      ring.position.set(x, H + 0.2, z); ring.rotation.x = Math.PI / 2; this.scene.add(ring);
    }
  }

  // A brazier: a stone bowl on a plinth with a glowing ember core (bloom does
  // the fire glow — no point light needed).
  _brazier(x, z, color) {
    const stone = new THREE.MeshStandardMaterial({ color: 0x8f7d5c, roughness: 0.9 });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 3.4, 10), stone);
    plinth.position.set(x, 1.7, z); this._addCollider(plinth);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.9, 1.0, 12), stone);
    bowl.position.set(x, 3.6, z); this.scene.add(bowl);
    const emberMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.4, roughness: 0.5 });
    const ember = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), emberMat);
    ember.position.set(x, 4.2, z); ember.scale.y = 1.3; this.scene.add(ember);
    this._pulseMats.push(emberMat);
  }

  // One solid stone ziggurat tier: a full-height box collider with a walkable
  // top platform (set a hair above the box so ramp lips read clean) and a
  // glowing edge band.
  _tier(cx, cz, w, d, h, mat, trimColor) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    box.position.set(cx, h / 2, cz);
    box.castShadow = true; box.receiveShadow = true;
    box.matrixAutoUpdate = false; box.updateMatrix(); box.updateMatrixWorld(true);
    this.scene.add(box);
    this.colliders.push({
      box: new THREE.Box3(new THREE.Vector3(cx - w / 2, 0, cz - d / 2),
                          new THREE.Vector3(cx + w / 2, h, cz + d / 2)),
      mesh: box,
    });
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.28, d + 0.5), this._neonMat(trimColor));
    band.position.set(cx, h + 0.02, cz); this.scene.add(band);
    this.platforms.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, y0: h + 0.08, y1: h + 0.08 });
  }

  // The colossal seated guardian. `baseY` is the pedestal top. Built from big
  // primitives (colliders for the main mass) with a helmeted head — a callback
  // to the soldier helmet — and walkable lap + shoulder perches.
  _colossus(baseY, mats, C) {
    const b = mats.bronze, bd = mats.bronzeD;
    const glow = this._neonMat(C.TEAL), glowB = this._neonMat(C.BLUE);
    const y = (v) => baseY + v;   // height above the pedestal

    const solid = (cx, cy, cz, w, h, d, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(cx, cy, cz); m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      this.colliders.push({ box: new THREE.Box3(
        new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
        new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2)), mesh: m });
      return m;
    };
    const deco = (geo, mat, x, yy, z) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, yy, z); m.castShadow = true;
      this.scene.add(m); return m;
    };

    // A scaled sphere (baked non-uniform scale) — for smooth helmet/pauldron forms.
    const ss = (r, sx, sy, sz) => { const g = new THREE.SphereGeometry(r, 22, 16); g.scale(sx, sy, sz); return g; };

    // The Warden is a colossal HELMETED BUST — head + shoulders rising from the
    // dais (a giant version of the soldier helmet). A bust reads as a grand
    // monument and avoids the janky look of a full box-figure.

    // Great obelisk far behind — the skyline spike.
    const ob = deco(new THREE.CylinderGeometry(0.7, 2.4, 46, 4), bd, 0, y(31), -14);
    ob.rotation.y = Math.PI / 4;
    this.colliders.push({ box: new THREE.Box3(new THREE.Vector3(-2.4, baseY, -16.4), new THREE.Vector3(2.4, baseY + 46, -11.6)), mesh: ob });
    deco(new THREE.ConeGeometry(1.3, 4, 4), glow, 0, y(56), -14).rotation.y = Math.PI / 4;
    for (const s of [-1, 1]) deco(new THREE.BoxGeometry(0.16, 42, 0.16), glow, s * 1.1, y(30), -12.9);

    // ── Shoulders / chest rising from the pedestal, with rounded pauldrons ──
    solid(0, y(5), -1, 25, 12, 16, b);                        // chest mass
    deco(ss(6.4, 1.0, 0.9, 1.0), b,  11.5, y(8), 0.5);        // right pauldron dome
    deco(ss(6.4, 1.0, 0.9, 1.0), b, -11.5, y(8), 0.5);        // left pauldron dome
    deco(new THREE.TorusGeometry(3.2, 0.5, 10, 24), glowB, 0, y(7), 8.2).rotation.x = 0.3; // chest sigil ring
    deco(new THREE.OctahedronGeometry(2.0), glowB, 0, y(7), 8.4);   // chest core
    solid(0, y(12), -1, 11, 6, 10, bd);                      // gorget / neck

    // ── Colossal helmet (giant soldier helmet: shell + dark visor band) ──
    const HY = y(21);
    deco(ss(6.8, 1.0, 1.06, 1.02), b, 0, HY, -1);            // shell
    deco(ss(5.9, 1.0, 0.5, 0.34), mats.visor, 0, HY - 0.4, 5.0);    // dark visor band (front)
    deco(new THREE.BoxGeometry(8.6, 0.9, 0.6), glowB, 0, HY - 0.1, 6.7);   // glowing eye-line
    deco(new THREE.BoxGeometry(11.2, 1.8, 2.4), b, 0, HY + 3.0, 4.4);      // brow
    deco(new THREE.BoxGeometry(2.7, 7.5, 4.4), b,  5.3, HY - 1.8, 3.6);    // right cheek
    deco(new THREE.BoxGeometry(2.7, 7.5, 4.4), b, -5.3, HY - 1.8, 3.6);    // left cheek
    deco(new THREE.BoxGeometry(7.6, 3.0, 3.4), bd, 0, HY - 5.2, 4.4);      // jaw / breather
    deco(new THREE.BoxGeometry(1.4, 2.6, 11.5), b, 0, HY + 6.0, -1);       // crest (front→back ridge)
    deco(new THREE.BoxGeometry(2.6, 6.0, 6.0), bd,  6.4, HY - 0.6, -1);    // right comms
    deco(new THREE.BoxGeometry(2.6, 6.0, 6.0), bd, -6.4, HY - 0.6, -1);    // left comms
    const shell = deco(ss(0.1, 1, 1, 1), b, 0, HY, -1); shell.visible = false;
    this.colliders.push({ box: new THREE.Box3(new THREE.Vector3(-7.2, HY - 7, -8), new THREE.Vector3(7.2, HY + 7, 6)), mesh: shell });

    // Floating halo above the head (spins).
    const halo = deco(new THREE.TorusGeometry(8.6, 0.32, 12, 48), glow, 0, y(31), -1);
    halo.rotation.x = Math.PI / 2;
    this._spinRings.push({ mesh: halo, speed: 0.3 });

    // Walkable perch: the chest/shoulder deck, right in front of the giant face.
    this.platforms.push({ minX: -9, maxX: 9, minZ: 1.5, maxZ: 8, y0: y(11.1), y1: y(11.1) });   // ≈ 25
  }

  // A corner shrine: a stepped walkable base topped by a glowing obelisk crystal.
  _shrine(x, z, color) {
    const stone = new THREE.MeshStandardMaterial({ color: 0xb0a07e, roughness: 0.9 });
    const nm = this._neonMat(color);
    const base = new THREE.Mesh(new THREE.BoxGeometry(12, 2, 12), stone);
    base.position.set(x, 1, z); base.castShadow = true; base.receiveShadow = true;
    base.matrixAutoUpdate = false; base.updateMatrix(); base.updateMatrixWorld(true);
    this.scene.add(base);
    this.colliders.push({ box: new THREE.Box3(new THREE.Vector3(x - 6, 0, z - 6), new THREE.Vector3(x + 6, 2, z + 6)), mesh: base });
    this.platforms.push({ minX: x - 6, maxX: x + 6, minZ: z - 6, maxZ: z + 6, y0: 2.08, y1: 2.08 });
    const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 14, 4), stone);
    ob.position.set(x, 9, z); ob.rotation.y = Math.PI / 4; ob.castShadow = true; this.scene.add(ob);
    this.colliders.push({ box: new THREE.Box3(new THREE.Vector3(x - 1.4, 2, z - 1.4), new THREE.Vector3(x + 1.4, 16, z + 1.4)), mesh: ob });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), nm);
    crystal.position.set(x, 17.6, z); this.scene.add(crystal);
    this._spinRings.push({ mesh: crystal, speed: 0.8 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.1, 8, 24), nm);
    ring.position.set(x, 2.3, z); ring.rotation.x = Math.PI / 2; this.scene.add(ring);
  }

  // Daytime Rook, rebuilt from the complete official node 755 reference.
  // The visual hierarchy is deliberately asymmetric: a suspended left mass,
  // a diagonal-braced central tower, a stepped right facade and a sunken stair.
  _buildRookArena() {
    const mats = {
      floor: new THREE.MeshStandardMaterial({ color: 0xb4b7b7, roughness: 0.78, metalness: 0.12 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x535250, roughness: 0.78, metalness: 0.12 }),
      wallLight: new THREE.MeshStandardMaterial({ color: 0x74736e, roughness: 0.76, metalness: 0.1 }),
      wallDark: new THREE.MeshStandardMaterial({ color: 0x343840, roughness: 0.7, metalness: 0.22 }),
      trim: new THREE.MeshStandardMaterial({ color: 0x202633, roughness: 0.58, metalness: 0.38 }),
      inset: new THREE.MeshStandardMaterial({ color: 0x8b7d6e, roughness: 0.9, metalness: 0.02 }),
      recess: new THREE.MeshStandardMaterial({ color: 0x171c24, roughness: 0.72, metalness: 0.28 }),
      stair: new THREE.MeshStandardMaterial({ color: 0x75473d, roughness: 0.86, metalness: 0.04 }),
      gold: new THREE.MeshStandardMaterial({
        color: 0xc9b56c, roughness: 0.48, metalness: 0.18,
        emissive: 0x6f4718, emissiveIntensity: 0.16,
      }),
      cyan: new THREE.MeshStandardMaterial({
        color: 0x8deaff, roughness: 0.3, metalness: 0.2,
        emissive: 0x3dc8ef, emissiveIntensity: 0.85,
      }),
    };

    const add = (mesh, collider = false) => {
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      if (collider) this._addCollider(mesh);
      else this.scene.add(mesh);
      return mesh;
    };
    const box = (w, h, d, mat, x, y, z, collider = false, walkable = false) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      add(mesh, collider);
      if (walkable) {
        this.platforms.push({
          minX: x - w / 2, maxX: x + w / 2,
          minZ: z - d / 2, maxZ: z + d / 2,
          y0: y + h / 2 + 0.04, y1: y + h / 2 + 0.04,
        });
      }
      return mesh;
    };
    const decor = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      mesh.userData.noHit = true;
      return add(mesh);
    };
    const ramp = (minX, maxX, minZ, maxZ, y0, y1, axis, mat = mats.floor) => {
      const w = maxX - minX, d = maxZ - minZ;
      const run = axis === 'x' ? w : d;
      const rise = y1 - y0;
      const len = Math.hypot(run, rise);
      const mesh = new THREE.Mesh(
        axis === 'x' ? new THREE.BoxGeometry(len, 0.5, d) : new THREE.BoxGeometry(w, 0.5, len),
        mat
      );
      mesh.position.set((minX + maxX) / 2, (y0 + y1) / 2, (minZ + maxZ) / 2);
      const a = Math.atan2(rise, run);
      if (axis === 'x') mesh.rotation.z = -a;
      else mesh.rotation.x = a;
      add(mesh);
      this.platforms.push({ minX, maxX, minZ, maxZ, y0, y1, axis });
      return mesh;
    };
    const pod = (x, y, z, axis = 'z', colorMat = mats.gold) => {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.15, 6), mats.trim);
      shell.position.set(x, y, z);
      if (axis === 'z') shell.rotation.x = Math.PI / 2;
      else shell.rotation.z = Math.PI / 2;
      add(shell);
      const lens = new THREE.Mesh(new THREE.BoxGeometry(
        axis === 'x' ? 0.12 : 0.46, 0.22, axis === 'z' ? 0.12 : 0.46
      ), colorMat);
      lens.position.set(
        x + (axis === 'x' ? -0.62 : 0),
        y,
        z + (axis === 'z' ? 0.62 : 0)
      );
      add(lens);
    };
    const faceFrame = (x, y, z, w, h, axis = 'z') => {
      const alongZ = axis === 'z';
      decor(alongZ ? w : 0.34, h, alongZ ? 0.34 : w, mats.wallDark, x, y, z);
      for (const s of [-1, 1]) {
        decor(
          alongZ ? 0.7 : 0.28, h + 0.8, alongZ ? 0.28 : 0.7, mats.trim,
          alongZ ? x + s * (w / 2 - 0.35) : x,
          y,
          alongZ ? z : z + s * (w / 2 - 0.35)
        );
      }
      decor(
        alongZ ? w : 0.28, 0.65, alongZ ? 0.28 : w, mats.trim,
        x, y + h / 2 - 0.32, z
      );
    };

    // ── Enclosing shell and the distant circular objective gate ────────────
    box(126, 18, 4, mats.wallDark, 0, 9, -61, true);
    box(126, 12, 4, mats.wallLight, 0, 6, 61, true);
    box(4, 18, 126, mats.wallDark, -61, 9, 0, true);
    box(4, 18, 126, mats.wall, 61, 9, 0, true);

    box(54, 26, 6, mats.wall, 0, 13, -57, true);
    box(22, 15, 0.8, mats.recess, 0, 8, -53.6);
    for (const x of [-21, -15, 15, 21]) box(3.2, 22, 2.2, mats.trim, x, 12, -53.8);
    const gateRing = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.75, 8, 28), mats.wallLight);
    gateRing.position.set(0, 8.5, -52.9);
    add(gateRing);
    const gateCore = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.0, 0.55, 12), mats.wallDark);
    gateCore.position.set(0, 8.5, -53.1);
    gateCore.rotation.x = Math.PI / 2;
    add(gateCore);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.18), mats.gold);
      light.position.set(Math.cos(a) * 3.2, 8.5 + Math.sin(a) * 3.2, -52.72);
      light.rotation.z = a;
      add(light);
    }

    // ── Huge suspended left block: Rook's dominant silhouette ─────────────
    box(11, 15, 20, mats.wallDark, -51, 7.5, -14, true);
    box(10, 16, 16, mats.wallDark, -25, 8, -14, true);
    box(36, 18, 28, mats.wall, -38, 24, -14, true, true);
    box(39, 2.4, 31, mats.trim, -38, 33.7, -14);
    box(30, 9, 0.8, mats.inset, -38, 23, 0.35);
    for (const x of [-50, -38, -26]) {
      decor(2.4, 14, 1.0, mats.trim, x, 23, 0.85);
      pod(x, 17.2, 1.45, 'z');
    }
    // Tapered underside and front lip, visible while running beneath it.
    decor(29, 2.4, 19, mats.inset, -38, 14.9, -14, 0.18, 0, 0);
    decor(38, 2.0, 3.2, mats.trim, -38, 15.7, 0.5);
    for (const x of [-49, -37, -25]) decor(2.2, 7.5, 2.2, mats.wallLight, x, 10.5, -1.0);

    // Angular left foreground bastion and the luminous Rook-style sigil.
    box(18, 30, 25, mats.wallDark, -53, 15, 32, true, true);
    box(15, 18, 0.8, mats.wall, -53, 17, 18.9);
    const sigil = new THREE.Group();
    for (const [x, y, w, h, rz] of [
      [0, 2.8, 5.4, 0.65, 0], [-3.3, 0.5, 0.55, 5.2, 0.18],
      [3.3, 0.5, 0.55, 5.2, -0.18], [0, 0.2, 3.0, 0.55, 0],
      [-1.2, -1.1, 0.55, 2.4, -0.75], [1.2, -1.1, 0.55, 2.4, 0.75],
    ]) {
      const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.16), mats.gold);
      part.position.set(x, y, 0);
      part.rotation.z = rz;
      sigil.add(part);
    }
    sigil.position.set(-53, 20, 18.35);
    this.scene.add(sigil);
    pod(-57.8, 9, 18.5, 'z');

    // ── Central-right monolith with its unmistakable diagonal brace ────────
    box(23, 38, 25, mats.wall, 17, 19, -10, true, true);
    box(25, 3, 27, mats.trim, 17, 38.2, -10);
    faceFrame(17, 16, 2.7, 17, 17, 'z');
    decor(4.0, 31, 1.25, mats.trim, 18.5, 17, 3.55, 0, 0, -0.58);
    decor(2.0, 18, 1.0, mats.wallLight, 8.3, 16, 3.65);
    pod(18, 10, 4.0, 'z');
    pod(11.2, 30, 4.0, 'z');
    // A wraparound balcony gives the monolith a real high-control route.
    box(31, 1.4, 8, mats.floor, 17, 10.3, 6.2, true, true);
    decor(31, 0.35, 0.35, mats.gold, 17, 11.15, 10.05);

    // ── Right stepped facade with the large E-shaped relief ────────────────
    box(22, 29, 49, mats.wall, 49, 14.5, -3, true, true);
    box(4, 31, 51, mats.trim, 38.8, 15.5, -3);
    for (const z of [-20, -5, 10]) faceFrame(37.7, 11, z, 10, 13, 'x');
    // Oversized horizontal relief bars on the inner face.
    for (const [z, len] of [[-21, 13], [-12, 8], [-2, 12], [9, 7], [19, 12]]) {
      decor(0.65, 2.2, len, mats.trim, 37.35, 16.5, z);
    }
    pod(37.0, 7.2, -25, 'x');
    pod(37.0, 7.2, 20, 'x');

    // A second right skyline slab creates the tight outer service canyon.
    box(12, 37, 22, mats.wallDark, 55, 18.5, 39, true, true);
    box(14, 2.1, 24, mats.trim, 55, 38.3, 39);
    for (const y of [8, 18, 28]) decor(0.8, 1.4, 14, mats.wallLight, 48.6, y, 39);

    // ── Mid-height route: bridge, ramp and underpass around the monoliths ───
    box(25, 1.4, 7, mats.floor, -4, 9.3, -18, true, true);
    decor(25, 0.35, 0.35, mats.gold, -4, 10.15, -14.7);
    box(12, 9, 7, mats.wallDark, -16, 4.5, -18, true);
    ramp(-7, 1, -36, -21, 0, 9.0, 'z', mats.floor);
    ramp(-20, -10, -7, 7, 0, 9.0, 'x', mats.floor);
    box(17, 1.3, 10, mats.floor, -1, 9.25, 0, true, true);
    ramp(29, 39, 8, 18, 9.0, 0, 'x', mats.floor);
    box(18, 1.3, 10, mats.floor, 30, 9.25, -32, true, true);
    box(12, 8.6, 10, mats.wallDark, 37, 4.3, -32, true);

    // ── Recessed rust-red stairwell in the foreground ──────────────────────
    box(18, 0.25, 20, mats.recess, 8, 0.12, 38);
    box(2.0, 5.5, 21, mats.wallDark, -2, 2.75, 38, true);
    box(2.0, 5.5, 21, mats.wallDark, 18, 2.75, 38, true);
    const stairCount = 11;
    for (let i = 0; i < stairCount; i++) {
      const y = 0.22 + i * 0.36;
      const z = 46 - i * 1.28;
      box(15.5, 0.42, 1.45, mats.stair, 8, y, z);
      this.platforms.push({
        minX: 0.25, maxX: 15.75, minZ: z - 0.73, maxZ: z + 0.73,
        y0: y + 0.23, y1: y + 0.23,
      });
      if (i % 3 === 1) decor(0.7, 0.12, 0.3, mats.gold, 0.7, y + 0.28, z);
    }
    box(20, 1.2, 13, mats.floor, 8, 4.8, 26, true, true);

    // Left circular landing and stacked trim rings visible in the reference.
    const landing = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.8, 2.2, 12), mats.wall);
    landing.position.set(-48, 1.1, 49);
    add(landing, true);
    this.platforms.push({ minX: -56, maxX: -40, minZ: 41, maxZ: 57, y0: 2.24, y1: 2.24 });
    for (const [r, y, tube, mat] of [[9.7, 0.3, 0.25, mats.trim], [9.2, 2.25, 0.18, mats.gold]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 36), mat);
      ring.position.set(-48, y, 49);
      ring.rotation.x = Math.PI / 2;
      add(ring);
    }

    // ── Ground cover that echoes Rook's square crates and short terminals ───
    for (const [x, z, w, h, d, mat] of [
      [-23, 22, 5, 3.2, 5, mats.wallDark], [-10, 12, 3.5, 4.2, 3.5, mats.wall],
      [29, 30, 6, 2.5, 4, mats.wallDark], [27, -44, 5, 3.5, 5, mats.wall],
      [-32, -45, 6, 2.7, 4, mats.wallDark], [-5, -39, 3.5, 4.5, 3.5, mats.wall],
    ]) {
      box(w, h, d, mat, x, h / 2, z, true, h <= 3.2);
      decor(w * 0.55, 0.18, d + 0.06, mats.gold, x, h * 0.68, z);
    }

    // Small recessed wall lamps repeat at human scale to sell the map's size.
    for (const [x, y, z, axis] of [
      [-57.8, 5, -40, 'z'], [-57.8, 5, 5, 'z'], [-57.8, 5, 47, 'z'],
      [57.8, 6, -38, 'z'], [57.8, 6, 14, 'z'], [57.8, 6, 48, 'z'],
      [-20, 5, -54, 'z'], [22, 5, -54, 'z'],
    ]) pod(x, y, z, axis);

    // Node 755 identifies Dust as the environment effect. Keep it sparse so it
    // reads in sunbeams without turning the bright map into visual noise.
    const dustCount = Math.floor(260 * this._lod);
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 122;
      dustPos[i * 3 + 1] = 0.5 + Math.random() * 38;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 122;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0xe6d5b6, size: 0.1, transparent: true, opacity: 0.32, depthWrite: false,
      })
    );
    dust.frustumCulled = false;
    this.scene.add(dust);
    this._dustField = dust;
  }

  // Winter-Graveyard, rebuilt from the complete official node 644 reference.
  // The original .evmap is a proprietary binary, so this is a geometry-level
  // recreation of the full visible composition rather than an asset import.
  _buildWinterGraveyard() {
    const mats = {
      snow: new THREE.MeshStandardMaterial({ color: 0xf2e9ef, roughness: 1 }),
      snowShade: new THREE.MeshStandardMaterial({ color: 0xd6c8d2, roughness: 1 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x9b8294, roughness: 0.94 }),
      stoneLight: new THREE.MeshStandardMaterial({ color: 0xb6a0ae, roughness: 0.92 }),
      stoneDark: new THREE.MeshStandardMaterial({ color: 0x665365, roughness: 0.96 }),
      recess: new THREE.MeshStandardMaterial({ color: 0x342b3b, roughness: 1 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xc99c39, roughness: 0.7, metalness: 0.18 }),
      green: new THREE.MeshStandardMaterial({ color: 0x2c7a32, roughness: 0.82 }),
      bark: new THREE.MeshStandardMaterial({ color: 0x43352f, roughness: 1 }),
      rock: new THREE.MeshStandardMaterial({ color: 0x887486, roughness: 1 }),
      red: new THREE.MeshStandardMaterial({ color: 0xc8313b, roughness: 0.68 }),
      white: new THREE.MeshStandardMaterial({ color: 0xf8eef2, roughness: 0.8 }),
      ginger: new THREE.MeshStandardMaterial({ color: 0xb7783e, roughness: 0.9 }),
      wire: new THREE.MeshBasicMaterial({ color: 0x29212b }),
    };

    const add = (mesh, collider = false) => {
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      if (collider) this._addCollider(mesh);
      else this.scene.add(mesh);
      return mesh;
    };
    const box = (w, h, d, mat, x, y, z, collider = false, walkable = false) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      add(mesh, collider);
      if (walkable) {
        this.platforms.push({
          minX: x - w / 2, maxX: x + w / 2,
          minZ: z - d / 2, maxZ: z + d / 2,
          y0: y + h / 2 + 0.04, y1: y + h / 2 + 0.04,
        });
      }
      return mesh;
    };
    const cylinderBetween = (a, b, radius, mat, segments = 7) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.86, radius, dir.length(), segments),
        mat
      );
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      return add(mesh);
    };
    const ramp = (minX, maxX, minZ, maxZ, y0, y1, axis, mat) => {
      const w = maxX - minX;
      const d = maxZ - minZ;
      const run = axis === 'x' ? w : d;
      const rise = y1 - y0;
      const len = Math.hypot(run, rise);
      const mesh = new THREE.Mesh(
        axis === 'x' ? new THREE.BoxGeometry(len, 0.55, d) : new THREE.BoxGeometry(w, 0.55, len),
        mat
      );
      mesh.position.set((minX + maxX) / 2, (y0 + y1) / 2, (minZ + maxZ) / 2);
      const angle = Math.atan2(rise, run);
      if (axis === 'x') mesh.rotation.z = -angle;
      else mesh.rotation.x = angle;
      add(mesh);
      this.platforms.push({ minX, maxX, minZ, maxZ, y0, y1, axis });
      return mesh;
    };

    // ── Monumental sealed gate and rear curtain wall ───────────────────────
    box(126, 20, 5, mats.stoneDark, 0, 10, -59.5, true);
    box(42, 30, 5.8, mats.stone, 0, 15, -57.5, true);
    box(34, 23, 0.7, mats.recess, 0, 11.5, -54.25);
    box(25, 18, 0.5, mats.stoneDark, 0, 9, -53.8);

    // Layered gate frame and the vertical gold-lit ribs visible in the source.
    for (const [w, h, x] of [[2.2, 25, -16], [2.2, 25, 16], [1.2, 21, -12.5], [1.2, 21, 12.5]]) {
      box(w, h, 1.15, mats.stoneLight, x, h / 2 + 1.2, -53.6);
    }
    for (const x of [-9.3, -6.2, 6.2, 9.3]) box(0.42, 15.5, 0.32, mats.gold, x, 8.3, -53.32);
    box(18, 1.4, 0.9, mats.stoneLight, 0, 18.1, -53.45);
    const gateCrown = new THREE.Mesh(new THREE.CylinderGeometry(12.5, 12.5, 0.75, 8, 1, false, 0, Math.PI), mats.stoneLight);
    gateCrown.rotation.x = Math.PI / 2;
    gateCrown.rotation.z = Math.PI / 2;
    gateCrown.position.set(0, 18.1, -53.55);
    gateCrown.scale.set(1, 0.62, 1);
    add(gateCrown);

    // Buttresses, arrow slits, panel relief and continuous battlements.
    for (const x of [-52, -39, -26, 26, 39, 52]) {
      box(5.5, 23, 7.2, mats.stone, x, 11.5, -57, true);
      box(1.5, 15, 1, mats.stoneLight, x, 10.2, -53.15);
      box(0.75, 3.6, 0.28, mats.gold, x, 9.8, -52.55);
    }
    for (let x = -59; x <= 59; x += 6) {
      box(3.2, 3.2, 4.8, x % 12 === 1 ? mats.stoneLight : mats.stone, x, 21.6, -58.6);
    }

    // The map's signature nested crescent/rib monument in front of the gate.
    for (let i = 0; i < 7; i++) {
      const radius = 8.5 + i * 1.18;
      const rib = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.23 + i * 0.025, 7, 48, Math.PI * 1.53),
        i < 2 ? mats.snow : mats.stoneLight
      );
      rib.position.set(-1.8 + i * 0.25, 7.7, -48.2 + i * 0.42);
      rib.rotation.z = -0.2 - i * 0.012;
      add(rib);
      const tipAngle = Math.PI * 1.53 - 0.02;
      const tx = rib.position.x + Math.cos(tipAngle + rib.rotation.z) * radius;
      const ty = rib.position.y + Math.sin(tipAngle + rib.rotation.z) * radius;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 6), mats.stoneLight);
      tip.position.set(tx, ty, rib.position.z);
      tip.rotation.z = 0.35;
      add(tip);
    }

    // Central holiday wreath and bow.
    const wreath = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.58, 8, 24), mats.green);
    wreath.position.set(0, 11.6, -46.65);
    add(wreath);
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      const colors = [0xff3b47, 0x49ef75, 0xffdc48, 0x57d8ff];
      const bulbMat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length] });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), bulbMat);
      bulb.position.set(Math.cos(a) * 2.56, Math.sin(a) * 2.56, 0.5);
      wreath.add(bulb);
    }
    const bowL = box(1.65, 1.15, 0.35, mats.red, -0.8, 8.85, -46.35);
    bowL.rotation.z = 0.45;
    const bowR = box(1.65, 1.15, 0.35, mats.red, 0.8, 8.85, -46.35);
    bowR.rotation.z = -0.45;

    // ── Raised right-side keep, arches and playable parapet ────────────────
    box(11, 20, 93, mats.stone, 52.5, 10, -4.5, true, true);
    box(6.5, 5, 94, mats.stoneDark, 57.5, 22.5, -4.5, true);
    for (let z = -45; z <= 40; z += 10) {
      box(5.2, 3.2, 5.3, mats.stoneLight, 49.4, 21.65, z);
    }
    for (const z of [-39, -23, -7, 9, 25]) {
      box(0.3, 7.3, 8.4, mats.recess, 46.82, 8.0, z);
      box(1.35, 15.6, 1.5, mats.stoneLight, 46.45, 8.2, z - 5.0);
      box(1.35, 15.6, 1.5, mats.stoneLight, 46.45, 8.2, z + 5.0);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.65, 6, 18, Math.PI), mats.stoneLight);
      arch.position.set(46.55, 11.7, z);
      arch.rotation.y = Math.PI / 2;
      add(arch);
    }
    // Bridge from the keep toward the gate and a broad snow ramp onto it.
    box(28, 2.1, 8, mats.stoneLight, 36, 16.2, -34, true, true);
    box(28, 0.55, 0.5, mats.snow, 36, 17.55, -30.2);
    ramp(40, 47, -4, 19, 0, 20.05, 'z', mats.stoneLight);
    box(1.1, 6.4, 24, mats.stone, 39.45, 3.2, 7.5, true);

    // Keep tower and angular crown above the right skyline.
    box(16, 12, 17, mats.stoneDark, 50, 27, -32, true, true);
    box(12, 6, 13, mats.stone, 50, 36, -32, true);
    for (const x of [44, 50, 56]) {
      const spire = new THREE.Mesh(new THREE.ConeGeometry(1.1, 7, 4), mats.stoneDark);
      spire.position.set(x, 42.5, -32);
      spire.rotation.y = Math.PI / 4;
      add(spire);
    }

    // ── Left canyon wall and the enclosing snow cliffs ─────────────────────
    box(5, 20, 116, mats.rock, -60, 10, 0, true);
    box(120, 12, 5, mats.rock, 0, 6, 60, true);
    const cliffData = [
      [-54, -46, 11, 15, 10], [-51, -31, 9, 12, 13], [-55, -15, 12, 18, 12],
      [-52, 5, 10, 13, 15], [-55, 24, 11, 16, 12], [-51, 43, 8, 11, 14],
      [-40, 54, 12, 8, 11], [-20, 57, 10, 7, 8], [20, 57, 11, 8, 9],
    ];
    for (let i = 0; i < cliffData.length; i++) {
      const [x, z, sx, sy, sz] = cliffData[i];
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(3.5, 0), mats.rock);
      rock.scale.set(sx / 7, sy / 7, sz / 7);
      rock.position.set(x, sy * 0.44, z);
      rock.rotation.set(i * 0.17, i * 0.41, i * 0.09);
      add(rock);
      this.colliders.push({
        box: new THREE.Box3(
          new THREE.Vector3(x - sx * 0.44, 0, z - sz * 0.44),
          new THREE.Vector3(x + sx * 0.44, sy * 0.9, z + sz * 0.44)
        ),
        mesh: null,
      });
      const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(2.7, 1), mats.snow);
      cap.scale.set(sx / 8, 0.48, sz / 8);
      cap.position.set(x - 0.3, sy * 0.83, z);
      add(cap);
    }

    // ── Snowbanks shape the three ground-level combat lanes ────────────────
    const bankData = [
      [-33, -38, 13, 2.6, 7, 0.12], [-18, -29, 11, 2.1, 5, -0.15],
      [18, -25, 14, 2.4, 6, 0.18], [32, -15, 9, 2.0, 6, -0.08],
      [-28, -2, 12, 2.2, 5, 0.1], [-7, 8, 15, 1.8, 5, -0.06],
      [24, 18, 12, 2.1, 6, 0.18], [-29, 31, 14, 2.6, 8, -0.2],
      [5, 42, 17, 2.0, 6, 0.08], [38, 40, 8, 2.4, 8, 0.2],
    ];
    for (let i = 0; i < bankData.length; i++) {
      const [x, z, sx, sy, sz, ry] = bankData[i];
      const bank = new THREE.Mesh(new THREE.IcosahedronGeometry(2.8, 1), i % 3 ? mats.snow : mats.snowShade);
      bank.scale.set(sx / 5.6, sy / 5.6, sz / 5.6);
      bank.position.set(x, sy * 0.34, z);
      bank.rotation.set(0, ry, 0);
      add(bank);
      if (i === 0 || i === 2 || i === 7) {
        this.colliders.push({
          box: new THREE.Box3(
            new THREE.Vector3(x - sx * 0.42, 0, z - sz * 0.42),
            new THREE.Vector3(x + sx * 0.42, sy * 0.75, z + sz * 0.42)
          ),
          mesh: null,
        });
      }
    }

    // Angular boulder cover scattered through the basin.
    for (const [x, z, s, r] of [
      [-37, 14, 2.7, 0.2], [-16, 28, 2.2, 1.0], [12, 17, 2.1, 0.5],
      [35, 30, 2.6, 0.8], [-6, -16, 1.8, 0.1], [28, -40, 2.4, 1.2],
    ]) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mats.rock);
      rock.scale.set(1.15, 0.75, 0.9);
      rock.rotation.set(0.12, r, 0.2);
      rock.position.set(x, s * 0.58, z);
      add(rock);
      this.colliders.push({
        box: new THREE.Box3(
          new THREE.Vector3(x - s, 0, z - s * 0.78),
          new THREE.Vector3(x + s, s * 1.2, z + s * 0.78)
        ),
        mesh: null,
      });
      const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(s * 0.82, 1), mats.snow);
      cap.scale.set(1.05, 0.35, 0.8);
      cap.position.set(x, s * 1.03, z);
      add(cap);
    }

    // ── Graveyard markers across the central approach ──────────────────────
    const graveData = [
      [-24, 40, 0.1], [-10, 35, -0.08], [15, 37, 0.08], [29, 34, -0.12],
      [-34, 22, 0.1], [-17, 19, -0.06], [5, 24, 0.06], [21, 8, -0.08],
      [-24, 1, 0.12], [2, -1, -0.08], [-12, -18, 0.06], [16, -15, -0.1],
      [-26, -33, 0.08], [8, -33, -0.04], [27, -29, 0.1],
    ];
    for (let i = 0; i < graveData.length; i++) {
      const [x, z, tilt] = graveData[i];
      const group = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.75, 0.38), i % 3 ? mats.stoneDark : mats.stone);
      slab.position.y = 1.15;
      group.add(slab);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.575, 0.575, 0.38, 8, 1, false, 0, Math.PI), slab.material);
      crown.rotation.x = Math.PI / 2;
      crown.rotation.z = Math.PI / 2;
      crown.position.y = 2.02;
      group.add(crown);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.28, 0.75), mats.snowShade);
      foot.position.y = 0.14;
      group.add(foot);
      group.position.set(x, 0, z);
      group.rotation.z = tilt;
      group.rotation.y = (i % 5 - 2) * 0.12;
      add(group);
      if (i % 3 === 0) {
        this.colliders.push({
          box: new THREE.Box3(
            new THREE.Vector3(x - 0.65, 0, z - 0.45),
            new THREE.Vector3(x + 0.65, 2.2, z + 0.45)
          ),
          mesh: null,
        });
      }
    }

    // ── Candy cane and gingerbread holiday props on the right bank ─────────
    const cane = new THREE.Group();
    const caneStem = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 7, 10), mats.white);
    caneStem.position.y = 3.5;
    cane.add(caneStem);
    const caneHook = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.43, 9, 24, Math.PI), mats.white);
    caneHook.position.set(-1.7, 7, 0);
    caneHook.rotation.z = Math.PI;
    cane.add(caneHook);
    for (let y = 0.8; y < 6.9; y += 1.2) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.12, 5, 10), mats.red);
      stripe.rotation.x = Math.PI / 2;
      stripe.position.y = y;
      cane.add(stripe);
    }
    cane.position.set(34, 1, 14);
    cane.rotation.set(0.08, -0.35, -0.12);
    add(cane);

    const ginger = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(2.1, 3.1, 0.55), mats.ginger);
    torso.position.y = 3.1;
    ginger.add(torso);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.65, 10), mats.ginger);
    head.rotation.x = Math.PI / 2;
    head.position.y = 5.3;
    ginger.add(head);
    cylinderBetween(new THREE.Vector3(37.4, 4, 13.7), new THREE.Vector3(40.2, 4.8, 13.7), 0.35, mats.ginger);
    cylinderBetween(new THREE.Vector3(37.4, 4, 13.7), new THREE.Vector3(34.8, 5, 13.7), 0.35, mats.ginger);
    ginger.position.set(37.4, 0.5, 13.7);
    add(ginger);

    // ── Bare trees and strings of colored holiday bulbs ────────────────────
    const bulbColors = [0xff4054, 0x53ff7f, 0x42c7ff, 0xffdb45];
    const lightString = (a, b, count = 12) => {
      cylinderBetween(a, b, 0.035, mats.wire, 5);
      for (let i = 0; i <= count; i++) {
        const p = a.clone().lerp(b, i / count);
        p.y -= Math.sin(i / count * Math.PI) * 0.45;
        const bulb = new THREE.Mesh(
          new THREE.ConeGeometry(0.11, 0.34, 5),
          new THREE.MeshBasicMaterial({ color: bulbColors[i % bulbColors.length] })
        );
        bulb.position.copy(p);
        bulb.rotation.z = Math.PI;
        add(bulb);
      }
    };
    const bareTree = (x, y, z, scale = 1) => {
      const root = new THREE.Vector3(x, y, z);
      const trunkTop = new THREE.Vector3(x + 0.4 * scale, y + 7.2 * scale, z);
      cylinderBetween(root, trunkTop, 0.34 * scale, mats.bark);
      const ends = [
        new THREE.Vector3(x - 3.2 * scale, y + 10.4 * scale, z + 0.6),
        new THREE.Vector3(x + 3.8 * scale, y + 11.2 * scale, z - 0.3),
        new THREE.Vector3(x - 1.1 * scale, y + 13.2 * scale, z),
      ];
      for (let i = 0; i < ends.length; i++) {
        const fork = new THREE.Vector3(x + (i - 1) * 0.6, y + 6.2 * scale, z);
        cylinderBetween(fork, ends[i], 0.2 * scale, mats.bark);
        const twig = ends[i].clone().add(new THREE.Vector3((i - 1) * 1.5, 2 * scale, (i % 2 ? 1 : -1) * scale));
        cylinderBetween(ends[i], twig, 0.11 * scale, mats.bark, 5);
      }
      lightString(
        new THREE.Vector3(x - 2.7 * scale, y + 9.7 * scale, z + 0.68),
        new THREE.Vector3(x + 3.25 * scale, y + 10.5 * scale, z - 0.28),
        9
      );
    };
    bareTree(49, 38, -31, 0.72);
    bareTree(50, 20.1, 22, 0.62);
    bareTree(-39, 20, -53, 0.58);
    bareTree(-47, 9, 38, 0.52);
    lightString(new THREE.Vector3(-18, 19.5, -53), new THREE.Vector3(18, 19.5, -53), 25);
    lightString(new THREE.Vector3(47, 17, -45), new THREE.Vector3(47, 17, 37), 34);

    // Gentle snowfall across the full arena; low quality uses a smaller field.
    const snowCount = Math.floor(620 * this._lod);
    const positions = new Float32Array(snowCount * 3);
    for (let i = 0; i < snowCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 122;
      positions[i * 3 + 1] = 1 + Math.random() * 42;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 122;
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const snow = new THREE.Points(
      snowGeo,
      new THREE.PointsMaterial({
        color: 0xffffff, size: this._quality === 'high' ? 0.19 : 0.14,
        transparent: true, opacity: 0.78, depthWrite: false,
      })
    );
    snow.frustumCulled = false;
    this.scene.add(snow);
    this._snowfall = snow;
  }

  _buildSpawnPoints() {
    // Rook starts are distributed across the open ground corridors and under
    // the suspended block, clear of the central monolith and recessed stairs.
    const coords = [
      [-20, 51], [27, 50], [-31, 39], [30, 38],
      [-25, 24], [-8, 20], [24, 20], [-47, 9],
      [-8, 4], [31, 3], [-48, -31], [-17, -31],
      [3, -39], [18, -45], [-45, -48], [48, -46],
    ];
    for (const [x, z] of coords) this.spawnPoints.push(new THREE.Vector3(x, 0, z));
  }

  // Animate the living city: drive flying traffic along its looping paths.
  // Called every frame by Game.js (both gameplay and the menu fly-through).
  update(dt) {
    this._clock += dt;
    if (this._dustField) {
      const attr = this._dustField.geometry.attributes.position;
      const p = attr.array;
      for (let i = 0; i < p.length; i += 3) {
        p[i] += dt * (0.08 + (i % 5) * 0.025);
        p[i + 1] += dt * (0.015 + (i % 7) * 0.004);
        if (p[i] > 61) p[i] = -61;
        if (p[i + 1] > 40) p[i + 1] = 0.5;
      }
      attr.needsUpdate = true;
    }
    if (this._snowfall) {
      const attr = this._snowfall.geometry.attributes.position;
      const p = attr.array;
      for (let i = 0; i < p.length; i += 3) {
        p[i] += dt * 0.34;
        p[i + 1] -= dt * (2.15 + (i % 9) * 0.08);
        if (p[i + 1] < 0.2) {
          p[i] = (Math.random() - 0.5) * 122;
          p[i + 1] = 38 + Math.random() * 7;
          p[i + 2] = (Math.random() - 0.5) * 122;
        } else if (p[i] > 61) {
          p[i] = -61;
        }
      }
      attr.needsUpdate = true;
    }
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

  // ── Winter-Bishop town ───────────────────────────────────────────────────────
  // Street grid: open avenues along x=0 and z=0 (|coord| < 19), cross-streets at
  // |coord| in 35..43, a wide outer ring, and a central plaza with the round
  // pavilion. 16 buildings in 3 rings; every roof is walkable.
  _buildWinterTown() {
    // Sci-fi battlefield palette. Key names kept (roof/trim/snow/stone/cream)
    // so every downstream reference re-themes for free:
    //   snow  -> rooftop landing-pad deck (dark alloy)
    //   stone -> structural composite (ramps/landings)
    //   cream -> pale ceramic armour plate (pavilion)
    const mats = {
      roof:  new THREE.MeshStandardMaterial({ color: 0x30363e, roughness: 0.55, metalness: 0.6 }),
      trim:  new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.45, metalness: 0.7 }),
      snow:  new THREE.MeshStandardMaterial({ color: 0x3c444e, roughness: 0.6, metalness: 0.5 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x59616c, roughness: 0.65, metalness: 0.45 }),
      cream: new THREE.MeshStandardMaterial({ color: 0xb8c2cc, roughness: 0.5, metalness: 0.4 }),
    };
    // one shared textured material per palette colour — alloy bunker walls
    const wall = (css, dark) => new THREE.MeshStandardMaterial({
      map: makeBuildingWallTexture(css, dark), roughness: 0.6, metalness: 0.45,
    });
    const CLAY  = wall('#4a5260', '#14181f');  // steel blue plating
    const CLAY2 = wall('#3a4048', '#101318');  // gunmetal plating
    const SLATE = wall('#2c3440', '#0c1016');  // dark hull plating
    const TAN   = wall('#5c5a52', '#1a1812');  // olive-drab composite

    // [cx, cz, w, d, h, mat, hut?]
    const blocks = [
      // inner ring (quadrant corners around the plaza)
      [ 27,  27, 16, 16, 10, CLAY,  false],
      [-27,  27, 16, 16, 12, SLATE, true ],
      [ 27, -27, 16, 16, 11, TAN,   true ],
      [-27, -27, 16, 16,  8, CLAY2, false],
      // mid ring (along the avenues)
      [ 27,  52, 16, 18, 14, SLATE, true ], [-27,  52, 16, 18,  9, CLAY,  false],
      [ 27, -52, 16, 18, 12, TAN,   false], [-27, -52, 16, 18, 15, SLATE, true ],
      [ 52,  27, 18, 16, 10, CLAY,  false], [-52,  27, 18, 16, 13, SLATE, false],
      [ 52, -27, 18, 16, 16, CLAY2, true ], [-52, -27, 18, 16, 11, TAN,   false],
      // corner towers
      [ 52,  52, 18, 18, 18, SLATE, true ], [-52,  52, 18, 18, 13, CLAY,  false],
      [ 52, -52, 18, 18, 16, TAN,   true ], [-52, -52, 18, 18, 20, SLATE, false],
    ];
    for (const [cx, cz, w, d, h, m, hut] of blocks) this._townBuilding(cx, cz, w, d, h, m, mats, hut);

    // ── roof access: two long ramps (one per short block) + landings ──
    // SW block (-27,-27) h=8 — ramp up its west wall from the avenue.
    this._rampBox(-38.5, -35.5, -27, -1, 8.46, 0, 'z', mats.stone, 0);
    this._townLanding(-38.5, -35, -31, -27, 8.46, mats.stone);
    // NE block (27,27) h=10 — ramp up its east wall.
    this._rampBox(35.5, 38.5, 3, 29, 0, 10.46, 'z', mats.stone, 0);
    this._townLanding(35, 38.5, 29, 35, 10.46, mats.stone);

    // ── rooftop bridges across the cross-streets (slight slope between roofs) ──
    this._rampBox(-28.5, -25.5, 35, 43, 12.46, 9.46, 'z', mats.trim, 0);   // (-27,27)h12 → (-27,52)h9
    this._rampBox(25.5, 28.5, -43, -35, 12.46, 11.46, 'z', mats.trim, 0);  // (27,-52)h12 → (27,-27)h11

    // ── grav-lifts at the plaza-side corners of each inner block ──
    this._gravLift( 18,  18, 12.0, 14);
    this._gravLift(-18,  18, 14.0, 14);
    this._gravLift( 18, -18, 13.0, 14);
    this._gravLift(-18, -18, 10.0, 14);

    // ── central pavilion landmark (round two-tier platform, cream top) ──
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.3, 0.5, 24), mats.stone);
    t1.position.set(0, 0.25, 0); this.scene.add(t1);
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.5, 24), mats.cream);
    t2.position.set(0, 0.75, 0); this.scene.add(t2);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.12, 8, 32), mats.trim);
    rim.rotation.x = Math.PI / 2; rim.position.y = 1.02; this.scene.add(rim);
    const med = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.12, 16), mats.trim);
    med.position.y = 1.06; this.scene.add(med);
    this.platforms.push({ minX: -4.2, maxX: 4.2, minZ: -4.2, maxZ: 4.2, y0: 0.5, y1: 0.5 });
    this.platforms.push({ minX: -3.2, maxX: 3.2, minZ: -3.2, maxZ: 3.2, y0: 1.0, y1: 1.0 });

    // ── blast rubble hugging building bases (was snow drifts) ──
    const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.95, metalness: 0.15 });
    for (const [cx, cz, w, d] of blocks) {
      for (let i = 0; i < 2; i++) {
        const side = Math.floor(Math.random() * 4);
        const rubble = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 5), rubbleMat);
        const len = 2.5 + Math.random() * 3;
        let dx = 0, dz = 0;
        if (side === 0)      { dx =  w / 2 + 0.4; rubble.scale.set(1.1, 0.55, len); }
        else if (side === 1) { dx = -w / 2 - 0.4; rubble.scale.set(1.1, 0.55, len); }
        else if (side === 2) { dz =  d / 2 + 0.4; rubble.scale.set(len, 0.55, 1.1); }
        else                 { dz = -d / 2 - 0.4; rubble.scale.set(len, 0.55, 1.1); }
        rubble.position.set(cx + dx + (Math.random() - 0.5) * 4, 0.1, cz + dz + (Math.random() - 0.5) * 4);
        rubble.rotation.y = Math.random() * Math.PI;      // low-poly debris read
        rubble.userData.noHit = true;
        this.scene.add(rubble);
      }
    }

    // ── energy conduit lights strung across the avenues between rooflines ──
    this._bulbStrand(-19,  27, 10.5,  19,  27, 10.5);
    this._bulbStrand(-19, -27,  8.5,  19, -27,  8.5);
    this._bulbStrand( 27, -19, 10.0,  27,  19, 10.0);
    this._bulbStrand(-27, -19,  8.5, -27,  19, 12.0);
  }

  // One town building: textured walls, parapet lip, snowy walkable roof.
  _townBuilding(cx, cz, w, d, h, sideMat, mats, hut) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      [sideMat, sideMat, mats.roof, mats.roof, sideMat, sideMat]
    );
    body.position.y = h / 2;
    g.add(body);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6), mats.trim);
    lip.position.y = h + 0.1; g.add(lip);
    const snow = new THREE.Mesh(new THREE.BoxGeometry(w - 0.8, 0.22, d - 0.8), mats.snow);
    snow.position.y = h + 0.35; g.add(snow);
    if (hut) {
      const hw = Math.min(5, w * 0.35);
      const hutM = new THREE.Mesh(new THREE.BoxGeometry(hw, 2.2, hw), mats.stone);
      hutM.position.set(w * 0.16, h + 1.45, -d * 0.16); g.add(hutM);
      const hutSnow = new THREE.Mesh(new THREE.BoxGeometry(hw + 0.2, 0.16, hw + 0.2), mats.snow);
      hutSnow.position.set(w * 0.16, h + 2.62, -d * 0.16); g.add(hutSnow);
    }
    g.position.set(cx, 0, cz);
    g.updateMatrixWorld(true);
    this.scene.add(g);
    this.colliders.push({
      box: new THREE.Box3(new THREE.Vector3(cx - w / 2, 0, cz - d / 2), new THREE.Vector3(cx + w / 2, h, cz + d / 2)),
      mesh: body,
    });
    this.platforms.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, y0: h + 0.46, y1: h + 0.46 });
  }

  // Flat landing shelf joining a ramp top to a roof edge.
  _townLanding(minX, maxX, minZ, maxZ, y, mat) {
    const land = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, 0.4, maxZ - minZ), mat);
    land.position.set((minX + maxX) / 2, y - 0.2, (minZ + maxZ) / 2);
    this.scene.add(land);
    this.platforms.push({ minX, maxX, minZ, maxZ, y0: y, y1: y });
  }

  // A sagging strand of energy-conduit marker lights between two anchor points.
  _bulbStrand(x0, z0, y0, x1, z1, y1) {
    const colors = [0x33d4ff, 0x1a9fd0, 0xff9a3b, 0x33d4ff, 0x66e8ff, 0xff7a2c];
    const segs = 18;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 6, 5),
        new THREE.MeshBasicMaterial({ color: colors[i % colors.length] })
      );
      bulb.position.set(
        x0 + (x1 - x0) * t,
        y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * 1.4,
        z0 + (z1 - z0) * t
      );
      bulb.matrixAutoUpdate = false; bulb.updateMatrix();
      this.scene.add(bulb);
    }
  }

  // Battlefield props: stacked military supply crates for cover + energy
  // marker lights strung along the perimeter wall tops.
  _buildSnowProps() {
    const hull  = new THREE.MeshStandardMaterial({ color: 0x2f3a34, roughness: 0.6, metalness: 0.55 }); // olive alloy
    const band  = new THREE.MeshStandardMaterial({ color: 0x11151a, roughness: 0.45, metalness: 0.7 });
    const glow  = this._neonMat(0x33d4ff);   // status light strip on the lid

    const crate = (x, z, s, y = 0) => {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), hull);
      box.position.y = s / 2; g.add(box);
      // reinforcing edge bands
      for (const ax of ['x', 'z']) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(ax === 'x' ? s + 0.04 : 0.12, 0.12, ax === 'z' ? s + 0.04 : 0.12), band);
        b.position.set(0, s / 2, 0); g.add(b);
      }
      // glowing status strip across the lid
      const cap = new THREE.Mesh(new THREE.BoxGeometry(s * 0.7, 0.06, 0.14), glow);
      cap.position.y = s + 0.03; g.add(cap);
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

    // Energy marker lights along the inner top of the four perimeter walls.
    const half = ARENA_HALF;
    const bulbColors = [0x33d4ff, 0x1a9fd0, 0xff9a3b, 0x66e8ff, 0x33d4ff, 0xff7a2c];
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
    // Four narrow edge strips. The previous single full-size neon slab washed
    // the whole platform red and hid the material underneath.
    const nm = this._neonMat(trimColor);
    for (const z of [cz - d / 2 - 0.06, cz + d / 2 + 0.06]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.08, 0.12), nm);
      band.position.set(cx, y + 0.02, z);
      band.userData.noHit = true;
      this.scene.add(band);
    }
    for (const x of [cx - w / 2 - 0.06, cx + w / 2 + 0.06]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, d + 0.06), nm);
      band.position.set(x, y + 0.02, cz);
      band.userData.noHit = true;
      this.scene.add(band);
    }
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

  // Glass scenic elevator: a clear glass shaft with a steel frame and a lit cabin.
  // Stepping onto the pad carries the player up to the mezzanine (a real mall's
  // panoramic lift). Same launch mechanic as before, restyled for the mall.
  _gravLift(x, z, topY, power) {
    const steel = new THREE.MeshStandardMaterial({ color: 0xd2d7dc, roughness: 0.32, metalness: 0.82 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xeaf4fb, roughness: 0.05, metalness: 0, transmission: 0.9, thickness: 0.4,
      transparent: true, opacity: 0.28, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false,
    });
    const cabinM = new THREE.MeshStandardMaterial({ color: 0xfff3df, roughness: 0.4, metalness: 0, emissive: 0xffe6c2, emissiveIntensity: 0.9 });
    const shaftH = topY + 2.4;

    // stone base pad
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.3, 24), steel);
    pad.position.set(x, 0.15, z); pad.receiveShadow = true; this.scene.add(pad);

    // four corner steel posts
    for (const [ox, oz] of [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, shaftH, 8), steel);
      post.position.set(x + ox, shaftH / 2, z + oz); this.scene.add(post);
    }
    // clear glass shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, shaftH, 20, 1, true), glass);
    shaft.position.set(x, shaftH / 2, z); this.scene.add(shaft);
    // steel rings top + bottom of the shaft
    for (const ry of [0.4, shaftH - 0.2]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.09, 8, 24), steel);
      ring.position.set(x, ry, z); ring.rotation.x = Math.PI / 2; this.scene.add(ring);
    }
    // lit glass cabin resting at the top landing
    const cabin = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 16), cabinM);
    cabin.position.set(x, topY + 1.1, z); this.scene.add(cabin);
    const cabinGlass = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.2, 16, 1, true), glass);
    cabinGlass.position.set(x, topY + 1.1, z); this.scene.add(cabinGlass);

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
    if (this._mapOctree) {
      const originY = Math.max(prevY, newY) + STEP_UP + GRACE;
      this._groundRay.origin.set(x, originY, z);
      const hit = this._mapOctree.rayIntersect(this._groundRay);
      if (hit) {
        const normal = hit.triangle.getNormal(_boxHit);
        const top = hit.position.y;
        const crossed = prevY >= top - GRACE && newY <= top + GRACE;
        const stepping = newY <= top + STEP_UP && newY >= top - 0.8;
        if (normal.y > 0.35 && (crossed || stepping)) return top;
      }
      return -100;
    }

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
    return this._cloneSpawn(this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)]);
  }

  _cloneSpawn(point) {
    const clone = point.clone();
    if (Number.isFinite(point.spawnYaw)) clone.spawnYaw = point.spawnYaw;
    return clone;
  }

  /**
   * A random spawn point that isn't in somebody's face — picks the candidate
   * furthest from the nearest listed occupant, so respawning doesn't drop you
   * back into the fight that just killed you.
   * @param {Array<{position: THREE.Vector3, alive?: boolean}>} occupants
   */
  safeSpawnPoint(occupants = []) {
    const live = occupants.filter((o) => o && o.alive !== false && o.position);
    if (!live.length) return this.randomSpawnPoint();
    // Score every spawn, then pick at random from the clearest third — always
    // safe, but not always the same corner on successive deaths.
    const scored = this.spawnPoints.map((p) => {
      let nearest = Infinity;
      for (const o of live) nearest = Math.min(nearest, p.distanceTo(o.position));
      return { p, nearest };
    }).sort((a, b) => b.nearest - a.nearest);
    const top = scored.slice(0, Math.max(1, Math.ceil(scored.length / 3)));
    return this._cloneSpawn(top[Math.floor(Math.random() * top.length)].p);
  }

  // ── Shooting against the world ──────────────────────────────────────────────
  // A collider is either backed by a visual (`mesh`) or is a bare box — most of
  // the mall's cover (trees, benches, kiosks, escalator volumes, railings) is
  // the latter. The two are complementary and must be tested differently:
  // meshes get an exact raycast, bare boxes get a ray/AABB test. Feeding a bare
  // collider's null mesh to Raycaster.intersectObjects() throws, which is what
  // made every shot fail after this map landed.

  /** Collider meshes, for Raycaster.intersectObjects(). Built once — static. */
  get raycastMeshes() {
    if (!this._raycastMeshes) {
      this._raycastMeshes = this.colliders.map((c) => c.mesh).filter(Boolean);
    }
    return this._raycastMeshes;
  }

  /** Bare (mesh-less) collider boxes, so they still stop bullets. */
  get raycastBoxes() {
    if (!this._raycastBoxes) {
      this._raycastBoxes = this.colliders.filter((c) => !c.mesh).map((c) => c.box);
    }
    return this._raycastBoxes;
  }

  /**
   * Nearest bare-box hit along a ray, or null.
   * @param {THREE.Ray} ray
   * @param {number} far  max distance to consider
   * @returns {{point: THREE.Vector3, distance: number}|null}
   */
  raycastBoxHit(ray, far = Infinity) {
    let best = null;
    for (const box of this.raycastBoxes) {
      // If the shooter is standing inside a box, intersectBox reports the far
      // EXIT face — which would swallow the shot. Ignore boxes we're already in.
      if (box.containsPoint(ray.origin)) continue;
      const p = ray.intersectBox(box, _boxHit);
      if (!p) continue;
      const d = ray.origin.distanceTo(p);
      if (d <= far && (!best || d < best.distance)) best = { point: p.clone(), distance: d };
    }
    return best;
  }

  /** Resolve horizontal collisions for the player/bot capsule against box colliders. */
  resolveCollisions(position, radius) {
    if (this._mapOctree) {
      const capsule = this._playerCapsule;
      capsule.radius = radius;
      capsule.start.set(position.x, position.y + radius, position.z);
      capsule.end.set(position.x, position.y + 1.7 - radius, position.z);
      const hit = this._mapOctree.capsuleIntersect(capsule);
      if (hit) position.addScaledVector(hit.normal, hit.depth);
      return position;
    }

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
