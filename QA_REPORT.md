# KYX.IO QA Report

Last executed: 2026-08-13

This report records tests that were actually executed against the running game. Public EV.IO comparisons use only publicly observable pages, gameplay stills, and live behavior; unavailable values remain marked unknown.

## Executed baseline

- Production build: PASS.
- Automated certificate: PASS, 25/25 gates.
- Real browser gameplay smoke: PASS.
- Browser console: PASS, zero first-party errors during the smoke.
- First-party requests: PASS, zero failures during the smoke. Google Fonts is optional and was blocked by the restricted QA network; local fallbacks rendered.
- Browser smoke measurements on the deterministic open lane: walk 1.51 m in 0.9 s, sprint 2.38 m in 0.9 s, jump +1.77 m after 100 ms, Auto Rifle ammo 50 to 49 after firing.
- Exercised: guest entry, match start, W movement, sprint, jump, firing, reload, reload-to-swap, swap back, blink, scoreboard open/close, lethal damage, death overlay, and automatic respawn.

## BUG-001

**Severity:** High  
**System:** Match flow / death / respawn  
**Steps to reproduce:** Launch a deathmatch, apply lethal damage, leave the browser in a throttled/headless state, and wait longer than the displayed three-second countdown.  
**Expected EV.IO behavior:** Respawn timing progresses independently of render frame rate.  
**Observed behavior in my game:** The countdown used clamped `requestAnimationFrame` deltas. It had only fallen from 3.0 s to 2.25 s after 3.6 wall-clock seconds and could take tens of seconds in a throttled tab.  
**Root cause:** A wall-clock match-flow deadline was implemented as an accumulated animation delta.  
**Files changed:** `src/core/Game.js`, `tools/gameplay_smoke.mjs`, `package.json`  
**Fix:** Store a monotonic respawn deadline and calculate the remaining countdown from `performance.now()`. Keep the dedicated death overlay active without automatically opening the full navigation UI.  
**Verification:** PASS. The same automated browser sequence now kills and automatically respawns the player, hides the overlay, restores finite player state, and reports no first-party console/network failures.

## BUG-002

**Severity:** Medium  
**System:** First-person weapon presentation  
**Steps to reproduce:** Equip the Auto Rifle at 16:9/78° FOV and compare the idle frame to current public EV.IO gameplay stills.  
**Expected EV.IO behavior:** Compact diagonal shoulder line; muzzle approaches the crosshair from the lower right; butt and arm continue through the lower/right frame; support grip is visible.  
**Observed behavior in my game:** The rifle was oversized, nearly horizontal, too centered, showed too much stock, and hid the support grip.  
**Root cause:** The camera-space viewmodel used only a broad position/scale adjustment and no persistent hip-fire pitch/yaw.  
**Files changed:** `src/weapons/WeaponSystem.js`, `tools/viewmodel_check.mjs`, `tools/screenshots.mjs`  
**Fix:** Added a smaller camera-space mount with persistent pitch/yaw, lower-right composition, shared hand/weapon transform, and visible compact support forearm. Added reference-framing regression bounds.  
**Verification:** PASS. All 20 weapons across 12 FOV/aspect frames pass near-plane, glove, ADS, reload, sprint, and refresh-rate checks; the full certificate remains 25/25.

## BUG-003

**Severity:** High  
**System:** Weapon state / death / respawn  
**Steps to reproduce:** Fire the Auto Rifle, start reloading, take lethal damage before the reload completes, and wait for automatic respawn.  
**Expected EV.IO behavior:** A new life starts with the base loadout, full magazine, and no action from the previous life.  
**Observed behavior in my game:** The viewmodel motion reset, but the weapon state still reported `isReloading=true`; the partial reload survived into the new life.  
**Root cause:** The respawn path called `resetMotionState()` and rebuilt the loadout HUD, but `setLoadout()` intentionally preserved each weapon's ammo/reload state.  
**Files changed:** `src/core/Game.js`, `tools/gameplay_smoke.mjs`  
**Fix:** Treat respawn as a new-life inventory boundary by resetting the base loadout's ammo, reload timers, recoil, switch, and viewmodel state before rebuilding HUD slots.  
**Verification:** PASS when the death-during-reload browser sequence returns with a full magazine and no active reload. The map-boundary probe also requires either legacy death/respawn or MoveSim recovery to produce a finite safe state.

## Known product gaps, not falsely marked fixed

- Team Slayer is currently a menu label backed by deathmatch logic.
- Capture the Flag has no flags.
- King of the Hill has no hill.
- Authoritative multiplayer is implemented but disabled by default; the standard shipped path is local bots.
- Current public EV.IO disconnected from its game server in this QA browser session, so live movement/reload/damage timing could not be measured today.
- Human multiplayer feel, legal/provenance review, and production rollback still require human/external validation.

## Reproduction command

```powershell
$env:KYX_URL='http://127.0.0.1:5995/'
$env:CHROME='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd run test:gameplay-smoke
```
