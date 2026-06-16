// Browser-local account system backed by localStorage.
// No real security guarantee — this is a client-side game.

const _DB  = 'sio_accounts';
const _SES = 'sio_session';

function _load() {
  try { return JSON.parse(localStorage.getItem(_DB) || '{"accounts":{}}'); }
  catch { return { accounts: {} }; }
}
function _save(db) { localStorage.setItem(_DB, JSON.stringify(db)); }

export const UserAccount = {
  current()    { return sessionStorage.getItem(_SES) || null; },
  isGuest()    { return sessionStorage.getItem(_SES) === '__guest__'; },
  isLoggedIn() { return !!sessionStorage.getItem(_SES); },

  login(username, password) {
    if (!username) return { ok: false, err: 'Enter a username' };
    const { accounts } = _load();
    const acc = accounts[username.toLowerCase()];
    if (!acc)                      return { ok: false, err: 'Account not found' };
    if (acc.password !== password) return { ok: false, err: 'Incorrect password' };
    sessionStorage.setItem(_SES, username.toLowerCase());
    return { ok: true };
  },

  register(username, password) {
    const u = (username || '').trim();
    if (u.length < 2)               return { ok: false, err: 'Username must be 2+ characters' };
    if (!/^[a-zA-Z0-9_]+$/.test(u)) return { ok: false, err: 'Letters, numbers and _ only' };
    if (!password || password.length < 3) return { ok: false, err: 'Password must be 3+ characters' };
    const db = _load();
    if (db.accounts[u.toLowerCase()]) return { ok: false, err: 'Username already taken' };
    db.accounts[u.toLowerCase()] = {
      displayName: u,
      password,
      created: Date.now(),
      stats: { kills: 0, score: 0, games: 0 },
    };
    _save(db);
    sessionStorage.setItem(_SES, u.toLowerCase());
    return { ok: true };
  },

  logout() { sessionStorage.removeItem(_SES); },
  guest()  { sessionStorage.setItem(_SES, '__guest__'); },

  getDisplayName(username) {
    const { accounts } = _load();
    return accounts[username]?.displayName || username;
  },

  getStats(username) {
    const { accounts } = _load();
    return accounts[username]?.stats || { kills: 0, score: 0, games: 0 };
  },

  addGameStats(username, kills, score) {
    if (!username || username === '__guest__') return;
    const db = _load();
    const acc = db.accounts[username];
    if (!acc) return;
    acc.stats.kills  = (acc.stats.kills  || 0) + kills;
    acc.stats.score  = (acc.stats.score  || 0) + score;
    acc.stats.games  = (acc.stats.games  || 0) + 1;
    _save(db);
  },
};
