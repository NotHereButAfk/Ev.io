export const GAME_MODES = [
  {
    id:        'deathmatch',
    name:      'DEATHMATCH',
    icon:      '⚔',
    tag:       'FFA',
    desc:      'Free-for-all. 8 players, 8 minutes. Kill for coins — streaks multiply rewards.',
    color:     '#ff5c5c',
    botCount:  7,
    noRespawn: false,
    timeLimit: 480,    // 8 minutes
    lives:     Infinity,
    waves:     false,
    isZombie:  false,
  },
  {
    id:        'survival',
    name:      'SURVIVAL',
    icon:      '🧟',
    tag:       'CO-OP',
    desc:      'Zombie apocalypse. Up to 5 players. Survive escalating waves — revive fallen teammates.',
    color:     '#44cc22',
    botCount:  0,      // zombies are spawned by SurvivalManager, not botManager
    noRespawn: true,
    timeLimit: 0,
    lives:     Infinity,
    waves:     false,  // handled by SurvivalManager
    isZombie:  true,
  },
];

export function getMode(id) {
  return GAME_MODES.find(m => m.id === id) || GAME_MODES[0];
}
