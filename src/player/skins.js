export const SKINS = [
  { id: 'crimson', name: 'Crimson', primary: 0xd1372b, secondary: 0x2b1414 },
  { id: 'azure', name: 'Azure', primary: 0x2b8fd1, secondary: 0x142233 },
  { id: 'toxic', name: 'Toxic', primary: 0x7fd13b, secondary: 0x1c2b14 },
  { id: 'shadow', name: 'Shadow', primary: 0x3a3f4b, secondary: 0x12141a },
  { id: 'gold', name: 'Gold', primary: 0xe0b03c, secondary: 0x332a14 },
  { id: 'arctic', name: 'Arctic', primary: 0xcfe8ee, secondary: 0x223238 },
  { id: 'violet', name: 'Violet', primary: 0x9050d1, secondary: 0x241433 },
  { id: 'magma', name: 'Magma', primary: 0xff7a29, secondary: 0x331a0e },
  { id: 'jet', name: 'Jet', primary: 0x16181d, secondary: 0x05060a },
  { id: 'rose', name: 'Rose', primary: 0xe85d9c, secondary: 0x331622 },
  { id: 'lime', name: 'Lime', primary: 0xb6f23c, secondary: 0x223308 },
  { id: 'steel', name: 'Steel', primary: 0x8c98a4, secondary: 0x20242a },
  // ── new vibrant skins ──
  { id: 'cyan', name: 'Cyan Pulse', primary: 0x22e0e8, secondary: 0x0a2a2e },
  { id: 'plasma', name: 'Plasma', primary: 0x3a8cff, secondary: 0x0a1840 },
  { id: 'neonpink', name: 'Neon Pink', primary: 0xff3aaa, secondary: 0x33102a },
  { id: 'emberorange', name: 'Ember', primary: 0xff5a1e, secondary: 0x331306 },
  { id: 'voidpurple', name: 'Voidwalker', primary: 0x8a2bff, secondary: 0x1a0a33 },
  { id: 'aurora', name: 'Aurora', primary: 0x2bffb0, secondary: 0x0a3326 }
];

export function getSkin(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}
