import * as THREE from 'three';

// Twenty cosmetic finishes for guns. Each skin recolors the material "roles"
// tagged on every gun model (body / accent / metal). Wood and special parts
// are left untouched. Animated skins also update emissive properties each
// frame via animateWeaponSkin().

export const WEAPON_SKINS = [
  // ── Tactical/Military ──────────────────────────────────────────────────
  { id: 'midnight',  name: 'Midnight Black',   body: 0x23262b, accent: 0x121317, metal: 0x6f757c, metalness: 0.55, roughness: 0.45 },
  { id: 'desert',   name: 'Desert Tan',        body: 0xb29766, accent: 0x6c5a3a, metal: 0x9c8e72, metalness: 0.4,  roughness: 0.6  },
  { id: 'olive',    name: 'Olive Drab',         body: 0x59603a, accent: 0x33371f, metal: 0x767a5a, metalness: 0.45, roughness: 0.55 },
  { id: 'woodland', name: 'Woodland',           body: 0x47542f, accent: 0x2b2a1b, metal: 0x5c6347, metalness: 0.4,  roughness: 0.6  },
  { id: 'urban',    name: 'Urban Gray',         body: 0x6b727a, accent: 0x3a3e44, metal: 0x9aa1a9, metalness: 0.5,  roughness: 0.45 },
  { id: 'stealth',  name: 'Stealth',            body: 0x111214, accent: 0x191b1e, metal: 0x2a2d33, metalness: 0.68, roughness: 0.28 },
  { id: 'ranger',   name: 'Forest Ranger',      body: 0x2d4228, accent: 0x1a2616, metal: 0x4a5e40, metalness: 0.4,  roughness: 0.58 },
  { id: 'navy',     name: 'Navy Ops',           body: 0x1a2440, accent: 0x0e1628, metal: 0x2c3e5c, metalness: 0.55, roughness: 0.4  },
  // ── Stylised ───────────────────────────────────────────────────────────
  { id: 'crimson',  name: 'Crimson',            body: 0x7c1f22, accent: 0x1b1416, metal: 0x9a4a4a, metalness: 0.55, roughness: 0.4  },
  { id: 'gold',     name: 'Gold Plated',        body: 0xc7a23a, accent: 0x4a3a12, metal: 0xe0c25a, metalness: 0.95, roughness: 0.18 },
  { id: 'arctic',   name: 'Arctic',             body: 0xd6dde5, accent: 0x8893a2, metal: 0xc2cad3, metalness: 0.5,  roughness: 0.4  },
  { id: 'carbon',   name: 'Carbon Fiber',       body: 0x18191d, accent: 0x2c2f35, metal: 0x4a4e55, metalness: 0.75, roughness: 0.22 },
  { id: 'rose',     name: 'Rose Gold',          body: 0xc9786a, accent: 0x7a3a30, metal: 0xdea08c, metalness: 0.9,  roughness: 0.2  },
  { id: 'emerald',  name: 'Emerald',            body: 0x1a5c34, accent: 0x0a2e1a, metal: 0x2e8c54, metalness: 0.75, roughness: 0.25 },
  { id: 'titanium', name: 'Titanium',           body: 0x8c9aaa, accent: 0x4a5260, metal: 0xc2d0de, metalness: 0.88, roughness: 0.15 },
  { id: 'obsidian', name: 'Obsidian',           body: 0x1a1214, accent: 0x0c0a0c, metal: 0x3a2830, metalness: 0.7,  roughness: 0.35 },
  // ── Animated ───────────────────────────────────────────────────────────
  {
    id: 'plasma', name: 'Plasma ⚡',
    body: 0x0a0f1a, accent: 0x001066, metal: 0x0055cc,
    metalness: 0.8, roughness: 0.15,
    emissive: 0x00aaff, emissiveIntensity: 0.4,
    animated: true, animType: 'pulse', animSpeed: 3.2, animMin: 0.2, animMax: 1.1
  },
  {
    id: 'inferno', name: 'Inferno 🔥',
    body: 0x1a0800, accent: 0x5c1400, metal: 0xcc3300,
    metalness: 0.6, roughness: 0.3,
    emissive: 0xff4400, emissiveIntensity: 0.5,
    animated: true, animType: 'flicker', animSpeed: 6.0, animMin: 0.3, animMax: 1.2
  },
  {
    id: 'prism', name: 'Prism 🌈',
    body: 0x1a1a1a, accent: 0x0f0f0f, metal: 0x606060,
    metalness: 0.75, roughness: 0.2,
    emissive: 0xffffff, emissiveIntensity: 0.4,
    animated: true, animType: 'cycle'
  },
  {
    id: 'void', name: 'Void ◈',
    body: 0x080608, accent: 0x12001a, metal: 0x3a0055,
    metalness: 0.82, roughness: 0.15,
    emissive: 0x6600cc, emissiveIntensity: 0.3,
    animated: true, animType: 'pulse', animSpeed: 2.4, animMin: 0.1, animMax: 0.85
  }
];

const _hsl = new THREE.Color();

export function getWeaponSkin(id) {
  return WEAPON_SKINS.find((s) => s.id === id) || WEAPON_SKINS[0];
}

/** Recolor a built gun model group using the skin's material role tags. */
export function applyWeaponSkin(group, skin) {
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
  const seen = new Set();
  group.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const m = obj.material;
    if (seen.has(m)) return;
    seen.add(m);
    const role = m.userData?.role;
    if (role !== 'body' && role !== 'metal') return;

    switch (skin.animType) {
      case 'pulse': {
        const pulse = (Math.sin(t * skin.animSpeed) + 1) * 0.5;
        m.emissive.setHex(skin.emissive);
        m.emissiveIntensity = skin.animMin + pulse * (skin.animMax - skin.animMin);
        break;
      }
      case 'flicker': {
        const noise = Math.sin(t * skin.animSpeed) * 0.5
          + Math.sin(t * skin.animSpeed * 2.3) * 0.3
          + Math.sin(t * skin.animSpeed * 0.7) * 0.2;
        const f = (noise + 1) * 0.5;
        m.emissive.setHex(skin.emissive);
        m.emissiveIntensity = skin.animMin + f * (skin.animMax - skin.animMin);
        break;
      }
      case 'cycle': {
        const hue = (t * 0.14) % 1;
        _hsl.setHSL(hue, 0.95, 0.55);
        m.emissive.copy(_hsl);
        m.emissiveIntensity = 0.55;
        break;
      }
    }
  });
}
