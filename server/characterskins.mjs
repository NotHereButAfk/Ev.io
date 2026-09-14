

export const RARITY_SHIELD = { common: 20, epic: 60, legendary: 80, mythic: 100 };

// Character finishes follow the strongest visual language in ev.io's official
// skin catalog: dark flexible under-suits, angular armor color blocking,
// readable helmet silhouettes, and one restrained emissive accent. These are
// original local palettes/themes rather than downloaded proprietary .evskin
// models, so they remain compatible with the rigged player and every animation.
export const ARMOR_SKINS = [
  {
    id: 'arctic_ghost', name: 'Arctic Ghost', rarity: 'common', collection: 'Frontier Ten', theme: 'bone',
    primary: 0xe4f3fa, secondary: 0x24334c, emissive: 0x67dbff,
    emissiveIntensity: 0.65, roughness: 0.58, metalness: 0.32, price: 20, shield: 0, earningEnabled: false,
  },
  {
    id: 'magma_revenant', name: 'Magma Revenant', rarity: 'common', collection: 'Frontier Ten', theme: 'horns',
    primary: 0x39333b, secondary: 0x21191b, emissive: 0xff581d,
    emissiveIntensity: 0.65, roughness: 0.58, metalness: 0.32, price: 20, shield: 0, earningEnabled: false,
  },
  {
    id: 'jade_ronin', name: 'Jade Ronin', rarity: 'common', collection: 'Frontier Ten', theme: 'horns',
    primary: 0x397a5b, secondary: 0x152a25, emissive: 0xaaff76,
    emissiveIntensity: 0.65, roughness: 0.58, metalness: 0.32, price: 20, shield: 0, earningEnabled: false,
  },
  {
    id: 'desert_jackal', name: 'Desert Jackal', rarity: 'common', collection: 'Frontier Ten', theme: 'ears',
    primary: 0xc7a776, secondary: 0x403528, emissive: 0x66e4e7,
    emissiveIntensity: 0.65, roughness: 0.58, metalness: 0.32, price: 20, shield: 0, earningEnabled: false,
  },
  {
    id: 'neon_specter', name: 'Neon Specter', rarity: 'common', collection: 'Frontier Ten',
    primary: 0x623a87, secondary: 0x211b36, emissive: 0xff60d5,
    emissiveIntensity: 0.65, roughness: 0.58, metalness: 0.32, price: 20, shield: 0, earningEnabled: false,
  },
  {
    id: 'abyss_diver', name: 'Abyss Diver', rarity: 'common', collection: 'Frontier Ten',
    primary: 0x21667f, secondary: 0x14283b, emissive: 0x5cffe0,
    emissiveIntensity: 0.65, roughness: 0.58, metalness: 0.32, price: 20, shield: 0, earningEnabled: false,
  },
  {
    id: 'royal_aegis', name: 'Royal Aegis', rarity: 'common', collection: 'Frontier Ten', theme: 'crown',
    primary: 0x3658a1, secondary: 0x1c243d, emissive: 0xffd878,
    emissiveIntensity: 0.65, roughness: 0.58, metalness: 0.32, price: 20, shield: 0, earningEnabled: false,
  },
  {
    id: 'rose_wraith', name: 'Rose Wraith', rarity: 'common', collection: 'Frontier Ten', theme: 'bone',
    primary: 0xd7a5b6, secondary: 0x433444, emissive: 0xff73b9,
    emissiveIntensity: 0.65, roughness: 0.58, metalness: 0.32, price: 20, shield: 0, earningEnabled: false,
  },
  {
    id: 'toxic_viper', name: 'Toxic Viper', rarity: 'common', collection: 'Frontier Ten', theme: 'ears',
    primary: 0x859c39, secondary: 0x252d22, emissive: 0xb5ff35,
    emissiveIntensity: 0.65, roughness: 0.58, metalness: 0.32, price: 20, shield: 0, earningEnabled: false,
  },
  {
    id: 'chrome_seraph', name: 'Chrome Seraph', rarity: 'common', collection: 'Frontier Ten', theme: 'crown',
    primary: 0xc5d4dd, secondary: 0x344252, emissive: 0xffe8a1,
    emissiveIntensity: 0.65, roughness: 0.58, metalness: 0.32, price: 20, shield: 0, earningEnabled: false,
  },
];

// Re-exported from the shared rarity module so every cosmetic system agrees.


export function getArmorSkin(id) {
  return ARMOR_SKINS.find(s => s.id === id) || null;
}
