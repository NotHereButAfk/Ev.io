import { chromium } from 'playwright';

const URL = process.env.KYX_URL || 'http://127.0.0.1:5995/';
const CHROME = process.env.CHROME || undefined;
const VIEW = { width: 1280, height: 720 };
const HIDE = `(() => {
  ['top-nav','nav-side','share-game','social-icons','center-play']
    .forEach(id => document.getElementById(id)?.classList.add('hidden'));
  const g = window.__game || window.game;
  if (g) g._menuOpen = false;
  return !!g;
})()`;

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--no-sandbox',
    '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: VIEW });
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), url: msg.location().url || '' });
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText}`));

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const mark = (message) => console.log(`[smoke] ${message}`);
const game = (source) => page.evaluate(`(() => { const g = window.__game || window.game; ${source} })()`);
const key = async (code, ms = 180) => {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
  await page.evaluate(HIDE);
};

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  mark('page loaded');
  await page.waitForTimeout(6000);
  await page.evaluate(() => document.querySelector('#auth-guest-btn')?.click());
  await page.waitForTimeout(1800);
  await page.evaluate(() => document.querySelector('#play-btn')?.click());
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(2500);
    if (await page.evaluate(() => !document.getElementById('hud')?.classList.contains('hidden'))) break;
  }
  assert(await page.evaluate(() => !document.getElementById('hud')?.classList.contains('hidden')), 'HUD never appeared');
  mark('match entered');
  await page.evaluate(HIDE);

  const start = await game(`return { state:g.state, p:{x:g.player.position.x,y:g.player.position.y,z:g.player.position.z}, ammo:g.weaponSystem.currentState.magAmmo };`);
  assert(start.state === 'playing', `game state is ${start.state}`);
  // Use the map's known open central lane so collision geometry does not turn
  // this input smoke into a spawn-luck test.
  await game(`g.player.position.set(0, 0, 22); g.player.yaw = Math.PI; g.player.velocity.set(0, 0, 0); return true;`);
  await page.waitForTimeout(100);
  const laneStart = await game(`return {x:g.player.position.x,y:g.player.position.y,z:g.player.position.z};`);

  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  await page.keyboard.up('w');
  const walked = await game(`return {x:g.player.position.x,y:g.player.position.y,z:g.player.position.z};`);
  const walkDistance = Math.hypot(walked.x - laneStart.x, walked.z - laneStart.z);
  assert(walkDistance > 1.0, `W moved only ${walkDistance.toFixed(2)}m`);

  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  const sprinted = await game(`return {x:g.player.position.x,y:g.player.position.y,z:g.player.position.z};`);
  const sprintDistance = Math.hypot(sprinted.x - walked.x, sprinted.z - walked.z);
  assert(sprintDistance > walkDistance * 1.12, `sprint ${sprintDistance.toFixed(2)}m is not faster than walk ${walkDistance.toFixed(2)}m`);
  mark('movement');

  await key('Space', 60);
  await page.waitForTimeout(100);
  const jumpY = await game(`return g.player.position.y;`);
  assert(jumpY > sprinted.y + 0.08, `jump rose only ${(jumpY - sprinted.y).toFixed(2)}m`);

  // Stress chord: diagonal air movement while firing. This is deliberately
  // overlapping input, not a sequence of isolated happy-path actions.
  await page.keyboard.down('w');
  await page.keyboard.down('d');
  await page.keyboard.down('Space');
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(240);
  await page.mouse.up({ button: 'left' });
  await page.keyboard.up('Space');
  await page.keyboard.up('d');
  await page.keyboard.up('w');

  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(420);
  await page.mouse.up({ button: 'left' });
  const afterFire = await game(`return g.weaponSystem.currentState.magAmmo;`);
  assert(afterFire < start.ammo, `firing did not consume ammo (${start.ammo} -> ${afterFire})`);
  mark('fire');
  await key('r', 80);
  await page.waitForTimeout(250);
  assert(await game(`return g.weaponSystem.currentState.isReloading;`), 'reload did not start');

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', key: '2', bubbles: true }));
  });
  await page.waitForTimeout(260);
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit2', key: '2', bubbles: true }));
  });
  assert(await game(`return g.weaponSystem.currentDef.kind === 'melee';`), 'weapon swap to melee failed');
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1', bubbles: true }));
  });
  await page.waitForTimeout(260);
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit1', key: '1', bubbles: true }));
  });
  assert(await game(`return g.weaponSystem.currentDef.kind !== 'melee';`), 'weapon swap back to gun failed');
  mark('reload and swap');

  await key('q', 60);
  await page.waitForTimeout(100);
  assert(await game(`return g.player.teleportCooldown > 0;`), 'blink did not enter cooldown');
  mark('blink');

  const grenadesBefore = await game(`return {frags:g.grenadeSystem.frags,smokes:g.grenadeSystem.smokes};`);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG', key: 'g', bubbles: true })));
  await page.waitForTimeout(120);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyG', key: 'g', bubbles: true })));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', bubbles: true })));
  await page.waitForTimeout(120);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', key: 'f', bubbles: true })));
  const grenadesAfter = await game(`return {frags:g.grenadeSystem.frags,smokes:g.grenadeSystem.smokes};`);
  assert(grenadesAfter.frags === grenadesBefore.frags - 1 && grenadesAfter.smokes === grenadesBefore.smokes - 1,
    `grenade chord failed: ${JSON.stringify(grenadesBefore)} -> ${JSON.stringify(grenadesAfter)}`);
  mark('grenades');

  await page.keyboard.down('Tab');
  await page.waitForTimeout(180);
  assert(await page.evaluate(() => !document.getElementById('scoreboard-overlay')?.classList.contains('hidden')), 'scoreboard did not open');
  await page.keyboard.up('Tab');
  await page.waitForTimeout(100);
  assert(await page.evaluate(() => document.getElementById('scoreboard-overlay')?.classList.contains('hidden')), 'scoreboard did not close');
  mark('scoreboard');

  await game(`g._onPlayerDamaged(g.player.health + g.player.shield + 10); return true;`);
  await page.waitForTimeout(160);
  assert(await game(`return g.player.isDead;`), 'forced lethal damage did not kill player');
  assert(await page.evaluate(() => !document.getElementById('respawn-overlay')?.classList.contains('hidden')), 'respawn overlay did not appear');
  await page.waitForTimeout(3600);
  const afterRespawn = await game(`return {dead:g.player.isDead, state:g.state, menu:g._menuOpen, remaining:g._respawnRemaining, health:g.player.health};`);
  assert(!afterRespawn.dead, `player did not auto-respawn: ${JSON.stringify(afterRespawn)}`);
  assert(await page.evaluate(() => document.getElementById('respawn-overlay')?.classList.contains('hidden')), 'respawn overlay stayed visible');
  mark('death and respawn');

  const invalidState = await game(`return {
    position:[g.player.position.x,g.player.position.y,g.player.position.z],
    velocity:[g.player.velocity.x,g.player.velocity.y,g.player.velocity.z],
    ammo:g.weaponSystem.currentState.magAmmo,
    reserve:g.weaponSystem.currentState.reserveAmmo,
    health:g.player.health,
  };`);
  assert([...invalidState.position, ...invalidState.velocity, invalidState.ammo, invalidState.reserve, invalidState.health].every(Number.isFinite),
    `non-finite state: ${JSON.stringify(invalidState)}`);
  assert(invalidState.ammo >= 0 && invalidState.reserve >= 0, `negative ammo: ${JSON.stringify(invalidState)}`);

  // The game has a CSS-only Google Fonts enhancement; restricted/offline QA
  // environments intentionally block it and exercise the declared fallbacks.
  const ignoredConsole = consoleErrors.filter(({ text, url }) =>
    !/favicon|fonts\.googleapis\.com/i.test(`${text} ${url}`));
  assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  assert(ignoredConsole.length === 0, `console errors: ${ignoredConsole.map((entry) => `${entry.text} @ ${entry.url}`).join(' | ')}`);
  const relevantFailures = failedRequests.filter((entry) => !/fonts\.googleapis\.com/i.test(entry));
  assert(relevantFailures.length === 0, `failed requests: ${relevantFailures.join(' | ')}`);
  console.log(`gameplay smoke passed: walk=${walkDistance.toFixed(2)}m/0.9s sprint=${sprintDistance.toFixed(2)}m/0.9s, jump rose ${(jumpY - sprinted.y).toFixed(2)}m @100ms, ammo ${start.ammo}->${afterFire}; reload/swap/blink/scoreboard/death/respawn green; console=0 request failures=0`);
} finally {
  await browser.close();
}
