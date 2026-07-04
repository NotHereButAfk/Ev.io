import { RARITY_ORDER, RARITY_COLORS } from '../core/Rarity.js';

export const RARITY_SHIELD = { common: 20, epic: 60, legendary: 80, mythic: 100 };

export const ARMOR_SKINS = [
  // ── COMMON ──────────────────────────────────────────────────────────────────
  { id: 'ash',       name: 'Ash',          rarity: 'common',    price: 200,  shield: 20,
    primary: 0x4a4a4a, secondary: 0x2a2a2a, metalness: 0.30, roughness: 0.70 },
  { id: 'forest',    name: 'Forest',       rarity: 'common',    price: 200,  shield: 20,
    primary: 0x2d4a2d, secondary: 0x1a2d1a, metalness: 0.25, roughness: 0.75 },
  { id: 'khaki',     name: 'Khaki',        rarity: 'common',    price: 200,  shield: 20,
    primary: 0x8a7a55, secondary: 0x5a4e35, metalness: 0.20, roughness: 0.80 },
  { id: 'slate',     name: 'Slate',        rarity: 'common',    price: 200,  shield: 20,
    primary: 0x4a5568, secondary: 0x2d3748, metalness: 0.35, roughness: 0.65 },
  { id: 'rust',      name: 'Rust',         rarity: 'common',    price: 200,  shield: 20,
    primary: 0x7a3a2a, secondary: 0x3d1d15, metalness: 0.30, roughness: 0.72 },

  // ── EPIC (formerly rare) ───────────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'arctic_f',  name: 'Arctic',       rarity: 'epic',      price: 500,  shield: 40,
    primary: 0xd4e8f0, secondary: 0x8ab0c4, metalness: 0.45, roughness: 0.55 },
  { id: 'midnight_f',name: 'Midnight',     rarity: 'epic',      price: 500,  shield: 40,
    primary: 0x1a1f2e, secondary: 0x0d1018, metalness: 0.55, roughness: 0.40 },
  { id: 'cobalt',    name: 'Cobalt',       rarity: 'epic',      price: 500,  shield: 40,
    primary: 0x1a4a9a, secondary: 0x0d2255, metalness: 0.50, roughness: 0.45 },
  { id: 'crimson_f', name: 'Crimson Rush', rarity: 'epic',      price: 500,  shield: 40,
    primary: 0xd12b2b, secondary: 0x6a1515, metalness: 0.45, roughness: 0.50 },
  { id: 'venom',     name: 'Venom',        rarity: 'epic',      price: 500,  shield: 40,
    primary: 0x3ad14a, secondary: 0x1a6a25, metalness: 0.40, roughness: 0.55 },

  // ── EPIC ──────────────────────────────────────────────────────────────────────
  { id: 'inferno',   name: 'Inferno',      rarity: 'epic',      price: 1200, shield: 60,
    primary: 0xff4a0a, secondary: 0x8a1a00, metalness: 0.55, roughness: 0.40,
    emissive: 0xff3a00, emissiveIntensity: 1.0 },
  { id: 'phantom',   name: 'Phantom',      rarity: 'epic',      price: 1200, shield: 60,
    primary: 0x6a2ad4, secondary: 0x2d0a6a, metalness: 0.60, roughness: 0.35,
    emissive: 0x7a2aff, emissiveIntensity: 0.9 },
  { id: 'glacial',   name: 'Glacial',      rarity: 'epic',      price: 1200, shield: 60,
    primary: 0x8ae8ff, secondary: 0x2a9ab8, metalness: 0.65, roughness: 0.30,
    emissive: 0x2ac8ff, emissiveIntensity: 0.8 },
  { id: 'sand_king', name: 'Sand King',    rarity: 'epic',      price: 1200, shield: 60,
    primary: 0xd4a84a, secondary: 0x7a5a1a, metalness: 0.60, roughness: 0.35 },
  { id: 'wraith',    name: 'Wraith',       rarity: 'epic',      price: 1200, shield: 60,
    primary: 0x1a2a1a, secondary: 0x050d05, metalness: 0.55, roughness: 0.42,
    emissive: 0x18ff44, emissiveIntensity: 0.85 },

  // ── LEGENDARY ──────────────────────────────────────────────────────────────────
  { id: 'aurum',     name: 'Aurum',        rarity: 'legendary', price: 2500, shield: 80,
    primary: 0xd4a520, secondary: 0x8a6a0a, metalness: 0.88, roughness: 0.14 },
  { id: 'obsidian',  name: 'Obsidian',     rarity: 'legendary', price: 2500, shield: 80,
    primary: 0x1a1a2e, secondary: 0x060610, metalness: 0.92, roughness: 0.07,
    emissive: 0x3a1aff, emissiveIntensity: 1.0 },
  { id: 'aurora',    name: 'Aurora',       rarity: 'legendary', price: 2500, shield: 80,
    primary: 0x15c4a0, secondary: 0x0a6a55, metalness: 0.76, roughness: 0.20,
    emissive: 0x18ffc4, emissiveIntensity: 1.1 },
  { id: 'neon',      name: 'Neon Striker', rarity: 'legendary', price: 2500, shield: 80,
    primary: 0xff2a7a, secondary: 0x6a001a, metalness: 0.72, roughness: 0.22,
    emissive: 0xff2a7a, emissiveIntensity: 1.3 },
  { id: 'void',      name: 'Void',         rarity: 'legendary', price: 2500, shield: 80,
    primary: 0x050510, secondary: 0x010108, metalness: 0.94, roughness: 0.04,
    emissive: 0x6a1aff, emissiveIntensity: 1.4 },

  // ── NEW high-rarity armor (epic / legendary / mythic) ────────────────────────
  { id: 'plasma_a',  name: 'Plasma Guard', rarity: 'epic',      price: 1200, shield: 60,
    primary: 0x0a1426, secondary: 0x041030, metalness: 0.72, roughness: 0.24,
    emissive: 0x00aaff, emissiveIntensity: 1.1 },
  { id: 'toxica',    name: 'Biohazard',    rarity: 'epic',      price: 1200, shield: 60,
    primary: 0x18280a, secondary: 0x0a1606, metalness: 0.55, roughness: 0.40,
    emissive: 0x66ff22, emissiveIntensity: 1.1 },
  { id: 'magma_a',   name: 'Magma Plate',  rarity: 'legendary', price: 2500, shield: 80,
    primary: 0x1a0800, secondary: 0x0c0503, metalness: 0.60, roughness: 0.34,
    emissive: 0xff5a00, emissiveIntensity: 1.6 },
  { id: 'celestial_a', name: 'Celestial',  rarity: 'legendary', price: 2500, shield: 80,
    primary: 0x0a0a26, secondary: 0x05030f, metalness: 0.86, roughness: 0.12,
    emissive: 0x9cb8ff, emissiveIntensity: 1.5 },
  { id: 'prism_a',   name: 'Prismatic',    rarity: 'mythic',    price: 5000, shield: 100,
    primary: 0xff3aaa, secondary: 0x2a1a3a, metalness: 0.9, roughness: 0.10,
    emissive: 0xff2bd0, emissiveIntensity: 2.0 },
  { id: 'singularity', name: 'Singularity', rarity: 'mythic',   price: 5000, shield: 100,
    primary: 0x08060c, secondary: 0x020104, metalness: 0.95, roughness: 0.05,
    emissive: 0x9c2bff, emissiveIntensity: 2.2 },
];

// Re-exported from the shared rarity module so every cosmetic system agrees.
export { RARITY_ORDER, RARITY_COLORS };

export function getArmorSkin(id) {
  return ARMOR_SKINS.find(s => s.id === id) || null;
}
