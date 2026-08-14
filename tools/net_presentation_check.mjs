#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { interpolateRemoteSample } from '../src/net/AuthClient.js';
import { chooseSafeSpawn } from '../server/authroom.mjs';

let passed = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL ${name}`);
  passed++;
  console.log(`ok   ${name}`);
};

const samples = [
  { t: 1000, x: 0, y: 0, z: 0, yaw: Math.PI - 0.1, vx: 10, vy: 0, vz: 0, health: 100 },
  { t: 1050, x: 0.5, y: 0, z: 0, yaw: -Math.PI + 0.1, vx: 10, vy: 0, vz: 0, health: 80 },
];
const middle = interpolateRemoteSample(samples, 1025);
ok('server-time samples interpolate smoothly between 20Hz ticks', Math.abs(middle.x - 0.25) < 1e-9);
ok('yaw takes the short path across the pi seam', Math.abs(Math.abs(middle.yaw) - Math.PI) < 0.02);
const extrapolated = interpolateRemoteSample(samples, 1300);
ok('remote extrapolation is capped at 75ms', Math.abs(extrapolated.x - 1.25) < 1e-9);

const safe = chooseSafeSpawn([[0, 0, 0], [12, 0, 0], [48, 0, 0]], [[1, 0, 0]], 0);
ok('spawn selection avoids occupied combat space', safe[0] === 48);

const bridge = readFileSync(new URL('../src/net/AuthNetBridge.js', import.meta.url), 'utf8');
ok('authoritative enemies render a health bar', /np-bar-fg/.test(bridge) && /healthFg\.style\.width/.test(bridge));
ok('authoritative bots are honestly labelled', /botBadge\.hidden = !r\.isBot/.test(bridge));

const avatar = readFileSync(new URL('../src/player/Avatar.js', import.meta.url), 'utf8');
ok('remote directional animation owns its scratch vector',
  /const _v = new THREE\.Vector3\(\)/.test(avatar) && /_v\.copy\(s\.position\)/.test(avatar));

const game = readFileSync(new URL('../src/core/Game.js', import.meta.url), 'utf8');
ok('authoritative join does not spawn a duplicate local roster', /if \(expectsAuth\)[\s\S]*?botManager\.clear\(\)[\s\S]*?serverSim\.stop\(\)/.test(game));

console.log(`net presentation passed (${passed} checks)`);
