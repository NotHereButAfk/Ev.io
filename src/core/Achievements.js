// Achievements (ev.io-style): tiered goals built from the player's lifetime
// stats. Each completed tier can be claimed once for an E-Coin reward.
import { UserAccount } from './UserAccount.js';
import { Shop } from './Shop.js';

const _KEY = 'sio_ach_claimed';

// Five tiers, shared by every category (matches ev.io's Beginner..Master ramp).
const TIERS = [
  { tier: 'Beginner',     reward: 1000 },
  { tier: 'Intermediate', reward: 2000 },
  { tier: 'Pro',          reward: 3000 },
  { tier: 'Tryhard',      reward: 4000 },
  { tier: 'Master',       reward: 5000 },
];

// Categories are driven by the lifetime stats we actually track.
const CATEGORIES = [
  { id: 'kills', name: 'ELIMINATOR',  icon: 'kills', verb: 'Get',   noun: 'total kills',  steps: [10, 50, 150, 300, 500] },
  { id: 'games', name: 'CAMPAIGNER',  icon: 'games', verb: 'Play',  noun: 'matches',      steps: [5, 25, 75, 150, 300] },
  { id: 'score', name: 'HIGH SCORER', icon: 'score', verb: 'Earn',  noun: 'total score',  steps: [2000, 15000, 60000, 200000, 600000] },
  { id: 'kd',    name: 'UNTOUCHABLE', icon: 'kd',    verb: 'Reach', noun: 'K/D',          steps: [1, 2, 3, 5, 10], isRatio: true },
];

function _claimed() { try { return JSON.parse(localStorage.getItem(_KEY)) || {}; } catch { return {}; } }
function _saveClaimed(d) { localStorage.setItem(_KEY, JSON.stringify(d)); }

function _statValue(stats, catId) {
  const kills = stats.kills || 0, deaths = stats.deaths || 0;
  if (catId === 'kd') return deaths > 0 ? kills / deaths : kills;
  return stats[catId] || 0;
}

export const Achievements = {
  // Flat list of every tier across every category for the given user.
  list(username) {
    const isGuest = !username || username === '__guest__';
    const stats   = isGuest ? { kills: 0, deaths: 0, score: 0, games: 0 }
                            : (UserAccount.getStats(username) || { kills: 0, deaths: 0, score: 0, games: 0 });
    const claimed = _claimed();
    const out = [];
    for (const cat of CATEGORIES) {
      const cur = _statValue(stats, cat.id);
      cat.steps.forEach((goal, i) => {
        const id = `${cat.id}_${i}`;
        const t  = TIERS[i];
        const goalLabel = cat.isRatio ? goal.toFixed(1) : goal.toLocaleString();
        out.push({
          id, category: cat.id, icon: cat.icon,
          name: `${cat.name} ${t.tier.toUpperCase()}`,
          desc: `${cat.verb} ${goalLabel} ${cat.noun}`,
          reward:   t.reward,
          current:  cat.isRatio ? Math.min(cur, goal) : Math.min(cur, goal),
          goal,
          isRatio:  !!cat.isRatio,
          progress: Math.max(0, Math.min(1, cur / goal)),
          complete: cur >= goal,
          claimed:  !!claimed[id],
        });
      });
    }
    return out;
  },

  claim(username, id) {
    const a = this.list(username).find((x) => x.id === id);
    if (!a || !a.complete || a.claimed) return { ok: false };
    const c = _claimed(); c[id] = true; _saveClaimed(c);
    Shop.addCoins(a.reward);
    return { ok: true, reward: a.reward };
  },

  // How many tiers are completed but not yet claimed (for a nav badge).
  claimableCount(username) {
    return this.list(username).filter((a) => a.complete && !a.claimed).length;
  },
};
