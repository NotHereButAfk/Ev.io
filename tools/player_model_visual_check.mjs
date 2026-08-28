import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, extname } from 'node:path';

const url = process.env.KYX_URL || 'http://127.0.0.1:5995/';
const output = process.env.KYX_PLAYER_MODEL_SHOT || 'artifacts/player-model.png';
const extension = extname(output) || '.png';
const stem = output.slice(0, output.length - extension.length);
mkdirSync(dirname(output), { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--no-sandbox',
    '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
await page.route(/fonts\.(?:googleapis|gstatic)\.com/, (route) => route.abort());

try {
  await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
  await page.waitForSelector('#play-btn', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    document.querySelector('[data-panel="loadout"]')?.click();
  });
  await page.waitForFunction(() => {
    const game = window.__game || window.game;
    return !!game?.menu?._armorPreview?._group;
  }, null, { timeout: 30000 });

  await page.evaluate(() => {
    const game = window.__game || window.game;
    const preview = game.menu._armorPreview;
    preview.stop();
    preview._renderer.setPixelRatio(1);
    preview._renderer.setSize(600, 600, false);
    preview._canvas.width = 600;
    preview._canvas.height = 600;
    preview._canvas.style.cssText = 'position:fixed;inset:20px;width:600px;height:600px;z-index:999999';
    preview._camera.aspect = 1;
    // The production preview camera is framed for a 220px panel. Pull it back
    // slightly for the QA plate so crown and soles remain visible in every view.
    preview._camera.position.set(0, 1.15, 5.25);
    preview._camera.lookAt(0, 1.15, 0);
    preview._camera.updateProjectionMatrix();
    document.body.style.background = '#0a0e16';
    for (const child of document.body.children) child.style.visibility = 'hidden';
    preview._canvas.style.visibility = 'visible';
  });

  for (const [name, yaw] of [['front', 0], ['quarter', Math.PI / 4], ['side', Math.PI / 2]]) {
    await page.evaluate((rotation) => {
      const game = window.__game || window.game;
      const preview = game.menu._armorPreview;
      preview._group.rotation.y = preview._baseYaw + rotation;
      preview._scene.updateMatrixWorld(true);
      preview._renderer.render(preview._scene, preview._camera);
    }, yaw);
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${stem}-${name}${extension}` });
  }
  console.log(`player model visual passed -> ${stem}-{front,quarter,side}${extension}`);
} finally {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}
