import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { MAIN_WEAPON_IDS } from '../src/weapons/weaponDefs.js';

const URL = process.env.KYX_URL || 'http://127.0.0.1:5995/?qa=1';
const OUT = path.resolve(process.env.ADS_OUT || path.join(os.tmpdir(), 'kyx-ads'));

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--no-sandbox',
    '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

try {
  await page.goto(URL, { waitUntil: 'commit', timeout: 30000 });
  await page.waitForSelector('#play-btn', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => document.querySelector('#play-btn')?.click());
  await page.waitForFunction(() => {
    const g = window.__game || window.game;
    return g && !document.getElementById('hud')?.classList.contains('hidden');
  }, null, { timeout: 30000 });
  await page.waitForTimeout(8000);

  for (const weaponId of MAIN_WEAPON_IDS) {
    await page.evaluate((id) => {
      const g = window.__game || window.game;
      g.weaponSystem.setLoadout(id, 'sword');
      g.weaponSystem.switchTo(0);
      g.input.rightMouseDown = true;
      g._menuOpen = false;
      g.menu?.hidePause?.();
      ['top-nav', 'nav-side', 'share-game', 'social-icons', 'center-play']
        .forEach((nodeId) => document.getElementById(nodeId)?.classList.add('hidden'));
    }, weaponId);
    await page.waitForFunction(() => (window.__game || window.game)?.weaponSystem?.scopeT > 0.98,
      null, { timeout: 8000 });
    await page.waitForTimeout(160);
    await page.screenshot({ path: path.join(OUT, `${weaponId}.png`) });
    const state = await page.evaluate(() => {
      const ws = (window.__game || window.game).weaponSystem;
      return {
        fov: ws.camera.fov,
        mount: ws.weaponMount.position.toArray(),
        scale: ws.weaponMount.scale.x,
      };
    });
    console.log(`${weaponId}: ${JSON.stringify(state)}`);
    await page.evaluate(() => { (window.__game || window.game).input.rightMouseDown = false; });
    await page.waitForFunction(() => (window.__game || window.game)?.weaponSystem?.scopeT < 0.08,
      null, { timeout: 8000 });
  }
} finally {
  await browser.close();
}

console.log(`ADS captures written to ${OUT}`);
