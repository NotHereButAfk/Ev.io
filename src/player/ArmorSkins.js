export const ARMOR_SKINS = [
  // ── COMMON ──────────────────────────────────────────────────────────────────
  { id: 'ash',       name: 'Ash',          rarity: 'common',    price: 200,
    primary: 0x4a4a4a, secondary: 0x2a2a2a, metalness: 0.30, roughness: 0.70 },
  { id: 'forest',    name: 'Forest',       rarity: 'common',    price: 200,
    primary: 0x2d4a2d, secondary: 0x1a2d1a, metalness: 0.25, roughness: 0.75 },
  { id: 'khaki',     name: 'Khaki',        rarity: 'common',    price: 200,
    primary: 0x8a7a55, secondary: 0x5a4e35, metalness: 0.20, roughness: 0.80 },
  { id: 'slate',     name: 'Slate',        rarity: 'common',    price: 200,
    primary: 0x4a5568, secondary: 0x2d3748, metalness: 0.35, roughness: 0.65 },
  { id: 'rust',      name: 'Rust',         rarity: 'common',    price: 200,
    primary: 0x7a3a2a, secondary: 0x3d1d15, metalness: 0.30, roughness: 0.72 },

  // ── RARE ─────────────────────────────────────────────────────────────────────
  { id: 'arctic_f',  name: 'Arctic',       rarity: 'rare',      price: 500,
    primary: 0xd4e8f0, secondary: 0x8ab0c4, metalness: 0.45, roughness: 0.55 },
  { id: 'midnight_f',name: 'Midnight',     rarity: 'rare',      price: 500,
    primary: 0x1a1f2e, secondary: 0x0d1018, metalness: 0.55, roughness: 0.40 },
  { id: 'cobalt',    name: 'Cobalt',       rarity: 'rare',      price: 500,
    primary: 0x1a4a9a, secondary: 0x0d2255, metalness: 0.50, roughness: 0.45 },
  { id: 'crimson_f', name: 'Crimson Rush', rarity: 'rare',      price: 500,
    primary: 0xd12b2b, secondary: 0x6a1515, metalness: 0.45, roughness: 0.50 },
  { id: 'venom',     name: 'Venom',        rarity: 'rare',      price: 500,
    primary: 0x3ad14a, secondary: 0x1a6a25, metalness: 0.40, roughness: 0.55 },

  // ── EPIC ──────────────────────────────────────────────────────────────────────
  { id: 'inferno',   name: 'Inferno',      rarity: 'epic',      price: 1200,
    primary: 0xff4a0a, secondary: 0x8a1a00, metalness: 0.55, roughness: 0.40,
    emissive: 0x3a0a00, emissiveIntensity: 0.20 },
  { id: 'phantom',   name: 'Phantom',      rarity: 'epic',      price: 1200,
    primary: 0x6a2ad4, secondary: 0x2d0a6a, metalness: 0.60, roughness: 0.35,
    emissive: 0x150035, emissiveIntensity: 0.18 },
  { id: 'glacial',   name: 'Glacial',      rarity: 'epic',      price: 1200,
    primary: 0x8ae8ff, secondary: 0x2a9ab8, metalness: 0.65, roughness: 0.30,
    emissive: 0x003a4a, emissiveIntensity: 0.12 },
  { id: 'sand_king', name: 'Sand King',    rarity: 'epic',      price: 1200,
    primary: 0xd4a84a, secondary: 0x7a5a1a, metalness: 0.60, roughness: 0.35 },
  { id: 'wraith',    name: 'Wraith',       rarity: 'epic',      price: 1200,
    primary: 0x1a2a1a, secondary: 0x050d05, metalness: 0.55, roughness: 0.42,
    emissive: 0x002800, emissiveIntensity: 0.14 },

  // ── LEGENDARY ──────────────────────────────────────────────────────────────────
  { id: 'aurum',     name: 'Aurum',        rarity: 'legendary', price: 2500,
    primary: 0xd4a520, secondary: 0x8a6a0a, metalness: 0.88, roughness: 0.14 },
  { id: 'obsidian',  name: 'Obsidian',     rarity: 'legendary', price: 2500,
    primary: 0x1a1a2e, secondary: 0x060610, metalness: 0.92, roughness: 0.07,
    emissive: 0x00002a, emissiveIntensity: 0.32 },
  { id: 'aurora',    name: 'Aurora',       rarity: 'legendary', price: 2500,
    primary: 0x15c4a0, secondary: 0x0a6a55, metalness: 0.76, roughness: 0.20,
    emissive: 0x003a2a, emissiveIntensity: 0.28 },
  { id: 'neon',      name: 'Neon Striker', rarity: 'legendary', price: 2500,
    primary: 0xff2a7a, secondary: 0x6a001a, metalness: 0.72, roughness: 0.22,
    emissive: 0x3a0015, emissiveIntensity: 0.38 },
  { id: 'void',      name: 'Void',         rarity: 'legendary', price: 2500,
    primary: 0x050510, secondary: 0x010108, metalness: 0.94, roughness: 0.04,
    emissive: 0x080028, emissiveIntensity: 0.55 },
];

export const RARITY_ORDER  = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_COLORS = {
  common:    '#9aabb8',
  rare:      '#4a9aff',
  epic:      '#b04af0',
  legendary: '#f0a820',
};

export function getArmorSkin(id) {
  return ARMOR_SKINS.find(s => s.id === id) || null;
}
