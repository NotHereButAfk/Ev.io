import * as THREE from 'three';

// Twenty cosmetic finishes specifically for the sword. A sword skin recolors
// the blade (metal role), the fuller groove (accent role), and the guard
// (special role), while leaving the wooden handle untouched.
// Animated skins pulse/cycle the blade's emissive each frame.

export const SWORD_SKINS = [
  // ── Classic Steel ──────────────────────────────────────────────────────
  {
    id: 'iron',         name: 'Iron',
    blade: 0x6a6e74, fuller: 0x2a2c30, guard: 0x4a4e54,
    metalness: 0.7, roughness: 0.45, emissive: 0x000000, emissiveIntensity: 0
  },
  {
    id: 'polished',     name: 'Polished Steel',
    blade: 0xc8d0da, fuller: 0x8890a0, guard: 0xa8b4c0,
    metalness: 0.92, roughness: 0.1, emissive: 0x000000, emissiveIntensity: 0
  },
  {
    id: 'obsidian_blade', name: 'Obsidian',
    blade: 0x18141c, fuller: 0x0c0a10, guard: 0x2a2236,
    metalness: 0.75, roughness: 0.3, emissive: 0x000000, emissiveIntensity: 0
  },
  {
    id: 'bloodstained', name: 'Bloodstained',
    blade: 0x4a3030, fuller: 0x6c1a1a, guard: 0x3a2424,
    metalness: 0.65, roughness: 0.4, emissive: 0x220000, emissiveIntensity: 0.15
  },
  {
    id: 'rusted',       name: 'Rusted',
    blade: 0x7a4428, fuller: 0x5a3018, guard: 0x6a3820,
    metalness: 0.25, roughness: 0.88, emissive: 0x000000, emissiveIntensity: 0
  },
  // ── Precious ───────────────────────────────────────────────────────────
  {
    id: 'bronze',       name: 'Ancient Bronze',
    blade: 0x9c6b28, fuller: 0x5a3e18, guard: 0xb88030,
    metalness: 0.8, roughness: 0.28, emissive: 0x000000, emissiveIntensity: 0
  },
  {
    id: 'gilded',       name: 'Gilded',
    blade: 0xc8a234, fuller: 0x7a6018, guard: 0xe0be50,
    metalness: 0.95, roughness: 0.15, emissive: 0x221800, emissiveIntensity: 0.2
  },
  {
    id: 'silver',       name: 'Silver Moon',
    blade: 0xe8eef4, fuller: 0xa0b0c0, guard: 0xccd8e4,
    metalness: 0.9, roughness: 0.12, emissive: 0x304050, emissiveIntensity: 0.1
  },
  // ── Elemental ──────────────────────────────────────────────────────────
  {
    id: 'frostbite',   name: 'Frostbite',
    blade: 0xaad0e8, fuller: 0x6090b8, guard: 0x7ab0d0,
    metalness: 0.8, roughness: 0.22, emissive: 0x2060a0, emissiveIntensity: 0.25
  },
  {
    id: 'poison',       name: 'Venom',
    blade: 0x1e5c28, fuller: 0x487a18, guard: 0x285c1e,
    metalness: 0.65, roughness: 0.35, emissive: 0x18440a, emissiveIntensity: 0.3
  },
  {
    id: 'phantom',      name: 'Phantom',
    blade: 0x5028a0, fuller: 0x2a1060, guard: 0x6030b8,
    metalness: 0.8, roughness: 0.25, emissive: 0x3010a0, emissiveIntensity: 0.4
  },
  {
    id: 'dawn',         name: 'Dawn Light',
    blade: 0xe8b060, fuller: 0xd08020, guard: 0xf0c870,
    metalness: 0.88, roughness: 0.18, emissive: 0x704820, emissiveIntensity: 0.2
  },
  // ── Dark Fantasy ───────────────────────────────────────────────────────
  {
    id: 'void_blade',   name: 'Void Blade',
    blade: 0x100a18, fuller: 0x3a1a66, guard: 0x1a0c2a,
    metalness: 0.85, roughness: 0.2, emissive: 0x500080, emissiveIntensity: 0.35
  },
  {
    id: 'sacred',       name: 'Sacred',
    blade: 0xf0f0f0, fuller: 0xffffff, guard: 0xe0e0e0,
    metalness: 0.9, roughness: 0.1, emissive: 0xd0e8ff, emissiveIntensity: 0.45
  },
  {
    id: 'dragon',       name: 'Dragonscale',
    blade: 0x5c1c0c, fuller: 0x8c2c10, guard: 0x441408,
    metalness: 0.7, roughness: 0.38, emissive: 0x2a0800, emissiveIntensity: 0.2
  },
  {
    id: 'shadow',       name: 'Shadow Iron',
    blade: 0x1c1820, fuller: 0x0e0c12, guard: 0x2a2432,
    metalness: 0.72, roughness: 0.32, emissive: 0x060010, emissiveIntensity: 0.1
  },
  // ── Animated ───────────────────────────────────────────────────────────
  {
    id: 'soul_fire',    name: 'Soul Fire 🔵',
    blade: 0x08101e, fuller: 0x001460, guard: 0x0a1830,
    metalness: 0.88, roughness: 0.14,
    emissive: 0x0066ff, emissiveIntensity: 0.6,
    animated: true, animType: 'pulse', animSpeed: 2.8, animMin: 0.3, animMax: 1.4
  },
  {
    id: 'lava_blade',   name: 'Lava Blade 🌋',
    blade: 0x200a04, fuller: 0x8c2800, guard: 0x3a0c04,
    metalness: 0.6, roughness: 0.3,
    emissive: 0xff3300, emissiveIntensity: 0.7,
    animated: true, animType: 'lava', animSpeed: 4.5, animMin: 0.4, animMax: 1.6
  },
  {
    id: 'storm',        name: 'Thunderstrike ⚡',
    blade: 0x1a180a, fuller: 0x7a6600, guard: 0x2c2608,
    metalness: 0.78, roughness: 0.2,
    emissive: 0xffdd00, emissiveIntensity: 0.5,
    animated: true, animType: 'storm', animSpeed: 8.0, animMin: 0.1, animMax: 1.8
  },
  {
    id: 'corruption',   name: 'Corruption ☠',
    blade: 0x0c1008, fuller: 0x204a10, guard: 0x0a1406,
    metalness: 0.8, roughness: 0.25,
    emissive: 0x40cc20, emissiveIntensity: 0.5,
    animated: true, animType: 'corruption', animSpeed: 3.0, animMin: 0.2, animMax: 1.2
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
  const seen = new Set();
  group.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const m = obj.material;
    if (seen.has(m)) return;
    seen.add(m);
    const role = m.userData?.role;
    if (role !== 'metal' && role !== 'accent') return;

    switch (skin.animType) {
      case 'pulse': {
        const pulse = (Math.sin(t * skin.animSpeed) + 1) * 0.5;
        m.emissive.setHex(skin.emissive);
        m.emissiveIntensity = skin.animMin + pulse * (skin.animMax - skin.animMin);
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
