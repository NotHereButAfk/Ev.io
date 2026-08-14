# KYX.IO QA Report

Last executed: 2026-08-14

This report records tests that were actually executed against the running game. Public EV.IO comparisons use only publicly observable pages, gameplay stills, and live behavior; unavailable values remain marked unknown.

## Executed baseline

- Production build: PASS.
- Automated certificate: PASS, 27/27 gates.
- Real browser gameplay smoke: PASS.
- Browser console: PASS, zero first-party errors during the smoke.
- Embedded-browser entry: PASS, live HUD reached with zero error/warning logs after pointer-lock rejection containment.
- Production verification: PASS for the Hero full-arsenal correction `e39c657` (run `31793165892`), loaded-Soldier correction `9b2fd97` (run `31797011674`), and late-loading fallback correction `62846c0` (run `31798425052`). A cache-busted Assault match on `kryx.live` captured both first- and third-person frames from the deployed runtime; the final frame is the rigged Soldier with its Auto Rifle outside the torso.
- Current roster correction: PASS locally. Live browser capture renders seven armed bots as Vanguard/Striker/Phantom only; the 27th release gate verifies saved-model migration and shared player/bot/remote chassis ownership. Production verification is pending deployment.
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

**System:** Third-person firearm/body intersection and reload hand contact

**Steps to reproduce:** Equip each of the 17 non-melee firearms on the connected Hero body and inspect the complete weapon mesh at fresh attachment, idle, walk, run, level/up/down aim, flinch, five reload phases, and three swap phases. Check every mesh vertex against the torso/shoulder volumes and both wrist positions against the final displayed grip targets rather than checking only the weapon object's origin.

**Expected behavior:** Every stock/receiver seats outside the visible shoulder and chest; the trigger hand stays on the grip; the support palm wraps the shooter-facing handguard surface and reaches the magazine during reload; no firearm surface enters the body during carry or actions.

**Observed behavior:** The earlier regression checked only an empty receiver-origin stand-in. The Auto Rifle extends 44.5 cm behind that origin, so all 15 sampled carry/action poses initially intersected the model: shoulder penetration reached 8.0 cm and reload torso penetration reached 3.1 cm. Expanding the probe to the complete arsenal found 29/272 mesh collisions across the Uzi, M16, rifle, LMG, RPG, bolt sniper, battle rifle, DMR, and fuel rod. A stricter two-wrist pass also found the positive reload roll presented the magazine away from the support hand, leaving it up to 42.7 cm short.

**Root cause:** `tests/rifle-carry-reference.test.mjs` used an empty `Object3D`, and the pose lab deliberately returned no geometric penetration result for the merged Hero `SkinnedMesh`. The carry used fixed M4-sized offsets for firearms whose stock length and receiver width differ substantially. Its support target ran through the handguard centerline, and the reload roll sign moved the magazine to the wrong side of the body.

**Files changed:** `src/player/RifleCarry.js`, `src/player/ThirdPersonCamera.js`, `pose-lab.html`, `tools/rifle_body_clearance_check.mjs`, `tools/certify.mjs`, `package.json`, `QA_REPORT.md`, `EVIO_COMPARISON.md`

**Fix:** Keep the 12 cm complete-mesh carry plane and 0.55 m firing-shoulder camera, then measure each firearm's authored stock-back and half-width once from its real meshes. Add only the extra forward/outboard clearance that geometry requires, preserve an uphill shoulder pocket, and move the support wrist to the shooter-facing handguard surface by the same width compensation. Reverse reload roll so the magazine is presented toward the support hand and use a smooth out-and-back magazine reach. The release gate now builds every production firearm, transforms every vertex through every state, and solves the real Hero wrists from the displayed weapon transform.

**Verification:** PASS in production. All 17 firearms pass all 272 production poses with 0.0 cm torso penetration, at most 0.6 cm shoulder contact (below the 0.8 cm surface tolerance), at most 0.1 cm trigger-wrist error, and 0.0 cm support-wrist error, including all reload/swap samples. Compact pistol, Auto Rifle, RPG, bolt sniper, and corrected reload renders were inspected from three angles. Real-browser gameplay smoke passes with walk 6.20 m/s, sprint 10.85 m/s, jump +4.42 m, ammo 50→47, and zero console/request failures. The release certificate passes 26/26 automated gates, including the 64-player soak. Runtime commit `e39c657` deployed successfully in run `31793165892`; cache-busted production entered a match and produced first- and third-person captures.

## BUG-010

**Severity:** High

**System:** Rigged Soldier firearm/body intersection and two-handed carry

**Steps to reproduce:** Select a rigged Soldier armor body, equip each firearm, and inspect its complete rendered mesh during idle, low-ready, aim up/down, run, sprint tuck, reload, and swap on assault, recon, heavy, and stealth proportions.

**Expected behavior:** The stock seats in front of the shoulder pocket instead of entering it; the receiver remains outside the chest; both modeled hands can close on the firearm through locomotion and actions.

**Observed behavior:** The previous Soldier carry test passed while using an empty `Object3D` as the gun. On the actual production M4, the rear stock lay almost on the shoulder-joint centre and penetrated the live Soldier shoulder envelope by roughly 11.3 cm. The separate full-mesh Hero-body gate did not exercise this rig or its carry solver.

**Root cause:** Two production body families used different carry implementations, but the Soldier regression measured only receiver placement and wrist targets. Its reach correction moved the whole firearm back toward the body whenever an animation shortened an arm, allowing perfect numerical wrist error while the real stock mesh crossed the shoulder.

**Files changed:** `src/player/HumanRifleCarry.js`, `src/player/HumanSoldier.js`, `tools/human_rifle_carry_check.mjs`, `human-pose-lab.html`, `QA_REPORT.md`, `EVIO_COMPARISON.md`

**Fix:** Scale showcase-authored firearms to the live Soldier, place the complete stock in front of the shoulder pocket, toe long guns inward slightly, and add stock-length-specific forward clearance from each weapon's measured geometry. Protract the support clavicle for a natural two-handed stance. Reach-limited poses now slide only the support-wrist contact along the weapon; they no longer pull the entire gun into the body. The pose lab can render any shipped firearm for visual inspection.

**Verification:** PASS in production. All 17 firearms pass 816 production Soldier poses (17 weapons × 4 armor bodies × 12 carry/action states): torso penetration is 0.0 cm, conservative shoulder-envelope contact is at most 0.3 cm under a 0.4 cm limit, both wrist-target errors are 0.00 cm, and the farthest support wrist is 17.8 cm from a firearm surface, within the modeled hand/finger span. M4 front/side/rear, Uzi sprint, sidearm, and heavy bolt-sniper sprint renders were inspected. Production build, gameplay smoke with zero console/request failures, and all 26 automated certificate gates pass. Commit `9b2fd97` deployed successfully in run `31797011674`.

## BUG-011

**Severity:** High

**System:** Late-loading Soldier fallback / active third-person player body

**Steps to reproduce:** Select Assault, enter a match before the optional 2.16 MB `soldier.glb` finishes loading, switch to third person, and inspect the held firearm from behind.

**Expected behavior:** Asset timing must not change anatomy or weapon safety. The loading fallback must remain a connected, correctly rigged player with the complete firearm outside the torso; when the Soldier finishes loading, an active match should upgrade to it without requiring a restart.

**Observed behavior:** A cache-busted production capture of commit `9b2fd97` entered before the Soldier rig was ready and preserved the old procedural mannequin for the whole match. Its disconnected capsule/box parts reappeared and the Auto Rifle hung vertically through the right arm/body, despite both the Hero and loaded-Soldier carry gates passing.

**Root cause:** `buildPreviewCharacter()` still fell through to the original procedural armor builder while optional GLBs loaded. The async model callback rebuilt only the menu preview and menu bots; it never replaced an already-created local player body.

**Files changed:** `src/player/PreviewCharacter.js`, `src/core/Game.js`, `tools/mesh_check.mjs`, `tools/screenshots.mjs`, `QA_REPORT.md`, `EVIO_COMPARISON.md`

**Fix:** Legacy kits now degrade to the connected weighted Hero body (Assault/Heavy → Vanguard, Recon → Striker, Stealth → Phantom), which already uses the full-mesh RifleCarry solver. The parts-bin procedural mannequin is no longer reachable from those selectable loading paths. When the real Soldier becomes ready during play, Game replaces the fallback body, resets its third-person attachment/animation state, and attaches the current weapon on the next frame. Screenshot tooling can force armor selection and block the Soldier asset to exercise this exact degraded path.

**Verification:** PASS in production. The mesh gate explicitly constructs all four legacy kits with Human loading disabled and requires a connected Hero rather than a `BlockBody` or procedural mannequin. A real-browser run with `/soldier.glb` deliberately aborted entered Assault, switched to third person, and rendered the connected fallback with the Auto Rifle outside the body. Hero full-mesh clearance (272 poses), loaded-Soldier full-mesh clearance (816 poses), gameplay smoke, production build, and the 26/26 release certificate all pass. Commit `62846c0` deployed successfully in run `31798425052`; the same cache-busted Assault capture that previously showed the mannequin now shows the rigged Soldier and body-clear rifle.

## BUG-012

**Severity:** High

**System:** Live player/bot model roster and firearm readability

**Steps to reproduce:** Start a normal match after the Soldier asset has loaded, inspect the seven bots and any authoritative remote avatars, then load an older profile whose saved armor id is Assault, Recon, Heavy, or Stealth.

**Expected behavior:** Every live combatant uses one connected, weighted body family with the same proven two-handed firearm solver. Saved selections must not silently restore a deprecated model whose gloves, attached plates, or alternate shoulder proportions swallow the weapon silhouette.

**Observed behavior:** The local default used Vanguard, but bots and authoritative remotes still hard-coded the four legacy Soldier ids. Older browser profiles could also retain those ids. As a result, the match visibly mixed the corrected exosuit with the exact layered human/armor bodies the player reported as looking assembled from separate parts; their smaller 0.65-scale Auto Rifle remained difficult to read between the large Soldier gloves.

**Root cause:** Model migration was applied only to a narrow default-profile case. `Bot.js` and `AuthNetBridge.js` owned separate stale chassis arrays, and the armor menu still exposed both body families, so production did not have one authoritative roster contract.

**Files changed:** `src/player/ArmorTypes.js`, `src/entities/Bot.js`, `src/net/AuthNetBridge.js`, `src/player/HumanRifleCarry.js`, `src/player/HumanSoldier.js`, `tools/armor_roster_check.mjs`, `tools/roster_visual_check.mjs`, `tools/human_rifle_carry_check.mjs`, `tools/certify.mjs`, `package.json`, `QA_REPORT.md`, `EVIO_COMPARISON.md`

**Fix:** Make Vanguard, Striker, and Phantom the only playable chassis; use that shared roster for the menu, local bots, and authoritative remote avatars; and migrate every saved legacy id to its closest connected exosuit. Retired Soldier code remains available for tooling, with compact guns enlarged and given stock-length-based forward clearance, but it is no longer selected by normal play.

**Verification:** PASS locally. The roster contract test proves the three playable ids, all four legacy migrations, connected-body construction, and shared bot/remote imports. The live-browser roster capture renders seven armed bots as Vanguard/Striker/Phantom only. The exact Hero body passes all 17 firearms across 272 carry/action poses with 0.0 cm torso penetration, at most 0.6 cm shoulder contact, and both wrists on their targets. Gameplay smoke completes movement, ADS, fire, reload, swap, abilities, scoreboard, death, respawn, and kill-plane recovery with zero console/request failures. The expanded release certificate passes 27/27 automated gates. Production verification is pending deployment of this change.

## BUG-013

**Severity:** High

**System:** Authoritative remote-player locomotion presentation

**Steps to reproduce:** Enter a deployed authoritative match with remote players present and let a remote avatar move far enough to enter its directional gait calculation.

**Expected behavior:** Remote avatars walk, strafe, and backpedal through the same connected-body locomotion and firearm-carry path without interrupting the render loop.

**Observed behavior:** The cache-busted production verification of `efd701a` reached the corrected roster, then repeatedly raised `ReferenceError: _v is not defined` while remote snapshots were animated.

**Root cause:** `Avatar.update()` used a module scratch vector while calculating resolved travel direction, but that vector was never declared. Local bot smoke did not execute `Avatar`'s authoritative-peer movement branch.

**Files changed:** `src/player/Avatar.js`, `tools/net_presentation_check.mjs`, `QA_REPORT.md`

**Fix:** Declare the frame-local `THREE.Vector3` scratch object used by remote directional animation, and add a network-presentation regression gate that requires both its ownership and use.

**Verification:** PASS locally. The expanded network-presentation gate passes 8/8 checks and the production build compiles. Cache-busted production verification is pending deployment of this follow-up.

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
