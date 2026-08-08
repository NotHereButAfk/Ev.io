import { RARITY_ORDER, RARITY_COLORS } from '../core/Rarity.js';

export const RARITY_SHIELD = { common: 20, epic: 60, legendary: 80, mythic: 100 };

// Character finishes follow the strongest visual language in ev.io's official
// skin catalog: dark flexible under-suits, angular armor color blocking,
// readable helmet silhouettes, and one restrained emissive accent. These are
// original local palettes/themes rather than downloaded proprietary .evskin
// models, so they remain compatible with the rigged player and every animation.
export const ARMOR_SKINS = [
  {
    id: 'cobalt_circuit', name: 'Cobalt Circuit', rarity: 'common', starter: true,
    // Bright segmented shell over a graphite flex suit. The previous saturated
    // blue-on-black finish crushed the model into one dark military silhouette.
    primary: 0xaeb3b5, secondary: 0x20252a, emissive: 0x79cbd6,
    emissiveIntensity: 0.52, roughness: 0.78, metalness: 0.08, price: 0, shield: 0,
  },
  {
    id: 'crimson_guard', name: 'Crimson Guard', rarity: 'common', starter: true,
    primary: 0x8f2528, secondary: 0x161012, emissive: 0xff4a45,
    emissiveIntensity: 0.68, roughness: 0.50, metalness: 0.52, price: 0, shield: 0,
  },
  {
    id: 'solar_warden', name: 'Solar Warden', rarity: 'epic',
    primary: 0x252a2f, secondary: 0x121417, emissive: 0xffc329,
    emissiveIntensity: 0.85, roughness: 0.38, metalness: 0.68, price: 1500, shield: 0,
  },
  {
    id: 'oni_protocol', name: 'Oni Protocol', rarity: 'epic', theme: 'horns',
    primary: 0xb52a2c, secondary: 0xe4e6e8, emissive: 0x4ce9ff,
    emissiveIntensity: 0.90, roughness: 0.42, metalness: 0.60, price: 1800, shield: 0,
  },
  {
    id: 'ivory_sentinel', name: 'Ivory Sentinel', rarity: 'legendary', theme: 'crown',
    primary: 0xd9d7ca, secondary: 0x3c321b, emissive: 0x5fdcff,
    emissiveIntensity: 0.82, roughness: 0.30, metalness: 0.76, price: 3200, shield: 0,
  },
  {
    id: 'boneframe', name: 'Boneframe', rarity: 'legendary', theme: 'bone',
    primary: 0xd2d0bd, secondary: 0x111419, emissive: 0x4dbdff,
    emissiveIntensity: 0.76, roughness: 0.55, metalness: 0.48, price: 3400, shield: 0,
  },
  {
    id: 'foxfire', name: 'Foxfire', rarity: 'mythic', theme: 'ears',
    primary: 0xe96a25, secondary: 0xe7e4dc, emissive: 0x3de6ff,
    emissiveIntensity: 1.0, roughness: 0.36, metalness: 0.62, price: 6000, shield: 0,
  },
  {
    id: 'void_regent', name: 'Void Regent', rarity: 'mythic', theme: 'crown',
    primary: 0x211a35, secondary: 0x0a0b11, emissive: 0xc54cff,
    emissiveIntensity: 1.05, roughness: 0.28, metalness: 0.78, price: 6400, shield: 0,
  },
];

// Re-exported from the shared rarity module so every cosmetic system agrees.
export { RARITY_ORDER, RARITY_COLORS };

export function getArmorSkin(id) {
  return ARMOR_SKINS.find(s => s.id === id) || null;
}
