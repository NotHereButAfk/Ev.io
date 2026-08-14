# KYX.IO QA Report

Last executed: 2026-08-14

This report records tests that were actually executed against the running game. Public EV.IO comparisons use only publicly observable pages, gameplay stills, and live behavior; unavailable values remain marked unknown.

## Executed baseline

- Production build: PASS.
- Automated certificate: PASS, 26/26 gates.
- Real browser gameplay smoke: PASS.
- Browser console: PASS, zero first-party errors during the smoke.
- Embedded-browser entry: PASS, live HUD reached with zero error/warning logs after pointer-lock rejection containment.
- Production verification: PASS for full-mesh rifle fix `2fc47af` via deployment run `31791229196`; cache-busted `kryx.live` entered a match and captured both the first-person rifle and corrected third-person Hero carry.
- First-party requests: PASS, zero failures during the smoke. Google Fonts is optional and was blocked by the restricted QA network; local fallbacks rendered.
- Browser smoke measurements: walk peak 6.20 m/s, sprint peak 10.85 m/s, jump peak +4.42 m, and live firearm ammo consumption.
- Exercised: guest entry, match start, W movement, sprint, jump, rapid mouse look, ADS enter/exit, overlapping diagonal-air-fire input, reload start/completion, gun-to-melee-to-gun swap, blink, frag and smoke grenades, scoreboard open/close, authoritative death presentation, lethal damage during reload/ability cooldown, automatic respawn, and kill-plane recovery.

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

**Verification:** PASS. The GUI contract covers synchronous and asynchronous rejection shapes; both the locally served game and deployed commit `9c2757e` entered an embedded-browser match, rendered the Auto Rifle HUD at 50/200, and reported zero error/warning logs.

## BUG-007

**Severity:** High

**System:** First- and third-person character/weapon posing

**Steps to reproduce:** Equip a rifle, inspect the real Soldier from the front or front-three-quarter view, then inspect the first-person idle view at 16:9. Exercise idle, walk, run, sprint, aim, pitch, and reload.

**Expected behavior:** The stock seats at the shoulder; the trigger hand remains on the pistol grip; the support hand remains on the handguard; the receiver stays clear of the head and upper torso; first-person hands move with the same weapon transform; locomotion and action layers do not detach the wrists.

**Observed behavior:** The third-person receiver sat above the real Soldier's shoulder line, placing the stock and forearms through the helmet/face. Idle forced a 68% aim blend. First-person framing was too flat and right-shifted, making the hold read as a floating side grip.

**Root cause:** Carry offsets were inherited from an older 2.2 m procedural body but applied to the 1.8 m rigged Soldier. The controller also forced a near-ADS idle pose. First-person lacked the final yaw/roll and vertical composition needed to make the authored grip contacts readable.

**Files changed:** `src/player/HumanRifleCarry.js`, `src/player/HumanSoldier.js`, `src/weapons/WeaponSystem.js`, `tools/human_rifle_carry_check.mjs`, `tools/viewmodel_check.mjs`, `human-pose-lab.html`, `viewmodel-pose-lab.html`

**Fix:** Rebased the rifle on the live shoulder midpoint, lowered idle to an 18% low-ready blend, moved the support contact onto the reachable receiver-side handguard, and kept both arms solved from the displayed weapon transform. Re-composed the first-person mount with a shared 0.18 rad pitch, 0.31 rad yaw, -0.10 rad roll, and lower camera-space origin.

**Verification:** PASS. Across 48 real Soldier/armor/action states, both wrist errors are 0.00 cm; low-ready receiver clearance is 9.4-11.0 cm below, 18.2-21.3 cm ahead, and at least 1.03x outside the shoulder line. Twenty shipped first-person weapons pass 12 FOV/aspect frames plus ADS, sprint, reload, near-plane, glove, and 30/60/144 Hz checks. The full automated certificate remains 25/25.

## BUG-008

**Severity:** High

**System:** Default player model / third-person rifle silhouette

**Steps to reproduce:** Select the default Vanguard chassis, enter third person, and inspect the player from the normal rear camera plus front/three-quarter views while idle, running, aiming, reloading, throwing, crouching, and sliding.

**Expected behavior:** The character reads as one rigged body with connected torso and limbs, weighted joint deformation, armor that wraps the body, and a rifle seated outside the right shoulder. The weapon must remain readable and the wrists must stay attached through actions.

**Observed behavior:** The shipping factory selected the rigid `BlockBody` chassis. Its rectangular torso, pelvis, limb blocks, and hard seams read as separate parts placed on a mannequin. Its rifle origin was only 12.3-16.9 cm from the centerline, inside the 20.9 cm right shoulder, so the normal rear camera visually swallowed the receiver. The alternative weighted body also placed a large black cape on the default chassis, hiding its back and weapon.

**Root cause:** The runtime builder pointed at the comparison block chassis even though the connected `HeroBody` was already implemented and fully gated. Rifle tests checked height and muzzle direction but did not assert lateral shoulder clearance on the production skinned body or exercise action states.

**Files changed:** `src/player/LowPolyModels.js`, `src/player/HeroBody.js`, `src/player/RifleCarry.js`, `tools/mesh_check.mjs`, `tests/rifle-carry-reference.test.mjs`, `pose-lab.html`, `tools/capture_pose_lab.mjs`, `tools/screenshots.mjs`

**Fix:** Ship the 11,078-vertex graded-weight Hero body for Vanguard/Striker/Phantom, keep the cape only on Phantom, move the receiver to the right shoulder pocket, and retarget the support hand to the reachable receiver-side handguard. The rigid block chassis remains available only for comparison/tooling.

**Verification:** PASS. The runtime factory is gated to the connected Hero body. All vertices are weighted; no weights leak across legs; every tested surface faces outward; the 1.822 m figure matches the camera and human landmarks; feet remain grounded; and the knee preserves volume under a hard bend. Through idle, walk, run, aim up/down, reload, swap, and flinch, trigger-wrist error is 0.00 cm, support-rail error is 0.00 cm laterally, normal receiver-origin clearance is 8.5 cm outside the shoulder, and action origin clearance never falls below 5.3 cm. Real-browser gameplay smoke passes with zero console/request failures, and the expanded automated certificate is 26/26 including the 64-player soak.

The receiver-origin checks above were not sufficient to prove clearance for the complete 1.14 m rifle mesh. BUG-009 records the full-mesh correction and supersedes that part of this verification.

## BUG-009

**Severity:** High

**System:** Third-person rifle/body intersection

**Steps to reproduce:** Equip the Auto Rifle on the connected Hero body and inspect the complete weapon mesh at fresh attachment, idle, walk, run, level/up/down aim, flinch, five reload phases, and three swap phases. Check the stock and rear receiver against the torso and shoulder volumes rather than checking only the weapon object's origin.

**Expected behavior:** The stock seats on the visible shoulder surface, the receiver remains in front of the chest, and no weapon surface enters the body during carry or actions. Both wrists must continue to follow the corrected weapon transform.

**Observed behavior:** The earlier regression checked only the receiver origin. The shipped Auto Rifle extends 44.5 cm behind that origin, so all 15 sampled carry/action poses still intersected the model: shoulder penetration reached 8.0 cm and reload torso penetration reached 3.1 cm even while the origin and wrist tests passed.

**Root cause:** `tests/rifle-carry-reference.test.mjs` used an empty `Object3D`, and the pose lab deliberately returned no geometric penetration result for the merged Hero `SkinnedMesh`. Neither gate instantiated or sampled the actual production rifle geometry.

**Files changed:** `src/player/RifleCarry.js`, `src/player/ThirdPersonCamera.js`, `tools/rifle_body_clearance_check.mjs`, `tools/certify.mjs`, `package.json`, `QA_REPORT.md`, `EVIO_COMPARISON.md`

**Fix:** Move the complete carry plane 12 cm forward, add a reachable outboard offset that increases for level/downward aim and swaps, apply the same clearance to the fresh-attachment transform, and retarget both arms from the final displayed transform. Move the gameplay camera from 0.38 m to a 0.55 m right-shoulder offset so the separated gun/forearm silhouette remains readable from the normal rear view. Add a release gate that transforms every vertex of the production Auto Rifle through the real carry states and tests it against conservative torso and shoulder volumes.

**Verification:** PASS. Sixteen production poses now report 0.0 cm torso penetration and no more than 0.7 cm shoulder contact, below the 0.8 cm surface tolerance. Trigger-wrist and support-rail errors remain 0.00 cm laterally. Front, side, rear, run, aim, reload, and swap renders were inspected. Real-browser gameplay smoke passes with walk 6.20 m/s, sprint 10.85 m/s, jump +4.42 m, ammo 50→47, and zero console/request failures. The expanded release certificate passes 26/26 automated gates, including the 64-player soak.

## Known product gaps, not falsely marked fixed

- Team Slayer is currently a menu label backed by deathmatch logic.
- Capture the Flag has no flags.
- King of the Hill has no hill.
- Authoritative multiplayer is implemented but disabled by default; the standard shipped path is local bots.
- The current public EV.IO spectator room loaded, but embedded pointer-lock restrictions prevented a controlled player-input trial; current movement/reload/damage timing remains unmeasured.
- Human multiplayer feel, legal/provenance review, and production rollback still require human/external validation.

## Reproduction command

```powershell
$env:KYX_URL='http://127.0.0.1:5995/'
$env:CHROME='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd run test:gameplay-smoke
```
