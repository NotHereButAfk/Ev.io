# ev.io — what we actually know

This project takes inspiration from **ev.io**, a browser arena FPS. Features
here get justified with "that's how ev.io does it" fairly often, so this file
exists to record how much of that is actually knowledge and how much is
guesswork.

**Why it matters.** Access differs by tool and session. Shell HTTPS has been
restricted in some environments, but on 2026-07-27 the Codex in-app browser
reached official ev.io map pages and third-party gameplay galleries/videos.
Those sources are now recorded below. They verify visible art direction, not
movement constants, damage values, exact dimensions, or current live balance.
The game has also been live and patched since ~2021, so undated footage may
show an older build.

The repo owner can play the live game and supplied a gameplay-observation
session. **When current owner observation and older web media disagree, use the
owner's observation.**

---

## Confidence levels

Everything below is tagged:

- **[known]** — widely and consistently documented; safe to rely on
- **[verified]** — directly inspected in a linked source on the date recorded
- **[likely]** — probably true, but not verified against the live game
- **[unverified]** — plausible recollection; do NOT build numbers on this
- **[ours]** — a decision this project made, not something ev.io does

---

## The game in outline

- **[known]** Browser FPS, Unity WebGL, free to play, out around 2021. Runs in
  a tab with no install.
- **[known]** Arena shooter with a Halo lineage — this repo's own tagline
  ("The Halo of Web3") reflects the same framing.
- **[known]** Recharging energy shield layered over health. Both come back
  after a break in damage.
- **[known]** Headshots matter; time-to-kill is fast.
- **[known]** Cosmetics tied to Solana; a shop, ranked play, an in-game
  currency.
- **[likely]** Vertical maps with grav lifts / jump pads, and a short-range
  dash or blink on a key.
- **[likely]** A sniper rifle is a signature weapon.

## Verified visual reference pass — 2026-07-27

Directly inspected sources:

- **[verified]** Official ev.io map pages and their large map images:
  [Jinx](https://ev.io/node/752), [Rook](https://ev.io/node/755),
  [Depot](https://ev.io/node/634), [Vestige](https://ev.io/node/661), and
  [Momentum](https://ev.io/node/682).
- **[verified]** The owner selected
  [Winter-Graveyard](https://ev.io/node/644) as the active-map target. Its
  official large image and `XmasGraveyard_1.evmap` download were inspected
  directly. The page identifies the Snow environment effect and Arctic
  background track.
- **[verified]** The owner subsequently supplied
  [Daytime Rook](https://ev.io/node/755) as the new active-map target. Its
  official `RookLitJPEG_0.jpg` large image and `RookLit_0.evmap` download were
  inspected directly. On 2026-07-28 the owner explicitly rejected a recreation
  and requested that the downloaded map itself be used. The complete 5,689,585
  byte version-3 asset is now shipped in `public/maps/`; its runtime decoder was
  implemented from the public ev.io 1.7.0 client and consumes the file with no
  unread bytes. The page identifies Dust as its environment effect and lists
  CTF, Deathmatch, Instagib and Team Deathmatch.
- **[verified]** The [Browser Craft ev.io page](https://browsercraft.com/game/ev-dot-io)
  exposes six 640x360 gameplay stills and embeds three YouTube gameplay videos
  (`HwdzCEbgxEQ`, `65nU5yZxavw`, `hMx-QmsWV7o`).
- **[verified]** A fourth embedded gameplay clip was inspected from the
  [Play123 ev.io page](https://www.jeux123.fr/jeu/ev-io)
  (`79pVgYAvpd8`).
- **[owner-observed]** The owner supplied live gameplay for Codex to watch.
  The arena used for this project's layout pass was identified as Jinx, then
  cross-checked against the official Jinx image above.

Visible motifs that repeat across those sources:

- **[verified]** Chunky modular walls and towers frame open sky/voids rather
  than forming one continuous indoor box.
- **[verified]** Narrow cyan, red, gold, or orange route accents sit on edges,
  seams, and wall slits; most structural surfaces stay matte.
- **[verified]** Maps mix broad combat courts with compressed side canyons,
  elevated bridges/ramps, and framed long vistas.
- **[verified]** Large focal props—circular platforms, statues/plinths, halo
  gates, or portal rings—make a route recognizable at a glance.
- **[verified]** Oversized environmental signs/logos and asymmetric accent
  zones help orient players.
- **[verified]** Material families include pale/white stone, warm tan or orange
  segmented panels, dark technical bases, and occasional saturated red floor
  channels.

Visible animation and combat-feedback cues:

- **[verified]** Gameplay stills consistently keep status/ability controls at
  the lower left, ammunition at the lower right, and the match timer at the top
  centre. These elements are mostly edge-aligned text, bars, and small key
  chips rather than a stack of large bordered panels.
- **[verified]** The first-person weapon stays low-right with restrained
  movement sway and small, responsive recoil rather than large constant bob.
- **[verified]** Reloading is a readable state: the weapon lowers out of its
  ready pose while a top-center progress bar advances, then returns to aim.
- **[verified]** Hits show floating damage values. Eliminations add a central
  skull/kill confirmation and a separate score value; headshots receive a
  stronger central callout.
- **[verified]** Kill-feed entries remain at the upper left while the central
  confirmation supplies the immediate action/reward beat.
- **[verified]** Respawn footage visibly announces a short invincibility period.
  This is evidence for a gameplay feature, not enough evidence to invent its
  timing or add it without server-authoritative support.

These cues were checked frame-by-frame in
[`65nU5yZxavw`](https://www.youtube.com/watch?v=65nU5yZxavw),
[`HwdzCEbgxEQ`](https://www.youtube.com/watch?v=HwdzCEbgxEQ), and
[`hMx-QmsWV7o`](https://www.youtube.com/watch?v=hMx-QmsWV7o) on 2026-07-27.

**[ours, implemented 2026-07-27]** The game now answers those visible cues with
a three-beat rigid-viewmodel reload, timed reload bar, viewmodel landing impulse,
central elimination/headshot score confirmation, shared remote fire recoil,
short visual-only death fall, and teleport-style respawn reform. Mechanics and
server timing remain unchanged.

**[ours, implemented 2026-07-29]** The gameplay HUD now follows that visible
edge hierarchy: slim HP/shield/energy bars and compact grenade/blink keys at
lower-left, small weapon-switch chips at bottom-centre, standalone ammunition
at lower-right, a quiet top-centre timer, and a single-line match summary. This
is a visual adaptation to KYX.IO's existing information and controls, not a
claim of pixel-identical ev.io UI.

Implementation boundary: these cues justify this project's visual treatment.
They do **not** verify exact ev.io layouts, scale, collision, spawn locations,
or gameplay constants.

## What we do NOT know

Do not invent values for any of these. If a change depends on one, ask the
owner — they can check in a minute what an agent cannot check at all.

- Movement constants: acceleration, friction, air control, whether momentum
  carries between jumps
- Whether it has Quake-style strafe-jump acceleration **(previously asserted in
  this project as fact — it was not verified, and should not have been)**
- Dash distance, cooldown, charges
- Weapon damage, fire rates, magazine sizes, TTK
- Map dimensions, layouts, sightline lengths
- Movement speed in m/s, jump height, gravity

## Corrections already made

Recording these so the same mistake isn't repeated:

- **"ev.io is a movement shooter where good players air-strafe to multiples of
  base speed."** Asserted confidently in Jul 2026 and used to justify a proposed
  movement rework. **Unsupported.** The underlying observation about *our*
  controller was fine and stands on its own — `velocity.x = desired.x` with a
  hard 9.6 m/s cap means no momentum and no skill expression in movement — but
  it should never have been dressed up as a fact about ev.io.

- **`src/world/World.js` arena, described in CLAUDE.md as reconstructed from a
  gameplay capture (`codex/evio-arena-recreation`).** **Settled 2026-07-27:**
  the owner supplied gameplay for Codex to observe; the layout was identified
  as Jinx and cross-checked against the official Jinx image. It remains a
  recreation adapted to this game's topology, not a measurement-perfect copy.

- **Active map target.** **Updated 2026-07-28:** Daytime Rook now loads the
  official `RookLit_0.evmap` directly. Do not reactivate the screenshot-led
  `_buildRookArena()` approximation. `EvMapLoader.js` owns the native format,
  materials, scene graph, spawn orientation and collision extraction.
  Winter-Graveyard remains as an inactive historical builder.

---

## For the owner to fill in

If you want agents to match ev.io more closely, these are the answers that
would actually change what gets built. One line each is plenty.

- [ ] Does speed build up as you chain jumps, or is it capped like ours?
- [ ] Roughly how long does a 1v1 last at mid range?
- [ ] Dash: how far, how often, how many charges?
- [ ] Is the shield a separate bar, and roughly how long until it recharges?
- [ ] How big is the viewmodel on screen compared to ours?
- [ ] Anything about it that feels good and obviously isn't in our game yet?

A short screen recording answers most of this faster than writing it out.
Agents can also compare supplied frames against the linked visual sources
above.

---

## The rule

**Don't state ev.io behaviour as fact in code comments, commit messages or docs
unless it's tagged [known]/[verified] here or the owner told you.** Write "our
design choice" instead — visual evidence is not evidence for mechanics.
