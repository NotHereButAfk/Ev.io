#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const css = read('src/style.css');

const failures = [];
const requireMatch = (source, pattern, label) => {
  if (!pattern.test(source)) failures.push(label);
};

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
for (const bootId of ['boot-phase', 'boot-progress', 'boot-detail', 'boot-percent', 'map-loading']) {
  requireMatch(index, new RegExp(`id=["']${bootId}["']`), `loading flow: ${bootId}`);
}
for (const loadingClass of ['ml-building', 'ml-panel', 'ml-name', 'ml-spinner', 'ml-progress']) {
  requireMatch(index, new RegExp(`class=["'][^"']*${loadingClass}`), `arena loading composition: ${loadingClass}`);
}
requireMatch(css, /\.ml-panel[^}]*width:\s*clamp\(320px,\s*29vw,\s*430px\)/s,
  'arena loading left information rail');
requireMatch(css, /@keyframes ml-spin/, 'arena loading activity indicator');
requireMatch(game, /Promise\.allSettled\(\[Promise\.resolve\(this\.world\.ready\)/, 'loading waits for map');
requireMatch(game, /_bootHumanReady/, 'loading waits for soldier rig');
requireMatch(game, /_bootWeaponsReady/, 'loading waits for weapon models');
requireMatch(menu, /querySelectorAll\(['"]\[data-panel\]['"]\)/, 'menu panel wiring');
requireMatch(hud, /--xhair-size/, 'dynamic crosshair spread');
requireMatch(hud, /classList\.toggle\(['"]ads/, 'ADS crosshair state');
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
