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
- `src/weapons/` — WeaponSystem, weapon defs, skins, `WeaponModels.js` (GLB).
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

## Known constraints / notes
- Can't generate/sculpt realistic character meshes from an image; the player
  model is a themed rigged Vanguard + a procedural Blender `spartan.glb`. For a
  truly realistic character, drop in an authored/licensed `.glb` and wire it via
  `PreviewCharacter.js`.
- Keep chat sessions from getting huge (lots of embedded video/screenshots) — it
  can trip a 32MB request limit. Prefer short clips + fresh sessions.
</content>
