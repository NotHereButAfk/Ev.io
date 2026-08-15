#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSponsorProbeBlocked } from '../src/ui/SponsorAvailability.js';

const visibleProbe = { offsetHeight: 1, offsetWidth: 1, getClientRects: () => [{}] };
assert.equal(isSponsorProbeBlocked(visibleProbe, { display: 'block', visibility: 'visible' }), false);
assert.equal(isSponsorProbeBlocked({ ...visibleProbe, offsetHeight: 0 }, { display: 'block', visibility: 'visible' }), true);
assert.equal(isSponsorProbeBlocked(visibleProbe, { display: 'none', visibility: 'visible' }), true);
assert.equal(isSponsorProbeBlocked(visibleProbe, { display: 'block', visibility: 'hidden' }), true);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const main = readFileSync(join(root, 'src/main.js'), 'utf8');
assert.match(index, /id=["']sponsor-block-warning["'][^>]*class=["'][^"']*hidden/);
assert.match(index, /id=["']sponsor-block-dismiss["']/);
assert.match(main, /installSponsorBlockCheck\(\)/);
assert.doesNotMatch(index, /adsbygoogle|data-ad-(?:client|slot)|boot-connect-ad|ml-ad|ad-slot/);

console.log('sponsor blocker check passed: visible probe stays silent; collapsed/hidden bait warns; no gray ad placeholders');
