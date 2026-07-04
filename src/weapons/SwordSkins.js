import * as THREE from 'three';
import { decalTexture } from './WeaponTextures.js';

// Cosmetic finishes for the sword. A sword skin recolors the blade (metal
// role), the fuller groove (accent role), and the guard (special role), while
// leaving the wooden handle untouched. Skins carry a `rarity`; fancier ones
// paint a `decal` pattern onto the blade (optionally glowing via decalEmissive).
// Animated skins pulse/cycle the blade's emissive each frame.

export const SWORD_SKINS = [
  // ── COMMON ───────────────────────────────────────────────────────────────
  { id: 'iron',   name: 'Iron',        rarity: 'common', blade: 0x6a6e74, fuller: 0x2a2c30, guard: 0x4a4e54, metalness: 0.7, roughness: 0.45, emissive: 0x000000, emissiveIntensity: 0 },
  { id: 'rusted', name: 'Rusted',      rarity: 'common', blade: 0x7a4428, fuller: 0x5a3018, guard: 0x6a3820, metalness: 0.25, roughness: 0.88, emissive: 0x000000, emissiveIntensity: 0 },
  { id: 'shadow', name: 'Shadow Iron', rarity: 'common', blade: 0x1c1820, fuller: 0x0e0c12, guard: 0x2a2432, metalness: 0.72, roughness: 0.32, emissive: 0x060010, emissiveIntensity: 0.1 },

  // ── COMMON (formerly uncommon) ─────────────────────────────────────────────────────────────────────────────────────────
  { id: 'polished',    name: 'Polished Steel', rarity: 'common', blade: 0xc8d0da, fuller: 0x8890a0, guard: 0xa8b4c0, metalness: 0.92, roughness: 0.1, emissive: 0x000000, emissiveIntensity: 0 },
  { id: 'bronze',      name: 'Ancient Bronze', rarity: 'common', blade: 0x9c6b28, fuller: 0x5a3e18, guard: 0xb88030, metalness: 0.8, roughness: 0.28, emissive: 0x000000, emissiveIntensity: 0 },
  { id: 'bloodstained',name: 'Bloodstained',   rarity: 'common', blade: 0x4a3030, fuller: 0x6c1a1a, guard: 0x3a2424, metalness: 0.65, roughness: 0.4, emissive: 0x220000, emissiveIntensity: 0.15 },
  { id: 'carbon_blade',name: 'Carbon Edge',    rarity: 'common', blade: 0xb0b6be, fuller: 0x2c2f35, guard: 0x44484e, metalness: 0.85, roughness: 0.2, emissive: 0x000000, emissiveIntensity: 0, decal: 'carbon' },

  // ── EPIC (formerly rare) ─────────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'obsidian_blade', name: 'Obsidian',  rarity: 'epic', blade: 0x18141c, fuller: 0x0c0a10, guard: 0x2a2236, metalness: 0.75, roughness: 0.3, emissive: 0x000000, emissiveIntensity: 0 },
  { id: 'silver',  name: 'Silver Moon',      rarity: 'epic', blade: 0xe8eef4, fuller: 0xa0b0c0, guard: 0xccd8e4, metalness: 0.9, roughness: 0.12, emissive: 0x304050, emissiveIntensity: 0.1 },
  { id: 'poison',  name: 'Venom',            rarity: 'epic', blade: 0x1e5c28, fuller: 0x487a18, guard: 0x285c1e, metalness: 0.65, roughness: 0.35, emissive: 0x18440a, emissiveIntensity: 0.3 },
  { id: 'dawn',    name: 'Dawn Light',       rarity: 'epic', blade: 0xe8b060, fuller: 0xd08020, guard: 0xf0c870, metalness: 0.88, roughness: 0.18, emissive: 0x704820, emissiveIntensity: 0.2 },
  { id: 'frostbite', name: 'Frostbite ❄', rarity: 'epic', blade: 0xddf0ff, fuller: 0x6090b8, guard: 0x7ab0d0, metalness: 0.8, roughness: 0.22, emissive: 0xffffff, emissiveIntensity: 0.3, decal: 'frost', decalEmissive: true },

  // ── EPIC ───────────────────────────────────────────────────────────────────
  { id: 'gilded',  name: 'Gilded',           rarity: 'epic', blade: 0xf0d878, fuller: 0x7a6018, guard: 0xe0be50, metalness: 0.95, roughness: 0.14, emissive: 0x221800, emissiveIntensity: 0.2, decal: 'gold' },
  { id: 'phantom', name: 'Phantom',          rarity: 'epic', blade: 0x5028a0, fuller: 0x2a1060, guard: 0x6030b8, metalness: 0.8, roughness: 0.25, emissive: 0x3010a0, emissiveIntensity: 0.4 },
  { id: 'dragon',  name: 'Dragonscale',      rarity: 'epic', blade: 0x6abf80, fuller: 0x0a3a1c, guard: 0x176b39, metalness: 0.72, roughness: 0.3, emissive: 0x0a3a1c, emissiveIntensity: 0.2, decal: 'dragon' },
  {
    id: 'galaxy_blade', name: 'Cosmos Edge ✦', rarity: 'epic',
    blade: 0xaab0ff, fuller: 0x2a1060, guard: 0x4a2a9c, metalness: 0.82, roughness: 0.18,
    emissive: 0xffffff, emissiveIntensity: 0.35, decal: 'galaxy', decalEmissive: true,
    animated: true, animType: 'pulse', animSpeed: 2.0, animMin: 0.2, animMax: 0.7
  },

  // ── LEGENDARY ──────────────────────────────────────────────────────────────
  { id: 'void_blade', name: 'Void Blade',    rarity: 'legendary', blade: 0x100a18, fuller: 0x3a1a66, guard: 0x1a0c2a, metalness: 0.85, roughness: 0.2, emissive: 0x500080, emissiveIntensity: 0.35 },
  { id: 'sacred',     name: 'Sacred',        rarity: 'legendary', blade: 0xf0f0f0, fuller: 0xffffff, guard: 0xe0e0e0, metalness: 0.9, roughness: 0.1, emissive: 0xd0e8ff, emissiveIntensity: 0.45 },
  {
    id: 'soul_fire', name: 'Soul Fire 🔵', rarity: 'legendary',
    blade: 0x08101e, fuller: 0x001460, guard: 0x0a1830, metalness: 0.88, roughness: 0.14,
    emissive: 0x0066ff, emissiveIntensity: 0.6,
    animated: true, animType: 'pulse', animSpeed: 2.8, animMin: 0.3, animMax: 1.4
  },
  {
    id: 'lava_blade', name: 'Lava Blade 🌋', rarity: 'legendary',
    blade: 0xffae6a, fuller: 0x8c2800, guard: 0x3a0c04, metalness: 0.6, roughness: 0.3,
    emissive: 0xffffff, emissiveIntensity: 0.7, decal: 'fire', decalEmissive: true,
    animated: true, animType: 'lava', animSpeed: 4.5, animMin: 0.4, animMax: 1.6
  },

  // ── MYTHIC ───────────────────────────────────────────────────────────────────
  {
    id: 'storm', name: 'Thunderstrike ⚡', rarity: 'mythic',
    blade: 0x9fe6ff, fuller: 0x7a6600, guard: 0x2c2608, metalness: 0.82, roughness: 0.18,
    emissive: 0xffffff, emissiveIntensity: 0.5, decal: 'lightning', decalEmissive: true,
    animated: true, animType: 'storm', animSpeed: 8.0, animMin: 0.1, animMax: 1.8
  },
  {
    id: 'corruption', name: 'Corruption ☠', rarity: 'mythic',
    blade: 0x8aff5a, fuller: 0x204a10, guard: 0x0a1406, metalness: 0.8, roughness: 0.25,
    emissive: 0xffffff, emissiveIntensity: 0.5, decal: 'toxic', decalEmissive: true,
    animated: true, animType: 'corruption', animSpeed: 3.0, animMin: 0.2, animMax: 1.2
  },
  {
    id: 'prism_blade', name: 'Prismatic 🌈', rarity: 'mythic',
    blade: 0xdddddd, fuller: 0x101010, guard: 0x808080, metalness: 0.9, roughness: 0.1,
    emissive: 0xffffff, emissiveIntensity: 0.5, animated: true, animType: 'cycle'
  },

  // ── SCI-FI MELEE FINISHES ───────────────────────────────────────────────────
  { id: 'tactical_blk', name: 'Tactical Black', rarity: 'common', blade: 0x23262b, fuller: 0x111316, guard: 0x16181c, metalness: 0.6, roughness: 0.42, emissive: 0x000000, emissiveIntensity: 0 },
  { id: 'titanium', name: 'Titanium', rarity: 'common', blade: 0xb8bec6, fuller: 0x5a5e66, guard: 0x7a8088, metalness: 0.95, roughness: 0.22, emissive: 0x000000, emissiveIntensity: 0 },
  {
    id: 'plasma_edge', name: 'Plasma Edge ⚡', rarity: 'epic',
    blade: 0x0a2030, fuller: 0x003a5a, guard: 0x06141e, metalness: 0.85, roughness: 0.16,
    emissive: 0x00ccff, emissiveIntensity: 0.7,
    animated: true, animType: 'pulse', animSpeed: 3.2, animMin: 0.35, animMax: 1.3
  },
  {
    id: 'neon_tanto', name: 'Neon Tanto 🌈', rarity: 'legendary',
    blade: 0x12081e, fuller: 0x2a0a40, guard: 0x0c0616, metalness: 0.8, roughness: 0.2,
    emissive: 0xff2db4, emissiveIntensity: 0.7,
    animated: true, animType: 'cycle'
  },
  {
    id: 'quantum_blade', name: 'Quantum ✦', rarity: 'mythic',
    blade: 0x0c1428, fuller: 0x0040ff, guard: 0x081024, metalness: 0.88, roughness: 0.12,
    emissive: 0xffffff, emissiveIntensity: 0.6, decal: 'galaxy', decalEmissive: true,
    animated: true, animType: 'storm', animSpeed: 6.0, animMin: 0.2, animMax: 1.6
  }
];

const _col = new THREE.Color();

export function getSwordSkin(id) {
  return SWORD_SKINS.find((s) => s.id === id) || SWORD_SKINS[0];
}

/**
 * Apply a sword skin to the sword model group. Touches blade (metal role),
 * fuller (accent role), and guard (special role); handle (wood) stays.
 */
export function applySwordSkin(group, skin) {
  const decal = skin.decal ? decalTexture(skin.decal) : null;
  const seen = new Set();
  group.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const m = obj.material;
    if (seen.has(m)) return;
    seen.add(m);
    const role = m.userData?.role;
    if (role === 'metal') {
      // blade
      m.color.setHex(skin.blade);
      m.metalness = skin.metalness;
      m.roughness = skin.roughness;
      m.emissive.setHex(skin.emissive);
      m.emissiveIntensity = skin.emissiveIntensity;
      // painted blade pattern
      m.map = decal || null;
      m.emissiveMap = (skin.decalEmissive && decal) ? decal : null;
      m.needsUpdate = true;
    } else if (role === 'accent') {
      // fuller groove
      m.color.setHex(skin.fuller);
      m.emissive.setHex(skin.emissive);
      m.emissiveIntensity = skin.emissiveIntensity * 0.6;
    } else if (role === 'special') {
      // guard / crossguard
      m.color.setHex(skin.guard);
      m.metalness = Math.min(1, skin.metalness + 0.05);
      m.roughness = Math.max(0.08, skin.roughness - 0.05);
    }
    // 'wood' (handle) intentionally left as-is.
  });
}

/**
 * Called every frame for the active sword when its skin is animated.
 * @param {THREE.Group} group  Active weapon model
 * @param {object}      skin   Sword skin definition (animated===true)
 * @param {number}      t      Accumulated time in seconds
 */
export function animateSwordSkin(group, skin, t) {
  if (!skin?.animated) return;
  // Glowing-decal blades keep emissive white so the painted pattern shows.
  const glowDecal = skin.decalEmissive;
  const seen = new Set();
  group.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const m = obj.material;
    if (seen.has(m)) return;
    seen.add(m);
    const role = m.userData?.role;
    if (role !== 'metal' && role !== 'accent') return;
    const keepWhite = glowDecal && role === 'metal';

    switch (skin.animType) {
      case 'pulse': {
        const pulse = (Math.sin(t * skin.animSpeed) + 1) * 0.5;
        if (!keepWhite) m.emissive.setHex(skin.emissive);
        m.emissiveIntensity = skin.animMin + pulse * (skin.animMax - skin.animMin);
        break;
      }
      case 'cycle': {
        const hue = (t * 0.14) % 1;
        _col.setHSL(hue, 0.95, 0.55);
        m.emissive.copy(_col);
        m.emissiveIntensity = 0.6;
        break;
      }
      case 'lava': {
        // two offset sine waves create the flowing/dripping lava feel
        const a = (Math.sin(t * skin.animSpeed) + 1) * 0.5;
        const b = (Math.sin(t * skin.animSpeed * 0.6 + 1.4) + 1) * 0.5;
        _col.setHex(0xff3300);
        const hot = new THREE.Color(0xff9900);
        _col.lerp(hot, b * 0.5);
        m.emissive.copy(_col);
        m.emissiveIntensity = skin.animMin + (a * 0.5 + b * 0.5) * (skin.animMax - skin.animMin);
        break;
      }
      case 'storm': {
        // rapid electric noise: white-yellow flashes
        const n = Math.sin(t * skin.animSpeed) * 0.5
          + Math.sin(t * skin.animSpeed * 3.1) * 0.35
          + Math.sin(t * skin.animSpeed * 0.42) * 0.15;
        const f = (n + 1) * 0.5;
        const isWhite = f > 0.75;
        m.emissive.setHex(isWhite ? 0xffffff : 0xffdd00);
        m.emissiveIntensity = skin.animMin + f * (skin.animMax - skin.animMin);
        break;
      }
      case 'corruption': {
        // organic sickly pulse between green and dark purple
        const p = (Math.sin(t * skin.animSpeed) + 1) * 0.5;
        _col.setHex(0x40cc20);
        const dark = new THREE.Color(0x200a40);
        _col.lerp(dark, p * 0.7);
        m.emissive.copy(_col);
        m.emissiveIntensity = skin.animMin + (1 - p * 0.5) * (skin.animMax - skin.animMin);
        break;
      }
    }
  });
}
