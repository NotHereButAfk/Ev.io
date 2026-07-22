export const ARMOR_TYPES = [
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
  // ── Low-poly cel-shaded models (illustrated like the authored guns) ──
  {
    id:   'vanguard',
    name: 'VANGUARD',
    desc: 'Low-poly heavy trooper — cel-shaded, orange trim',
    icon: 'M16 3 L9 8 L9 23 L23 23 L23 8 Z'
  },
  {
    id:   'striker',
    name: 'STRIKER',
    desc: 'Low-poly agile scout — cel-shaded, teal visor',
    icon: 'M16 5 L11 8 L12 21 L20 21 L21 8 Z'
  },
  {
    id:   'phantom',
    name: 'PHANTOM',
    desc: 'Low-poly stealth infiltrator — cel-shaded, violet glow',
    icon: 'M16 5 L12 9 L13 21 L19 21 L20 9 Z'
  },
];

export function getArmorType(id) {
  return ARMOR_TYPES.find((a) => a.id === id) || ARMOR_TYPES[0];
}

const LS_KEY = 'sio_armor_type';
export function loadArmorType()       { return localStorage.getItem(LS_KEY) || 'assault'; }
export function saveArmorType(id)     { localStorage.setItem(LS_KEY, id); }
