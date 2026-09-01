// Server-owned allow-list for paid digital items. Keep this module free of
// renderer/browser imports so checkout can start on the production Node host.
const byRarity = {
  common: ['ember','venom','crimson','desert','arctic','solar','ultraviolet','woodland','graphite','copper','oceanic','rosegold','hazard'],
  epic: ['voltage','inferno','biohazard','cosmos','prismatic','stormcall','permafrost','cybergrid','darknet','tigerstrike','carbonpro','kawaiiblast','redprotocol'],
  legendary: ['royalgold','bloodmoon','bonecrusher','jadedragon','whiteout','shadowops','magmalord','neonparade'],
  mythic: ['fireball','sakura','prismbreak','k9unit','overclock','eventhorizon'],
};

const armorByRarity = {
  epic: ['solar_warden','oni_protocol'],
  legendary: ['ivory_sentinel','boneframe'],
  mythic: ['foxfire','void_regent'],
};

const label = (id) => id.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

export const STORE_ITEMS = [
  ...Object.entries(byRarity).flatMap(([rarity, ids]) => ids.map((id) => ({ id, name: label(id), kind: 'weapon', rarity }))),
  ...Object.entries(armorByRarity).flatMap(([rarity, ids]) => ids.map((id) => ({ id, name: label(id), kind: 'character', rarity }))),
];
