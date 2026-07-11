import { RARITY_ORDER, RARITY_COLORS } from '../core/Rarity.js';

export const RARITY_SHIELD = { common: 20, epic: 60, legendary: 80, mythic: 100 };

export const ARMOR_SKINS = [];

// Re-exported from the shared rarity module so every cosmetic system agrees.
export { RARITY_ORDER, RARITY_COLORS };

export function getArmorSkin(id) {
  return ARMOR_SKINS.find(s => s.id === id) || null;
}
