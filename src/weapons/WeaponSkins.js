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
// Curated to 15 common / 12 epic / 5 legendary / 3 mythic — one clear pick
// per visual theme rather than several near-duplicate recolors.

export const WEAPON_SKINS = [
  // ── COMMON (15) ──────────────────────────────────────────────────────────────
  { id: 'midnight', name: 'Midnight Black', rarity: 'common', body: 0x23262b, accent: 0x121317, metal: 0x6f757c, metalness: 0.55, roughness: 0.45 },
  { id: 'urban',    name: 'Urban Gray',     rarity: 'common', body: 0x6b727a, accent: 0x3a3e44, metal: 0x9aa1a9, metalness: 0.5,  roughness: 0.45 },
  { id: 'desert',   name: 'Desert Tan',     rarity: 'common', body: 0xb29766, accent: 0x6c5a3a, metal: 0x9c8e72, metalness: 0.4,  roughness: 0.6  },
  { id: 'olive',    name: 'Olive Drab',     rarity: 'common', body: 0x59603a, accent: 0x33371f, metal: 0x767a5a, metalness: 0.45, roughness: 0.55 },
  { id: 'woodland', name: 'Woodland Camo',  rarity: 'common', body: 0x47542f, accent: 0x2b2a1b, metal: 0x5c6347, metalness: 0.4, roughness: 0.6, decal: 'digicamo' },
  { id: 'ranger',   name: 'Forest Ranger',  rarity: 'common', body: 0x2d4228, accent: 0x1a2616, metal: 0x4a5e40, metalness: 0.4, roughness: 0.58 },
  { id: 'stealth',  name: 'Stealth',        rarity: 'common', body: 0x111214, accent: 0x191b1e, metal: 0x2a2d33, metalness: 0.68, roughness: 0.28 },
  { id: 'carbon',   name: 'Carbon Fiber',   rarity: 'common', body: 0x18191d, accent: 0x2c2f35, metal: 0x6a7077, metalness: 0.8, roughness: 0.2, decal: 'carbon' },
  { id: 'slate',    name: 'Slate Blue',    rarity: 'common', body: 0x4a5663, accent: 0x262d35, metal: 0x7e8a98, metalness: 0.5,  roughness: 0.5  },
  { id: 'charcoal', name: 'Charcoal',      rarity: 'common', body: 0x2c2e31, accent: 0x161719, metal: 0x595d62, metalness: 0.6,  roughness: 0.4  },
  { id: 'rust',     name: 'Rustic Iron',   rarity: 'common', body: 0x7a4a32, accent: 0x3a2218, metal: 0x9a6a4a, metalness: 0.55, roughness: 0.52 },
  { id: 'coral',    name: 'Coral Reef',    rarity: 'common', body: 0xe07a6a, accent: 0x6e3028, metal: 0xf0a090, metalness: 0.5, roughness: 0.4 },
  { id: 'mint',     name: 'Mint Fresh',    rarity: 'common', body: 0x7ad4b0, accent: 0x2c5a48, metal: 0xa8ead4, metalness: 0.55, roughness: 0.35 },
  { id: 'copper',   name: 'Copper Patina', rarity: 'common', body: 0x4a8a78, accent: 0x6a4a2a, metal: 0xc97a4a, metalness: 0.85, roughness: 0.3 },
  { id: 'amethyst', name: 'Amethyst',      rarity: 'common', body: 0x6a4a8c, accent: 0x331f4a, metal: 0x9a6acc, metalness: 0.7, roughness: 0.3 },

  // ── EPIC (12) ────────────────────────────────────────────────────────────────
  { id: 'crimson',  name: 'Crimson',        rarity: 'epic', body: 0x7c1f22, accent: 0x1b1416, metal: 0x9a4a4a, metalness: 0.6, roughness: 0.35 },
  { id: 'tiger',    name: 'Tiger Strike',   rarity: 'epic', body: 0xff9a2a, accent: 0x1a1208, metal: 0xc87a1a, metalness: 0.5, roughness: 0.45, decal: 'tiger' },
  {
    id: 'arctic', name: 'Arctic Frost', rarity: 'epic',
    body: 0xd6dde5, accent: 0x5a7a8a, metal: 0xc2cad3, metalness: 0.6, roughness: 0.3,
    emissive: 0x2a6a9a, emissiveIntensity: 0.6, decal: 'frost', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 1.8, animMin: 0.4, animMax: 1.2
  },
  { id: 'gold',     name: 'Gold Plated',    rarity: 'epic', body: 0xc7a23a, accent: 0x4a3a12, metal: 0xe0c25a, metalness: 0.95, roughness: 0.16, decal: 'gold' },
  { id: 'skull',    name: 'Bonecrusher',    rarity: 'epic', body: 0x14151a, accent: 0x0a0a0e, metal: 0x9a9a90, metalness: 0.6, roughness: 0.45, decal: 'skull' },
  {
    id: 'dragonscale', name: 'Dragonscale 🐉', rarity: 'epic',
    body: 0x1a7a44, accent: 0x06160d, metal: 0x2fae6a, metalness: 0.7, roughness: 0.28,
    emissive: 0x0a3a1c, emissiveIntensity: 0.2, decal: 'dragon'
  },
  {
    id: 'plasma', name: 'Plasma ⚡', rarity: 'epic',
    body: 0x0a0f1a, accent: 0x001066, metal: 0x0055cc, metalness: 0.8, roughness: 0.15,
    emissive: 0x00aaff, emissiveIntensity: 1.2,
    animated: true, animType: 'pulse', animSpeed: 3.2, animMin: 0.6, animMax: 2.2
  },
  {
    id: 'toxic', name: 'Toxic Waste ☣', rarity: 'epic',
    body: 0x0a1206, accent: 0x05100a, metal: 0x3a9c1a, metalness: 0.6, roughness: 0.35,
    emissive: 0x66ff22, emissiveIntensity: 1.2, decal: 'toxic', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 3.5, animMin: 0.6, animMax: 1.8
  },
  {
    id: 'inferno', name: 'Inferno', rarity: 'epic',
    body: 0x1a0800, accent: 0x5c1400, metal: 0xcc3300, metalness: 0.6, roughness: 0.3,
    emissive: 0xff4400, emissiveIntensity: 1.3,
    animated: true, animType: 'flicker', animSpeed: 6.0, animMin: 0.6, animMax: 2.3
  },
  {
    id: 'urbanedge', name: 'Urban Edge', rarity: 'epic',
    body: 0x8a9099, accent: 0x23262b, metal: 0xc8ccd2, metalness: 0.7, roughness: 0.3,
    decal: 'camo_urban'
  },
  {
    id: 'amber', name: 'Amber Glass', rarity: 'epic',
    body: 0xd08a1a, accent: 0x5a3a08, metal: 0xf0b84a, metalness: 0.7, roughness: 0.22,
    emissive: 0xff9a00, emissiveIntensity: 0.5,
    animated: true, animType: 'pulse', animSpeed: 1.5, animMin: 0.3, animMax: 0.9
  },
  { id: 'stormsteel', name: 'Storm Steel', rarity: 'epic', body: 0x586878, accent: 0x2a333c, metal: 0xaebcca, metalness: 0.92, roughness: 0.14 },

  // ── LEGENDARY (5) ──────────────────────────────────────────────────────────────
  {
    id: 'wildfire', name: 'Wildfire 🔥', rarity: 'legendary',
    body: 0xff5a00, accent: 0x2a0a00, metal: 0xff7a1a, metalness: 0.5, roughness: 0.4,
    emissive: 0xff3300, emissiveIntensity: 1.4, decal: 'fire', decalEmissive: true,
    animated: true, animType: 'flicker', animSpeed: 7.0, animMin: 0.7, animMax: 2.4,
    shootSound: 'fire'
  },
  {
    id: 'cybernet', name: 'Cybernet 🤖', rarity: 'legendary',
    body: 0x0a1014, accent: 0x04080c, metal: 0x0aa0c0, metalness: 0.85, roughness: 0.18,
    emissive: 0x00e5ff, emissiveIntensity: 1.3, decal: 'cyber', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 4.0, animMin: 0.7, animMax: 2.0,
    shootSound: 'laser'
  },
  {
    id: 'galaxy', name: 'Galaxy ✦', rarity: 'legendary',
    body: 0x06030f, accent: 0x030208, metal: 0x5a3a9c, metalness: 0.8, roughness: 0.2,
    emissive: 0x9c4aff, emissiveIntensity: 1.2, decal: 'galaxy', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 2.2, animMin: 0.6, animMax: 2.0
  },
  {
    id: 'crimsonmoon', name: 'Crimson Moon 🌑', rarity: 'legendary',
    body: 0x2c0608, accent: 0x120203, metal: 0xf0c24a, metalness: 0.85, roughness: 0.2,
    emissive: 0xff2a3a, emissiveIntensity: 1.0, decal: 'bloodmoon', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 1.4, animMin: 0.5, animMax: 1.6
  },
  {
    id: 'royalgold', name: 'Royal Gold 👑', rarity: 'legendary',
    body: 0x3a2c08, accent: 0x1a1404, metal: 0xffd24a, metalness: 0.97, roughness: 0.1,
    emissive: 0xffc800, emissiveIntensity: 0.7, decal: 'gold', decalEmissive: true
  },

  // ── MYTHIC (3) ───────────────────────────────────────────────────────────────
  {
    id: 'prism', name: 'Prism 🌈', rarity: 'mythic',
    body: 0x1a1a1a, accent: 0x0f0f0f, metal: 0x808080, metalness: 0.85, roughness: 0.12,
    emissive: 0xffffff, emissiveIntensity: 1.6, animated: true, animType: 'cycle'
  },
  {
    // Anime waifu finish: pastel sakura decal (stars/hearts/petals), hot-pink
    // glow, and the kawaii "pew~!" shoot sound. shootSound is in CUTE_SOUNDS,
    // so firing also gets the pink muzzle flash + sparkle-heart burst.
    id: 'sakura', name: 'Sakura Waifu 🌸', rarity: 'mythic',
    body: 0xff8fce, accent: 0x6a2a8c, metal: 0xe0a0ff, metalness: 0.55, roughness: 0.3,
    emissive: 0xff3aa0, emissiveIntensity: 1.5, decal: 'anime', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 2.8, animMin: 0.8, animMax: 2.3,
    shootSound: 'anime'
  },
  {
    id: 'pyroclasm', name: 'Pyroclasm 🔥', rarity: 'mythic',
    body: 0x0c0400, accent: 0x1a0600, metal: 0xff6a00, metalness: 0.52, roughness: 0.38,
    emissive: 0xff2200, emissiveIntensity: 2.2, decal: 'fire', decalEmissive: true,
    animated: true, animType: 'flicker', animSpeed: 10.0, animMin: 0.8, animMax: 3.0,
    shootSound: 'fire', fireEmbers: true
  }
];

const _hsl = new THREE.Color();

export function getWeaponSkin(id) {
  return WEAPON_SKINS.find((s) => s.id === id) || WEAPON_SKINS[0];
}

/** Recolor a built gun model group using the skin's material role tags. */
export function applyWeaponSkin(group, skin) {
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
    } else if (role === 'metal') {
      m.color.setHex(skin.metal);
      m.emissive.setHex(skin.emissive ?? 0x000000);
      m.emissiveIntensity = skin.emissiveIntensity ?? 0;
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
