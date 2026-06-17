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
];

export function getArmorType(id) {
  return ARMOR_TYPES.find((a) => a.id === id) || ARMOR_TYPES[0];
}

const LS_KEY = 'sio_armor_type';
export function loadArmorType()       { return localStorage.getItem(LS_KEY) || 'assault'; }
export function saveArmorType(id)     { localStorage.setItem(LS_KEY, id); }
