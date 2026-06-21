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
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#04080c';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 4;
  for (let i = 0; i < 22; i++) {
    let x = Math.random() * size, y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = 2 + (Math.random() * 4 | 0);
    for (let s = 0; s < segs; s++) {
      if (Math.random() < 0.5) x += (Math.random() - 0.5) * 60;
      else y += (Math.random() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#7dffff';
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
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
  const size = 256, c = makeCanvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#06030f';
  ctx.fillRect(0, 0, size, size);
  const clouds = ['#5a1e9c', '#1e3a9c', '#9c1e6e', '#2a8ccc'];
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 30 + Math.random() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, clouds[(Math.random() * clouds.length) | 0] + 'cc');
    g.addColorStop(1, 'rgba(6,3,15,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  for (let i = 0; i < 220; i++) {
    const b = Math.random();
    ctx.fillStyle = b > 0.9 ? '#bfe0ff' : `rgba(255,255,255,${0.4 + b * 0.6})`;
    const s = b > 0.95 ? 2 : 1;
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
  const size = 256, c = makeCanvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#070a16';
  ctx.fillRect(0, 0, size, size);
  ctx.shadowColor = '#aef0ff';
  ctx.shadowBlur = 6;
  const bolt = (x, y, ang, len, w) => {
    if (len < 8 || w < 0.4) return;
    ctx.strokeStyle = w > 1.5 ? '#ffffff' : '#7fd8ff';
    ctx.lineWidth = w;
    const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
    bolt(nx, ny, ang + (Math.random() - 0.5) * 1.1, len * 0.7, w * 0.7);
    if (Math.random() < 0.5) bolt(nx, ny, ang + (Math.random() - 0.5) * 1.6, len * 0.5, w * 0.5);
  };
  for (let i = 0; i < 5; i++) bolt(Math.random() * size, 0, Math.PI / 2 + (Math.random() - 0.5), 50, 2.4);
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

const DECALS = {
  fire:      fireDecal,
  anime:     animeDecal,
  dragon:    dragonDecal,
  cyber:     cyberDecal,
  carbon:    carbonDecal,
  digicamo:  digicamoDecal,
  hextech:   hextechDecal,
  frost:     frostDecal,
  galaxy:    galaxyDecal,
  gold:      goldDecal,
  skull:     skullDecal,
  toxic:     toxicDecal,
  lightning: lightningDecal,
  tiger:     tigerDecal,
};

// Returns a seamless color CanvasTexture for the given decal type (cached).
export function decalTexture(type) {
  return cached('decal_' + type, () => {
    const make = DECALS[type];
    if (!make) return null;
    return finalize(make(), { color: true, repeat: 2 });
  });
}
