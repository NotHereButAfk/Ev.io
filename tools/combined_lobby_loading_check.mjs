import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeAuthServer } from '../server/authserver.mjs';

const server = makeAuthServer({ targetPopulation: 0 });
await new Promise((resolve) => server.http.listen(0, '127.0.0.1', resolve));
const port = server.http.address().port;
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.route(/fonts\.(?:googleapis|gstatic)\.com/, (route) => route.fulfill({
    status: 200, contentType: 'text/css', body: '',
  }));
  let downloads = 0;
  let sockets = 0;
  page.on('request', (request) => { if (request.url().endsWith('.evmap')) downloads++; });
  page.on('websocket', (socket) => { if (socket.url().includes(`:${port}`)) sockets++; });
  await page.goto(`${process.env.KYX_URL || 'http://127.0.0.1:5997/'}?authnet=ws://127.0.0.1:${port}`);
  await page.waitForFunction(() => window.__game?._hasPreparedLobby()
    && document.getElementById('boot-status').textContent === 'READY', null,
  { timeout: 60000, polling: 100 });
  assert.equal(downloads, 1, 'initial preparation downloads only the lobby map');
  assert.equal(sockets, 1, 'initial preparation joins one lobby');
  const result = await page.evaluate(async () => {
    const game = window.__game;
    const client = game._authNet.client;
    const id = client.you;
    let loadingCalls = 0;
    const show = game._showServerJoining.bind(game);
    game._showServerJoining = (...args) => { loadingCalls++; return show(...args); };
    await game.menu.onPlay('Guest', game.selectedSkin.id, 'deathmatch', game.selectedArmorType);
    return { loadingCalls, sameClient: client === game._authNet.client,
      sameId: id === game._authNet.client.you, state: game.state,
      hidden: document.getElementById('map-loading').classList.contains('hidden') };
  });
  assert.deepEqual(result, { loadingCalls: 0, sameClient: true, sameId: true, state: 'playing', hidden: true });
  assert.equal(downloads, 1, 'Play does not download another map');
  assert.equal(sockets, 1, 'Play does not reconnect');

  // A disconnected prepared lobby cannot be reused as if it were still ready.
  await page.evaluate(() => window.__game._authNet.client.disconnect());
  await page.waitForFunction(() => !window.__game._hasPreparedLobby(), null, { polling: 50 });
  await page.evaluate(async () => {
    window.__game._quitToMenu();
    await window.__game._startupReadyPromise;
  });
  assert.equal(await page.evaluate(() => window.__game._hasPreparedLobby()), true,
    'returning to the menu prepares the next lobby before exposing Play');
  assert.equal(downloads, 1, 'returning to the same map reuses its geometry');
  assert.equal(sockets, 2, 'returning after disconnect establishes one replacement lobby');
  console.log('combined lobby loading passed: one map download, one socket, Play reuses prepared lobby; stale connection rejected and menu return prepares replacement');
} finally {
  await browser.close();
  await server.close();
}
