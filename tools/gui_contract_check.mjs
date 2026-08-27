#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestPointerLockSafely } from '../src/core/InputManager.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8');
const index = read('index.html');
const login = read('login.html');
const register = read('register.html');
const privacy = read('privacy.html');
const terms = read('terms.html');
const menu = read('src/ui/MainMenu.js');
const hud = read('src/ui/HUD.js');
const game = read('src/core/Game.js');
const settings = read('src/core/GameSettings.js');
const inventory = read('src/ui/InventoryPanel.js');
const css = read('src/style.css');

const failures = [];
if (!index.includes('class="inv-profile-head"')) failures.push('inventory exposes the compact EV profile header');
if (!index.includes('class="inv-page-title inv-equipped-title"')) failures.push('inventory exposes one currently-equipped row');
if (!index.includes('class="inv-page-title inv-inventory-title"')) failures.push('inventory exposes the owned-item section');
if (!css.includes('flex: 0 0 110px')) failures.push('inventory preserves EV-style 110px item tiles');
if (!index.includes('>Equipped</h2>') || !index.includes('>Inventory</h2>')) failures.push('inventory uses EV heading copy and casing');
for (const label of ['Auto Rifle', 'Hand Cannon', 'Burst Rifle', 'Sweeper', 'Laser Rifle']) {
  if (!inventory.includes(`'${label}'`)) failures.push(`inventory category: ${label}`);
}
if (!inventory.includes("label: 'Sword'")) failures.push('inventory category: Sword');
if (!hud.includes("ammo.className = 'ws-ammo'")) failures.push('weapon HUD exposes per-slot ammo');
if (!hud.includes("slot.isMelee ? '∞'")) failures.push('weapon HUD exposes EV-style melee infinity');
if (!css.includes('flex: 0 0 84px !important')) failures.push('weapon HUD preserves EV 200x84 slot geometry');
if (!css.includes('border-right: 5px solid rgba(255,255,255,0)')) failures.push('weapon HUD preserves the EV active rail');
const requireMatch = (source, pattern, label) => {
  if (!pattern.test(source)) failures.push(label);
};

let rejectedPointerLockCaught = false;
const rejectedPointerLock = {
  requestPointerLock: () => ({
    catch(handler) {
      rejectedPointerLockCaught = true;
      handler(new Error('pointer lock rejected'));
    },
  }),
};
if (!requestPointerLockSafely(rejectedPointerLock) || !rejectedPointerLockCaught) {
  failures.push('pointer-lock promise rejection is contained');
}
if (requestPointerLockSafely({ requestPointerLock: () => { throw new Error('wrong document'); } })) {
  failures.push('pointer-lock synchronous DOMException is contained');
}

for (const label of ['PUBLIC GAME', 'PRIVATE', 'PROFILE', 'STORE', 'SOCIAL', 'CRYPTO', 'SETTINGS']) {
  requireMatch(index, new RegExp(`>${label}(?:\\s|&|<)`), `top navigation: ${label}`);
}
for (const panel of ['private', 'profile', 'shop', 'settings', 'feedback', 'more', 'rankings']) {
  requireMatch(index, new RegExp(`id=["']panel-${panel}["']`), `panel: ${panel}`);
}
requireMatch(menu, /querySelectorAll\(['"]\[data-panel\]['"]\)/, 'generic panel controls');
requireMatch(menu, /getElementById\(['"]panel-['"]\s*\+\s*id\)/, 'generic panel destination');
for (const side of ['login', 'rankings', 'feedback', 'more']) {
  requireMatch(index, new RegExp(`(?:>|data-panel=["'])${side}`, 'i'), `side navigation: ${side}`);
}

requireMatch(login, /href=["']\/register["']/, 'login to register navigation');
requireMatch(login, /id=["']login-btn["']/, 'login submit control');
requireMatch(login, /id=["']guest-btn["']/, 'login guest control');
requireMatch(login, /id=["']reset-err["']/, 'honest reset feedback');
requireMatch(register, /href=["']\/login["']/, 'register to login navigation');
requireMatch(register, /id=["']reg-btn["']/, 'register submit control');
requireMatch(register, /id=["']guest-btn["']/, 'register guest control');
for (const control of ['reg-email', 'reg-strength', 'reg-match', 'reg-privacy', 'reg-terms']) {
  requireMatch(register, new RegExp(`id=["']${control}["']`), `register parity control: ${control}`);
}
requireMatch(privacy, /Privacy policy/i, 'privacy page');
requireMatch(terms, /Terms of use/i, 'terms page');

requireMatch(index, /id=["']crosshair["']/, 'crosshair element');
requireMatch(index, /id=["']map-loading["'][^>]*class=["'][^"']*hidden/,
  'match loader stays hidden beneath the first-paint startup shell');
requireMatch(index, /id=["']connect-screen["'][\s\S]*?boot-connect-logo[\s\S]*?boot-connect-text/,
  'brief engine connection composition');
for (const loadingClass of ['ml-building', 'ml-panel', 'ml-name', 'ml-spinner']) {
  requireMatch(index, new RegExp(`class=["'][^"']*${loadingClass}`), `arena loading composition: ${loadingClass}`);
}
requireMatch(css, /\.ml-panel[^}]*width:\s*clamp\(320px,\s*29vw,\s*430px\)/s,
  'arena loading left information rail');
requireMatch(css, /@keyframes ml-spin/, 'arena loading activity indicator');
requireMatch(css, /\.ml-panel[^}]*padding:\s*37vh\s+29px\s+0/s, 'arena loading reference information position');
requireMatch(css, /\.ml-tip[^}]*bottom:\s*25px/s, 'arena loading tip position');
if (/adsbygoogle|data-ad-(?:client|slot)|boot-connect-ad|ml-ad|ad-slot/.test(index + css)) {
  failures.push('advertising placeholders remain disabled until production markup is supplied');
}
requireMatch(index, /id=["']nav-mobile-toggle["'][^>]*aria-expanded=["']false["']/,
  'mobile navigation toggle');
requireMatch(menu, /classList\.toggle\(['"]mobile-open['"]\)/, 'mobile navigation wiring');
if (/boot-map-panel|boot-map-brand|boot-map-progress|ml-brand/.test(index)) {
  failures.push('loading screen has no duplicate branding or synthetic boot meter');
}
requireMatch(index, /id=["']ml-progress-fill["']/, 'readiness-bound arena progress indicator');
requireMatch(game, /new World\(this\._initialMapId,\s*\{\s*autoLoad:\s*false\s*\}\)/,
  'cold map decode begins after the connection handoff paints');
requireMatch(game, /async _runConnectSequence\(\)[\s\S]*?findAvailableMatch[\s\S]*?_setStartupProgress\(['"]READY['"],\s*100[\s\S]*?_showMapLoading[\s\S]*?startInitialLoad\(\)[\s\S]*?_finishMapLoading[\s\S]*?_schedulePresentationPreloads/,
  'startup progress hands off from matchmaking to real arena loading before optional presentation downloads');
for (const id of ['boot-progress-fill', 'boot-detail', 'boot-percent', 'boot-retry']) {
  requireMatch(index, new RegExp(`id=["']${id}["']`), `startup loader control: ${id}`);
}
requireMatch(game, /_showStartupError[\s\S]*?boot-retry[\s\S]*?_runConnectSequence/,
  'startup loader exposes a recoverable retry path');
requireMatch(game, /_startPresentationPreloads\(onProgress[\s\S]*?preloadHumanSoldier[\s\S]*?preloadWeaponModels/,
  'soldier, animation, and weapon presentation assets share the deferred preload path');
requireMatch(menu, /querySelectorAll\(['"]\[data-panel\]['"]\)/, 'menu panel wiring');
requireMatch(index, /ability-page-key["']>Q<[\s\S]*?<strong>TELEPORT<\/strong>/,
  'abilities page advertises Q teleport');
requireMatch(index, /ability-page-key["']>G<[\s\S]*?<strong>FRAG GRENADE<\/strong>/,
  'abilities page advertises G frag');
requireMatch(index, /ability-page-key["']>F<[\s\S]*?<strong>SMOKE GRENADE<\/strong>/,
  'abilities page advertises F smoke');
if (/FLASH GRENADE|<span class="ability-page-key">E<\/span>|<strong>IMPULSE<\/strong>/.test(index)) {
  failures.push('abilities page has no stale unshipped bindings');
}
requireMatch(hud, /--xhair-size/, 'dynamic crosshair spread');
requireMatch(hud, /(?:classList\.toggle|toggleClass)\([^\n]*['"]ads['"]/, 'ADS crosshair state');
requireMatch(hud, /flashHitmarker[\s\S]*?if \(this\._adsActive \|\| !this\.hitmarker\) return/,
  'ADS suppresses the center-screen X hit marker');
requireMatch(css, /#hud #crosshair[^}]*--xhair-size/s, 'crosshair style contract');
requireMatch(css, /\.auth-page \.login-submit[^}]*align-self:\s*flex-start/s, 'EV-style compact auth action');
requireMatch(settings, /crosshairColor:\s*['"]white['"]/, 'neutral player-screen crosshair default');
requireMatch(index, /id=["']server-pop["']>\s*<span id=["']server-pop-count/, 'clean player population markup');
requireMatch(css, /EV\.IO FIRST-PERSON PLAYER SCREEN/, 'measured player-screen sizing layer');

if (failures.length) {
  console.error(`gui contract failed (${failures.length}): ${failures.join(', ')}`);
  process.exit(1);
}

console.log('gui contract passed: 7 top-level destinations, 7 panels, auth routes, and dynamic ADS crosshair');
