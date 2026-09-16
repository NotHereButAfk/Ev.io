// Every playable map ships as a baked asset shared by client and server.
// Original authored arenas and imported arenas use the same collision format.
export const IMPORTED_MAPS = Object.freeze([
  Object.freeze({
    id: 'copper-circuit', name: 'Copper Circuit', region: 'Copper District',
    fileName: 'CopperCircuit.evmap', url: '/maps/CopperCircuit.evmap',
    loadingImage: '/images/maps/copper-circuit.jpg', environment: 'dust',
    background: 0x91d5f5, fog: 0xbce2eb, fogNear: 90, fogFar: 210,
    lighting: Object.freeze({sky: 0xe4f6ff, ground: 0x434440, hemisphereIntensity: 1.3,
      sun: 0xffebc4, sunIntensity: 1.9, rim: 0x6fffea, rimIntensity: .4}),
  }),
  Object.freeze({
    id: 'daytime-rook',
    name: 'Daytime Rook',
    loadingImage: '/images/maps/daytime-rook.jpg',
    region: 'Rook Sector',
    fileName: 'RookLit_0.evmap',
    url: '/maps/RookLit_0.evmap',
    environment: 'dust',
    background: 0xcfe9ef,
    fog: 0xc8d7dc,
    fogNear: 145,
    fogFar: 360,
    lighting: Object.freeze({
      sky: 0xf4fbff,
      ground: 0x41464d,
      hemisphereIntensity: 1.45,
      sun: 0xfff0cf,
      sunIntensity: 1.68,
      rim: 0x77cfff,
      rimIntensity: 0.34,
    }),
  }),
  Object.freeze({
    id: 'winter-graveyard',
    name: 'Winter-Graveyard',
    loadingImage: '/images/maps/winter-graveyard.jpg',
    region: 'Winter Graveyard',
    fileName: 'XmasGraveyard_1.evmap',
    url: '/maps/XmasGraveyard_1.evmap',
    environment: 'snow',
    background: 0xc8d4df,
    fog: 0xd7e0e8,
    fogNear: 105,
    fogFar: 300,
    lighting: Object.freeze({
      sky: 0xddeeff,
      ground: 0x263246,
      hemisphereIntensity: 1.18,
      sun: 0xdcecff,
      sunIntensity: 1.38,
      rim: 0x8bbcff,
      rimIntensity: 0.48,
    }),
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
