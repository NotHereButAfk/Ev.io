// Ten cosmetic finishes that can be applied to every gun. A skin recolors the
// material "roles" tagged on each weapon model (body / accent / metal), while
// leaving wood furniture and special parts (e.g. an RPG warhead) untouched so
// the guns still read as realistic.
export const WEAPON_SKINS = [
  { id: 'midnight', name: 'Midnight',     body: 0x23262b, accent: 0x121317, metal: 0x6f757c, metalness: 0.55, roughness: 0.45 },
  { id: 'desert',   name: 'Desert Tan',   body: 0xb29766, accent: 0x6c5a3a, metal: 0x9c8e72, metalness: 0.4,  roughness: 0.6 },
  { id: 'olive',    name: 'Olive Drab',   body: 0x59603a, accent: 0x33371f, metal: 0x767a5a, metalness: 0.45, roughness: 0.55 },
  { id: 'woodland', name: 'Woodland',     body: 0x47542f, accent: 0x2b2a1b, metal: 0x5c6347, metalness: 0.4,  roughness: 0.6 },
  { id: 'urban',    name: 'Urban Gray',   body: 0x6b727a, accent: 0x3a3e44, metal: 0x9aa1a9, metalness: 0.5,  roughness: 0.45 },
  { id: 'crimson',  name: 'Crimson',      body: 0x7c1f22, accent: 0x1b1416, metal: 0x9a4a4a, metalness: 0.55, roughness: 0.4 },
  { id: 'gold',     name: 'Gold Plated',  body: 0xc7a23a, accent: 0x4a3a12, metal: 0xe0c25a, metalness: 0.95, roughness: 0.18 },
  { id: 'arctic',   name: 'Arctic',       body: 0xd6dde5, accent: 0x8893a2, metal: 0xc2cad3, metalness: 0.5,  roughness: 0.4 },
  { id: 'cyber',    name: 'Cyber Neon',   body: 0x1b2030, accent: 0x00c2ff, metal: 0x2bd6ff, metalness: 0.7,  roughness: 0.25 },
  { id: 'carbon',   name: 'Carbon Fiber', body: 0x18191d, accent: 0x2c2f35, metal: 0x4a4e55, metalness: 0.75, roughness: 0.22 }
];

export function getWeaponSkin(id) {
  return WEAPON_SKINS.find((s) => s.id === id) || WEAPON_SKINS[0];
}

/** Recolor a built weapon model group according to its material role tags. */
export function applyWeaponSkin(group, skin) {
  const seen = new Set();
  group.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const m = obj.material;
    if (seen.has(m)) return;
    seen.add(m);
    const role = m.userData && m.userData.role;
    if (role === 'body') {
      m.color.setHex(skin.body);
      m.metalness = skin.metalness;
      m.roughness = skin.roughness;
    } else if (role === 'accent') {
      m.color.setHex(skin.accent);
      m.metalness = skin.metalness;
      m.roughness = Math.min(0.85, skin.roughness + 0.15);
    } else if (role === 'metal') {
      m.color.setHex(skin.metal);
    }
    // 'wood' and 'special' roles are intentionally left as-is.
  });
}
