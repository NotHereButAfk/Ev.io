import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BOT_TACTICS,
  BOT_DIFFICULTIES,
  BOT_STATES,
  advanceBotMagazine,
  advanceBurst,
  botAimErrorMeters,
  botLoadoutForId,
  combatTargetScore,
  chooseCombatSteering,
  getBotDifficulty,
  isInsideBotFov,
  smoothBotAim,
} from '../src/entities/BotCombat.js';
import { BotManager } from '../src/entities/BotManager.js';
import { AuthRoom, TICK_HZ } from '../server/authroom.mjs';

assert.ok(BOT_DIFFICULTIES.easy.reactionMin > BOT_DIFFICULTIES.hard.reactionMin);
assert.ok(BOT_DIFFICULTIES.easy.aimErrorScale > BOT_DIFFICULTIES.hard.aimErrorScale);
assert.ok(BOT_DIFFICULTIES.easy.detectionDistance < BOT_DIFFICULTIES.hard.detectionDistance);
assert.ok(BOT_DIFFICULTIES.easy.movementSpeed < BOT_DIFFICULTIES.hard.movementSpeed);
assert.equal(getBotDifficulty('missing'), BOT_DIFFICULTIES.normal);
assert.equal(isInsideBotFov(0, 0, -10, 90), true);
assert.equal(isInsideBotFov(0, 0, 10, 90), false);
assert.ok(Math.abs(smoothBotAim(0, Math.PI, 4, 0.05)) < Math.PI,
  'aim smoothing must turn toward a target without snapping');
console.log('ok   difficulty presets change reaction, accuracy, movement decisions, detection and aim speed');

const cases = [
  {
    name: 'ranged closes from outside its orbit',
    input: { distance: BOT_TACTICS.rangedOrbitDistance + 4, hasLineOfSight: true },
    check: (s) => s.mode === 'close' && s.forward > 0 && s.strafe !== 0,
  },
  {
    name: 'ranged circles while it has a useful firing lane',
    input: { distance: 9, hasLineOfSight: true, strafeSign: -1 },
    check: (s) => s.mode === 'orbit' && Math.abs(s.forward) < 0.2
      && s.strafe < -0.6 && s.strafe > -0.8,
  },
  {
    name: 'ranged creates room when crowded',
    input: { distance: 3, hasLineOfSight: true },
    check: (s) => s.mode === 'retreat' && s.forward < 0 && s.strafe > 0,
  },
  {
    name: 'lost target is pursued rather than shot through cover',
    input: { distance: 8, hasLineOfSight: false },
    check: (s) => s.mode === 'pursue' && s.forward === 1,
  },
  {
    name: 'melee keeps closing instead of orbiting at rifle range',
    input: { distance: 8, hasLineOfSight: true, melee: true },
    check: (s) => s.mode === 'rush' && s.forward === 1,
  },
];

for (const c of cases) {
  const steering = chooseCombatSteering(c.input);
  assert.ok(c.check(steering), `${c.name}: ${JSON.stringify(steering)}`);
  console.log(`ok   ${c.name}`);
}

const randoms = [0, 0.5];
let ri = 0;
const continueBurst = advanceBurst(3, () => randoms[ri++ % randoms.length]);
assert.equal(continueBurst.shotsRemaining, 2);
assert.equal(continueBurst.burstPause, false);

const pauseBurst = advanceBurst(1, () => randoms[ri++ % randoms.length]);
assert.ok(pauseBurst.shotsRemaining >= 2 && pauseBurst.shotsRemaining <= 4);
assert.equal(pauseBurst.burstPause, true);
assert.ok(pauseBurst.delayScale > continueBurst.delayScale);
console.log('ok   ranged fire uses short bursts with a readable pause');

const lobbyLoadouts = Array.from({ length: 8 }, (_, i) => botLoadoutForId(i + 1));
assert.equal(lobbyLoadouts.filter(Boolean).length, 7, 'eight-slot lobby should contain one blade bot');
assert.deepEqual(lobbyLoadouts.slice(0, 5).map((w) => w?.id || 'sword'),
  ['m4', 'm16', 'rifle', 'lmg', 'sword']);
assert.ok(lobbyLoadouts.filter(Boolean).every((w) =>
  w.magSize > 0 && w.reloadTime > 0 && w.damage > 0 && w.range > 0));
console.log('ok   full lobby receives varied weapons with finite magazines and reloads');

const rifleRole = botLoadoutForId(1);
let magazine = { ammo: rifleRole.magSize, reloadRemaining: 0 };
for (let i = 0; i < rifleRole.magSize; i++) {
  magazine = advanceBotMagazine(magazine.ammo, magazine.reloadRemaining, 0, rifleRole, true);
}
assert.equal(magazine.ammo, 0);
assert.equal(magazine.reloadRemaining, rifleRole.reloadTime, 'empty bot magazine did not start reload');
magazine = advanceBotMagazine(magazine.ammo, magazine.reloadRemaining, rifleRole.reloadTime - 0.01, rifleRole);
assert.equal(magazine.ammo, 0, 'bot magazine refilled before reload completed');
magazine = advanceBotMagazine(magazine.ammo, magazine.reloadRemaining, 0.02, rifleRole);
assert.equal(magazine.ammo, rifleRole.magSize, 'bot magazine did not refill after reload');
assert.equal(magazine.reloadRemaining, 0);
console.log('ok   finite bot magazines block fire until weapon-specific reload completes');

assert.ok(botAimErrorMeters(20, 1.15) < 0.8, '20m bot scatter is still too inaccurate');
assert.ok(botAimErrorMeters(40, 1.15) < 1.25, '40m bot scatter is still too inaccurate');
assert.ok(botAimErrorMeters(20, 0.8) > 0.4, 'bots became perfect aim-locks');
console.log('ok   bot aim is lethal but retains real world-space scatter');

const player = {
  position: new THREE.Vector3(100, 0, 0),
  health: 100,
  isDead: false,
};
const makeFakeBot = (x) => ({
  position: new THREE.Vector3(x, 0, 0),
  alive: true,
  isDead: false,
  _targetScanT: 0,
  health: 100,
  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) this.alive = false;
    return !this.alive;
  },
  update(_dt, target, _camera, attack) {
    this.observedTarget = target;
    if (this.shouldFire) attack(10, this.position);
  },
});
const nearBot = makeFakeBot(0);
const otherBot = makeFakeBot(5);
nearBot.shouldFire = true;
nearBot._provoked = true;
nearBot._targetEntity = otherBot;
const manager = new BotManager(null, null);
manager.bots = [nearBot, otherBot];
manager.update(0.1, player, null, (damage) => { player.health -= damage; }, null);
assert.equal(nearBot.observedTarget, otherBot, 'bot should engage the nearer opponent');
assert.equal(otherBot.health, 90, 'bot-vs-bot damage should reach the selected opponent');
assert.equal(player.health, 100, 'bots must not all focus the human player');
console.log('ok   provoked bots retaliate against their attacker instead of forming a 7v1');

const pressureBot = makeFakeBot(0);
pressureBot.id = 3;
pressureBot.shouldFire = false;
const pressureRival = makeFakeBot(8);
player.position.set(12, 0, 0);
player.health = 100;
const pressureManager = new BotManager(null, null);
pressureManager.bots = [pressureBot, pressureRival];
pressureManager.update(0.1, player, null, (damage) => { player.health -= damage; }, null);
assert.equal(pressureBot.observedTarget, player, 'neutral bot should receive the harmless fallback observation target');
assert.equal(pressureRival.health, 100, 'unprovoked bot damaged another neutral bot');
assert.equal(player.health, 100, 'unprovoked bot damaged the neutral human');
pressureBot._provokedByPlayer = true;
pressureBot.shouldFire = true;
pressureBot._targetEntity = null;
pressureBot._targetScanT = 0;
pressureManager.update(0.1, player, null, (damage) => { player.health -= damage; }, null);
assert.equal(pressureBot.observedTarget, player, 'provoked bot did not retaliate against the human');
assert.equal(player.health, 90, 'provoked bot could not damage the human');
console.log('ok   bots leave humans neutral until attacked, then retaliate');

const aiArena = {
  id: 'bot-ai', name: 'Bot AI', region: 'test', half: 80, killY: -20,
  noBaseFloor: false, platforms: [], boxes: [], gravLifts: [], teleporters: [],
  spawns: [[0, 0, 0], [0, 0, -12], [8, 0, -10]],
  callouts: [{ x: -20, y: 0, z: -20 }, { x: 20, y: 0, z: 20 }],
};
const aiRoom = new AuthRoom(aiArena, { botDifficulty: 'easy' });
const humanId = aiRoom.add(() => {}, 'Human');
const botId = aiRoom.addBot('Responder');
const rivalId = aiRoom.add(() => {}, 'Rival');
const human = aiRoom.players.get(humanId);
const bot = aiRoom.players.get(botId);
const rival = aiRoom.players.get(rivalId);
Object.assign(human.state, { px: 0, py: 0, pz: -12 });
Object.assign(bot.state, { px: 0, py: 0, pz: 0 });
Object.assign(rival.state, { px: 8, py: 0, pz: -10 });
human.invulnerableUntil = bot.invulnerableUntil = rival.invulnerableUntil = 0;
for (let i = 0; i < TICK_HZ * 2; i++) aiRoom.update();
assert.equal(human.health, 100, 'authoritative bot attacked a neutral player');
assert.equal(bot._botState, BOT_STATES.ROAM);
aiRoom._damage(bot, human, 1, false);
assert.equal(bot._botTargetId, human.id, 'damage did not immediately select the attacker');
assert.equal(bot._botState, BOT_STATES.REACT);
assert.ok(bot._botReactionUntil > aiRoom.tick, 'difficulty reaction delay was skipped');
aiRoom._damage(bot, rival, 1, false);
assert.equal(bot._botTargetId, rival.id, 'a new attacker did not force a target switch');
aiRoom._resetBotAI(bot);
assert.equal(bot._botState, BOT_STATES.ROAM);
assert.equal(bot._botTargetId, null);
assert.equal(bot._botHostility.size, 0, 'respawn reset retained hostility');
console.log('ok   authoritative states enforce passive roam, reaction delay, attacker switching, and respawn reset');

const loadRoom = new AuthRoom(aiArena, { targetPopulation: 8, botDifficulty: 'normal' });
const loadStarted = performance.now();
for (let i = 0; i < 1200; i++) loadRoom.update();
const averageTickMs = (performance.now() - loadStarted) / 1200;
assert.ok(averageTickMs < 5,
  `eight-bot decisions exceeded the server budget (${averageTickMs.toFixed(2)}ms/tick)`);
assert.ok([...loadRoom.players.values()].every((entry) => entry.isBot && entry._botNextScanTick > loadRoom.tick - 20),
  'bot scans are not timer-throttled');
console.log(`ok   eight bots throttle scans/LOS/decisions (${averageTickMs.toFixed(3)}ms per 20Hz tick)`);

console.log('\nall bot combat checks passed');
