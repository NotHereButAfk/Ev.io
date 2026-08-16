#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { AuthClient, interpolateRemoteSample } from '../src/net/AuthClient.js';
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

const smoothClient = new AuthClient('ws://invalid');
smoothClient.sim = { px: 10, py: 2, pz: -4 };
smoothClient._visualOffset = { x: 0.3, y: -0.1, z: 0.2 };
const beforeSmooth = smoothClient.localPos();
smoothClient.advancePresentation(1 / 60);
const afterSmooth = smoothClient.localPos();
ok('local camera correction decays continuously instead of snapping at 20Hz',
  afterSmooth.x < beforeSmooth.x && afterSmooth.x > smoothClient.sim.px);
const sixtyHz = smoothClient._visualOffset.x;
smoothClient._visualOffset.x = 0.3;
smoothClient.advancePresentation(1 / 120);
smoothClient.advancePresentation(1 / 120);
ok('local correction smoothing is frame-rate independent',
  Math.abs(smoothClient._visualOffset.x - sixtyHz) < 1e-9);

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
ok('authoritative map rotation loads immediately without a stale-map leaderboard',
  /while \(this\.world\.currentMapId !== this\._authoritativeMapTarget\)[\s\S]*?await this\._activateMap\(target\)/.test(game));

console.log(`net presentation passed (${passed} checks)`);
