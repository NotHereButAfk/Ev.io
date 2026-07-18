import * as THREE from 'three';
import { decalTexture } from './WeaponTextures.js';

// Cosmetic finishes for guns. Each skin recolors the material "roles"
// tagged on every gun model (body / accent / metal). Wood and special parts
// are left untouched. Animated skins also update emissive properties each
// frame via animateWeaponSkin().
//
// A skin may also carry:
//   rarity      — 'common'|'epic'|'legendary'|'mythic'
//   decal       — a seamless image pattern painted on the body (see WeaponTextures)
//   decalEmissive — the decal also glows via emissiveMap
//   shootSound  — overrides the fire SFX ('anime' kawaii pew, 'laser', 'fire')
//
// Curated to 10 common / 10 epic / 6 legendary / 4 mythic (30 total) — one
// clear pick per visual theme rather than several near-duplicate recolors.

// Five free common finishes, usable on any gun (commons are auto-owned — see
// Armory.ownsSkin). Each just recolours the shell or retints the energy glow.
// The light-tint skins keep the guns' shared gunmetal body and only change
// energyColor; the others recolour the shell (Desert keeps the cyan glow).
export const WEAPON_SKINS = [
  { id: 'ember',   name: 'Ember',   rarity: 'common', body: 0x394049, accent: 0x0c0e11, metal: 0x8a929c, metalness: 0.42, roughness: 0.48, energyColor: 0xff7a1e },
  { id: 'venom',   name: 'Venom',   rarity: 'common', body: 0x394049, accent: 0x0c0e11, metal: 0x8a929c, metalness: 0.42, roughness: 0.48, energyColor: 0x54ff45 },
  { id: 'crimson', name: 'Crimson', rarity: 'common', body: 0x394049, accent: 0x0c0e11, metal: 0x8a929c, metalness: 0.42, roughness: 0.48, energyColor: 0xff2e3a },
  { id: 'desert',  name: 'Desert',  rarity: 'common', body: 0xb29766, accent: 0x4a3b24, metal: 0xa89878, metalness: 0.40, roughness: 0.55 },
  { id: 'arctic',  name: 'Arctic',  rarity: 'common', body: 0xcdd6dd, accent: 0x5f6a74, metal: 0xb8c2cc, metalness: 0.50, roughness: 0.40, energyColor: 0x8fd8ff },
  { id: 'solar',       name: 'Solar',       rarity: 'common', body: 0x394049, accent: 0x0c0e11, metal: 0x8a929c, metalness: 0.42, roughness: 0.48, energyColor: 0xffc93a },
  { id: 'ultraviolet', name: 'Ultraviolet', rarity: 'common', body: 0x394049, accent: 0x0c0e11, metal: 0x8a929c, metalness: 0.42, roughness: 0.48, energyColor: 0xb44dff },
  { id: 'woodland',    name: 'Woodland',    rarity: 'common', body: 0x5a6648, accent: 0x2a3220, metal: 0x7a8468, metalness: 0.38, roughness: 0.58 },
  { id: 'graphite',    name: 'Graphite',    rarity: 'common', body: 0x1c1f24, accent: 0x0a0c0e, metal: 0x4a505a, metalness: 0.55, roughness: 0.35, energyColor: 0xd8ecff },
  { id: 'copper',      name: 'Copper',      rarity: 'common', body: 0x9a5f38, accent: 0x3a2214, metal: 0xc08050, metalness: 0.70, roughness: 0.35, energyColor: 0xffb070 },

  // ── EPIC (5): animated finishes — a glowing pattern on the shell plus a
  // pulsing / cycling emissive. Also auto-owned (see Armory.ownsSkin).
  { id: 'voltage',   name: 'Voltage',   rarity: 'epic', body: 0x1b2733, accent: 0x0a0f14, metal: 0x8a929c, metalness: 0.50, roughness: 0.40,
    emissive: 0x2ee6ff, emissiveIntensity: 0.9, energyColor: 0x2ee6ff, decal: 'hextech', decalEmissive: true,
    animated: true, animType: 'pulse',   animSpeed: 3.4, animMin: 0.45, animMax: 1.5 },
  { id: 'inferno',   name: 'Inferno',   rarity: 'epic', body: 0x2a1206, accent: 0x160800, metal: 0x8a7a70, metalness: 0.50, roughness: 0.45,
    emissive: 0xff4400, emissiveIntensity: 0.9, energyColor: 0xff5a1e, decal: 'lava', decalEmissive: true,
    animated: true, animType: 'flicker', animSpeed: 6.0, animMin: 0.40, animMax: 1.5 },
  { id: 'biohazard', name: 'Biohazard', rarity: 'epic', body: 0x16260c, accent: 0x0a1206, metal: 0x7a8a68, metalness: 0.50, roughness: 0.45,
    emissive: 0x4aff00, emissiveIntensity: 0.9, energyColor: 0x66ff2e, decal: 'toxic', decalEmissive: true,
    animated: true, animType: 'flicker', animSpeed: 7.0, animMin: 0.40, animMax: 1.4 },
  { id: 'cosmos',    name: 'Cosmos',    rarity: 'epic', body: 0x120c22, accent: 0x080610, metal: 0x8a86a0, metalness: 0.55, roughness: 0.35,
    emissive: 0x8a3aff, emissiveIntensity: 0.9, energyColor: 0x9a50ff, decal: 'galaxy', decalEmissive: true,
    animated: true, animType: 'pulse',   animSpeed: 2.2, animMin: 0.40, animMax: 1.4 },
  { id: 'prismatic', name: 'Prismatic', rarity: 'epic', body: 0x101018, accent: 0x08080c, metal: 0x9aa0ac, metalness: 0.60, roughness: 0.30,
    emissive: 0xffffff, emissiveIntensity: 1.4, decal: 'holographic', decalEmissive: true,
    animated: true, animType: 'rainbow', animSpeed: 0.3, animMin: 1.0,  animMax: 2.0 },
  { id: 'stormcall',   name: 'Stormcall',    rarity: 'epic', body: 0x1a1f2e, accent: 0x0a0d14, metal: 0x8a92a4, metalness: 0.55, roughness: 0.38,
    emissive: 0xffe23a, emissiveIntensity: 0.9, energyColor: 0xffe23a, decal: 'lightning', decalEmissive: true,
    animated: true, animType: 'flicker', animSpeed: 9.0, animMin: 0.35, animMax: 1.6 },
  { id: 'permafrost',  name: 'Permafrost',   rarity: 'epic', body: 0x10202c, accent: 0x081018, metal: 0x9ab4c4, metalness: 0.55, roughness: 0.30,
    emissive: 0x6ad4ff, emissiveIntensity: 0.9, energyColor: 0x8fe0ff, decal: 'ice', decalEmissive: true,
    animated: true, animType: 'pulse',   animSpeed: 1.8, animMin: 0.45, animMax: 1.3 },
  { id: 'cybergrid',   name: 'Cybergrid',    rarity: 'epic', body: 0x140a1e, accent: 0x0a0512, metal: 0x8a86a0, metalness: 0.55, roughness: 0.35,
    emissive: 0xff3ad4, emissiveIntensity: 0.9, energyColor: 0xff3ad4, decal: 'circuitneon', decalEmissive: true,
    animated: true, animType: 'pulse',   animSpeed: 3.0, animMin: 0.45, animMax: 1.5 },
  { id: 'darknet',     name: 'Darknet',      rarity: 'epic', body: 0x061206, accent: 0x030a04, metal: 0x5a7a5e, metalness: 0.50, roughness: 0.40,
    emissive: 0x30ff5a, emissiveIntensity: 0.9, energyColor: 0x30ff5a, decal: 'matrix', decalEmissive: true,
    animated: true, animType: 'flicker', animSpeed: 5.0, animMin: 0.40, animMax: 1.4 },
  { id: 'tigerstrike', name: 'Tiger Strike', rarity: 'epic', body: 0x2e1a08, accent: 0x140b04, metal: 0x9a8266, metalness: 0.50, roughness: 0.45,
    emissive: 0xff8a1e, emissiveIntensity: 0.8, energyColor: 0xff8a1e, decal: 'tiger', decalEmissive: true,
    animated: true, animType: 'pulse',   animSpeed: 2.6, animMin: 0.40, animMax: 1.2 },

  // ── LEGENDARY (3): total-coverage wraps — the artwork flows over the
  // receiver, barrel and trim too (decalOnMetal/decalOnAccent), with a themed
  // energy retint. Auto-owned like the rest (see Armory.ownsSkin).
  { id: 'royalgold', name: 'Royal Gold 👑', rarity: 'legendary', body: 0xc7a23a, accent: 0x4a3a12, metal: 0xe0c25a, metalness: 0.95, roughness: 0.18,
    emissive: 0xffc83a, emissiveIntensity: 0.7, energyColor: 0xffc83a,
    decal: 'gold', decalEmissive: true, decalOnMetal: true, decalOnAccent: true,
    animated: true, animType: 'pulse', animSpeed: 1.6, animMin: 0.45, animMax: 1.1 },
  { id: 'bloodmoon', name: 'Blood Moon 🌑', rarity: 'legendary', body: 0x1a0a0e, accent: 0x0e0508, metal: 0x6a3a42, metalness: 0.60, roughness: 0.40,
    emissive: 0xff2030, emissiveIntensity: 0.8, energyColor: 0xff2030,
    decal: 'bloodmoon', decalEmissive: true, decalOnMetal: true, decalOnAccent: true,
    animated: true, animType: 'pulse', animSpeed: 1.2, animMin: 0.50, animMax: 1.3 },
  { id: 'bonecrusher', name: 'Bonecrusher 💀', rarity: 'legendary', body: 0x14151a, accent: 0x0a0a0e, metal: 0x9a9a90, metalness: 0.60, roughness: 0.45,
    emissive: 0xcfe8ff, emissiveIntensity: 0.8, energyColor: 0xcfe8ff,
    decal: 'skull', decalEmissive: true, decalOnMetal: true, decalOnAccent: true,
    animated: true, animType: 'flicker', animSpeed: 4.5, animMin: 0.45, animMax: 1.2 },
  { id: 'jadedragon', name: 'Jade Dragon 🐉', rarity: 'legendary', body: 0x0e2a1a, accent: 0x06140a, metal: 0x3a8a5a, metalness: 0.65, roughness: 0.32,
    emissive: 0x3aff9a, emissiveIntensity: 0.8, energyColor: 0x3aff9a,
    decal: 'dragon', decalEmissive: true, decalOnMetal: true, decalOnAccent: true,
    animated: true, animType: 'pulse', animSpeed: 1.4, animMin: 0.45, animMax: 1.2 },
  { id: 'whiteout', name: 'Whiteout ❄️', rarity: 'legendary', body: 0xdce8f0, accent: 0x8aa4b4, metal: 0xf0f6fa, metalness: 0.55, roughness: 0.25,
    emissive: 0x9adcff, emissiveIntensity: 0.7, energyColor: 0x9adcff,
    decal: 'frost', decalEmissive: true, decalOnMetal: true, decalOnAccent: true,
    animated: true, animType: 'pulse', animSpeed: 1.0, animMin: 0.40, animMax: 1.1 },
  { id: 'shadowops', name: 'Shadow Ops 🎖️', rarity: 'legendary', body: 0x22262c, accent: 0x101318, metal: 0x5a6068, metalness: 0.55, roughness: 0.45,
    emissive: 0xffa030, emissiveIntensity: 0.7, energyColor: 0xffa030,
    decal: 'camo_urban', decalEmissive: true, decalOnMetal: true, decalOnAccent: true,
    animated: true, animType: 'flicker', animSpeed: 3.2, animMin: 0.35, animMax: 1.0 },

  // ── MYTHIC (2): showpieces — total-coverage wraps plus a custom synthesized
  // shoot sound (see AudioManager.playSkinShot).
  { id: 'fireball', name: 'Fireball 🔥', rarity: 'mythic', body: 0x1c0a04, accent: 0x0e0502, metal: 0x8a5a40, metalness: 0.55, roughness: 0.40,
    emissive: 0xff4400, emissiveIntensity: 1.0, energyColor: 0xff5a1e,
    decal: 'fire', decalEmissive: true, decalOnMetal: true, decalOnAccent: true,
    animated: true, animType: 'flicker', animSpeed: 8.0, animMin: 0.55, animMax: 1.6,
    shootSound: 'fireball' },   // every shot shouts "FIREBALL!"
  { // Japanese anime showpiece: the hand-drawn Neko Neon street wrap (cat-girl,
    // neon kanji signs, lanterns — textures/sakura/wrap.png) over a white base,
    // warm neon-pink glow, and the cute anime-girl "ah~♪" vocal per shot.
    id: 'sakura', name: 'Neko Neon 😺', rarity: 'mythic',
    body: 0xffffff, accent: 0xffffff, metal: 0xffffff, metalness: 0.4, roughness: 0.36,
    emissive: 0xff5ea0, emissiveIntensity: 0.4, energyColor: 0xff5ea0,
    decal: 'animegirl', decalEmissive: true, decalOnMetal: true, decalOnAccent: true,
    animated: true, animType: 'pulse', animSpeed: 2.2, animMin: 0.25, animMax: 0.7,
    shootSound: 'waifu' },
  { id: 'prismbreak', name: 'Prism Break 🌈', rarity: 'mythic', body: 0x0c0c14, accent: 0x060608, metal: 0x9aa0ac, metalness: 0.70, roughness: 0.25,
    emissive: 0xffffff, emissiveIntensity: 1.2, decal: 'cyber', decalEmissive: true, decalOnMetal: true, decalOnAccent: true,
    animated: true, animType: 'rainbow', animSpeed: 0.6, animMin: 1.1, animMax: 2.2,
    shootSound: 'prism' },   // crystalline chime per shot
  { id: 'k9unit', name: 'K-9 Unit 🐶', rarity: 'mythic', body: 0x3a4038, accent: 0x1a1e18, metal: 0x8a8e80, metalness: 0.50, roughness: 0.50,
    emissive: 0xffb040, emissiveIntensity: 0.6, energyColor: 0xffb040,
    decal: 'digicamo', decalEmissive: true, decalOnMetal: true, decalOnAccent: true,
    animated: true, animType: 'pulse', animSpeed: 2.8, animMin: 0.30, animMax: 0.9,
    shootSound: 'bark' },    // every shot barks — good boy
];

const _hsl = new THREE.Color();

export function getWeaponSkin(id) {
  // Catalog is empty — no gun skins exist, so there is no default fallback.
  return WEAPON_SKINS.find((s) => s.id === id) || null;
}

/** Recolor a built gun model group using the skin's material role tags. */
export function applyWeaponSkin(group, skin) {
  // No skin (empty catalog / cleared finish) → leave the model's build-time look.
  if (!skin) return;
  const decal = skin.decal ? decalTexture(skin.decal) : null;
  const seen = new Set();
  group.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const m = obj.material;
    if (seen.has(m)) return;
    seen.add(m);
    const role = m.userData?.role;
    if (role === 'body') {
      m.color.setHex(skin.body);
      m.metalness = skin.metalness;
      m.roughness = skin.roughness;
      m.emissive.setHex(skin.emissive ?? 0x000000);
      m.emissiveIntensity = skin.emissiveIntensity ?? 0;
      // Painted decal pattern on the main shell.
      m.map = decal || null;
      if (skin.decalEmissive && decal) {
        m.emissiveMap = decal;
        m.emissive.setHex(0xffffff); // let the pattern's own colors glow
      } else {
        m.emissiveMap = null;
      }
      m.needsUpdate = true;
    } else if (role === 'accent') {
      m.color.setHex(skin.accent);
      m.metalness = skin.metalness;
      m.roughness = Math.min(0.85, skin.roughness + 0.15);
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
      // Total-coverage wraps also paint the trim/furniture parts. Clear the map
      // otherwise, so switching back from a full wrap to a normal skin doesn't
      // leave the old artwork on the trim (materials are reused across skins).
      m.map = (skin.decalOnAccent && decal) ? decal : null;
      m.needsUpdate = true;
    } else if (role === 'energy') {
      // Sci-fi glow strips. A skin may retint the hue (e.g. a "make the light
      // a different colour" finish). Keep a near-black base so the part doesn't
      // wash out under the game's ACES tone mapping — the glow rides on the
      // emissive, exactly as the model build does. Record the build-time colours
      // once so a retint is reversible when the next skin omits energyColor.
      if (m.userData.baseEnergyColor === undefined) {
        m.userData.baseEnergyColor = m.color.getHex();
        m.userData.baseEnergyEmissive = m.emissive.getHex();
      }
      if (skin.energyColor !== undefined) {
        m.color.setHex(_hsl.setHex(skin.energyColor).multiplyScalar(0.12).getHex());
        m.emissive.setHex(skin.energyColor);
      } else {
        m.color.setHex(m.userData.baseEnergyColor);
        m.emissive.setHex(m.userData.baseEnergyEmissive);
      }
      m.needsUpdate = true;
    } else if (role === 'metal') {
      m.color.setHex(skin.metal);
      m.emissive.setHex(skin.emissive ?? 0x000000);
      m.emissiveIntensity = skin.emissiveIntensity ?? 0;
      // Full-coverage wraps (decalOnMetal) paint the receiver/barrel too, so
      // the artwork flows across the whole gun instead of only body panels.
      // Otherwise clear the maps so a normal skin fully reverses a prior wrap.
      if (skin.decalOnMetal && decal) {
        m.map = decal;
        if (skin.decalEmissive) { m.emissiveMap = decal; m.emissive.setHex(0xffffff); }
        else m.emissiveMap = null;
      } else {
        m.map = null;
        m.emissiveMap = null;
      }
      m.needsUpdate = true;
    }
    // 'wood' and 'special' roles intentionally left as-is.
  });
}

/**
 * Called every frame for the active gun when its skin is animated.
 * Updates emissive color/intensity only on body + metal parts.
 * @param {THREE.Group} group  Active weapon model
 * @param {object}      skin   Skin definition (must have animated===true)
 * @param {number}      t      Accumulated time in seconds
 */
export function animateWeaponSkin(group, skin, t) {
  if (!skin?.animated) return;
  // For glowing-decal skins the emissiveMap supplies the colour, so we keep
  // emissive white on the body and only animate the glow intensity.
  const glowDecal = skin.decalEmissive;
  const seen = new Set();
  group.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const m = obj.material;
    if (seen.has(m)) return;
    seen.add(m);
    const role = m.userData?.role;
    if (role !== 'body' && role !== 'metal') return;
    const keepWhite = glowDecal && role === 'body';

    switch (skin.animType) {
      case 'pulse': {
        const pulse = (Math.sin(t * skin.animSpeed) + 1) * 0.5;
        if (!keepWhite) m.emissive.setHex(skin.emissive);
        m.emissiveIntensity = skin.animMin + pulse * (skin.animMax - skin.animMin);
        break;
      }
      case 'flicker': {
        const noise = Math.sin(t * skin.animSpeed) * 0.5
          + Math.sin(t * skin.animSpeed * 2.3) * 0.3
          + Math.sin(t * skin.animSpeed * 0.7) * 0.2;
        const f = (noise + 1) * 0.5;
        if (!keepWhite) m.emissive.setHex(skin.emissive);
        m.emissiveIntensity = skin.animMin + f * (skin.animMax - skin.animMin);
        break;
      }
      case 'cycle': {
        const hue = (t * 0.14) % 1;
        _hsl.setHSL(hue, 0.95, 0.55);
        m.emissive.copy(_hsl);
        m.emissiveIntensity = 1.6;
        break;
      }
      case 'rainbow': {
        // Fast continuous hue cycling with a gentle brightness pulse so the
        // bloom shimmers through the whole spectrum.
        const speed = skin.animSpeed ?? 0.35;
        const hue = (t * speed) % 1;
        _hsl.setHSL(hue, 1.0, 0.55);
        if (!keepWhite) m.emissive.copy(_hsl);
        const lo = skin.animMin ?? 1.2, hi = skin.animMax ?? 2.2;
        const pulse = (Math.sin(t * 4.0) + 1) * 0.5;
        m.emissiveIntensity = lo + pulse * (hi - lo);
        break;
      }
    }
  });
}
