# KYX.IO — project notes (for Claude / new sessions)

A Three.js browser FPS (an **ev.io**-style arena shooter), built with **Vite**.
Deployed to **Hostinger** (static site) via a GitHub Action on every push to `main`.

## How to run / build
- Dev: `npx vite --port 5999 --host`
- Build: `npm run build` → outputs to `dist/` (Vite `base: './'`, works from any web root)
- Headless screenshots for verification: Playwright + swiftshader; GLBs take
  ~30s to load. Log in via `#auth-guest-btn`, start a match via `#play-btn`.

## Deploy (VPS — kyrx.live)
- Live site: **kyrx.live**, hosted on a **VPS** (as of Jul 2026; supersedes the
  old kyx.io Hostinger shared hosting, which superseded Netlify — Netlify PR
  previews still post bot comments; ignore them).
- `.github/workflows/deploy-vps.yml` builds and **rsyncs `dist/` over SSH** on
  every push to `main`. Repo secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
  (private key), `VPS_PATH` (web root), optional `VPS_PORT`.
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

## Layout
- `src/core/Game.js` — main loop, state, match flow, HUD wiring, map-loading card.
- `src/world/World.js` — the map. Currently a **REAL SHOPPING MALL**
  (ARENA_HALF=62): a bright, **daylit** two-level retail gallery modelled on a
  real mall photo. Cream stone-tile floor (`_buildGround`, `MeshPhysicalMaterial`
  clearcoat + faint grout grid); pale-plaster outer shell (`_buildArenaWalls`);
  daylight lighting (`_buildLighting`: strong warm hemisphere + near-vertical
  "sun through the roof" key). The hero feature is a **vaulted glass skylight
  roof** (`_buildGlassRoof`) — a barrel vault of emissive translucent glass on
  white steel arch ribs + purlins, arcing over the whole atrium (decorative, no
  colliders). `_buildMall()` builds the interior: four sides of **warm-lit glass
  storefronts** (bright emissive shop interiors + clear glass panes + red accents
  + illuminated lightbox signs + mannequin displays, 2 storeys, white pilasters);
  a walkable **mezzanine** (`platforms[]`) around a central **light-well** with
  clear glass + steel railings (`_mallRailing`), white soffit ceilings + recessed
  downlights; four **escalators** (`_rampBox`, dark steel treads + glass
  balustrades, rising ±24→±34 to meet the deck through the railing gaps) and four
  **glass scenic elevators** (`_gravLift`, reskinned — clear glass shaft + lit
  cabin, still launches you up) link the levels; a central **tiered stone
  fountain** is the landmark/cover; **leafy ficus trees** in stone pots + bright
  **retail kiosks** (walkable) are the concourse cover. Deep detail pass: every
  shop has a **named illuminated lightbox sign** (canvas `makeStoreSignTexture`,
  12 store brands × 3 sign styles), **stocked display windows** (shelves +
  product boxes + mannequins behind glass, sealed by invisible display
  colliders), and one **open entrance alcove per side** (welcome mat + shrubs —
  a shallow cover niche); décor = floor **medallion** rings, wood **benches**,
  trash bins, a **café terrace** (tables/stools/red umbrellas), **MALL MAP**
  directory boards, 16 hanging **promo banners** (`makeBannerTexture`: SALE /
  NEW SEASON / KYX GALLERIA), mezzanine railing **hedge planters**, and warm
  track **spotlights** on the roof's dark clerestory fascia. Collision
  via `colliders[]` (boxes) + `platforms[]` + `gravLifts[]` + `groundHeightAt()`.
  (The old `_buildGlassField()`/`_glassPillar()`, `_buildArena()`,
  `_buildMonument()`, `_buildWinterTown()`, `_buildOrbitalRing()` remain defined
  but unused.)
- `src/player/` — `HumanSoldier.js` (rigged Mixamo Vanguard w/ procedural armor,
  worn-metal PBR detail textures, `setLocomotion()` speed-scaled anim + idle
  breathing), `PreviewCharacter.js` (also loads Blender `public/spartan.glb` for
  the menu preview), `skins.js` (default = white/silver spartan), `Player.js`.
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
- `src/ui/` — `MainMenu.js` (nav + all panels: loadout/inventory, profile,
  shop, battlepass, settings, fireteam, private, achievements), `HUD.js`
  (green/cyan/amber bars, coin popups, weapon wheel), `Nameplates.js`,
  `DamageNumbers.js`, `WeaponThumbnails.js` (renders skinned guns to dataURLs).
- `public/*.glb` — soldier, player, spartan, weapons, zombie models.
- `src/core/NetClient.js` — optional WebSocket client for the 24/7 match
  relay; `server/` — the standalone relay itself (deployed separately, see
  above).

## Design system (CSS in `src/style.css`)
- ev.io-inspired: dark translucent glass panels, **cyan** accent (`--kx-cyan`),
  consistent section labels w/ accent bars. Big appended sections at the end of
  the file: "PAGE UI OVERHAUL", "IN-GAME HUD OVERHAUL", inventory cards,
  scoreboard, achievements, map loading screen, inventory v2 toolbar.

## Done this project (high level)
- Full menu/page restyle; in-game HUD restyle; floating damage numbers;
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
- `src/sim/fixtures.js` — 10 sealed fixtures (flat-floor, wall, corner, ramp,
  step, ceiling, crouch tunnel, slide, teleport, recovery), shared by runner+lab.
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
- `server/authnet_test.mjs` (`npm run test:auth` in server/) — 15 authority/
  abuse proofs: forged transforms ignored, replay/reorder guarded, spam-fire
  rate-limited, impossible ammo blocked, forged kill/damage ignored, duplicate
  fire/session dropped, reconnect, 50%-loss+jitter survival. All pass.
- `authnet-lab.html` — browser lab (`?ws=…&name=…&auto=circle|forward`); the
  G3 capture ran TWO independent browser contexts in one authoritative room,
  each predicting locally and seeing the other via snapshots.
- Not yet wired into the live Game.js loop — the authoritative path is proven
  standalone; folding it into the shipping game (replacing local ServerSim) is
  the integration step gated behind G3 sign-off.

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

## Known constraints / notes
- Can't generate/sculpt realistic character meshes from an image; the player
  model is a themed rigged Vanguard + a procedural Blender `spartan.glb`. For a
  truly realistic character, drop in an authored/licensed `.glb` and wire it via
  `PreviewCharacter.js`.
- Keep chat sessions from getting huge (lots of embedded video/screenshots) — it
  can trip a 32MB request limit. Prefer short clips + fresh sessions.
</content>
