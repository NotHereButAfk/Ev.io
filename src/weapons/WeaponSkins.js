import * as THREE from 'three';
import { decalTexture } from './WeaponTextures.js';

// Cosmetic finishes for guns. Each skin recolors the material "roles"
// tagged on every gun model (body / accent / metal). Wood and special parts
// are left untouched. Animated skins also update emissive properties each
// frame via animateWeaponSkin().
//
// A skin may also carry:
//   rarity      — 'common'|'epic'|'legendary'|'mythic'
//   decal       — a seamless image pattern painted on the body (see WeaponTextures)
//   decalEmissive — the decal also glows via emissiveMap
//   shootSound  — overrides the fire SFX ('anime' kawaii pew, 'laser', 'fire')
//
// Curated to 15 common / 12 epic / 5 legendary / 3 mythic — one clear pick
// per visual theme rather than several near-duplicate recolors.

// Five free common finishes, usable on any gun (commons are auto-owned — see
// Armory.ownsSkin). Each just recolours the shell or retints the energy glow.
// The light-tint skins keep the guns' shared gunmetal body and only change
// energyColor; the others recolour the shell (Desert keeps the cyan glow).
export const WEAPON_SKINS = [
  { id: 'ember',   name: 'Ember',   rarity: 'common', body: 0x394049, accent: 0x0c0e11, metal: 0x8a929c, metalness: 0.42, roughness: 0.48, energyColor: 0xff7a1e },
  { id: 'venom',   name: 'Venom',   rarity: 'common', body: 0x394049, accent: 0x0c0e11, metal: 0x8a929c, metalness: 0.42, roughness: 0.48, energyColor: 0x54ff45 },
  { id: 'crimson', name: 'Crimson', rarity: 'common', body: 0x394049, accent: 0x0c0e11, metal: 0x8a929c, metalness: 0.42, roughness: 0.48, energyColor: 0xff2e3a },
  { id: 'desert',  name: 'Desert',  rarity: 'common', body: 0xb29766, accent: 0x4a3b24, metal: 0xa89878, metalness: 0.40, roughness: 0.55 },
  { id: 'arctic',  name: 'Arctic',  rarity: 'common', body: 0xcdd6dd, accent: 0x5f6a74, metal: 0xb8c2cc, metalness: 0.50, roughness: 0.40, energyColor: 0x8fd8ff },
];

const _hsl = new THREE.Color();

export function getWeaponSkin(id) {
  // Catalog is empty — no gun skins exist, so there is no default fallback.
  return WEAPON_SKINS.find((s) => s.id === id) || null;
}

/** Recolor a built gun model group using the skin's material role tags. */
export function applyWeaponSkin(group, skin) {
  // No skin (empty catalog / cleared finish) → leave the model's build-time look.
  if (!skin) return;
  const decal = skin.decal ? decalTexture(skin.decal) : null;
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
      // Painted decal pattern on the main shell.
      m.map = decal || null;
      if (skin.decalEmissive && decal) {
        m.emissiveMap = decal;
        m.emissive.setHex(0xffffff); // let the pattern's own colors glow
      } else {
        m.emissiveMap = null;
      }
      m.needsUpdate = true;
    } else if (role === 'accent') {
      m.color.setHex(skin.accent);
      m.metalness = skin.metalness;
      m.roughness = Math.min(0.85, skin.roughness + 0.15);
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
      // Total-coverage wraps also paint the trim/furniture parts. Clear the map
      // otherwise, so switching back from a full wrap to a normal skin doesn't
      // leave the old artwork on the trim (materials are reused across skins).
      m.map = (skin.decalOnAccent && decal) ? decal : null;
      m.needsUpdate = true;
    } else if (role === 'energy') {
      // Sci-fi glow strips. A skin may retint the hue (e.g. a "make the light
      // a different colour" finish). Keep a near-black base so the part doesn't
      // wash out under the game's ACES tone mapping — the glow rides on the
      // emissive, exactly as the model build does. Record the build-time colours
      // once so a retint is reversible when the next skin omits energyColor.
      if (m.userData.baseEnergyColor === undefined) {
        m.userData.baseEnergyColor = m.color.getHex();
        m.userData.baseEnergyEmissive = m.emissive.getHex();
      }
      if (skin.energyColor !== undefined) {
        m.color.setHex(_hsl.setHex(skin.energyColor).multiplyScalar(0.12).getHex());
        m.emissive.setHex(skin.energyColor);
      } else {
        m.color.setHex(m.userData.baseEnergyColor);
        m.emissive.setHex(m.userData.baseEnergyEmissive);
      }
      m.needsUpdate = true;
    } else if (role === 'metal') {
      m.color.setHex(skin.metal);
      m.emissive.setHex(skin.emissive ?? 0x000000);
      m.emissiveIntensity = skin.emissiveIntensity ?? 0;
      // Full-coverage wraps (decalOnMetal) paint the receiver/barrel too, so
      // the artwork flows across the whole gun instead of only body panels.
      // Otherwise clear the maps so a normal skin fully reverses a prior wrap.
      if (skin.decalOnMetal && decal) {
        m.map = decal;
        if (skin.decalEmissive) { m.emissiveMap = decal; m.emissive.setHex(0xffffff); }
        else m.emissiveMap = null;
      } else {
        m.map = null;
        m.emissiveMap = null;
      }
      m.needsUpdate = true;
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
  // For glowing-decal skins the emissiveMap supplies the colour, so we keep
  // emissive white on the body and only animate the glow intensity.
  const glowDecal = skin.decalEmissive;
  const seen = new Set();
  group.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const m = obj.material;
    if (seen.has(m)) return;
    seen.add(m);
    const role = m.userData?.role;
    if (role !== 'body' && role !== 'metal') return;
    const keepWhite = glowDecal && role === 'body';

    switch (skin.animType) {
      case 'pulse': {
        const pulse = (Math.sin(t * skin.animSpeed) + 1) * 0.5;
        if (!keepWhite) m.emissive.setHex(skin.emissive);
        m.emissiveIntensity = skin.animMin + pulse * (skin.animMax - skin.animMin);
        break;
      }
      case 'flicker': {
        const noise = Math.sin(t * skin.animSpeed) * 0.5
          + Math.sin(t * skin.animSpeed * 2.3) * 0.3
          + Math.sin(t * skin.animSpeed * 0.7) * 0.2;
        const f = (noise + 1) * 0.5;
        if (!keepWhite) m.emissive.setHex(skin.emissive);
        m.emissiveIntensity = skin.animMin + f * (skin.animMax - skin.animMin);
        break;
      }
      case 'cycle': {
        const hue = (t * 0.14) % 1;
        _hsl.setHSL(hue, 0.95, 0.55);
        m.emissive.copy(_hsl);
        m.emissiveIntensity = 1.6;
        break;
      }
      case 'rainbow': {
        // Fast continuous hue cycling with a gentle brightness pulse so the
        // bloom shimmers through the whole spectrum.
        const speed = skin.animSpeed ?? 0.35;
        const hue = (t * speed) % 1;
        _hsl.setHSL(hue, 1.0, 0.55);
        if (!keepWhite) m.emissive.copy(_hsl);
        const lo = skin.animMin ?? 1.2, hi = skin.animMax ?? 2.2;
        const pulse = (Math.sin(t * 4.0) + 1) * 0.5;
        m.emissiveIntensity = lo + pulse * (hi - lo);
        break;
      }
    }
  });
}
