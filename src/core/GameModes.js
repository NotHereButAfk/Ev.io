// Game mode definitions — read by both the menu UI and the Game logic.
export const GAME_MODES = [
  {
    id:        'deathmatch',
    name:      'DEATHMATCH',
    icon:      '⚔',
    tag:       'CLASSIC',
    desc:      'Kill bots for 100 pts each. Bots respawn. Survive as long as possible.',
    color:     '#ff5c5c',
    botCount:  7,
    noRespawn: false,
    timeLimit: 0,        // 0 = no limit
    lives:     Infinity,
    waves:     false,
  },
  {
    id:        'time_attack',
    name:      'TIME ATTACK',
    icon:      '⏱',
    tag:       'SPEED',
    desc:      'Maximum kills in 2 minutes. Score big before the clock hits zero.',
    color:     '#ffd27a',
    botCount:  7,
    noRespawn: false,
    timeLimit: 120,
    lives:     Infinity,
    waves:     false,
  },
  {
    id:        'wave_survival',
    name:      'WAVE SURVIVAL',
    icon:      '〰',
    tag:       'CHALLENGE',
    desc:      'Clear escalating bot waves. Each wave adds more bots with higher health. 3 lives.',
    color:     '#4fc3f7',
    botCount:  3,        // starting bot count; grows by +2 per wave
    noRespawn: true,
    timeLimit: 0,
    lives:     3,
    waves:     true,
  },
  {
    id:        'elimination',
    name:      'ELIMINATION',
    icon:      '◈',
    tag:       'HARDCORE',
    desc:      'Eliminate all 8 bots — no respawns for either side. One life. No mercy.',
    color:     '#ce93d8',
    botCount:  8,
    noRespawn: true,
    timeLimit: 0,
    lives:     1,
    waves:     false,
  },
];

export function getMode(id) {
  return GAME_MODES.find((m) => m.id === id) || GAME_MODES[0];
}
