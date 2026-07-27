# Working on KYX.IO alongside other agents

Several agents work in this repo at once (Claude, Codex, Copilot — see the
`claude/*`, `codex/*`, `copilot/*` branches). This file is the shared contract.
It is the canonical one: `CLAUDE.md` and `.github/copilot-instructions.md`
point here rather than keeping their own copies, so it can't drift.

`README.md` is the human-facing overview of the game. `CLAUDE.md` has the deep
project map (what the map is, how the weapons are authored, phase history).
Read those for orientation. Read THIS for the rules that stop us breaking each
other's work.

`docs/REFERENCE-EVIO.md` records what we do and don't actually know about
ev.io, the reference game. **No agent here can reach it** — the proxy refuses
`ev.io:443` — so anything you "know" about it is untestable training data.
Don't state ev.io behaviour as fact unless that file marks it [known] or the
owner told you; say "our design choice" instead.

---

## Verify before you push

```
npm run build                 # must be clean
npm run test:move             # 10 movement fixtures, exact hashes
npm run test:gait             # walk cycle: foot planting in every direction, jump pose
npm run test:actions          # every action moves the body
cd server && npm run test:auth   # 25 authority/abuse proofs
```

There is no test runner for rendering or gameplay feel. The pattern used
instead is a **headless probe**: a throwaway `.html` that imports the real
modules, drives them, and writes numbers to `window.__r`, loaded through
Playwright against `npx vite --port 5994 --host 127.0.0.1 --strictPort`.
Chromium lives at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; it
needs `--use-gl=swiftshader --enable-webgl --no-sandbox`. Delete the probe
before committing. This is how foot planting, hand-to-grip error, bot hit
rates and weapon-vs-body penetration were all measured — if you change any of
those, measure them again rather than eyeballing a screenshot.

The full game **does** boot headlessly under swiftshader — verified. Load `/`,
`document.querySelector('#auth-guest-btn').click()`, then `#play-btn` (use a JS
`.click()`; Playwright's actionability check hangs on the canvas overlay). The
HUD comes up in ~10s. One gotcha: headless never grants pointer lock, so
`onLockChange(false)` fires and re-opens the pause nav over the match — hide
`#top-nav`, `#nav-side`, `#share-game`, `#social-icons`, `#center-play` and set
`game._menuOpen = false` after each interaction, or you're screenshotting the
menu instead of the game.

`window.__game` is the live Game instance, so you can teleport the player, set
`_camDist` for third person, or change renderer settings between screenshots.

---

## Invariants that break silently

Each of these has already cost real breakage. None is caught by a test.

**1. `world.colliders` entries may have `mesh: null`.**
45 of the mall's 57 do (trees, benches, kiosks, escalator volumes). Passing
them to `Raycaster.intersectObjects` throws — three.js does `object.layers`
with no null guard. This once made *every shot in the game* throw, silently,
because the exception unwound past `renderer.render`.
→ Use `world.raycastMeshes` (cached, filtered) **and** `world.raycastBoxHit(ray, far)`,
nearest wins. Never `colliders.map(c => c.mesh)`.

**2. `applyWalkCycle()` returns an ALREADY-EASED `lean`.**
Assign it (`mesh.rotation.x = gait.lean`). Do not ease it again. The returned
`bob` was solved for that exact lean; easing toward it separately drifts the
feet up to 5cm through the floor.

**2b. `applyWalkCycle()` needs to be told which way the body is TRAVELLING.**
Pass `dirF`/`dirR` — the velocity's components along the body's own forward
(−Z) and right (+X), normalised. Anything that always faces where it is going
(the bots) can omit them. A **player cannot**: they strafe and backpedal while
still facing their aim, and without this the legs run a forward stride while
the body slides sideways, so the feet travel with the body instead of planting
(measured slip 1.0 strafing, 1.5 backpedalling — the "animations are running
backwards" bug). Pass `grounded`/`vy` too, or a jump has no pose and the legs
just freeze in mid-air. `npm run test:gait` covers all of it.
→ Do NOT hand-tune the stride rate. It is derived from `groundPerStep()`, which
measures the ANKLE's travel across stance off the actual pose. Not the contact
point — that migrates heel→toe as the foot rolls, and a rolling foot is not a
sliding one.

**2c. If it is an ACTION, it has to animate.** Reload, weapon swap, grenade
throw, melee swing, slide and taking a hit all shipped at some point moving
nothing at all. Adding a new one means adding its pose, not just its effect.
→ Continuous state (crouching, sliding, airborne) is an option on
`applyWalkCycle`. One-shots with no clock of their own (throw, swap, flinch) go
through `triggerAction()` / `tickActions()` in `Actions.js`. One-shots that DO
have a clock somewhere else — a reload runs off the weapon's `reloadTimer`, a
melee strike off its `swingPhase` — pass that progress straight through; do not
start a second timer, it will drift out of step with the thing it depicts.
`npm run test:actions` fails on any action whose pose is identical to not doing
it, which is the actual failure mode: silence, not a wrong number.

**3. `applyRifleCarry()` owns both arms *and* the weapon transform** — and
`applyMeleeCarry()` owns them for a blade.
Don't pose `armL/armR/elbowL/elbowR` anywhere else for a gun-carrying body —
the hands are IK'd onto the grip and handguard every frame and will slide off.
Anything that should move the rifle *without* changing the grip (breathing,
stride, recoil, look-pitch) goes through the `swing` option, which is a
common-mode shoulder rotation the arms follow for free.
A blade has no IK, so `applyMeleeCarry()` derives the weapon's position FROM
the arm angles rather than keying it alongside them. Key both separately and
you get exactly what the first attempt at the swing did: the sword tracking a
perfectly good arc a forearm's length away from the arm swinging it.

**4. Facing conventions.** Low-poly bodies are modelled facing **−Z**; game
forward is **+Z** → add `π` to their yaw. A weapon's muzzle is its own local
−Z, so a held weapon's `rotation.y` is **0**, not π. Character root meshes use
`rotation.order = 'YXZ'` so lean and death-topple happen about the body's axes,
not the world's.

**5. Bots are passive by design.** `PASSIVE_UNTIL_PROVOKED = true` in
`Bot.js` — they ignore the player until shot, and their aim is deliberately
bad. This was changed once and reverted at the owner's request. `AIM_ERR_BASE`
/ `AIM_ERR_PER_M` are the difficulty dial; hit probability goes as the inverse
square of them.

**6. What other players see comes from `src/player/Avatar.js`.**
The local third-person body and every remote player must render through the
same animation calls, or your own view of yourself disagrees with everyone
else's. If you add a visible state (a new ability, a stance), add it to
`Avatar.update()`'s state struct *and* publish it in the server snapshot
(`server/authroom.mjs`) — otherwise remotes can't show it. `pitch` and
`firing` were missing for exactly this reason.

---

## Collision hotspots

`src/core/Game.js`, `src/ui/HUD.js` and `index.html` are touched by nearly
every feature. Two agents landed edits three lines apart in `_onPlayerDamaged`
this week. Before starting on those, `git fetch origin main` and look at what
moved in the last hour.

Rough ownership by area, to reduce overlap rather than to forbid anything:

| area | files |
|---|---|
| characters, animation, rigs | `src/player/*`, `src/entities/Bot.js` |
| weapons, ballistics | `src/weapons/*` |
| map, collision | `src/world/World.js` |
| netcode | `src/net/*`, `server/*` |
| HUD, menus, styling | `src/ui/*`, `index.html`, `src/style.css` |
| match flow, modes, scoring | `src/core/*` |

---

## In flight — claim your lane here

Keep this short and current. Delete your row when it lands.

| who | lane | status |
|---|---|---|
| claude | movement model — accel/friction, air-strafe, double jump, dash (`src/player/Player.js`, `src/sim/MoveSim.js`) | not started, behind a flag |
| codex | post-match performance screen | landed (3627f7c) |

### Open, and specced for whoever takes it

**Movement feedback UI** — pairs with the movement model above, and extends the
post-match work that just landed. Owner: whoever gets there; the seam is clean
because the model only *produces* state and the UI only *reads* it.

The movement change will expose, on `player`:

```js
player.speed          // number, m/s, horizontal
player.topSpeed       // number, best this life
player.dashCharges    // int remaining
player.dashCooldown   // 0..1, 1 = ready
```

Wanted, all in `src/ui/*` + `index.html` + `src/style.css`:
- a speed readout that only appears above base walk speed, so building
  momentum is visible and therefore learnable
- dash charges + cooldown on the HUD
- `topSpeed` as a post-match stat next to accuracy in the existing tabs

None of that needs the model finished — the four fields can be stubbed on
`player` today and wired up when it lands.

## Git

- Work on your own `<agent>/<topic>` branch.
- **Rebase onto `origin/main` before pushing.** `main` is shared and moves.
- **Never force-push `main`.** If your push is rejected, rebase and retry —
  a force would erase whichever agent got there first.
- Pushing to `main` triggers `.github/workflows/deploy-vps.yml` (build +
  rsync to the live host). Treat it as a deploy, not a save.
