#!/usr/bin/env node
// Measures where every gun's sight ends up when you aim down it, and writes
// tests/sights.json for `npm run test:aim` to check against.
//
// This has to run in a browser: the weapon models bake their PBR and decal
// textures through a 2D canvas, so they cannot be built in Node at all. The
// survey therefore drives the REAL builders through headless Chromium and
// records what they actually produce — including weaponMount's 0.74 scale,
// which is the thing an alignment written against un-scaled measurements gets
// silently wrong.
//
//   npm run sights            re-measure and rewrite the fixture
//   npm run sights -- --png out.png    also save a contact sheet to look at
//
// Needs a dev server on :5999 (npx vite --port 5999).

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pngArg = process.argv.indexOf('--png');
const PORT = process.env.PORT || 5999;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1760, height: 1300 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(`http://localhost:${PORT}/tools/sight_survey.html`, { waitUntil: 'load' });
await page.waitForFunction('window.__done === true', { timeout: 240000 });

const survey = await page.evaluate('window.__survey');
writeFileSync(join(root, 'tests/sights.json'), JSON.stringify(survey, null, 2) + '\n');

console.log('gun'.padEnd(15), 'sight from eye'.padStart(15), 'source'.padStart(9), 'stock gap'.padStart(10));
let bad = 0;
for (const [id, v] of Object.entries(survey).sort((a, b) => a[1].rearGap - b[1].rearGap)) {
  const flag = v.rearGap < 0.02 ? '  <-- CLIPS' : '';
  if (v.rearGap < 0.02) bad++;
  console.log(id.padEnd(15), `${(v.dip * 100).toFixed(2)} cm`.padStart(15),
              (v.declared ? 'declared' : 'inferred').padStart(9),
              v.rearGap.toFixed(3).padStart(10) + flag);
}
console.log(bad ? `\n${bad} gun(s) reach the near plane` : '\nevery stock clears the eye');
console.log(`wrote tests/sights.json (${Object.keys(survey).length} guns)`);

if (pngArg > 0 && process.argv[pngArg + 1]) {
  await (await page.$('#out')).screenshot({ path: process.argv[pngArg + 1] });
  console.log('contact sheet ->', process.argv[pngArg + 1]);
}
await browser.close();
