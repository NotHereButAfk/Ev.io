import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox','--disable-setuid-sandbox','--use-gl=swiftshader',
         '--disable-dev-shm-usage','--ignore-gpu-blocklist'],
  headless: true,
});
const ctx  = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded' });

// Wait for either auth screen or top-nav to appear
await page.waitForTimeout(4500);
await page.screenshot({ path: '/tmp/shot_01_connect.png' });

// If auth screen is visible, click PLAY AS GUEST
const guest = page.locator('#auth-guest-btn');
if (await guest.isVisible().catch(() => false)) {
  await page.screenshot({ path: '/tmp/shot_02_auth.png' });
  console.log('auth screen — clicking guest');
  await guest.click();
  await page.waitForTimeout(1200);
}

// Now top-nav should be visible
await page.screenshot({ path: '/tmp/shot_03_menu.png' });
console.log('menu');

// Open LOADOUT panel
await page.locator('[data-panel="loadout"]').click();
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/shot_04_loadout.png' });
console.log('loadout');

// Click HEAVY
const heavy = page.locator('.armor-card[data-armor-id="heavy"]');
if (await heavy.count()) {
  await heavy.click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/shot_05_heavy.png' });
  console.log('heavy selected');
}

// Click STEALTH
const stealth = page.locator('.armor-card[data-armor-id="stealth"]');
if (await stealth.count()) {
  await stealth.click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/shot_06_stealth.png' });
  console.log('stealth selected');
}

// Close panel and start game
await page.locator('#play-btn').click().catch(async () => {
  await page.locator('#nav-public-btn').click();
});
await page.waitForTimeout(3500);
await page.screenshot({ path: '/tmp/shot_07_gameplay.png' });
console.log('gameplay');

if (errs.length) console.error('JS ERRORS:', errs.slice(0,5).join('\n'));
await browser.close();
