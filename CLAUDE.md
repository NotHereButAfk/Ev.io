# KYX.IO — project notes (for Claude / new sessions)

A Three.js browser FPS (an **ev.io**-style arena shooter), built with **Vite**.
Deployed to **Hostinger** (static site) via a GitHub Action on every push to `main`.

## How to run / build
- Dev: `npx vite --port 5999 --host`
- Build: `npm run build` → outputs to `dist/` (Vite `base: './'`, works from any web root)
- Headless screenshots for verification: Playwright + swiftshader; GLBs take
  ~30s to load. Log in via `#auth-guest-btn`, start a match via `#play-btn`.

## Deploy (Hostinger)
- `.github/workflows/deploy-hostinger.yml` builds + uploads `dist/` over **FTPS**
  (plain FTP times out on Hostinger). Needs repo secrets `FTP_SERVER`,
  `FTP_USERNAME`, `FTP_PASSWORD`; `server-dir: /public_html/`.
- Every push to `main` auto-deploys. (Old host was Netlify — abandoned; ran out
  of credits.)

## Working branch
- Develop on `claude/browser-game-weapons-wb22wp`; merge to `main` to deploy.

## Layout
- `src/core/Game.js` — main loop, state, match flow, HUD wiring, map-loading card.
- `src/world/World.js` — the map. Currently the **Winter-Bishop town**: textured
  building blocks in 3 rings, avenues/plaza, walkable snowy rooftops, ramps +
  rooftop bridges, grav-lifts, central pavilion, snow drifts, string lights.
  Collision via `colliders[]` (boxes) + `platforms[]` (walkable tops) +
  `groundHeightAt()`. Snowy overcast palette, no neon.
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
  **Inventory v2** = real skinned-weapon renders + search + rarity filter chips.

## Known constraints / notes
- Can't generate/sculpt realistic character meshes from an image; the player
  model is a themed rigged Vanguard + a procedural Blender `spartan.glb`. For a
  truly realistic character, drop in an authored/licensed `.glb` and wire it via
  `PreviewCharacter.js`.
- Keep chat sessions from getting huge (lots of embedded video/screenshots) — it
  can trip a 32MB request limit. Prefer short clips + fresh sessions.
</content>
