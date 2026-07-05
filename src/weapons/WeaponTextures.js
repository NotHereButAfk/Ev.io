import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Procedural canvas-based PBR + decal textures.
//
// Everything here is generated once and cached, so there are no external image
// assets to ship. Normal / roughness maps give every gun a tactile, hyper-real
// surface (brushed metal, pebbled polymer). Decal patterns are *seamless tiles*
// — because each gun is built from dozens of small primitives whose UVs are
// each 0..1, a tileable pattern reads correctly on every part.
// ---------------------------------------------------------------------------

const _cache = new Map();
function cached(key, make) {
  if (_cache.has(key)) return _cache.get(key);
  const tex = make();
  _cache.set(key, tex);
  return tex;
}

function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function finalize(canvas, { color = false, repeat = 1 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ── PBR surface maps (shared by every weapon) ──────────────────────────────

// Brushed-metal normal map: fine horizontal scratches perturbing the surface.
export function metalNormalMap() {
  return cached('metalNormal', () => {
    const size = 256;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgb(128,128,255)'; // neutral normal
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      const y = Math.random() * size;
      const len = 20 + Math.random() * 120;
      const x = Math.random() * size;
      const shade = 128 + (Math.random() - 0.5) * 70;
      ctx.strokeStyle = `rgb(${shade|0},${shade|0},255)`;
      ctx.globalAlpha = 0.18 + Math.random() * 0.22;
      ctx.lineWidth = Math.random() < 0.85 ? 1 : 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + (Math.random() - 0.5) * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return finalize(c, { repeat: 2 });
  });
}

// Roughness variation: subtle blotches + brush streaks so reflections shimmer.
export function metalRoughnessMap() {
  return cached('metalRough', () => {
    const size = 256;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgb(120,120,120)';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1600; i++) {
      const v = 90 + Math.random() * 110;
      ctx.fillStyle = `rgb(${v|0},${v|0},${v|0})`;
      ctx.globalAlpha = 0.25;
      const x = Math.random() * size, y = Math.random() * size;
      ctx.fillRect(x, y, 1 + Math.random() * 3, 1);
    }
    // wear patches (smoother / shinier)
    for (let i = 0; i < 18; i++) {
      const r = 8 + Math.random() * 26;
      const g = ctx.createRadialGradient(
        Math.random() * size, Math.random() * size, 0,
        Math.random() * size, Math.random() * size, r);
      g.addColorStop(0, 'rgba(60,60,60,0.5)');
      g.addColorStop(1, 'rgba(60,60,60,0)');
      ctx.fillStyle = g;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, 0, size, size);
    }
    ctx.globalAlpha = 1;
    return finalize(c, { repeat: 2 });
  });
}

// Pebbled polymer normal map for body/grip parts (fine stippled grain).
export function polymerNormalMap() {
  return cached('polymerNormal', () => {
    const size = 256;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgb(128,128,255)';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 5000; i++) {
      const shade = 128 + (Math.random() - 0.5) * 60;
      ctx.fillStyle = `rgb(${shade|0},${shade|0},255)`;
      ctx.globalAlpha = 0.4;
      const x = Math.random() * size, y = Math.random() * size;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
    return finalize(c, { repeat: 3 });
  });
}

// ── Themed decal patterns (seamless color tiles) ───────────────────────────

// FIRE — embers + flame tongues, used as both color map and emissive map.
function fireDecal() {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  // dark charred base
  ctx.fillStyle = '#0a0402';
  ctx.fillRect(0, 0, size, size);
  // rising flame tongues (drawn wrapped for tiling)
  const drawFlame = (x, baseY, h, w) => {
    const g = ctx.createLinearGradient(0, baseY, 0, baseY - h);
    g.addColorStop(0, '#fff2a0');
    g.addColorStop(0.35, '#ff8c1a');
    g.addColorStop(0.7, '#e02200');
    g.addColorStop(1, 'rgba(120,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w, baseY);
    ctx.quadraticCurveTo(x - w * 0.3, baseY - h * 0.6, x, baseY - h);
    ctx.quadraticCurveTo(x + w * 0.3, baseY - h * 0.6, x + w, baseY);
    ctx.closePath();
    ctx.fill();
  };
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * size;
    const h = 60 + Math.random() * 150;
    const w = 14 + Math.random() * 26;
    // draw at x and wrapped copies so the tile is seamless horizontally
    [x, x - size, x + size].forEach((xx) => drawFlame(xx, size + 10, h, w));
  }
  // embers
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? '#ffcc55' : '#ff5511';
    ctx.globalAlpha = 0.5 + Math.random() * 0.5;
    const x = Math.random() * size, y = Math.random() * size;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  ctx.globalAlpha = 1;
  return c;
}

// ANIME — kawaii pastel pattern: sakura petals, stars, hearts on pink.
function animeDecal() {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  // pastel gradient base
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#ff9ed6');
  bg.addColorStop(0.5, '#c79bff');
  bg.addColorStop(1, '#9ce0ff');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const star = (x, y, r, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const a2 = a + Math.PI / 5;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(a2) * r * 0.45, y + Math.sin(a2) * r * 0.45);
    }
    ctx.closePath();
    ctx.fill();
  };
  const heart = (x, y, s, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x, y, x - s, y, x - s, y + s * 0.4);
    ctx.bezierCurveTo(x - s, y + s * 0.8, x, y + s, x, y + s * 1.2);
    ctx.bezierCurveTo(x, y + s, x + s, y + s * 0.8, x + s, y + s * 0.4);
    ctx.bezierCurveTo(x + s, y, x, y, x, y + s * 0.3);
    ctx.fill();
  };
  const petal = (x, y, r, col) => {
    ctx.fillStyle = col;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7,
        r * 0.5, r * 0.28, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe680';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  };

  for (let i = 0; i < 7; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const r = 10 + Math.random() * 10;
    const k = Math.random();
    if (k < 0.4) petal(x, y, r, 'rgba(255,255,255,0.92)');
    else if (k < 0.7) star(x, y, r, 'rgba(255,255,160,0.95)');
    else heart(x, y, r, 'rgba(255,120,170,0.95)');
  }
  // sparkle dots
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const x = Math.random() * size, y = Math.random() * size;
    ctx.fillRect(x, y, 2, 2);
  }
  return c;
}

// ANIME GIRL — a chibi anime girl face (twin-tails, huge sparkly eyes, blush,
// little "ah~" mouth) on a pastel gradient, ringed with hearts and sparkles.
function animeGirlDecal() {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');

  // pastel gradient base
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#ffb3dd');
  bg.addColorStop(0.55, '#d9aaff');
  bg.addColorStop(1, '#a8d8ff');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const cx = 128, cy = 122;

  // twin-tail lobes behind the head
  ctx.fillStyle = '#ff5fb8';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * 84, cy + 6, 26, 58, s * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); // tail tip curl
    ctx.ellipse(cx + s * 96, cy + 62, 14, 26, s * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // hair scrunchies
  ctx.fillStyle = '#ffe066';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + s * 74, cy - 34, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  // back hair + head silhouette
  ctx.fillStyle = '#ff6fc2';
  ctx.beginPath();
  ctx.arc(cx, cy - 14, 76, Math.PI * 0.95, Math.PI * 2.05);
  ctx.quadraticCurveTo(cx + 78, cy + 40, cx + 52, cy + 52);
  ctx.quadraticCurveTo(cx, cy + 66, cx - 52, cy + 52);
  ctx.quadraticCurveTo(cx - 78, cy + 40, cx - 76, cy - 10);
  ctx.closePath();
  ctx.fill();

  // face
  ctx.fillStyle = '#ffe8d6';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, 54, 50, 0, 0, Math.PI * 2);
  ctx.fill();

  // bangs — three swooping arcs over the forehead
  ctx.fillStyle = '#ff6fc2';
  ctx.beginPath();
  ctx.moveTo(cx - 58, cy - 4);
  ctx.quadraticCurveTo(cx - 46, cy - 52, cx, cy - 56);
  ctx.quadraticCurveTo(cx + 46, cy - 52, cx + 58, cy - 4);
  ctx.quadraticCurveTo(cx + 42, cy - 20, cx + 30, cy - 2);
  ctx.quadraticCurveTo(cx + 18, cy - 26, cx, cy - 6);
  ctx.quadraticCurveTo(cx - 18, cy - 26, cx - 30, cy - 2);
  ctx.quadraticCurveTo(cx - 42, cy - 20, cx - 58, cy - 4);
  ctx.closePath();
  ctx.fill();
  // ahoge (the little hair sprig on top)
  ctx.strokeStyle = '#ff6fc2';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 56);
  ctx.quadraticCurveTo(cx + 10, cy - 82, cx - 8, cy - 88);
  ctx.stroke();

  // eyes — huge vertical ellipses with layered highlights
  for (const s of [-1, 1]) {
    const ex = cx + s * 24, ey = cy + 14;
    ctx.fillStyle = '#3a1a4a';                       // outline/iris base
    ctx.beginPath(); ctx.ellipse(ex, ey, 13, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a3aff';                       // iris glow
    ctx.beginPath(); ctx.ellipse(ex, ey + 3, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';                       // big sparkle
    ctx.beginPath(); ctx.arc(ex - 4, ey - 6, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 4, ey + 8, 2.4, 0, Math.PI * 2); ctx.fill();
    // upper lash line
    ctx.strokeStyle = '#3a1a4a';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(ex, ey - 4, 14, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  }

  // blush
  ctx.fillStyle = 'rgba(255,110,150,0.55)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * 38, cy + 30, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // little open "ah~" mouth
  ctx.fillStyle = '#c2325a';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 40, 7, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff8aa0'; // tongue
  ctx.beginPath();
  ctx.ellipse(cx, cy + 44, 4.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // hearts + sparkles around her
  const heart2 = (x, y, s, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x, y, x - s, y, x - s, y + s * 0.4);
    ctx.bezierCurveTo(x - s, y + s * 0.8, x, y + s, x, y + s * 1.2);
    ctx.bezierCurveTo(x, y + s, x + s, y + s * 0.8, x + s, y + s * 0.4);
    ctx.bezierCurveTo(x + s, y, x, y, x, y + s * 0.3);
    ctx.fill();
  };
  heart2(34, 44, 13, 'rgba(255,80,150,0.95)');
  heart2(222, 58, 10, 'rgba(255,120,180,0.9)');
  heart2(40, 210, 9, 'rgba(255,120,180,0.9)');
  heart2(214, 200, 12, 'rgba(255,80,150,0.95)');
  for (let i = 0; i < 34; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const x = Math.random() * size, y = Math.random() * size;
    ctx.fillRect(x, y, 2, 2);
  }
  return c;
}

// DRAGON — overlapping scales with a jade-green sheen.
function dragonDecal() {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b1f14';
  ctx.fillRect(0, 0, size, size);
  const sc = 26;
  for (let row = -1; row * sc * 0.6 < size; row++) {
    for (let col = -1; col * sc < size + sc; col++) {
      const x = col * sc + (row % 2 ? sc / 2 : 0);
      const y = row * sc * 0.6;
      const g = ctx.createRadialGradient(x, y - sc * 0.2, 1, x, y, sc * 0.7);
      g.addColorStop(0, '#3fae6a');
      g.addColorStop(0.6, '#176b39');
      g.addColorStop(1, '#0a2e1c');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, sc * 0.62, 0, Math.PI, false);
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,255,180,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  return c;
}

// CYBER — neon circuit traces + nodes on near-black, glows via emissive map.
function cyberDecal() {
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#04080c';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 2.4;
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 8;
  ctx.lineCap = 'round';
  for (let i = 0; i < 44; i++) {
    let x = Math.random() * size, y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = 2 + (Math.random() * 5 | 0);
    for (let s = 0; s < segs; s++) {
      if (Math.random() < 0.5) x += (Math.random() - 0.5) * 120;
      else y += (Math.random() - 0.5) * 120;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#bdffff';
    ctx.beginPath();
    ctx.arc(x, y, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  return c;
}

// CARBON — woven carbon-fibre twill.
function carbonDecal() {
  const size = 256, c = makeCanvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#0c0d10';
  ctx.fillRect(0, 0, size, size);
  const cell = 16;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const odd = ((x / cell) + (y / cell)) % 2 === 0;
      const g = ctx.createLinearGradient(x, y, x + cell, y + cell);
      if (odd) { g.addColorStop(0, '#34373d'); g.addColorStop(1, '#15171b'); }
      else     { g.addColorStop(0, '#15171b'); g.addColorStop(1, '#34373d'); }
      ctx.fillStyle = g;
      ctx.fillRect(x, y, cell, cell);
    }
  }
  return c;
}

// DIGICAMO — pixelated digital camouflage.
function digicamoDecal() {
  const size = 256, c = makeCanvas(size), ctx = c.getContext('2d');
  const cols = ['#3a4a2a', '#566b3a', '#222c18', '#7a8a55'];
  const px = 16;
  for (let y = 0; y < size; y += px) {
    for (let x = 0; x < size; x += px) {
      ctx.fillStyle = cols[(Math.random() * cols.length) | 0];
      ctx.fillRect(x, y, px, px);
    }
  }
  // scatter a few half-size pixels for a finer pattern
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = cols[(Math.random() * cols.length) | 0];
    ctx.fillRect((Math.random() * size) | 0, (Math.random() * size) | 0, px / 2, px / 2);
  }
  return c;
}

// HEXTECH — glowing hexagon honeycomb.
function hextechDecal() {
  const size = 256, c = makeCanvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#06121a';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#18e0ff';
  ctx.lineWidth = 1.4;
  ctx.shadowColor = '#18e0ff';
  ctx.shadowBlur = 5;
  const r = 22, h = Math.sqrt(3) * r;
  for (let row = -1; row * (h / 2) < size + h; row++) {
    for (let col = -1; col * (1.5 * r) < size + r; col++) {
      const x = col * 1.5 * r;
      const y = row * h + (col % 2 ? h / 2 : 0);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;
  return c;
}

// FROST — icy crystals + frost speckle.
function frostDecal() {
  const size = 256, c = makeCanvas(size), ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#0a2230');
  bg.addColorStop(1, '#123a4e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(190,235,255,0.85)';
  ctx.shadowColor = '#bdeeff';
  ctx.shadowBlur = 4;
  for (let i = 0; i < 9; i++) {
    const cx = Math.random() * size, cy = Math.random() * size, len = 18 + Math.random() * 28;
    for (let a = 0; a < 6; a++) {
      const ang = (Math.PI / 3) * a;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const ex = cx + Math.cos(ang) * len, ey = cy + Math.sin(ang) * len;
      ctx.lineTo(ex, ey);
      // barbs
      ctx.lineTo(ex - Math.cos(ang - 0.5) * 6, ey - Math.sin(ang - 0.5) * 6);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(ang + 0.5) * 6, ey - Math.sin(ang + 0.5) * 6);
      ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;
  for (let i = 0; i < 150; i++) {
    ctx.fillStyle = 'rgba(220,245,255,0.6)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }
  return c;
}

// GALAXY — nebula clouds + starfield.
function galaxyDecal() {
  const size = 512, c = makeCanvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#06030f';
  ctx.fillRect(0, 0, size, size);
  const clouds = ['#7a2ad0', '#2a5aff', '#d02a9a', '#2ab8ff'];
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 50 + Math.random() * 130;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, clouds[(Math.random() * clouds.length) | 0] + 'dd');
    g.addColorStop(1, 'rgba(6,3,15,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  for (let i = 0; i < 520; i++) {
    const b = Math.random();
    ctx.fillStyle = b > 0.9 ? '#dff0ff' : `rgba(255,255,255,${0.4 + b * 0.6})`;
    const s = b > 0.96 ? 3 : (b > 0.85 ? 2 : 1);
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  return c;
}

// GOLD FILIGREE — ornate damascus swirls on gold.
function goldDecal() {
  const size = 256, c = makeCanvas(size), ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#caa23a');
  bg.addColorStop(0.5, '#f3d678');
  bg.addColorStop(1, '#9c7a1e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(90,60,8,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 8 + Math.random() * 22;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2; a += 0.3) {
      const rr = r * (0.6 + 0.4 * Math.sin(a * 3));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      a ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
  return c;
}

// SKULL — repeating skull motif.
function skullDecal() {
  const size = 256, c = makeCanvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#14151a';
  ctx.fillRect(0, 0, size, size);
  const drawSkull = (x, y, s) => {
    ctx.fillStyle = '#d8d8d0';
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - s * 0.7, y, s * 1.4, s * 1.1);
    ctx.fillStyle = '#14151a';
    ctx.beginPath(); ctx.arc(x - s * 0.4, y - s * 0.1, s * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + s * 0.4, y - s * 0.1, s * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(x - s * 0.1, y + s * 0.2, s * 0.2, s * 0.4);
    for (let i = -2; i <= 2; i++) ctx.fillRect(x + i * s * 0.22 - 1, y + s * 0.9, 2, s * 0.3);
  };
  const step = 64;
  for (let y = step / 2; y < size + step; y += step)
    for (let x = step / 2; x < size + step; x += step)
      drawSkull(x + ((y / step) % 2 ? step / 2 : 0), y, 14);
  return c;
}

// TOXIC — acid splatter + bubbles, glows green.
function toxicDecal() {
  const size = 256, c = makeCanvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#0a1206';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 12 + Math.random() * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, '#aaff33');
    g.addColorStop(0.6, '#3a9c1a');
    g.addColorStop(1, 'rgba(10,18,6,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = 'rgba(180,255,90,0.7)';
    ctx.lineWidth = 1;
    const x = Math.random() * size, y = Math.random() * size;
    ctx.beginPath(); ctx.arc(x, y, 1 + Math.random() * 4, 0, Math.PI * 2); ctx.stroke();
  }
  return c;
}

// LIGHTNING — branching electric arcs, glows.
function lightningDecal() {
  const size = 512, c = makeCanvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#070a16';
  ctx.fillRect(0, 0, size, size);
  ctx.shadowColor = '#cdf5ff';
  ctx.shadowBlur = 10;
  ctx.lineCap = 'round';
  const bolt = (x, y, ang, len, w) => {
    if (len < 10 || w < 0.5) return;
    ctx.strokeStyle = w > 2.2 ? '#ffffff' : '#9fe4ff';
    ctx.lineWidth = w;
    const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
    bolt(nx, ny, ang + (Math.random() - 0.5) * 1.1, len * 0.72, w * 0.72);
    if (Math.random() < 0.5) bolt(nx, ny, ang + (Math.random() - 0.5) * 1.6, len * 0.5, w * 0.5);
  };
  for (let i = 0; i < 9; i++) bolt(Math.random() * size, 0, Math.PI / 2 + (Math.random() - 0.5), 90, 3.6);
  ctx.shadowBlur = 0;
  return c;
}

// TIGER — orange coat with black stripes.
function tigerDecal() {
  const size = 256, c = makeCanvas(size), ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, '#ff9a2a');
  bg.addColorStop(1, '#e8761a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1a1208';
  for (let i = 0; i < 22; i++) {
    const y = Math.random() * size, x = Math.random() * size;
    const w = 4 + Math.random() * 8, h = 30 + Math.random() * 50, tilt = (Math.random() - 0.5) * 0.6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(w, h * 0.5, 0, h);
    ctx.quadraticCurveTo(-w * 0.4, h * 0.5, 0, 0);
    ctx.fill();
    ctx.restore();
  }
  return c;
}

// HOLOGRAPHIC — iridescent rainbow foil with a brushed sheen. Glows.
function holographicDecal() {
  const size = 512, c = makeCanvas(size), ctx = c.getContext('2d');
  // diagonal rainbow sweep
  const g = ctx.createLinearGradient(0, 0, size, size);
  const stops = ['#ff2bd0', '#ff8a2b', '#fff52b', '#2bff7a', '#2bd8ff', '#6a4bff', '#ff2bd0'];
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // shimmering diagonal bands (foil refraction)
  for (let i = 0; i < 60; i++) {
    const off = (i / 60) * size * 1.6 - size * 0.3;
    const bg = ctx.createLinearGradient(off, 0, off + 40, size);
    bg.addColorStop(0, 'rgba(255,255,255,0)');
    bg.addColorStop(0.5, `rgba(255,255,255,${0.10 + Math.random() * 0.20})`);
    bg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bg;
    ctx.save();
    ctx.translate(off, 0);
    ctx.rotate(0.6);
    ctx.fillRect(-size, -size, 30, size * 3);
    ctx.restore();
  }
  // fine sparkle
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.6})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }
  return c;
}

// CIRCUITNEON — dense glowing PCB: traces, pads, vias. Glows.
function circuitneonDecal() {
  const size = 512, c = makeCanvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#02100a';
  ctx.fillRect(0, 0, size, size);
  const grid = 32;
  ctx.lineCap = 'square';
  ctx.shadowColor = '#1bff8a';
  ctx.shadowBlur = 6;
  // manhattan traces snapped to a grid for a dense PCB look
  for (let i = 0; i < 130; i++) {
    let gx = (Math.random() * (size / grid) | 0) * grid;
    let gy = (Math.random() * (size / grid) | 0) * grid;
    const horiz = Math.random() < 0.5;
    ctx.strokeStyle = Math.random() < 0.18 ? '#7bffd0' : '#15e07a';
    ctx.lineWidth = 1.6 + Math.random() * 1.4;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    let steps = 1 + (Math.random() * 4 | 0);
    let h = horiz;
    for (let s = 0; s < steps; s++) {
      if (h) gx += (Math.random() < 0.5 ? -1 : 1) * grid * (1 + (Math.random() * 3 | 0));
      else gy += (Math.random() < 0.5 ? -1 : 1) * grid * (1 + (Math.random() * 3 | 0));
      ctx.lineTo(gx, gy);
      h = !h;
    }
    ctx.stroke();
  }
  // solder pads / vias
  for (let i = 0; i < 90; i++) {
    const x = (Math.random() * (size / grid) | 0) * grid;
    const y = (Math.random() * (size / grid) | 0) * grid;
    ctx.fillStyle = '#9fffdd';
    ctx.beginPath(); ctx.arc(x, y, 2.6 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#02100a';
    ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0;
  return c;
}

// LAVA — cracked black basalt with glowing magma veins. Glows.
function lavaDecal() {
  const size = 512, c = makeCanvas(size), ctx = c.getContext('2d');
  // dark cracked rock base
  ctx.fillStyle = '#0c0503';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 80; i++) {
    const v = 10 + Math.random() * 24;
    ctx.fillStyle = `rgb(${v|0},${(v*0.6)|0},${(v*0.4)|0})`;
    ctx.globalAlpha = 0.4;
    const x = Math.random() * size, y = Math.random() * size, r = 8 + Math.random() * 30;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // glowing magma veins — branching cracks
  ctx.shadowColor = '#ff7b1a';
  ctx.shadowBlur = 12;
  const vein = (x, y, ang, len, w) => {
    if (len < 12 || w < 0.6) return;
    const g = ctx.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.addColorStop(0, '#fff0a0');
    g.addColorStop(0.5, '#ff7b1a');
    g.addColorStop(1, '#c41800');
    ctx.strokeStyle = g;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
    vein(nx, ny, ang + (Math.random() - 0.5) * 1.0, len * 0.72, w * 0.72);
    if (Math.random() < 0.55) vein(nx, ny, ang + (Math.random() - 0.5) * 1.6, len * 0.6, w * 0.62);
  };
  for (let i = 0; i < 10; i++) vein(Math.random() * size, Math.random() * size, Math.random() * Math.PI * 2, 70, 4.5);
  // glowing embers
  ctx.shadowBlur = 6;
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? '#ffcc55' : '#ff5511';
    ctx.beginPath(); ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0;
  return c;
}

// ICE — refractive crystal facets with cool glints. Subtle glow.
function iceDecal() {
  const size = 512, c = makeCanvas(size), ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#9fd8ec');
  bg.addColorStop(0.5, '#cfeefb');
  bg.addColorStop(1, '#6fb6d8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  // crystalline facets — random triangles with refraction shading
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 24 + Math.random() * 70;
    const a0 = Math.random() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
    ctx.lineTo(x + Math.cos(a0 + 1 + Math.random()) * r, y + Math.sin(a0 + 1 + Math.random()) * r);
    ctx.closePath();
    const shade = 200 + Math.random() * 55;
    ctx.fillStyle = `rgba(${shade|0},${(shade+5)|0},255,${0.10 + Math.random() * 0.18})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // bright glints
  ctx.shadowColor = '#e6faff';
  ctx.shadowBlur = 6;
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  ctx.shadowBlur = 0;
  return c;
}

// BLOODMOON — dark red marble veined with gold. Subtle glow on veins.
function bloodmoonDecal() {
  const size = 512, c = makeCanvas(size), ctx = c.getContext('2d');
  const bg = ctx.createRadialGradient(size * 0.5, size * 0.5, 10, size * 0.5, size * 0.5, size * 0.7);
  bg.addColorStop(0, '#5a0c10');
  bg.addColorStop(0.6, '#2c0608');
  bg.addColorStop(1, '#120203');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  // dark marble swirls
  for (let i = 0; i < 50; i++) {
    ctx.strokeStyle = `rgba(${100 + Math.random()*60|0},10,14,${0.2 + Math.random()*0.3})`;
    ctx.lineWidth = 4 + Math.random() * 12;
    ctx.beginPath();
    let x = Math.random() * size, y = Math.random() * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (Math.random() - 0.5) * 120; y += (Math.random() - 0.5) * 120;
      ctx.quadraticCurveTo(x + 30, y - 30, x, y);
    }
    ctx.stroke();
  }
  // gold veins (faint glow)
  ctx.shadowColor = '#ffd86a';
  ctx.shadowBlur = 5;
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = '#f0c24a';
    ctx.lineWidth = 0.8 + Math.random() * 1.8;
    ctx.lineCap = 'round';
    let x = Math.random() * size, y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  return c;
}

// MATRIX — falling green code glyphs on black. Glows.
function matrixDecal() {
  const size = 512, c = makeCanvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#010803';
  ctx.fillRect(0, 0, size, size);
  const glyphs = 'ｱｲｳｴｵｶｷｸ0123456789ﾊﾋﾌﾍﾎ@#$%';
  const colW = 16;
  ctx.font = '14px monospace';
  ctx.textBaseline = 'top';
  ctx.shadowColor = '#28ff7a';
  for (let cx = 0; cx < size; cx += colW) {
    const head = Math.random() * size;
    const trail = 6 + (Math.random() * 14 | 0);
    for (let r = 0; r < trail; r++) {
      const y = (head - r * colW) ;
      const yy = ((y % size) + size) % size;
      const ch = glyphs[(Math.random() * glyphs.length) | 0];
      if (r === 0) { ctx.fillStyle = '#d8ffe6'; ctx.shadowBlur = 8; }
      else { const a = 1 - r / trail; ctx.fillStyle = `rgba(30,${200 + (a*55)|0},90,${a})`; ctx.shadowBlur = 4; }
      ctx.fillText(ch, cx + 1, yy);
    }
  }
  ctx.shadowBlur = 0;
  return c;
}

// CAMO_URBAN — sharp angular urban camouflage.
function camoUrbanDecal() {
  const size = 512, c = makeCanvas(size), ctx = c.getContext('2d');
  const cols = ['#c8ccd2', '#8a9099', '#4a4f57', '#23262b'];
  ctx.fillStyle = cols[0];
  ctx.fillRect(0, 0, size, size);
  // angular blotches, drawn wrapped for tiling
  const blob = (x, y, col, scale) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    const pts = 5 + (Math.random() * 4 | 0);
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const r = scale * (0.5 + Math.random() * 0.8);
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  };
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const col = cols[1 + (Math.random() * (cols.length - 1) | 0)];
    const sc = 18 + Math.random() * 46;
    [[0,0],[size,0],[-size,0],[0,size],[0,-size]].forEach(([dx,dy]) => blob(x+dx, y+dy, col, sc));
  }
  return c;
}

const DECALS = {
  fire:        fireDecal,
  anime:       animeDecal,
  animegirl:   animeGirlDecal,
  dragon:      dragonDecal,
  cyber:       cyberDecal,
  carbon:      carbonDecal,
  digicamo:    digicamoDecal,
  hextech:     hextechDecal,
  frost:       frostDecal,
  galaxy:      galaxyDecal,
  gold:        goldDecal,
  skull:       skullDecal,
  toxic:       toxicDecal,
  lightning:   lightningDecal,
  tiger:       tigerDecal,
  // ── new high-quality decals ──
  holographic: holographicDecal,
  circuitneon: circuitneonDecal,
  lava:        lavaDecal,
  ice:         iceDecal,
  bloodmoon:   bloodmoonDecal,
  matrix:      matrixDecal,
  camo_urban:  camoUrbanDecal,
};

// Returns a seamless color CanvasTexture for the given decal type (cached).
export function decalTexture(type) {
  return cached('decal_' + type, () => {
    const make = DECALS[type];
    if (!make) return null;
    return finalize(make(), { color: true, repeat: 2 });
  });
}
