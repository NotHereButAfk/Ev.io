// Per-rarity gameplay perks for equipped skins.
// Gun perks scale weapon stats; armor perks scale player health/shield.
// Kill multiplier stacks across all 3 equipped slots (gun + melee + armor),
// capped at 5.0 when all mythic are equipped.

export const GUN_PERKS = {
  common:    { damageBonus: 0,    ammoBonus: 0,  reloadBonus: 0    },
  uncommon:  { damageBonus: 0.05, ammoBonus: 2,  reloadBonus: 0.05 },
  rare:      { damageBonus: 0.10, ammoBonus: 4,  reloadBonus: 0.10 },
  epic:      { damageBonus: 0.15, ammoBonus: 6,  reloadBonus: 0.15 },
  legendary: { damageBonus: 0.20, ammoBonus: 10, reloadBonus: 0.20 },
  mythic:    { damageBonus: 0.25, ammoBonus: 15, reloadBonus: 0.25 },
};

export const ARMOR_PERKS = {
  common:    { healthBonus: 0,  shieldBonus: 0  },
  uncommon:  { healthBonus: 10, shieldBonus: 0  },
  rare:      { healthBonus: 20, shieldBonus: 0  },
  epic:      { healthBonus: 35, shieldBonus: 10 },
  legendary: { healthBonus: 50, shieldBonus: 25 },
  mythic:    { healthBonus: 75, shieldBonus: 50 },
};

// Per-slot kill coin multiplier bonus.
// total = 1.0 + gun_bonus + melee_bonus + armor_bonus, capped at 5.0
// All mythic: 1.0 + 1.33 + 1.33 + 1.33 = 4.99 ≈ 5×
export const KILL_MULT_BONUS = {
  common:    0,
  uncommon:  0.25,
  rare:      0.50,
  epic:      0.75,
  legendary: 1.00,
  mythic:    1.33,
};

// Formatted perk description string for a given skin rarity (for shop tooltips)
export function describePerk(rarity, isArmor) {
  if (rarity === 'common') return 'Cosmetic only';
  const mult = KILL_MULT_BONUS[rarity] || 0;
  const multStr = mult > 0 ? `+${(mult * 100).toFixed(0)}% kill coins` : '';
  if (isArmor) {
    const p = ARMOR_PERKS[rarity] || {};
    const parts = [];
    if (p.healthBonus) parts.push(`+${p.healthBonus} max HP`);
    if (p.shieldBonus) parts.push(`+${p.shieldBonus} shield`);
    if (multStr) parts.push(multStr);
    return parts.join(' · ');
  } else {
    const p = GUN_PERKS[rarity] || {};
    const parts = [];
    if (p.damageBonus) parts.push(`+${(p.damageBonus * 100).toFixed(0)}% dmg`);
    if (p.ammoBonus)   parts.push(`+${p.ammoBonus} ammo`);
    if (p.reloadBonus) parts.push(`-${(p.reloadBonus * 100).toFixed(0)}% reload`);
    if (multStr) parts.push(multStr);
    return parts.join(' · ');
  }
}
