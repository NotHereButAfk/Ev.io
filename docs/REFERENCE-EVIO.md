# ev.io — what we actually know

This project takes inspiration from **ev.io**, a browser arena FPS. Features
here get justified with "that's how ev.io does it" fairly often, so this file
exists to record how much of that is actually knowledge and how much is
guesswork.

**Why it matters.** No agent working in this repo can reach ev.io — outbound
HTTPS is restricted to a package-registry allowlist, and `ev.io:443` is refused
at the proxy. Anything an agent "knows" about it comes from training data:
second-hand, undated, and impossible to check from inside the sandbox. The game
has also been live and patched since ~2021, so even accurate recollections may
describe a version that no longer exists.

The repo owner can play it. Agents cannot. **When those two disagree, the owner
is right.**

---

## Confidence levels

Everything below is tagged:

- **[known]** — widely and consistently documented; safe to rely on
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

- **`src/world/World.js` arena, described in CLAUDE.md as "reconstructed from a
  gameplay capture" (`codex/evio-arena-recreation`).** If a capture was supplied
  by the owner, that's accurate. If not, no agent in this repo could have
  observed one, and the wording should be softened to "ev.io-inspired original".
  **Unconfirmed either way — worth settling, because future agents will read it
  as sourced.** The map is good on its own merits regardless: measured frame
  clipping dropped from 16.3% to 0.1% versus the mall it replaced, enemies read
  clearly against it, and it introduces no runtime errors.

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

A short screen recording answers most of this faster than writing it out, and
an agent can read frames from a file even though it can't reach the site.

---

## The rule

**Don't state ev.io behaviour as fact in code comments, commit messages or docs
unless it's tagged [known] here or the owner told you.** Write "our design
choice" instead — it's honest, and it ages better than a claim nobody can check.
