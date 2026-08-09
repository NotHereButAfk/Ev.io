import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BOT_TACTICS,
  advanceBurst,
  botAimErrorMeters,
  combatTargetScore,
  chooseCombatSteering,
} from '../src/entities/BotCombat.js';
import { BotManager } from '../src/entities/BotManager.js';

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
const manager = new BotManager(null, null);
manager.bots = [nearBot, otherBot];
manager.update(0.1, player, null, (damage) => { player.health -= damage; }, null);
assert.equal(nearBot.observedTarget, otherBot, 'bot should engage the nearer opponent');
assert.equal(otherBot.health, 90, 'bot-vs-bot damage should reach the selected opponent');
assert.equal(player.health, 100, 'bots must not all focus the human player');
console.log('ok   bots select and damage nearby opponents instead of forming a 7v1');

const pressureBot = makeFakeBot(0);
pressureBot.id = 3;
pressureBot.shouldFire = true;
const pressureRival = makeFakeBot(8);
player.position.set(12, 0, 0);
player.health = 100;
const pressureManager = new BotManager(null, null);
pressureManager.bots = [pressureBot, pressureRival];
pressureManager.update(0.1, player, null, (damage) => { player.health -= damage; }, null);
assert.equal(pressureBot.observedTarget, pressureRival, 'unprovoked bot selected the neutral human');
assert.equal(player.health, 100, 'unprovoked bot damaged the neutral human');
pressureBot._provokedByPlayer = true;
pressureBot._targetEntity = null;
pressureBot._targetScanT = 0;
pressureManager.update(0.1, player, null, (damage) => { player.health -= damage; }, null);
assert.equal(pressureBot.observedTarget, player, 'provoked bot did not retaliate against the human');
assert.equal(player.health, 90, 'provoked bot could not damage the human');
console.log('ok   bots leave humans neutral until attacked, then retaliate');

console.log('\nall bot combat checks passed');
