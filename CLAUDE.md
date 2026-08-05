# KYX.IO — project notes (for Claude / new sessions)

> **Working alongside other agents?** Read [`AGENTS.md`](AGENTS.md) first —
> it's the shared contract (Claude / Codex / Copilot all work in this repo) and
> lists the invariants that break silently, the verification commands, and the
> git rules for a `main` that several agents push to. This file is the project
> map; that one is the rules.

A Three.js browser FPS (an **ev.io**-style arena shooter), built with **Vite**.
Deployed to **Hostinger** (static site) via a GitHub Action on every push to `main`.

## How to run / build
- Dev: `npx vite --port 5999 --host`
- Build: `npm run build` → outputs to `dist/` (Vite `base: './'`, works from any web root)
- Headless screenshots for verification: Playwright + swiftshader; GLBs take
  ~30s to load. Log in via `#auth-guest-btn`, start a match via `#play-btn`.

## Deploy (VPS — kryx.live)
- Live site: **kryx.live**, hosted on a **VPS** (as of Jul 2026; supersedes the
  old kyx.io Hostinger shared hosting, which superseded Netlify — Netlify PR
  previews still post bot comments; ignore them).
- `.github/workflows/deploy-vps.yml` builds and **rsyncs `dist/` over SSH** on
  every push to `main`. Repo secrets: `VPS_HOST`, `VPS_USER`, `VPS_SECRET`
  (private key), and `VPS_PATH` (web root). SSH uses port 22.
- The SSH-key heredoc was repaired on 2026-07-29; its unindented body had made
  the workflow invalid YAML, so GitHub produced failed runs with zero jobs or
  logs. If deployment still fails after that repair, inspect the actual job
  log and verify the `VPS_*` secrets rather than reverting the YAML fix.
- Being a VPS, it can ALSO run the 24/7 match relay (`server/`) under
  systemd/pm2 — set the `VITE_WS_URL` secret to its ws(s):// URL and clients
  share one live match. See "24/7 match server" below.

## 24/7 match server (optional, separate from the static site)
- `server/` is a standalone Node/WebSocket relay (see `server/README.md`) that
  shares the deathmatch countdown timer + real connected-player roster across
  everyone's browser, so joining mid-match shows real elapsed time and real
  other players instead of a private simulated match per visit. It does
  **not** simulate positions/movement/hit-detection — that stays client-side.
- Must be deployed separately to a host that keeps a Node process alive (VPS,
  Fly.io, Railway, Render's paid Web Service tier — not Hostinger shared
  hosting, not Render's free tier which sleeps).
- Client opt-in via build-time env var `VITE_WS_URL` (see `.env.example`); the
  Hostinger deploy workflow already passes through a `VITE_WS_URL` repo secret
  if set. With no URL configured, or if unreachable, the game falls back to
  `ServerSim`'s local-only simulated roster — unchanged from before this
  existed, so nothing breaks if the relay isn't deployed.

## Working branch
- Develop on `claude/browser-game-weapons-wb22wp`; merge to `main` to deploy.

## Latest Codex handoff — gameplay polish (2026-07-29)
- Official Rook weapon pickups now come from the four marker records embedded in
  `RookLit_0.evmap`, including their authored elevations. `PickupLayout.js`
  maps them to the local power arsenal; collection checks vertical separation,
  so a pickup on an upper floor cannot be taken from below. `npm run
  test:evmap` locks the source hash, marker kinds, mirrored positions and guns.
- Player mobility is intentionally our tuning, not a claim about ev.io's
  internal constants: sprint is now 10.85 m/s (`6.2 * 1.75`) and jump impulse is
  13.8 m/s. Legacy `Player.js` and deterministic `MoveSim.js` match. The new
  `mobility` fixture locks a jump peak above 4m and sprint above 10.5 m/s.
- Bots make tactical choices in longer, stickier beats, switch targets less,
  strafe less violently and random-hop much less. Rigged human bots now receive
  their actual grounded state, so a jump uses the air pose instead of running
  in mid-air.
- The first-person arm is shorter, darkened, tucked into the lower-right and
  parented to the weapon kick/reload group. It follows the gun instead of
  floating as a separate bright tube.
- `ArmorSkins.js` now has eight original ev.io-inspired character finishes:
  dark undersuits, segmented plate color blocking, restrained emissive accents,
  and ear/horn/crown/bone helmet themes. Two starter finishes are guest-owned.
  A one-time migration changes the default from the white cyborg to the rigged
  human Assault model (cyborgs remain selectable). Guest Inventory access is
  enabled, and `ArmorPreviewRenderer` now uses the same skinnable rigged model
  as a match rather than the static white Spartan. Run `npm run test:skins`.
- Forward-facing animation is centralized in `src/player/Facing.js`. The actual
  `soldier.glb` planted-foot motion proves that its visual/travel forward is
  local -Z, matching the procedural bodies. Local players, network avatars and
  bots now use the same conversion instead of contradictory 180-degree special
  cases. `npm run test:facing` locks both the yaw math and the real GLB axis.
- Rigged-human locomotion now uses the measured `soldier.glb` planted-foot
  speeds (walk 1.70 m/s, run 4.28 m/s) through `HumanLocomotion.js`. Walk/run
  changes preserve normalized clip phase, avoid Three.js cadence warping,
  damp playback speed, synchronize head/weapon accents to the actual foot
  cycle, and normalize each clip's hips track to the same bind origin (the raw
  clips differed by about 13 cm). Sprint cadence is capped at 1.72x so the
  10.85 m/s sci-fi sprint does not become cartoon-fast. Run
  `npm run test:human-motion`.
- The first-person view now has two complete skinned gloves: a lifted trigger
  hand seated on the pistol grip and a mirrored support hand on the fore-end.
  Both are parented to the recoil/reload group; the support hand hides for
  melee. This replaces the partly clipped single forearm that could disappear
  below the bottom edge at common FOVs.
- Full browser playtest (2026-07-29): the production menu, login, registration
  and reset states render and respond; the game boots, respawns and accepts
  combat/movement actions; both POV hands remain visible; and every movement
  lab tape runs for flat floor, walls, corners, ramps, steps, ceilings, crouch
  tunnels, slides, mobility, teleport and kill-plane recovery. The release
  certificate is 9/9 green. During that pass, `arena_metrics.mjs` was corrected
  to aim its deterministic test bots at the target's actual elevation instead
  of always firing level; 2/4/8-player topology runs now all cover combat and
  reach every callout.
- Final live ev.io comparison used an actual Edge match, not only stills:
  ev.io keeps its idle rifle low/right and lowers the entire viewmodel during
  sprint. KYX follows the same restrained carry language but intentionally
  keeps both skinned gloves clearer at idle because the owner explicitly wants
  their hands visible. The comparison also exposed invalid placeholder
  AdSense requests; the `ca-pub-XXXXXXXXXXXXXXXX` slots now remain inert until
  a real publisher ID and loader are configured, eliminating those console
  errors without removing the reserved layout.
- Security check (2026-07-29): root production packages and the server have no
  npm advisories. The one high-severity dev-only PostCSS advisory was patched
  to 8.5.25; the browser-local rankings renderer now uses text nodes for stored
  names, and no committed private keys/tokens were found. `UserAccount.js` now
  persists 210k-iteration PBKDF2-SHA256 hashes with per-account salts, requires
  eight-character passwords and upgrades legacy plaintext records after one
  valid login. Important boundary: it is still browser-local demo identity, not
  production authentication, and `server/index.js` is a client-trusting roster
  relay. Do not use either for valuable identity, inventory or competitive
  score; those require server-side accounts and the authoritative
  `authserver.mjs` path with an exact `ALLOWED_ORIGINS` setting.

## Layout
- `src/core/Game.js` — main loop, state, match flow, HUD wiring, map-loading card.
- `src/world/World.js` — the active map is the downloaded official
  **ev.io Daytime Rook** asset from [node 755](https://ev.io/node/755), not a
  procedural recreation. `public/maps/RookLit_0.evmap` is decoded at runtime by
  `src/world/EvMapLoader.js`, which implements ev.io's public version-3 binary
  reader and builds its 43 geometry buffers, 23 materials, four embedded
  textures, recursive scene graph, authored collision mesh and 15 player
  spawns. `World` builds a Three.js `Octree` from that native collision mesh for
  exact ground, capsule and weapon ray tests. `_buildRookArena()` is retained
  only as inactive historical code and is never called.
  `_buildWinterGraveyard()` preserves the previous node-644 map for comparison.
- `src/world/World.js` — **map rotation**: `MAPS` is the registry (id, name,
  region, sky/fog, async `build(world)`), `world.loadMap(id)` swaps the arena
  and `nextMapId()` advances it; Game.js rotates in `_restart()`, i.e. when a
  match ends. Every map builds into its own root Group — the builders' hundreds
  of `this.scene.add()` calls are captured by pointing `this.scene` at that
  group for the build — so switching is detach + dispose + rebuild, and
  everything Game.js owns in the scene is untouched. Gated by
  `npm run test:maps`.
  **The rotation contains ONLY the official downloaded ev.io asset**
  (`public/maps/RookLit_0.evmap`, Daytime Rook from node 755, decoded by
  `EvMapLoader.js`) — one entry, so `_rotateMap()` returns early rather than
  tearing down and re-decoding 5.7MB to arrive back where it started. Adding a
  second downloaded map is one entry in `MAPS`; the async machinery exists for
  exactly that.
  The procedural recreations all still work and are all OUT of rotation:
  `_buildWinterGraveyard()` (node 644), `_buildEvioArena()`, `_buildRookArena()`
  (node 755), `_buildLegacyEvioArena()`, plus the mall/city/winter-town set.
- `src/player/` — `BlockBody.js` is the SHIPPING player/bot chassis: hard-surface
  armour plates authored in Blender (`tools/model_player.py`), emitted as the
  data module `heroParts.js` and assembled here into one SkinnedMesh per
  material on the game's own 20-bone skeleton. No runtime asset load — the
  generator writes JS, not a .glb. Regenerate with
  `python3 tools/model_player.py -- --js src/player/heroParts.js`.
  `Proportions.js` is the FIGURE: one source of truth for joint
  heights, bone lengths and the sole corners, built from adult anthropometry at
  the stature that matches `Player.js`'s 1.70m eye height (1.816m, 7.5 heads).
  The body was a 2.21m giant on 12%-of-height ankles until this existed, and the
  numbers were copied into five files. `HeroBody.js` builds the PRIMARY
  player/bot chassis: a few
  **SkinnedMesh**es on a real 19-bone skeleton, where a limb is ONE surface from
  hip to ankle that bends because its vertices are weighted between bones (the
  old parts-on-pivots body came apart at any bend past ~60°). Weights are
  derived from position along the limb, not painted and not guessed from bone
  proximity. `BodyGeometry.js` is the superellipse-loft + skinning core;
  `LowPolyModels.js` owns the palettes/materials and keeps the previous
  segmented body as `buildSegmentedCharacter()` for comparison. 14 draw calls a
  body instead of 178. See AGENTS.md 2g/2h/2i and `npm run test:mesh`.
  The armour is a **violet champion**: crested helm w/ dark visor + magenta
  optic, three stacked pauldron lames, sternum emblem, belt, hip skirt (side
  panels on the pelvis, front tassets on the THIGHS so they swing with a
  stride instead of being a fence the leg walks through), long black cape,
  gauntlets and chunky boots. Azure (`striker`) and graphite (`phantom`)
  variants use the same build.
  `HeroBody.js` (the lofted, graded-weight body) is still built and still gated
  — it is the technique for anything that has to CREASE at a joint, which rigid
  plates cannot do. Reach it via `buildLoftedCharacter()`.
  Historic note — the segmented body (the three cel-shaded cyborgs). Everything organic on it — torso, thighs, calves,
  feet, arms, hands, skull — is one **lofted superelliptical surface** per part
  (`|x/rx|^n + |z/rz|^n = 1`, n 2 = limb, 2.8 = ribcage, 3.2 = boot sole), and
  the armour is `plate()`d as curved shells that wrap the form underneath rather
  than boxes bolted over it. Buffers are cached by shape and SHARED between
  bodies — see AGENTS.md 2e/2f, and `npm run test:mesh`.
  `HumanSoldier.js` (rigged Mixamo Vanguard w/ procedural armor,
  worn-metal PBR detail textures, `setLocomotion()` speed-scaled anim + idle
  breathing), `PreviewCharacter.js` (also loads Blender `public/spartan.glb` for
  the menu preview), `skins.js` (default = white/silver spartan), `Player.js`.
  `Avatar.js` is the shared local/remote visible-state path: snapshot movement
  drives speed and strafe, automatic fire produces repeated recoil, death holds
  a short fall instead of popping out, and respawn triggers the same reform beat
  used by teleporting human bodies.
- `src/entities/Bot.js` + `BotCombat.js` — active arena-opponent behavior:
  sight acquisition with short last-seen memory, close/orbit/retreat/rush
  steering, imperfect burst fire, jump/lift/teleporter traversal and
  collision-stall recovery. `BotManager` targets the nearest living opponent
  across the player and other bots, so deathmatch is a real free-for-all rather
  than seven bots focusing the user. `npm run test:bots` locks the tactical
  spacing, burst cadence and opponent-selection contract.
- `src/weapons/` — WeaponSystem, weapon defs, skins, `WeaponModels.js` (GLB
  loader + procedural builders). The arsenal's models are **Blender-authored
  GLBs** scripted via `bpy` in `tools/` (`gunlib.py` helpers — box/cyl/row +
  `profile()` traced-silhouette extrusion + `hole_rect`/`hole_ellipse`
  boolean punches + strict BVH connectivity audit on every export;
  `model_arsenal.py` → `public/weapons_authored.glb` with real-firearm
  silhouettes — Uzi/M1887/M4/M16/AK/M240/RPG-7/AWM/DEagle/G3/P90/SR-25/
  870/M79/knife/sword; `model_sidearm.py` → `public/sidearm.glb` Glock).
  Loader precedence: per-id override GLB → authored atlas → legacy
  weapons.glb → procedural (plasmarifle/concussion/ghammer stay procedural).
  Authored guns render ILLUSTRATED: MeshToonMaterial cel shading + an
  inverted-hull dark outline per mesh (matches the reference-chart art).
  Furniture = `body` role (orange default via def color), glow = `energy`
  role (def energyColor). Skins are MAIN-weapon only (Armory.canSkin:
  m4/magnum/battlerifle/energyshotgun/plasmarifle); the Night Market sells
  armor + gun skins only (no sword skins). Viewmodel mount is scaled 0.74.
  The first-person arm palette is resolved from the equipped character model:
  cyborg plate/frame/joint/glow colours come from `LowPolyModels.js`, legacy
  armour comes from `HumanSoldier.js`, and cosmetic armour overrides both.
- `src/ui/` — `MainMenu.js` (nav + all panels: loadout/inventory, profile,
  shop, battlepass, settings, fireteam, private, achievements), `HUD.js`
  (edge-aligned ev.io-like combat layout: slim green/cyan/amber bars and small
  ability keys at lower-left, compact weapon chips, standalone lower-right
  ammo, top-center timer/reload progress, coin popups, and central
  elimination/headshot confirmation), `Nameplates.js`,
  `DamageNumbers.js`, `WeaponThumbnails.js` (renders skinned guns to dataURLs).
- `public/*.glb` — soldier, player, spartan, weapons, zombie models.
- `src/core/NetClient.js` — optional WebSocket client for the 24/7 match
  relay; `server/` — the standalone relay itself (deployed separately, see
  above).

## Design system (CSS in `src/style.css`)
- ev.io-inspired: dark translucent glass panels, **cyan** accent (`--kx-cyan`),
  consistent section labels w/ accent bars. Big appended sections at the end of
  the file: "PAGE UI OVERHAUL", "IN-GAME HUD OVERHAUL", inventory cards,
  scoreboard, achievements, map loading screen, inventory v2 toolbar. The final
  "CLEAN EV.IO-LIKE GAMEPLAY HUD" layer deliberately removes glass-card chrome
  from the in-match readouts and is the authoritative gameplay-HUD cascade.

## Done this project (high level)
- Full menu/page restyle; clean edge-aligned in-game HUD; active free-for-all
  arena bots; floating damage numbers;
  ev.io post-match leaderboard; PROFILE nav dropdown (Inventory/Career/Achievements);
  Achievements page; hold-TAB in-game scoreboard; survival wave HUD + wave bonus
  + best time; **1:1 inventory** (per-gun tabs, no main/map split);
  vertical weapon wheel; enemy nameplates; coin-earn popups; Winter-Bishop
  map + map loading screen; Esc opens the full nav GUI mid-match;
  fixed false-positive mobile controls on desktop (pointer-lock now works);
  **Inventory v2** = real skinned-weapon renders + search + rarity filter chips;
  gun-skin catalog doubled to 30 (10 common / 10 epic / 6 legendary / 4 mythic).

## Phase 3 — deterministic movement (evidence layer)
- `src/sim/MoveSim.js` — pure fixed-20Hz movement/collision core (no THREE/DOM;
  state quantized 1e-6/tick → bit-identical replays). Mirrors the legacy
  controller's constants + World's platform/collider semantics, and seals the
  legacy gaps: flat-floor stability + support NORMALS (snap-down hysteresis),
  ceiling clamp, crouch-aware collision height + no-stand-under-blocked-headroom,
  kill-plane recovery to last safe support, deterministic teleport ray.
- `src/sim/fixtures.js` — 11 sealed fixtures (flat-floor, wall, corner, ramp,
  step, ceiling, crouch tunnel, slide, mobility, teleport, recovery), shared by
  runner+lab.
- `src/sim/fixtures.js` — 10 sealed fixtures (flat-floor, wall, corner, ramp,
  step, ceiling, crouch tunnel, slide, teleport, recovery), shared by runner+lab.
- `npm run test:mesh` (tools/mesh_check.mjs) — the skinned body still carries
  the rig metrics the animation reads off it (bone heights, bone lengths, sole
  plane, head-hit height), for all three chassis, PLUS the skinning: no
  unweighted vertex, no weight crossing between the legs, enough loops through
  a joint, and a knee that keeps its volume through a 92° bend.
- `npm run test:move` (tools/movesim_fixtures.mjs) — invariants, double-run
  bit-identity, frame-schedule parity (two seeded irregular frame schedules →
  identical 20Hz hashes), golden hashes in tests/movesim.golden.json, movement
  tapes in tests/tapes/. `--write` regenerates goldens.
- `movement-lab.html` (vite dev page) — graybox lab: live WASD drive of the sim
  + deterministic fixture-tape playback; browser hashes match the Node runner
  exactly (cross-environment determinism).
- `src/sim/MoveBridge.js` — feature-flagged rendered bridge (`?movesim=1` or
  localStorage kx_movesim=1): sim owns movement at 20Hz with interpolation;
  the legacy Player controller remains the DEFAULT until G2 sign-off.

## Phase 4/5 — authoritative multiplayer (evidence layer)
- `server/authroom.mjs` — fixed-20Hz authoritative room. Runs the SAME
  MoveSim the client predicts with; owns ALL truth: validated movement (never
  trusts client transforms — only tri-state intent), health/shield/damage/
  death, 3s respawn, score, kill feed, and lag-compensated hitscan (rewinds
  targets to the shooter's acked tick over 1s of position history). Sequenced
  input queue per player with catch-up cap.
- `server/authserver.mjs` — WS host with the connection protections:
  origin allow-list (ALLOWED_ORIGINS), JSON schema + 2KB size cap, token-bucket
  rate limit, monotonic-seq replay guard, ping/pong heartbeat + dead-socket
  reap, snapshot backpressure shedding, duplicate-session reject. `npm run auth`
  (server/) → :8788.
- `src/net/AuthClient.js` — client prediction/replay + remote interpolation:
  predicts locally each tick, on every snapshot snaps to server truth at
  ackTick and replays unacked inputs; renders remotes 2 ticks in the past
  lerped between snapshots.
- `server/authnet_test.mjs` (`npm run test:auth` in server/) — 33 authority/
  abuse proofs: forged transforms ignored, replay/reorder guarded, spam-fire
  rate-limited, impossible ammo blocked, forged kill/damage ignored, duplicate
  fire/session dropped, reconnect, 50%-loss+jitter survival. All pass.
- `authnet-lab.html` — browser lab (`?ws=…&name=…&auto=circle|forward`); the
  G3 capture ran TWO independent browser contexts in one authoritative room,
  each predicting locally and seeing the other via snapshots.
- `src/net/AuthNetBridge.js` — folds the authoritative path INTO the live game
  behind a flag (`?authnet=1` / `?authnet=ws://host:port` / localStorage
  kx_authnet=1). When on, the server owns movement+combat: the local player is
  client-predicted (drives camera + position), remotes render as interpolated
  avatars with nameplates, fire routes to the server, and hit/kill events flow
  to the HUD. OFF by default → the local ServerSim path is completely
  untouched. Verified: build clean, flag-detection unit-tested, and it wraps
  the same AuthClient proven in the two-browser G3 capture. (Full in-game
  headless screenshot is blocked by the sandbox's swiftshader/vite instability,
  not the code.)

## Phase 6 — original arena graybox
- `src/sim/arenas.js` — `INKFALL` (Inkfall Foundry graybox): analytic arena
  (Crucible deck + N/S ramps, E/W foundry walls, Slag Duct crouch tunnel,
  Gantry steps, Ink Crate cover) with spawns, callouts, and pickups. Shared by
  the auth room and the labs; topology tunable here before beauty work.
- `tools/arena_metrics.mjs` (`npm run arena:metrics`) — bot-driven route times,
  occupancy heatmaps, kills/reachability at 2/4/8p. Confirms no dead zones.

## Phase 8 — accessibility (evidence layer)
- Settings ACCESSIBILITY section (index.html) → GameSettings keys, applied live
  via `<html>` data-attrs + CSS vars in `MainMenu._previewAccessibility`
  (style.css PHASE 8 block): crosshair shape (cross/dot/circle) + colour,
  colour-blind SVG filters (protan/deutan/tritan over #game-canvas + #hud),
  HUD scale, reduce-motion (CSS + 3D: no bob, recoil-cam suppressed in
  Player.js), reduce-flashes, high-contrast, hit-sound toggle, focus rings.

## Phase 9 — stress/soak (evidence layer)
- `tools/stress_soak.mjs` (`npm run stress:soak`) — tick-budget matrix at
  8/16/32/64p + a soak run. The auth sim maxes ~0.7ms/tick at 64p (50ms
  budget), 0 invalid states, no leak; network bandwidth is the real limit.

## Phase 10 — server-authoritative abilities
- `server/authroom.mjs` ABILITIES: flash / smoke / impulse throwables. Server
  owns charges (2 each), cooldown, the aim-ray detonation point, and every
  effect: flash = LOS-gated blind, smoke = a vision volume that blocks hitscan
  (`_raySmoked`), impulse = radial knockback with per-component clamp
  (IMPULSE_MAX). `onAbility` is replay-guarded; resolved in update() like fire.
  Snapshots carry blind/abilities/smokes; `AuthClient.sendAbility`.
- `server/authnet_test.mjs` now 21 proofs (was 15): +unknown-kind ignored,
  spam capped by charges/cooldown, smoke volume created, duplicate seq ignored,
  impulse velocity clamped (no infinite launch).

## Phase 11 — measured animation quality pass
- `src/player/HumanLocomotion.js` + `HumanSoldier.js` now use the shipped
  `soldier.glb` as the measurement source of truth. Walk/run crossfades map
  between measured bilateral foot-contact origins, resolved displacement drives
  cadence (so holding sprint into a wall stops the legs), backpedal reverses the
  gait, and travel direction turns the lower body while the chest keeps the aim
  line. A measured thigh-only stride warp replaces cartoon-fast sprint playback:
  11.06 m/s of foot travel for the 10.85 m/s sprint target (1.9% high), with no
  added toe penetration. Do not restore the old Hips-track normalization; the
  source clips are already floor-aligned (0.77 cm total floor spread).
- Human actions now have visible, smoothed silhouettes for crouch, slide, jump
  push/apex/landing, reload, swap, grenade throw, melee, recoil, damage,
  teleport, and death/respawn recovery. One-shot timing uses the owning gameplay
  clock, and smoothing is exponential so 30/60/144 Hz converge.
- `src/player/HumanRifleCarry.js` owns the firearm in body space and solves both
  real Mixamo arms onto the grip/receiver every frame. Patrol, aim, locomotion,
  sprint, reload, and vertical aim were swept across all four production armor
  scales against the actual rig: both wrist errors are 0.00 cm across 48 states,
  with every target kept inside the measured arm reach. The reload rolls the
  magazine toward the support shoulder.
- `src/weapons/WeaponSystem.js` keeps both first-person gloves visible, uses
  aspect-aware framing and a farther near-plane-safe mount, suppresses duplicate
  reload motion, sharply reduces ADS bob/sway, and scales landing response from
  retained fall speed. The gate covers 20 weapons × 12 FOV/aspect combinations
  plus 30/60/144 Hz blend and recoil parity, and guards gun-to-melee pose reset.
- Local TPS, remote avatars, bots, and authoritative snapshots now carry the
  same resolved speed/direction, ground/vertical, sprint/slide, aim/action, and
  weapon state. Zombie death crumple is absolute rather than frame-accumulated,
  and player respawn clears every transient pose/controller state.
- Browser comparison against live ev.io confirmed the same readability targets:
  a compact low-ready carry, tucked sprint silhouette, quick shouldered aim, and
  restrained first-person weapon motion. KYX intentionally keeps both owner
  gloves visible because that is an explicit owner requirement.
- New evidence gates: `test:human-carry`, `test:viewmodel`,
  `test:zombie-death`, and `test:player-respawn`; `test:human-motion` now parses
  the real GLB at 720 phases and proves floor contact, phase continuity, stride
  delivery, and no penetration regression. `test:actions` covers the human
  action curves. All are included in `npm run certify`.
- Security check for this pass: full root and server `npm audit` both report
  zero known vulnerabilities; the diff adds no dynamic HTML/eval, credentials,
  or storage. New presentation inputs are boolean-sanitized or weapon-
  allowlisted, while sprint presentation is derived from authoritative resolved
  velocity rather than client intent. An unset
  `ALLOWED_ORIGINS` accepts loopback browsers only instead of silently allowing
  every site. All 33 authority/abuse proofs pass. This is engineering evidence
  only; the release certificate still correctly leaves G-legal for a human
  security/privacy/legal review.

## Known constraints / notes
- Can't generate/sculpt realistic character meshes from an image; the player
  model is a themed rigged Vanguard + a procedural Blender `spartan.glb`. For a
  truly realistic character, drop in an authored/licensed `.glb` and wire it via
  `PreviewCharacter.js`.
- Keep chat sessions from getting huge (lots of embedded video/screenshots) — it
  can trip a 32MB request limit. Prefer short clips + fresh sessions.
</content>
