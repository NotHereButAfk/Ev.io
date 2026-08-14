import { chromium } from 'playwright';

const URL = process.env.KYX_URL || 'http://127.0.0.1:5995/';
const CHROME = process.env.CHROME || undefined;
const VIEW = { width: 1280, height: 720 };
const HIDE = `(() => {
  ['top-nav','nav-side','share-game','social-icons','center-play']
    .forEach(id => document.getElementById(id)?.classList.add('hidden'));
  const g = window.__game || window.game;
  if (g) {
    g._menuOpen = false;
    g.menu?.hidePause?.();
  }
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
const inputKey = async (code, keyValue, settleMs = 650) => {
  await page.evaluate(HIDE);
  await page.evaluate(({ code, keyValue }) => {
    const g = window.__game || window.game;
    g.input._onKeyDown({ code, key: keyValue, preventDefault() {} });
  }, { code, keyValue });
  await page.waitForTimeout(settleMs);
  await page.evaluate(({ code, keyValue }) => {
    const g = window.__game || window.game;
    g.input._onKeyUp({ code, key: keyValue });
  }, { code, keyValue });
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

  await game(`g.input._onKeyDown({code:'KeyW',key:'w',preventDefault(){}}); return true;`);
  await page.waitForTimeout(900);
  await game(`g.input._onKeyUp({code:'KeyW',key:'w'}); return true;`);
  const walked = await game(`return {x:g.player.position.x,y:g.player.position.y,z:g.player.position.z};`);
  const walkDistance = Math.hypot(walked.x - laneStart.x, walked.z - laneStart.z);
  assert(walkDistance > 1.0, `W moved only ${walkDistance.toFixed(2)}m`);

  // Restart from the same lane and zero velocity so acceleration retained from
  // the walk trial cannot bias either side of this comparison.
  await game(`g.player.position.set(0,0,22); g.player.velocity.set(0,0,0); return true;`);
  await page.waitForTimeout(150);
  const sprintStart = await game(`return {x:g.player.position.x,y:g.player.position.y,z:g.player.position.z};`);
  await game(`
    g.input._onKeyDown({code:'ShiftLeft',key:'Shift',preventDefault(){}});
    g.input._onKeyDown({code:'KeyW',key:'w',preventDefault(){}});
    return true;
  `);
  await page.waitForTimeout(900);
  await game(`
    g.input._onKeyUp({code:'KeyW',key:'w'});
    g.input._onKeyUp({code:'ShiftLeft',key:'Shift'});
    return true;
  `);
  const sprinted = await game(`return {x:g.player.position.x,y:g.player.position.y,z:g.player.position.z};`);
  const sprintDistance = Math.hypot(sprinted.x - sprintStart.x, sprinted.z - sprintStart.z);
  assert(sprintDistance > walkDistance * 1.12, `sprint ${sprintDistance.toFixed(2)}m is not faster than walk ${walkDistance.toFixed(2)}m`);
  mark('movement');

  await game(`g.player.position.set(0,0,22); g.player.velocity.set(0,0,0); return true;`);
  await page.waitForTimeout(200);
  const jumpBaseY = await game(`return g.player.position.y;`);
  await game(`g.input._onKeyDown({code:'Space',key:' ',preventDefault(){}}); return true;`);
  await page.waitForTimeout(80);
  await game(`g.input._onKeyUp({code:'Space',key:' '}); return true;`);
  let jumpY = jumpBaseY;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(50);
    jumpY = Math.max(jumpY, await game(`return g.player.position.y;`));
  }
  assert(jumpY > jumpBaseY + 0.08, `jump rose only ${(jumpY - jumpBaseY).toFixed(2)}m`);

  // First-person stress: a large single-frame look delta must remain finite,
  // and ADS must hide/restore the weapon smoothly around its zoom blend.
  const lookBefore = await game(`return {yaw:g.player.yaw,pitch:g.player.pitch};`);
  await page.evaluate(HIDE);
  await game(`g.input.pointerLocked=true; g.input._onMouseMove({movementX:220,movementY:-160}); return true;`);
  await page.waitForTimeout(650);
  const lookAfter = await game(`return {yaw:g.player.yaw,pitch:g.player.pitch};`);
  assert(Number.isFinite(lookAfter.yaw) && Number.isFinite(lookAfter.pitch)
    && (Math.abs(lookAfter.yaw - lookBefore.yaw) > 0.05 || Math.abs(lookAfter.pitch - lookBefore.pitch) > 0.05),
  `rapid mouse look was lost or invalid: ${JSON.stringify({lookBefore,lookAfter})}`);
  await game(`g.input.rightMouseDown=true; return true;`);
  await page.waitForTimeout(650);
  assert(await game(`return g.weaponSystem.scopeT > 0.2 && !g.weaponSystem.kickGroup.visible;`), 'ADS did not zoom and hide the hip-fire viewmodel');
  await game(`g.input.rightMouseDown=false; return true;`);
  await page.waitForFunction(() => {
    const g = window.__game || window.game;
    return g?.weaponSystem?.scopeT < 0.15 && g.weaponSystem.kickGroup?.visible;
  }, null, { timeout: 6000 });
  assert(await game(`return g.weaponSystem.scopeT < 0.15 && g.weaponSystem.kickGroup.visible;`), 'ADS release did not restore the viewmodel');
  mark('rapid look and ADS');

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

  await inputKey('Digit2', '2');
  assert(await game(`return g.weaponSystem.currentDef.kind === 'melee';`), 'weapon swap to melee failed');
  await inputKey('Digit1', '1');
  assert(await game(`return g.weaponSystem.currentDef.kind !== 'melee';`), 'weapon swap back to gun failed');
  mark('reload and swap');

  await key('q', 60);
  await page.waitForTimeout(100);
  assert(await game(`return g.player.teleportCooldown > 0;`), 'blink did not enter cooldown');
  mark('blink');

  const grenadesBefore = await game(`return {frags:g.grenadeSystem.frags,smokes:g.grenadeSystem.smokes};`);
  await inputKey('KeyG', 'g', 160);
  await inputKey('KeyF', 'f', 160);
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

  // Exercise the authoritative presentation callback independently of server
  // availability. It must use the respawn overlay without opening the pause
  // navigation or releasing control behind an unrelated full-screen menu.
  await game(`g._onAuthoritativeDeath({deaths:g.deaths}); return true;`);
  assert(!await game(`return g._menuOpen;`), 'authoritative death opened the full navigation menu');
  assert(await page.evaluate(() => !document.getElementById('respawn-overlay')?.classList.contains('hidden')), 'authoritative death overlay did not appear');
  await game(`g._onAuthoritativeRespawn({deaths:g.deaths}); return true;`);
  assert(await page.evaluate(() => document.getElementById('respawn-overlay')?.classList.contains('hidden')), 'authoritative respawn overlay did not clear');
  mark('authoritative death presentation');

  // Kill the player during an active reload. Respawn must not resurrect a
  // frozen magazine animation or carry partial ammunition into the new life.
  await inputKey('KeyR', 'r', 160);
  assert(await game(`return g.weaponSystem.currentState.isReloading;`), 'pre-death reload did not start');
  await game(`g._onPlayerDamaged(g.player.health + g.player.shield + 10); return true;`);
  await page.waitForTimeout(160);
  assert(await game(`return g.player.isDead;`), 'forced lethal damage did not kill player');
  assert(await page.evaluate(() => !document.getElementById('respawn-overlay')?.classList.contains('hidden')), 'respawn overlay did not appear');
  await page.waitForTimeout(3600);
  // A software-rendered browser may sample the final pre-deadline frame a few
  // milliseconds early; wait for the next animation frame that applies the
  // already-expired monotonic respawn deadline.
  await page.waitForFunction(() => !(window.__game || window.game)?.player?.isDead, null, { timeout: 2500 });
  const afterRespawn = await game(`return {dead:g.player.isDead, state:g.state, menu:g._menuOpen, remaining:g._respawnRemaining, health:g.player.health};`);
  assert(!afterRespawn.dead, `player did not auto-respawn: ${JSON.stringify(afterRespawn)}`);
  assert(await page.evaluate(() => document.getElementById('respawn-overlay')?.classList.contains('hidden')), 'respawn overlay stayed visible');
  assert(!await game(`return g.weaponSystem.currentState.isReloading;`), 'reload animation survived respawn');
  assert(await game(`return g.weaponSystem.currentState.magAmmo === g.weaponSystem.currentDef.magSize;`), 'respawn did not refill the equipped weapon');
  assert(await game(`return g.player.teleportCooldown === 0;`), 'blink cooldown survived respawn');
  assert(await game(`return g.grenadeSystem.frags === 2 && g.grenadeSystem.smokes === 2;`), 'grenade inventory did not refill on respawn');
  mark('death and respawn');

  // Map-boundary abuse: the legacy controller kills at the kill plane while
  // the opt-in deterministic MoveSim reports a recovery; either path must end
  // at a finite safe location rather than falling forever.
  await game(`g.player.position.set(5000, (g.world.killY ?? -25) - 5, 5000); g.player.velocity.set(0,-1,0); return true;`);
  await page.waitForTimeout(900);
  const boundary = await game(`return {dead:g.player.isDead,p:[g.player.position.x,g.player.position.y,g.player.position.z],killY:g.world.killY};`);
  if (boundary.dead) {
    await page.waitForTimeout(3600);
    assert(!await game(`return g.player.isDead;`), 'kill-plane death did not respawn');
  } else {
    assert(boundary.p.every(Number.isFinite) && boundary.p[1] > boundary.killY,
      `kill-plane recovery failed: ${JSON.stringify(boundary)}`);
  }
  mark('kill plane');

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
  console.log(`gameplay smoke passed: walk=${walkDistance.toFixed(2)}m/0.9s sprint=${sprintDistance.toFixed(2)}m/0.9s, jump peak +${(jumpY - jumpBaseY).toFixed(2)}m, ammo ${start.ammo}->${afterFire}; look/ADS/reload/swap/blink/scoreboard/death/respawn green; console=0 request failures=0`);
} finally {
  await browser.close();
}
