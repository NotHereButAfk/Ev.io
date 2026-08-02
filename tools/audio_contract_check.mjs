#!/usr/bin/env node

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { WEAPON_AUDIO_PROFILES } from '../src/core/AudioManager.js';

const rifle = WEAPON_AUDIO_PROFILES.rifle;
assert.equal(rifle.gain, 0.8, 'Auto Rifle must respect EV.IO mg volume 0.8');
assert.ok(rifle.dur <= 0.08, 'automatic report must stay short and readable');
assert.ok(rifle.reverb <= 0.12, 'Auto Rifle tail must not smear full-auto cadence');
assert.ok(rifle.subGain <= 0.2, 'Auto Rifle must avoid an exaggerated bass boom');
assert.ok(rifle.mech >= 0.18, 'Auto Rifle needs a clear mechanical bolt tick');

const source = readFileSync(new URL('../src/core/AudioManager.js', import.meta.url), 'utf8');
assert.match(source, /Math\.random\(\).*\(b - a\)/, 'shots need randomized pitch/level');
assert.match(source, /rolloffFactor\s*=\s*1\.6/, 'remote gunfire needs strong distance falloff');
assert.match(source, /playReloadMag\(\)/, 'magazine reload cue must exist');
assert.match(source, /playReloadRack\(\)/, 'bolt/rack reload cue must exist');

console.log('audio contract passed: compact mg report, pitch variance, stereo arena tail, falloff, and reload mechanics');
