// The playable rotation is deliberately asset-backed. A map belongs here only
// when its real .evmap binary ships in public/maps; procedural recreations and
// grayboxes must never leak into the live map vote/rotation.
export const IMPORTED_MAPS = Object.freeze([
  Object.freeze({
    id: 'daytime-rook',
    name: 'Daytime Rook',
    region: 'Rook Sector',
    fileName: 'RookLit_0.evmap',
    url: '/maps/RookLit_0.evmap',
    environment: 'dust',
    background: 0xcfe9ef,
    fog: 0xc8d7dc,
    fogNear: 145,
    fogFar: 360,
  }),
  Object.freeze({
    id: 'winter-graveyard',
    name: 'Winter-Graveyard',
    region: 'Winter Graveyard',
    fileName: 'XmasGraveyard_1.evmap',
    url: '/maps/XmasGraveyard_1.evmap',
    environment: 'snow',
    background: 0xc8d4df,
    fog: 0xd7e0e8,
    fogNear: 105,
    fogFar: 300,
  }),
]);

export const DEFAULT_MAP_ID = IMPORTED_MAPS[0].id;

export function getImportedMap(id) {
  return IMPORTED_MAPS.find((map) => map.id === id) || IMPORTED_MAPS[0];
}

export function nextImportedMapId(currentId) {
  const index = IMPORTED_MAPS.findIndex((map) => map.id === currentId);
  return IMPORTED_MAPS[(index + 1 + IMPORTED_MAPS.length) % IMPORTED_MAPS.length].id;
}

export function importedMapIds() {
  return IMPORTED_MAPS.map((map) => map.id);
}
