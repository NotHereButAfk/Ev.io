import { chromium } from 'playwright';

const url = process.env.KYX_URL || 'http://127.0.0.1:5997/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--no-sandbox',
    '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
});

try {
  const clean = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await clean.route(/fonts\.(?:googleapis|gstatic)\.com/, (route) => route.abort());
  await clean.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await clean.waitForTimeout(1000);
  if (!await clean.locator('#sponsor-block-warning').evaluate((node) => node.classList.contains('hidden'))) {
    throw new Error('warning appeared without a blocked sponsor probe');
  }
  await clean.close();

  const blocked = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await blocked.route(/fonts\.(?:googleapis|gstatic)\.com/, (route) => route.abort());
  await blocked.addInitScript(() => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        if (this.classList?.contains('adsbox')) return 0;
        return original.get.call(this);
      },
    });
  });
  await blocked.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await blocked.waitForFunction(() => !document.getElementById('sponsor-block-warning')?.classList.contains('hidden'), null, {
    timeout: 10000, polling: 50,
  });
  await blocked.locator('#sponsor-block-dismiss').evaluate((button) => button.click());
  if (!await blocked.locator('#sponsor-block-warning').evaluate((node) => node.classList.contains('hidden'))) {
    throw new Error('continue button did not dismiss the warning');
  }
  await blocked.close();
  console.log('sponsor blocker browser check passed: clean page stays silent; blocked bait warns and dismisses');
} finally {
  await browser.close();
}
