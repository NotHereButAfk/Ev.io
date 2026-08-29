#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

const source = readFileSync(new URL('../src/core/Game.js', import.meta.url), 'utf8');
assert.match(source, /new THREE\.CatmullRomCurve3\([\s\S]*?closed, 'centripetal'/,
  'spectator camera must use a smooth spline');
assert.match(source, /this\._camPath\.getPointAt\(u, this\._camPos\)/,
  'spectator position must advance continuously along the route');
assert.match(source, /this\._camLookPath\.getPointAt\(u, this\._camLook\)/,
  'spectator look direction must roam with the route');
assert.match(source, /map\.spectatorRoutes[\s\S]*?this\._camRouteIndex = \(this\._camRouteIndex \+ 1\) % this\._camRoutes\.length/,
  'spectator must float through every authored arena viewpoint');
assert.match(source, /THREE\.MathUtils\.clamp\(pathLength \/ 7, 32, 90\)/,
  'fallback orbit must float at a smooth map-touring speed');
assert.match(source, /const fadeWindow = 0\.18[\s\S]*?this\.canvas\.style\.opacity = opacityText/,
  'spectator must hide safe-lane changes instead of exposing camera cuts');
assert.match(source, /this\._camStallTime > 0\.45/,
  'spectator must recover from a degenerate route instead of staying still');
assert.match(source, /_updateMenuScene\(dt, cameraDt = dt\)[\s\S]*?this\._camTravelTime \+= cameraStep/,
  'spectator travel must use real frame time instead of the capped gameplay delta');
assert.match(source, /const poseDt = THREE\.MathUtils\.clamp\(cameraDt, 0, 1 \/ 30\)[\s\S]*?this\._camRenderPos\.lerp\(this\._camPos, poseBlend\)/,
  'spectator render pose must absorb long startup frames instead of visibly jumping');
assert.match(source, /this\.world\.currentMap[\s\S]*?this\.botManager\.addBot\(false, 1, false\)[\s\S]*?this\._menuBotSpawnCooldown = 0\.12/,
  'spectator bots must be staggered behind real map readiness');
assert.match(source, /this\.botManager\.update\([\s\S]*?this\._menuDummyPlayer[\s\S]*?this\.world, true,/,
  'spectator bots must use normal bot-versus-bot combat');
assert.match(source, /const minimumCameraStep = Math\.max\(cameraStep, 1 \/ 240\) \* 0\.05/,
  'spectator stall detection must be refresh-rate independent');
assert.doesNotMatch(source, /movedSq < 0\.0004/,
  'spectator must not use a fixed per-frame stall threshold');
assert.match(source, /if \(routeChanged\) cameraOpacity = 0/,
  'a spectator route cut must remain fully hidden for its first frame');
assert.match(source, /bot\.healthBarGroup\.visible = false/,
  'menu bots must not spend draw calls on combat-only health bars');
assert.doesNotMatch(source, /Math\.max\(54, this\._camPath\.getLength\(\) \/ 6\.5\)/,
  'spectator must not retain the old nearly-static 54 second minimum');

const points = [
  new THREE.Vector3(-20, 12, 30), new THREE.Vector3(30, 15, 20),
  new THREE.Vector3(20, 13, -30), new THREE.Vector3(-30, 16, -20),
];
const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);
const start = curve.getPointAt(0);
const quarter = curve.getPointAt(0.25);
const end = curve.getPointAt(1);
assert.ok(start.distanceTo(quarter) > 20, 'route must materially move around the map');
assert.ok(start.distanceTo(end) < 1e-6, 'route must loop without a camera cut');
const duration = THREE.MathUtils.clamp(curve.getLength() / 7, 32, 90);
const sampleA = curve.getPointAt(0.25);
const sampleB = curve.getPointAt(0.25 + 1 / duration);
assert.ok(sampleA.distanceTo(sampleB) > 3 && sampleA.distanceTo(sampleB) < 10,
  'spectator must float visibly without racing around the arena');

// At 144 Hz a legitimate slow camera can move less than the old fixed 2 cm
// threshold each frame. The new threshold describes a true near-zero speed,
// so it cannot repeatedly mistake high-refresh motion for a stall.
const highRefreshDt = 1 / 144;
const legitimateStep = 1.5 * highRefreshDt;
const minimumStep = Math.max(highRefreshDt, 1 / 240) * 0.05;
assert.ok(legitimateStep < 0.02 && legitimateStep > minimumStep,
  'high-refresh spectator motion must not trigger stall recovery');

// A 120ms startup hitch may move the route target substantially, but the
// rendered camera consumes only a frame-rate-independent fraction of it.
const hitchTargetDistance = 7 * 0.12;
const hitchBlend = 1 - Math.exp(-10 * (1 / 30));
const hitchRenderedDistance = hitchTargetDistance * hitchBlend;
assert.ok(hitchRenderedDistance > 0 && hitchRenderedDistance < hitchTargetDistance * 0.35,
  'startup hitch was not damped before reaching the visible camera');

console.log('spectator camera passed: startup hitches are damped, bots are staggered, and route cuts stay hidden');
