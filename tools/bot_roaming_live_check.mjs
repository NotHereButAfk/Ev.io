import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const url = process.env.KYX_URL || 'http://127.0.0.1:5997/?qa=1';
const screenshot = process.env.KYX_BOT_ROAM_SHOT || 'artifacts/bot-roaming-live.png';
mkdirSync(dirname(screenshot), { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--no-sandbox',
    '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route(/fonts\.(?:googleapis|gstatic)\.com/, (route) => route.fulfill({
  status: 200, contentType: 'text/css', body: '',
}));

try {
  await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
  // map-loading starts hidden before startup has actually handed off to the
  // menu, so waiting on it alone races the loading overlay. Wait for the play
  // control itself to become visible, then use the same DOM click as the smoke
  // test (pointer lock is not part of this roaming observation).
  await page.locator('#play-btn').waitFor({ state: 'visible', timeout: 90000 });
  await page.evaluate(() => document.getElementById('play-btn')?.click());
  try {
    await page.waitForFunction(() => JSON.parse(document.getElementById('qa-runtime')?.textContent || '{}').state === 'playing', null,
      { timeout: 30000 });
  } catch (error) {
    const state = await page.evaluate(() => {
      const game = window.__game || window.game;
      return {
        state: game?.state,
        mapId: game?.world?.currentMapId,
        mapReady: !!game?.world?.currentMap,
        startupInFlight: game?._startupInFlight,
        joinInFlight: game?._joinInFlight,
        mapLoader: document.getElementById('map-loading')?.className,
      };
    });
    throw new Error(`${error.message}; runtime=${JSON.stringify(state)}`);
  }

  const entry = await page.evaluate(() => {
    const game = window.__game || window.game;
    const positions = game.botManager.bots.map((bot) =>
      `${bot.position.x.toFixed(2)},${bot.position.z.toFixed(2)}`);
    return {
      mapReady: !!game.world.currentMap,
      spawnCount: game.world.spawnPoints.length,
      uniqueBotSpawns: new Set(positions).size,
    };
  });
  if (!entry.mapReady || entry.spawnCount < 4 || entry.uniqueBotSpawns < 4) {
    throw new Error(`Play entered before authored spawn data was ready: ${JSON.stringify(entry)}`);
  }

  const samples = [];
  for (let sample = 0; sample < 20; sample++) {
    await page.waitForTimeout(750);
    samples.push(await page.evaluate(() => JSON.parse(
      document.getElementById('qa-runtime')?.textContent || '{}'
    ).bots || []));
  }

  const tracks = new Map();
  for (const frame of samples) {
    for (const bot of frame) {
      if (!tracks.has(bot.id)) tracks.set(bot.id, []);
      tracks.get(bot.id).push(bot);
    }
  }
  const metrics = [...tracks].map(([id, track]) => {
    let travel = 0;
    let airborneStarts = 0;
    let wasGrounded = true;
    let stuckFrames = 0;
    for (let index = 0; index < track.length; index++) {
      const bot = track[index];
      if (index) travel += Math.hypot(bot.x - track[index - 1].x, bot.z - track[index - 1].z);
      if (!bot.grounded && wasGrounded && bot.verticalSpeed > 0.25) airborneStarts++;
      wasGrounded = bot.grounded;
      if (bot.stuck > 0.38) stuckFrames++;
    }
    const start = track[0], end = track.at(-1);
    return {
      id,
      travel,
      displacement: Math.hypot(end.x - start.x, end.z - start.z),
      airborneStarts,
      stuckFrames,
      start: {
        x: start.x, z: start.z, speed: start.speed,
        roamX: start.roamX, roamZ: start.roamZ, alive: start.alive,
      },
      end: {
        x: end.x, z: end.z, speed: end.speed,
        roamX: end.roamX, roamZ: end.roamZ, alive: end.alive,
      },
    };
  });

  const runners = metrics.filter((metric) => metric.travel > 10);
  if (runners.length < 4) {
    throw new Error(`only ${runners.length} bots covered a running lane: ${JSON.stringify(metrics)}`);
  }
  if (metrics.some((metric) => metric.airborneStarts > 4 || metric.stuckFrames > 5)) {
    throw new Error(`bot repeated jumps/stuck behavior returned: ${JSON.stringify(metrics)}`);
  }

  await page.screenshot({ path: screenshot });
  console.log(`bot roaming live passed: ${runners.length}/${metrics.length} bots ran >10m in 15s; no repeated wall-jumping -> ${screenshot}`);
} finally {
  await browser.close();
}
