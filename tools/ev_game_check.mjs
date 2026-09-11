import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(?:googleapis|gstatic)\.com/, (route) => route.abort());
  await page.goto(process.env.KYX_URL || 'http://127.0.0.1:5994/');
  await page.waitForFunction(() => window.__game?.previewCharacter?.userData?.isEvCharacter, null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector('#play-btn').click());
  await page.waitForFunction(() => window.__game?.state === 'playing', null, { timeout: 60000 });
  const result = await page.evaluate(async () => {
    const game = window.__game;
    const { Avatar } = await import('/src/player/Avatar.js');
    const peer = new Avatar(game.world.scene);
    for (let i = 0; i < 60; i++) peer.update(1 / 60, { position: game.player.position.clone(), yaw: 0, speed: 1.2, grounded: true, crouch: true, firing: true });
    const result = {
      local: !!game._playerBody.userData.isEvCharacter,
      menu: !!game.previewCharacter.userData.isEvCharacter,
      bots: game.botManager.bots.map((bot) => !!bot.mesh.userData.isEvCharacter),
      remote: !!peer.group.userData.isEvCharacter,
      remoteAction: peer.group.userData.activeAnimation,
      rifle: game.weaponSystem._models?.get?.('m4')?.group?.userData?.modelSource,
    };
    peer.dispose();
    return result;
  });
  assert(result.local && result.menu && result.remote, JSON.stringify(result));
  assert(result.bots.length > 0 && result.bots.every(Boolean), 'all local bots must use the new default');
  assert.match(result.remoteAction, /Crouch Walk and Shoot/);
  assert.deepEqual(errors, []);
  console.log('EV game integration passed:', JSON.stringify(result));
} finally { await browser.close(); }
