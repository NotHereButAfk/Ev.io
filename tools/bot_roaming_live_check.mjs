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
  await page.waitForFunction(() => document.getElementById('map-loading')?.classList.contains('hidden'), null,
    { timeout: 90000 });
  await page.locator('#play-btn').click();
  await page.waitForFunction(() => JSON.parse(document.getElementById('qa-runtime')?.textContent || '{}').state === 'playing', null,
    { timeout: 30000 });

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
