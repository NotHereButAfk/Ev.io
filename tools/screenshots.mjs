// Capture the screenshots used in README.md, straight from the real game.
//
//   npx vite --port 5994 --host 127.0.0.1 --strictPort &
//   node tools/screenshots.mjs
//
// Re-run this after any visual change rather than letting the README rot. The
// shots come from a live match driven headlessly, so they can't drift from
// what the game actually looks like.
//
// Two things make this work, both non-obvious:
//   · the play button needs a JS .click() — Playwright's actionability check
//     hangs on the canvas overlay
//   · headless never grants pointer lock, so the game's own onLockChange
//     handler re-opens the pause nav over the live match. HIDE() clears it,
//     and has to be re-applied after every interaction.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { TPS_DEFAULT_DISTANCE } from '../src/player/ThirdPersonCamera.js';

const URL = process.env.KYX_URL || 'http://127.0.0.1:5994/';
const OUT = 'docs/screenshots';
const VIEW = { width: 1280, height: 720 };

const HIDE = `(() => {
  ['top-nav','nav-side','share-game','social-icons','center-play']
    .forEach(id => document.getElementById(id)?.classList.add('hidden'));
  const g = window.__game || window.game;
  if (g) g._menuOpen = false;
  return !!g;
})()`;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--no-sandbox',
         '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: VIEW });
page.on('pageerror', (e) => console.warn('  page error:', e.message));

const shot = async (name) => {
  await page.evaluate(HIDE);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('  ✓', name);
};
const pose = (js) => page.evaluate(`(() => { const g = window.__game || window.game; ${js} })()`);

console.log('loading', URL);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/menu.png` });        // chrome intentionally left in
console.log('  ✓ menu');

await page.evaluate(`document.querySelector('#auth-guest-btn')?.click()`);
await page.waitForTimeout(2000);
await page.evaluate(`document.querySelector('#play-btn')?.click()`);

// GLBs take a while; wait for the HUD rather than guessing
let inGame = false;
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(4000);
  inGame = await page.evaluate(`!document.getElementById('hud')?.classList.contains('hidden')`);
  if (inGame) break;
}
if (!inGame) { console.error('match never started'); await browser.close(); process.exit(1); }
console.log('  in match');

await pose(`g.weaponSystem.setLoadout('m4', 'sword'); g.player.position.set(0, 0, 22); g.player.yaw = Math.PI; g.player.pitch = -0.04;`);
await page.waitForTimeout(1200);
await shot('first-person');

// Document the actual first third-person zoom notch. A stale 3.4m override made
// the player look much smaller here than during normal gameplay.
await pose(`g.player._camDist = ${TPS_DEFAULT_DISTANCE};`);
await page.waitForTimeout(1200);
await shot('third-person');

// Stand in front of a living bot and confirm it's actually on screen before
// calling the shot "combat" — bots wander, so the naive placement often framed
// an empty concourse.
const framed = await page.evaluate(`(() => {
  const g = window.__game || window.game;
  g.player._camDist = 0;
  const THREE = g.world.scene.constructor;
  for (const b of g.botManager.bots.filter(x => x.alive)) {
    g.player.position.set(b.position.x, 0, b.position.z + 8);
    // yaw is a CAMERA yaw: the view direction is -(sin yaw, cos yaw), so to
    // look AT something the deltas go in negated.
    g.player.yaw = Math.atan2(-(b.position.x - g.player.position.x),
                              -(b.position.z - g.player.position.z));
    g.player.pitch = 0;
    g.player.camera.position.set(g.player.position.x, 1.7, g.player.position.z);
    g.player.camera.rotation.order = 'YXZ';
    g.player.camera.rotation.set(0, g.player.yaw, 0);
    g.player.camera.updateMatrixWorld(true);
    const v = b.mesh.position.clone(); v.y += 1.2;
    v.project(g.player.camera);
    if (Math.abs(v.x) < 0.6 && Math.abs(v.y) < 0.6 && v.z < 1) return b.displayName;
  }
  return null;
})()`);
console.log('  combat framing:', framed || 'NO BOT IN FRAME');
await page.waitForTimeout(1200);
await shot('combat');

await browser.close();
console.log('done →', OUT);
