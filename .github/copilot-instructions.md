# Copilot instructions — KYX.IO

Read **[`AGENTS.md`](../AGENTS.md)** first. It is the canonical contract shared
by every agent working in this repo (Claude, Codex, Copilot), and it lists the
invariants that break silently — raycasting against the map, the walk-cycle
lean/bob contract, who owns the arm rig, facing conventions, and the rule that
what other players see must come from `src/player/Avatar.js`.

`CLAUDE.md` has the deeper project map: what the arena is, how the weapons are
authored in Blender, and the phase-by-phase history.

Before pushing: `npm run build`, `npm run test:move`, and
`cd server && npm run test:auth`. Rebase onto `origin/main` first — it is
shared and it moves. Never force-push it.
