# KYX.IO QA Report

Last executed: 2026-08-13

This report records tests that were actually executed against the running game. Public EV.IO comparisons use only publicly observable pages, gameplay stills, and live behavior; unavailable values remain marked unknown.

## Executed baseline

- Production build: PASS.
- Automated certificate: PASS, 25/25 gates.
- Real browser gameplay smoke: PASS.
- Browser console: PASS, zero first-party errors during the smoke.
- Embedded-browser entry: PASS, live HUD reached with zero error/warning logs after pointer-lock rejection containment.
- First-party requests: PASS, zero failures during the smoke. Google Fonts is optional and was blocked by the restricted QA network; local fallbacks rendered.
- Browser smoke measurements on independent deterministic open-lane trials: walk 1.20 m in 0.9 s, sprint 2.09 m in 0.9 s, jump peak +4.41 m, Auto Rifle ammo 50 to 48 after firing.
- Exercised: guest entry, match start, W movement, sprint, jump, rapid mouse look, ADS enter/exit, overlapping diagonal-air-fire input, reload, reload-to-swap, swap back, blink, frag and smoke grenades, scoreboard open/close, authoritative death presentation, lethal damage during reload/ability cooldown, automatic respawn, and kill-plane recovery.

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

## BUG-004

**Severity:** High

**System:** Ability state / death / respawn

**Steps to reproduce:** Use blink, throw one frag and one smoke, take lethal damage before the blink cooldown expires, and wait for respawn.

**Expected EV.IO behavior:** Respawn is a clean-life boundary: blink is ready and the standard throwable inventory is restored, matching the authoritative room's existing respawn contract.

**Observed behavior in my game:** The local/legacy path kept `teleportCooldown` and depleted grenade counts into the next life. With MoveSim enabled, the bridge could also write its pre-death cooldown state back after `Player.respawn()`.

**Root cause:** `Player.respawn()` reset movement and recoil but not ability state; `MoveBridge` only resynchronized on a large position change; the local respawn path did not refill throwable inventory even though the authoritative server did.

**Files changed:** `src/player/Player.js`, `src/sim/MoveBridge.js`, `src/weapons/GrenadeSystem.js`, `src/core/Game.js`, `tools/player_respawn_check.mjs`, `tools/gameplay_smoke.mjs`

**Fix:** Reset blink/pad cooldowns per life, add a respawn epoch so MoveBridge always rebuilds its deterministic state even at a nearby spawn, and refill local grenade charges without deleting already-active smoke/explosion presentation.

**Verification:** PASS. The real-browser death-during-ability sequence respawns with blink ready and two frag/two smoke charges; deterministic respawn and movement fixtures pass.

## BUG-005

**Severity:** Medium

**System:** Authoritative multiplayer death presentation

**Steps to reproduce:** Enter an authoritative match and receive an alive-to-dead server transition.

**Expected EV.IO behavior:** The match remains visible behind a dedicated death/respawn overlay while control is locked.

**Observed behavior in my game:** The authoritative callback opened the full pause/navigation UI, unlike the corrected local deathmatch path.

**Root cause:** `_onAuthoritativeDeath()` retained a legacy `_openMenu()` call after the local path moved to the dedicated overlay.

**Files changed:** `src/core/Game.js`, `tools/gameplay_smoke.mjs`

**Fix:** Use the respawn overlay as the sole automatic death UI; manual Escape navigation remains available.

**Verification:** PASS. The browser harness invokes the authoritative death/respawn callbacks, proves the navigation menu stays closed, and proves the overlay appears and clears.

## BUG-006

**Severity:** Medium

**System:** Browser input / pointer lock / console health

**Steps to reproduce:** Open the production game in an embedded browser where the canvas belongs to a document that is not eligible for pointer lock, then press `CLICK TO PLAY`.

**Expected EV.IO behavior:** Pointer lock is attempted as an enhancement; rejection leaves the game/UI usable and does not emit an unhandled first-party exception.

**Observed behavior in my game:** The match entered and rendered, but the production console logged `WrongDocumentError: The root document of this element is not valid for pointer lock.`

**Root cause:** `InputManager.requestPointerLock()` called the browser API without containing either its synchronous DOMException or its rejected promise.

**Files changed:** `src/core/InputManager.js`, `tools/gui_contract_check.mjs`

**Fix:** Route the request through a safe boundary that absorbs unsupported, wrong-document, and policy rejection paths while returning whether a request could be initiated.

**Verification:** PASS. The GUI contract covers synchronous and asynchronous rejection shapes; the embedded browser entered a locally served match, rendered the Auto Rifle HUD at 50/200, and reported zero error/warning logs.

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
