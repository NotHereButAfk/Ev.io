// Skins are cosmetic-only, plus a kill-coin earn multiplier by rarity — no
// combat stat effects (damage/ammo/reload/health/shield). The multiplier
// stacks across all 3 equipped slots (gun + melee + armor), capped at 5.0
// when all three are mythic.

// Per-slot kill coin multiplier bonus.
// total = 1.0 + gun_bonus + melee_bonus + armor_bonus, capped at 5.0
// All mythic: 1.0 + 1.33 + 1.33 + 1.33 = 4.99 ≈ 5×
export const KILL_MULT_BONUS = {
  common:    0,
  epic:      0.75,
  legendary: 1.00,
  mythic:    1.33,
};

// Formatted perk description string for a given skin rarity (for shop/inventory tooltips)
export function describePerk(rarity) {
  if (rarity === 'common') return 'Cosmetic only';
  const mult = KILL_MULT_BONUS[rarity] || 0;
  return mult > 0 ? `+${(mult * 100).toFixed(0)}% kill coins` : 'Cosmetic only';
}
