import * as THREE from 'three';
import { decalTexture } from './WeaponTextures.js';

// Cosmetic finishes for guns. Each skin recolors the material "roles"
// tagged on every gun model (body / accent / metal). Wood and special parts
// are left untouched. Animated skins also update emissive properties each
// frame via animateWeaponSkin().
//
// A skin may also carry:
//   rarity      — 'common'|'uncommon'|'rare'|'epic'|'legendary'|'mythic'
//   decal       — a seamless image pattern painted on the body (see WeaponTextures)
//   decalEmissive — the decal also glows via emissiveMap
//   shootSound  — overrides the fire SFX ('anime' kawaii pew, 'laser', 'fire')

export const WEAPON_SKINS = [
  // ── COMMON ───────────────────────────────────────────────────────────────
  { id: 'midnight', name: 'Midnight Black', rarity: 'common', body: 0x23262b, accent: 0x121317, metal: 0x6f757c, metalness: 0.55, roughness: 0.45 },
  { id: 'urban',    name: 'Urban Gray',     rarity: 'common', body: 0x6b727a, accent: 0x3a3e44, metal: 0x9aa1a9, metalness: 0.5,  roughness: 0.45 },
  { id: 'desert',   name: 'Desert Tan',     rarity: 'common', body: 0xb29766, accent: 0x6c5a3a, metal: 0x9c8e72, metalness: 0.4,  roughness: 0.6  },
  { id: 'olive',    name: 'Olive Drab',     rarity: 'common', body: 0x59603a, accent: 0x33371f, metal: 0x767a5a, metalness: 0.45, roughness: 0.55 },

  // ── UNCOMMON ───────────────────────────────────────────────────────────────
  { id: 'woodland', name: 'Woodland Camo',  rarity: 'uncommon', body: 0x47542f, accent: 0x2b2a1b, metal: 0x5c6347, metalness: 0.4, roughness: 0.6, decal: 'digicamo' },
  { id: 'ranger',   name: 'Forest Ranger',  rarity: 'uncommon', body: 0x2d4228, accent: 0x1a2616, metal: 0x4a5e40, metalness: 0.4, roughness: 0.58 },
  { id: 'navy',     name: 'Navy Ops',       rarity: 'uncommon', body: 0x1a2440, accent: 0x0e1628, metal: 0x2c3e5c, metalness: 0.55, roughness: 0.4 },
  { id: 'stealth',  name: 'Stealth',        rarity: 'uncommon', body: 0x111214, accent: 0x191b1e, metal: 0x2a2d33, metalness: 0.68, roughness: 0.28 },
  { id: 'carbon',   name: 'Carbon Fiber',   rarity: 'uncommon', body: 0x18191d, accent: 0x2c2f35, metal: 0x6a7077, metalness: 0.8, roughness: 0.2, decal: 'carbon' },

  // ── RARE ───────────────────────────────────────────────────────────────────
  { id: 'crimson',  name: 'Crimson',        rarity: 'rare', body: 0x7c1f22, accent: 0x1b1416, metal: 0x9a4a4a, metalness: 0.6, roughness: 0.35 },
  { id: 'emerald',  name: 'Emerald',        rarity: 'rare', body: 0x1a5c34, accent: 0x0a2e1a, metal: 0x2e8c54, metalness: 0.78, roughness: 0.22 },
  { id: 'rose',     name: 'Rose Gold',      rarity: 'rare', body: 0xc9786a, accent: 0x7a3a30, metal: 0xdea08c, metalness: 0.9, roughness: 0.18 },
  { id: 'tiger',    name: 'Tiger Strike',   rarity: 'rare', body: 0xff9a2a, accent: 0x1a1208, metal: 0xc87a1a, metalness: 0.5, roughness: 0.45, decal: 'tiger' },
  {
    id: 'arctic', name: 'Arctic Frost', rarity: 'rare',
    body: 0xd6dde5, accent: 0x5a7a8a, metal: 0xc2cad3, metalness: 0.6, roughness: 0.3,
    emissive: 0x2a6a9a, emissiveIntensity: 0.6, decal: 'frost', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 1.8, animMin: 0.4, animMax: 1.2
  },

  // ── EPIC ───────────────────────────────────────────────────────────────────
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

  // ── LEGENDARY ──────────────────────────────────────────────────────────────
  { id: 'titanium', name: 'Titanium',      rarity: 'legendary', body: 0x8c9aaa, accent: 0x4a5260, metal: 0xc2d0de, metalness: 0.9, roughness: 0.1 },
  {
    id: 'obsidian', name: 'Obsidian', rarity: 'legendary',
    body: 0x14101a, accent: 0x0c0a0c, metal: 0x3a2830, metalness: 0.86, roughness: 0.1,
    emissive: 0x12001f, emissiveIntensity: 0.22
  },
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
    id: 'thunderbolt', name: 'Thunderbolt ⚡', rarity: 'legendary',
    body: 0x070a16, accent: 0x040610, metal: 0x7fd8ff, metalness: 0.8, roughness: 0.2,
    emissive: 0xaef0ff, emissiveIntensity: 1.4, decal: 'lightning', decalEmissive: true,
    animated: true, animType: 'flicker', animSpeed: 9.0, animMin: 0.5, animMax: 2.4,
    shootSound: 'laser'
  },
  {
    id: 'galaxy', name: 'Galaxy ✦', rarity: 'legendary',
    body: 0x06030f, accent: 0x030208, metal: 0x5a3a9c, metalness: 0.8, roughness: 0.2,
    emissive: 0x9c4aff, emissiveIntensity: 1.2, decal: 'galaxy', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 2.2, animMin: 0.6, animMax: 2.0
  },

  // ── MYTHIC ───────────────────────────────────────────────────────────────────
  {
    id: 'prism', name: 'Prism 🌈', rarity: 'mythic',
    body: 0x1a1a1a, accent: 0x0f0f0f, metal: 0x808080, metalness: 0.85, roughness: 0.12,
    emissive: 0xffffff, emissiveIntensity: 1.6, animated: true, animType: 'cycle'
  },
  {
    id: 'void', name: 'Void ◈', rarity: 'mythic',
    body: 0x080608, accent: 0x12001a, metal: 0x3a0055, metalness: 0.88, roughness: 0.1,
    emissive: 0x6600cc, emissiveIntensity: 1.3,
    animated: true, animType: 'pulse', animSpeed: 2.4, animMin: 0.5, animMax: 2.1
  },
  {
    id: 'sakura', name: 'Sakura Anime 🌸', rarity: 'mythic',
    body: 0xff8fce, accent: 0x6a2a8c, metal: 0xe0a0ff, metalness: 0.55, roughness: 0.35,
    decal: 'anime', shootSound: 'anime'
  },
  {
    id: 'supernova', name: 'Supernova 💥', rarity: 'mythic',
    body: 0x100318, accent: 0x05010a, metal: 0xff6acc, metalness: 0.8, roughness: 0.16,
    emissive: 0xffffff, emissiveIntensity: 1.5, decal: 'galaxy', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 5.0, animMin: 0.7, animMax: 2.5,
    shootSound: 'laser'
  },

  // ── NEW SKINS (epic+) ────────────────────────────────────────────────────────

  // EPIC
  {
    id: 'urbanedge', name: 'Urban Edge', rarity: 'epic',
    body: 0x8a9099, accent: 0x23262b, metal: 0xc8ccd2, metalness: 0.7, roughness: 0.3,
    decal: 'camo_urban'
  },
  {
    id: 'frostbite', name: 'Frostbite ❄', rarity: 'epic',
    body: 0x9fd8ec, accent: 0x18394a, metal: 0xcfeefb, metalness: 0.7, roughness: 0.18,
    emissive: 0x6fd0ff, emissiveIntensity: 0.9, decal: 'ice', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 1.6, animMin: 0.4, animMax: 1.3
  },
  {
    id: 'overclock', name: 'Overclock', rarity: 'epic',
    body: 0x02100a, accent: 0x021008, metal: 0x15e07a, metalness: 0.8, roughness: 0.22,
    emissive: 0x1bff8a, emissiveIntensity: 1.1, decal: 'circuitneon', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 3.0, animMin: 0.6, animMax: 1.9,
    shootSound: 'laser'
  },

  // LEGENDARY
  {
    id: 'magmacore', name: 'Magma Core', rarity: 'legendary',
    body: 0x0c0503, accent: 0x2a0c00, metal: 0xff7b1a, metalness: 0.55, roughness: 0.4,
    emissive: 0xff5a00, emissiveIntensity: 1.4, decal: 'lava', decalEmissive: true,
    animated: true, animType: 'flicker', animSpeed: 5.5, animMin: 0.7, animMax: 2.3,
    shootSound: 'fire'
  },
  {
    id: 'crimsonmoon', name: 'Crimson Moon 🌑', rarity: 'legendary',
    body: 0x2c0608, accent: 0x120203, metal: 0xf0c24a, metalness: 0.85, roughness: 0.2,
    emissive: 0xff2a3a, emissiveIntensity: 1.0, decal: 'bloodmoon', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 1.4, animMin: 0.5, animMax: 1.6
  },
  {
    id: 'datastream', name: 'Datastream', rarity: 'legendary',
    body: 0x010803, accent: 0x010402, metal: 0x28ff7a, metalness: 0.78, roughness: 0.2,
    emissive: 0x28ff7a, emissiveIntensity: 1.3, decal: 'matrix', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 4.5, animMin: 0.6, animMax: 2.1,
    shootSound: 'laser'
  },
  {
    id: 'iridium', name: 'Iridium 🪙', rarity: 'legendary',
    body: 0x1a1a1a, accent: 0x0f0f0f, metal: 0xc0c0c0, metalness: 0.92, roughness: 0.12,
    emissive: 0xffffff, emissiveIntensity: 1.4, decal: 'holographic', decalEmissive: true,
    animated: true, animType: 'rainbow', animSpeed: 0.22, animMin: 1.0, animMax: 2.0
  },

  // MYTHIC
  {
    id: 'holographic', name: 'Holographic 🌈', rarity: 'mythic',
    body: 0x1a1a1a, accent: 0x101010, metal: 0xb0b0b0, metalness: 0.9, roughness: 0.1,
    emissive: 0xffffff, emissiveIntensity: 1.8, decal: 'holographic', decalEmissive: true,
    animated: true, animType: 'rainbow', animSpeed: 0.35, animMin: 1.3, animMax: 2.5,
    shootSound: 'laser'
  },
  {
    id: 'lavacore', name: 'Lava Core 🌋', rarity: 'mythic',
    body: 0x0c0503, accent: 0x1a0600, metal: 0xff8a2a, metalness: 0.5, roughness: 0.45,
    emissive: 0xff5a00, emissiveIntensity: 1.8, decal: 'lava', decalEmissive: true,
    animated: true, animType: 'flicker', animSpeed: 7.0, animMin: 1.0, animMax: 2.5,
    shootSound: 'fire'
  },
  {
    id: 'matrix', name: 'Matrix 💻', rarity: 'mythic',
    body: 0x010803, accent: 0x010402, metal: 0x28ff7a, metalness: 0.85, roughness: 0.15,
    emissive: 0x28ff7a, emissiveIntensity: 1.9, decal: 'matrix', decalEmissive: true,
    animated: true, animType: 'flicker', animSpeed: 8.0, animMin: 1.0, animMax: 2.4,
    shootSound: 'laser'
  },
  {
    id: 'bloodmoon', name: 'Blood Moon 🩸', rarity: 'mythic',
    body: 0x2c0608, accent: 0x120203, metal: 0xf0c24a, metalness: 0.9, roughness: 0.16,
    emissive: 0xff1a2a, emissiveIntensity: 1.7, decal: 'bloodmoon', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 1.6, animMin: 0.9, animMax: 2.3
  },
  {
    id: 'celestial', name: 'Celestial ✦', rarity: 'mythic',
    body: 0x05030f, accent: 0x020108, metal: 0x6a8aff, metalness: 0.85, roughness: 0.14,
    emissive: 0x9cb8ff, emissiveIntensity: 1.8, decal: 'galaxy', decalEmissive: true,
    animated: true, animType: 'rainbow', animSpeed: 0.18, animMin: 1.2, animMax: 2.4,
    shootSound: 'laser'
  },
  {
    id: 'cryostorm', name: 'Cryostorm ❄', rarity: 'mythic',
    body: 0x9fd8ec, accent: 0x123040, metal: 0xeafaff, metalness: 0.8, roughness: 0.12,
    emissive: 0x7fe0ff, emissiveIntensity: 1.7, decal: 'ice', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 2.0, animMin: 0.9, animMax: 2.4
  },

  // ══ EXPANSION PACK: 5 per tier (common→mythic) ═══════════════════════════════

  // ── COMMON (5) ───────────────────────────────────────────────────────────────
  { id: 'slate',    name: 'Slate Blue',    rarity: 'common', body: 0x4a5663, accent: 0x262d35, metal: 0x7e8a98, metalness: 0.5,  roughness: 0.5  },
  { id: 'sand',     name: 'Sandstorm',     rarity: 'common', body: 0xc9b487, accent: 0x7a6a44, metal: 0xa89a78, metalness: 0.4,  roughness: 0.6  },
  { id: 'moss',     name: 'Moss Green',    rarity: 'common', body: 0x4c5a36, accent: 0x29331d, metal: 0x6c7a52, metalness: 0.42, roughness: 0.56 },
  { id: 'charcoal', name: 'Charcoal',      rarity: 'common', body: 0x2c2e31, accent: 0x161719, metal: 0x595d62, metalness: 0.6,  roughness: 0.4  },
  { id: 'rust',     name: 'Rustic Iron',   rarity: 'common', body: 0x7a4a32, accent: 0x3a2218, metal: 0x9a6a4a, metalness: 0.55, roughness: 0.52 },

  // ── UNCOMMON (5) ─────────────────────────────────────────────────────────────
  { id: 'coral',    name: 'Coral Reef',    rarity: 'uncommon', body: 0xe07a6a, accent: 0x6e3028, metal: 0xf0a090, metalness: 0.5, roughness: 0.4 },
  { id: 'mint',     name: 'Mint Fresh',    rarity: 'uncommon', body: 0x7ad4b0, accent: 0x2c5a48, metal: 0xa8ead4, metalness: 0.55, roughness: 0.35 },
  { id: 'copper',   name: 'Copper Patina', rarity: 'uncommon', body: 0x4a8a78, accent: 0x6a4a2a, metal: 0xc97a4a, metalness: 0.85, roughness: 0.3 },
  { id: 'graphite', name: 'Graphite Weave',rarity: 'uncommon', body: 0x202227, accent: 0x35383f, metal: 0x70767e, metalness: 0.82, roughness: 0.22, decal: 'carbon' },
  { id: 'amethyst', name: 'Amethyst',      rarity: 'uncommon', body: 0x6a4a8c, accent: 0x331f4a, metal: 0x9a6acc, metalness: 0.7, roughness: 0.3 },

  // ── RARE (5) ─────────────────────────────────────────────────────────────────
  { id: 'sapphire', name: 'Sapphire',      rarity: 'rare', body: 0x1a3a8c, accent: 0x0a1a44, metal: 0x3a6ad0, metalness: 0.88, roughness: 0.16 },
  {
    id: 'amber', name: 'Amber Glass', rarity: 'rare',
    body: 0xd08a1a, accent: 0x5a3a08, metal: 0xf0b84a, metalness: 0.7, roughness: 0.22,
    emissive: 0xff9a00, emissiveIntensity: 0.5,
    animated: true, animType: 'pulse', animSpeed: 1.5, animMin: 0.3, animMax: 0.9
  },
  { id: 'jade',     name: 'Jade Dynasty',  rarity: 'rare', body: 0x1f7a5a, accent: 0x0c3328, metal: 0x3aae84, metalness: 0.8, roughness: 0.2, decal: 'dragon' },
  { id: 'blush',    name: 'Blush Pink',    rarity: 'rare', body: 0xe69ac0, accent: 0x8c3a66, metal: 0xf4bcd8, metalness: 0.75, roughness: 0.22 },
  { id: 'stormsteel', name: 'Storm Steel', rarity: 'rare', body: 0x586878, accent: 0x2a333c, metal: 0xaebcca, metalness: 0.92, roughness: 0.14 },

  // ── LEGENDARY (5) ────────────────────────────────────────────────────────────
  {
    id: 'solarflare', name: 'Solar Flare ☀', rarity: 'legendary',
    body: 0x2a1200, accent: 0x4a2200, metal: 0xffaa1a, metalness: 0.6, roughness: 0.32,
    emissive: 0xff8800, emissiveIntensity: 1.4, decal: 'lava', decalEmissive: true,
    animated: true, animType: 'flicker', animSpeed: 6.5, animMin: 0.8, animMax: 2.4,
    shootSound: 'fire'
  },
  {
    id: 'venomstrike', name: 'Venomstrike ☣', rarity: 'legendary',
    body: 0x081404, accent: 0x041002, metal: 0x4ad81a, metalness: 0.78, roughness: 0.24,
    emissive: 0x7aff2a, emissiveIntensity: 1.3, decal: 'toxic', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 3.4, animMin: 0.7, animMax: 2.1
  },
  {
    id: 'nebula', name: 'Nebula 🌌', rarity: 'legendary',
    body: 0x0a0518, accent: 0x05030c, metal: 0x7a4ad0, metalness: 0.82, roughness: 0.18,
    emissive: 0xb060ff, emissiveIntensity: 1.3, decal: 'galaxy', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 2.0, animMin: 0.7, animMax: 2.2
  },
  {
    id: 'neonpulse', name: 'Neon Pulse ⚡', rarity: 'legendary',
    body: 0x0a0014, accent: 0x05000a, metal: 0xff2ad0, metalness: 0.85, roughness: 0.18,
    emissive: 0xff40e0, emissiveIntensity: 1.4, decal: 'cyber', decalEmissive: true,
    animated: true, animType: 'flicker', animSpeed: 8.0, animMin: 0.6, animMax: 2.3,
    shootSound: 'laser'
  },
  {
    id: 'royalgold', name: 'Royal Gold 👑', rarity: 'legendary',
    body: 0x3a2c08, accent: 0x1a1404, metal: 0xffd24a, metalness: 0.97, roughness: 0.1,
    emissive: 0xffc800, emissiveIntensity: 0.7, decal: 'gold', decalEmissive: true
  },

  // ── MYTHIC (5) — with cute custom shoot sounds! ──────────────────────────────
  {
    id: 'nekomata', name: 'Nekomata 🐱', rarity: 'mythic',
    body: 0xffb0d8, accent: 0x7a2a5a, metal: 0xff80c0, metalness: 0.6, roughness: 0.3,
    emissive: 0xff3aa0, emissiveIntensity: 1.4, decal: 'anime', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 3.0, animMin: 0.8, animMax: 2.2,
    shootSound: 'meow'
  },
  {
    id: 'kawaiicore', name: 'Kawaii Core 💖', rarity: 'mythic',
    body: 0xffc8e8, accent: 0x8c3a6a, metal: 0xffa0d0, metalness: 0.7, roughness: 0.22,
    emissive: 0xffffff, emissiveIntensity: 1.7, decal: 'anime', decalEmissive: true,
    animated: true, animType: 'rainbow', animSpeed: 0.4, animMin: 1.1, animMax: 2.4,
    shootSound: 'uwu'
  },
  {
    id: 'puppylove', name: 'Puppy Love 🐶', rarity: 'mythic',
    body: 0xf0c89a, accent: 0x7a4a2a, metal: 0xffdcb0, metalness: 0.6, roughness: 0.3,
    emissive: 0xffb860, emissiveIntensity: 1.3,
    animated: true, animType: 'pulse', animSpeed: 2.6, animMin: 0.7, animMax: 2.0,
    shootSound: 'bark'
  },
  {
    id: 'stardust', name: 'Stardust ✨', rarity: 'mythic',
    body: 0x0a0820, accent: 0x040310, metal: 0x9c8aff, metalness: 0.85, roughness: 0.14,
    emissive: 0xc0b0ff, emissiveIntensity: 1.8, decal: 'galaxy', decalEmissive: true,
    animated: true, animType: 'rainbow', animSpeed: 0.16, animMin: 1.2, animMax: 2.5,
    shootSound: 'sparkle'
  },
  {
    id: 'chromaflare', name: 'Chroma Flare 🌈', rarity: 'mythic',
    body: 0x161616, accent: 0x0c0c0c, metal: 0xb8b8b8, metalness: 0.92, roughness: 0.1,
    emissive: 0xffffff, emissiveIntensity: 1.9, decal: 'holographic', decalEmissive: true,
    animated: true, animType: 'rainbow', animSpeed: 0.5, animMin: 1.3, animMax: 2.5,
    shootSound: 'laser'
  },
  {
    id: 'nya_blaster', name: 'Nya Blaster 😺', rarity: 'mythic',
    body: 0xff70d8, accent: 0x8a006a, metal: 0xffb0f0, metalness: 0.62, roughness: 0.28,
    emissive: 0xff22cc, emissiveIntensity: 2.0, decal: 'anime', decalEmissive: true,
    animated: true, animType: 'cycle',
    shootSound: 'meow'
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
