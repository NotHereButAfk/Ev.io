import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bloomEnabled, lowerRuntimeQuality, postFxPixelRatio, rendererPixelRatio,
  shouldReduceRuntimeQuality,
} from '../src/core/RenderQuality.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assert = (ok, message) => { if (!ok) throw new Error(message); };

assert(rendererPixelRatio('medium', 3) === 1, 'medium renderer must stay at 1x');
assert(postFxPixelRatio('medium', 3) === 1, 'medium bloom must stay at 1x');
assert(rendererPixelRatio('high', 3) === 2, 'high renderer cap changed');
assert(postFxPixelRatio('high', 3) === 1.5, 'high bloom must cap at 1.5x');
assert(rendererPixelRatio('low', 3) === 0.6, 'low renderer scale changed');
assert(!bloomEnabled('low') && !bloomEnabled('medium') && bloomEnabled('high'),
  'bloom must stay a high-quality-only effect');
assert(lowerRuntimeQuality('high') === 'medium'
  && lowerRuntimeQuality('medium') === 'low'
  && lowerRuntimeQuality('low') === 'low', 'runtime quality fallback order changed');
assert(shouldReduceRuntimeQuality(3, 120, 40), 'sustained slow frames must reduce runtime quality');
assert(!shouldReduceRuntimeQuality(3, 180, 0), 'steady 60fps must preserve requested quality');

const bot = readFileSync(join(root, 'src/entities/Bot.js'), 'utf8');
const zombie = readFileSync(join(root, 'src/entities/Zombie.js'), 'utf8');
const game = readFileSync(join(root, 'src/core/Game.js'), 'utf8');
const plates = readFileSync(join(root, 'src/ui/Nameplates.js'), 'utf8');
const weapons = readFileSync(join(root, 'src/weapons/WeaponSystem.js'), 'utf8');
const authNet = readFileSync(join(root, 'src/net/AuthNetBridge.js'), 'utf8');
const hero = readFileSync(join(root, 'src/player/HeroBody.js'), 'utf8');
assert(!/quaternion\.clone\(\)\.invert\(\)/.test(bot), 'bot billboard allocates every frame');
assert(!/quaternion\.clone\(\)\.invert\(\)/.test(zombie), 'zombie billboard allocates every frame');
const menuUpdate = game.slice(game.indexOf('_updateMenuScene(dt)'), game.indexOf('_loop()'));
assert(!/new THREE\.Vector3/.test(menuUpdate), 'menu simulation allocates a vector every frame');
assert(/distanceToSquared/.test(plates), 'nameplates must reject by squared distance');
assert(/nextCheck: now \+ 100/.test(plates), 'nameplate occlusion raycasts must be throttled');
assert(!/\[this\.kickPos\.[xyz], this\.kickVel\.[xyz]\]\s*=/.test(weapons),
  'recoil spring allocates result arrays every frame');
assert(/this\._hudInfo \|\|=/.test(weapons), 'HUD payload must be reused');
assert(/this\._remoteSeen/.test(authNet) && /this\._remoteProject/.test(authNet),
  'remote-player sync must reuse frame scratch storage');
assert(!/frustumCulled = false/.test(hero),
  'connected player bodies must retain camera frustum culling');

console.log('client performance passed: medium gameplay bloom off, high post-FX 1.5x; player culling, allocation-free hot loops, and 10Hz nameplate LOS verified');
