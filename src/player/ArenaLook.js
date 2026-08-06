// ═══════════════════════════════════════════════════════════════════════════
// Making a character read as part of the arena instead of a model dropped into
// one.
//
// The arena is the real downloaded ev.io asset, and EvMapLoader builds every one
// of its 23 materials as a MeshToonMaterial: flat, banded, no specular. The
// authored weapon arsenal is MeshToonMaterial too, and so are the procedural
// cyborg chassis. The rigged human — which a migration made the DEFAULT
// character — was the one thing left shading as PBR, with metalness up to 0.95
// and envMapIntensity above 1.
//
// That is the whole "imported separately" tell, and it is two problems, not one:
//
//   1. WRONG SHADING LANGUAGE. A smooth PBR gradient with moving speculars sat
//      on top of a map that resolves every surface into two or three flat
//      bands. The eye reads the difference instantly even when the colours are
//      right, because the two surfaces respond to the same light differently.
//
//   2. WRONG ENVIRONMENT. Metal has no diffuse — its colour is almost entirely
//      what it reflects. The scene's IBL is a PMREM of RoomEnvironment, a small
//      grey studio box, at half intensity. So a metalness-0.9 pauldron standing
//      in a bright daylit arena was reflecting a dim indoor room. It came out
//      near-black against near-white deck.
//
// Toon shading fixes both at once, because MeshToonMaterial ignores metalness
// and the environment entirely and shades from the same lights the map does.
// But that also means the brightness the metal used to borrow from reflections
// has to be put back into the albedo, or converting makes the character DARKER
// rather than better integrated — see reflectiveGain() below.
//
// The third piece is contact. Shadow maps are off across the whole renderer
// ("sky-only lighting: no shadow casters"), so nothing in the arena grounds
// anything. A figure with no shadow floats however well it is shaded, so the
// character gets an explicit contact shadow that finds the surface underneath
// it — deck, ramp or crate — and tightens as it lands.
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';

// The map's own toon materials carry no gradientMap, so three shades them with
// its default smooth two-tone ramp. Matching that exactly is the point: this is
// the same band count the map resolves to, not a stylistic choice of our own.
// A ramp here would band the character MORE finely than the arena it stands in.
const MAP_GRADIENT = null;

// How much of a metal's lost reflection to put back as albedo. A fully metallic
// surface under toon shading has nothing but its base colour left, and these
// base colours were authored dark on purpose because reflection was doing the
// lifting (`readableUnder * 0.72`, `plateColor * 0.92`). Without this the
// conversion reads as "the character got darker".
const METAL_LIFT = 0.62;
// Toon shading loses the specular sheen that separated a plate edge from the
// plate. A little extra gain on the brightest materials keeps that separation.
const SHEEN_LIFT = 0.10;

/**
 * The albedo a metal surface needs under toon shading to sit at the value it
 * held under PBR, where most of its light arrived as reflection.
 */
function reflectiveGain(color, metalness, envIntensity) {
  const lift = METAL_LIFT * Math.min(1, metalness) * Math.min(1.4, envIntensity);
  const c = color.clone();
  // Move toward white rather than scaling: scaling a near-black plate stays
  // near-black, and metal reflections are broadly neutral in this arena's light.
  c.lerp(_white, lift * 0.5);
  c.multiplyScalar(1 + lift * 0.5 + SHEEN_LIFT * Math.min(1, metalness));
  c.r = Math.min(1, c.r); c.g = Math.min(1, c.g); c.b = Math.min(1, c.b);
  return c;
}
const _white = new THREE.Color(0xffffff);

/**
 * Convert one PBR material to the arena's shading language.
 *
 * Everything that survives the model change is carried across — colour maps,
 * normal maps, emissive (the visor and energy accents), alpha. roughnessMap and
 * metalnessMap have no meaning under toon shading and are dropped; that is the
 * conversion working, not detail being lost by accident.
 */
function toonify(src) {
  const m = new THREE.MeshToonMaterial({
    color: reflectiveGain(src.color ?? _white,
                          src.metalness ?? 0,
                          src.envMapIntensity ?? 1),
    map: src.map ?? null,
    normalMap: src.normalMap ?? null,
    emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0x000000),
    emissiveMap: src.emissiveMap ?? null,
    emissiveIntensity: src.emissiveIntensity ?? 1,
    alphaMap: src.alphaMap ?? null,
    alphaTest: src.alphaTest ?? 0,
    transparent: !!src.transparent,
    opacity: src.opacity ?? 1,
    side: src.side ?? THREE.FrontSide,
    vertexColors: !!src.vertexColors,
    gradientMap: MAP_GRADIENT,
    dithering: true,          // the map decodes with dithering; match its banding
  });
  if (src.normalScale && m.normalScale) m.normalScale.copy(src.normalScale);
  m.name = src.name || '';
  m.userData = { ...(src.userData || {}), arenaLook: true, wasStandard: true };
  return m;
}

/**
 * Shade every surface of a character the way the arena is shaded.
 *
 * Safe to call twice — already-converted materials are left alone, so a body
 * that is rebuilt on respawn or retinted by a skin change does not compound the
 * brightness lift.
 */
export function applyArenaLook(root) {
  if (!root) return root;
  const converted = new Map();
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const out = list.map((src) => {
      if (!src || src.userData?.arenaLook) return src;
      // The cyborg chassis and the authored guns are already toon-shaded, and
      // an outline hull is deliberately unlit — leave both exactly as they are.
      if (!src.isMeshStandardMaterial && !src.isMeshPhysicalMaterial) return src;
      if (!converted.has(src)) converted.set(src, toonify(src));
      return converted.get(src);
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  // The old materials are still referenced by nothing else on this body; free
  // their GPU state rather than leaving one per respawn behind.
  for (const src of converted.keys()) src.dispose?.();
  root.userData.arenaLook = true;
  return root;
}

// ── Contact shadow ─────────────────────────────────────────────────────────

function shadowTexture() {
  if (shadowTexture._tex) return shadowTexture._tex;
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  // Denser in the middle than a linear falloff: a figure's contact darkens
  // sharply right under it and fades out well before the edge of the blob.
  g.addColorStop(0.00, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.70, 'rgba(0,0,0,0.16)');
  g.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  shadowTexture._tex = tex;
  return tex;
}

const SHADOW_RADIUS = 0.62;   // metres; roughly a standing figure's footprint
const FADE_HEIGHT   = 3.2;    // metres of air before the shadow is gone

/**
 * A soft dark ellipse that tracks a body onto whatever it is standing over.
 *
 * Lives in the scene rather than under the body, because the body leans and bobs
 * with the gait and a parented shadow would lean and bob with it — sliding off
 * the floor on every stride.
 */
export class ContactShadow {
  constructor(scene, radius = SHADOW_RADIUS) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      // The deck is flat and the shadow sits a few millimetres over it; without
      // an offset the two z-fight into a shimmering mess at grazing angles.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.radius = radius;
    this._scene = scene;
    scene.add(this.mesh);
  }

  /**
   * @param {World} world  for the surface query
   * @param {Vector3} pos  the body's feet position
   * @param {number} scale extra size, e.g. a crouched figure spreads a little
   */
  update(world, pos, scale = 1) {
    const surface = world?.surfaceBelow?.(pos.x, pos.y, pos.z);
    if (surface === null || surface === undefined) { this.mesh.visible = false; return; }
    const air = Math.max(0, pos.y - surface);
    if (air > FADE_HEIGHT) { this.mesh.visible = false; return; }
    const t = air / FADE_HEIGHT;
    // Airborne reads as a smaller, fainter, softer patch — the standard cue
    // that tells you how far off the ground something is.
    const s = this.radius * scale * (1 - t * 0.45) * 2;
    this.mesh.scale.set(s, 1, s);
    this.mesh.position.set(pos.x, surface + 0.02, pos.z);
    this.material.opacity = 0.62 * (1 - t) * (1 - t);
    this.mesh.visible = true;
  }

  dispose() {
    this._scene?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
