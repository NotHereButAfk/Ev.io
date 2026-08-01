const _KEY     = 'sio_shop';
const _EQ_KEY  = 'sio_armor_skin';
const STARTER  = 500; // coins new players start with
const STARTER_ARMOR_SKINS = new Set(['cobalt_circuit', 'crimson_guard']);

function _load() {
  try { return JSON.parse(localStorage.getItem(_KEY) || `{"coins":${STARTER},"owned":[]}`); }
  catch { return { coins: STARTER, owned: [] }; }
}
function _save(d) { localStorage.setItem(_KEY, JSON.stringify(d)); }

export const Shop = {
  getCoins()  { return _load().coins; },
  getOwned()  { return _load().owned; },
  isOwned(id) { return STARTER_ARMOR_SKINS.has(id) || _load().owned.includes(id); },

  addCoins(n) {
    const d = _load();
    d.coins = (d.coins || 0) + n;
    _save(d);
    return d.coins;
  },

  buy(skinId, price) {
    const d = _load();
    if (d.owned.includes(skinId)) return { ok: false, err: 'Already owned' };
    if ((d.coins || 0) < price)   return { ok: false, err: 'Not enough coins' };
    d.coins -= price;
    d.owned.push(skinId);
    _save(d);
    return { ok: true, remaining: d.coins };
  },

  unlock(skinId) {
    const d = _load();
    if (!d.owned.includes(skinId)) {
      d.owned.push(skinId);
      _save(d);
    }
  },

  // New profiles start with a readable blue/graphite finish instead of the
  // nearly-black untinted material. An explicit empty string still means the
  // player chose the unpainted default in Inventory.
  getEquipped()   {
    try {
      const stored = localStorage.getItem(_EQ_KEY);
      return stored === null ? 'cobalt_circuit' : (stored || null);
    } catch { return 'cobalt_circuit'; }
  },
  equip(skinId)   { localStorage.setItem(_EQ_KEY, skinId || ''); },
  unequip()       { localStorage.setItem(_EQ_KEY, ''); },
};
