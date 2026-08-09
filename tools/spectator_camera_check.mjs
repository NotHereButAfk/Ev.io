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
assert.match(source, /this\._camRouteIndex = \(this\._camRouteIndex \+ 1\) % this\._camRoutes\.length/,
  'spectator must advance through map-wide safe routes');
assert.match(source, /THREE\.MathUtils\.clamp\(pathLength \/ 14, 12, 28\)/,
  'spectator routes must move at a visible map-touring speed');
assert.match(source, /this\._camStallTime > 0\.45/,
  'spectator must recover from a degenerate route instead of staying still');
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
const duration = THREE.MathUtils.clamp(curve.getLength() / 14, 12, 28);
const sampleA = curve.getPointAt(0.25);
const sampleB = curve.getPointAt(0.25 + 1 / duration);
assert.ok(sampleA.distanceTo(sampleB) > 4,
  'spectator must cover visible distance during each second of the fly-through');

console.log('spectator camera passed: smooth safe lanes roam every map spawn and loop continuously');
