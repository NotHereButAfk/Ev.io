export const ARMOR_TYPES = [
  // ── Low-poly cel-shaded cyborg-terminator models (the primary roster) ──
  {
    id:   'vanguard',
    name: 'ENDO-800',
    desc: 'White endoskeleton cyborg — skull face, red optics',
    icon: 'M16 3 L9 8 L9 23 L23 23 L23 8 Z'
  },
  {
    id:   'striker',
    name: 'CRYO HUNTER',
    desc: 'Steel-blue infiltrator cyborg — cyan optics',
    icon: 'M16 5 L11 8 L12 21 L20 21 L21 8 Z'
  },
  {
    id:   'phantom',
    name: 'NIGHTSTALKER',
    desc: 'Blacked-out graphite cyborg — red optics',
    icon: 'M16 5 L12 9 L13 21 L19 21 L20 9 Z'
  },
  // ── Legacy human-soldier armour kits (still selectable) ──
  {
    id:   'assault',
    name: 'ASSAULT',
    desc: 'Balanced tactical plate — the standard kit',
    icon: 'M16 4 L10 8 L10 22 L22 22 L22 8 Z'
  },
  {
    id:   'recon',
    name: 'RECON',
    desc: 'Light scout loadout — fast and agile',
    icon: 'M16 5 L12 8 L12 20 L20 20 L20 8 Z'
  },
  {
    id:   'heavy',
    name: 'HEAVY',
    desc: 'Maximum armour coverage — built like a tank',
    icon: 'M16 3 L8 8 L8 24 L24 24 L24 8 Z'
  },
  {
    id:   'stealth',
    name: 'STEALTH',
    desc: 'Minimal profile infiltrator — move unseen',
    icon: 'M16 6 L13 9 L13 21 L19 21 L19 9 Z'
  },
];

export function getArmorType(id) {
  return ARMOR_TYPES.find((a) => a.id === id) || ARMOR_TYPES[0];
}

const LS_KEY = 'sio_armor_type';
const MODEL_MIGRATION_KEY = 'sio_armor_human_model_v1';
// Roll the current profile onto the rigged armored soldier once. The cyborg
// roster remains selectable afterward, but new/default players now use the
// silhouette and animation system that matches ev.io's character skins.
export function loadArmorType() {
  const saved = localStorage.getItem(LS_KEY);
  if (!localStorage.getItem(MODEL_MIGRATION_KEY)) {
    localStorage.setItem(MODEL_MIGRATION_KEY, '1');
    if (!saved || ['vanguard', 'striker', 'phantom'].includes(saved)) {
      localStorage.setItem(LS_KEY, 'assault');
      return 'assault';
    }
  }
  return saved || 'assault';
}
export function saveArmorType(id)     { localStorage.setItem(LS_KEY, id); }
