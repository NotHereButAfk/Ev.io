// Inkfall Foundry — GRAYBOX (Phase 6 start). One shared, analytic arena
// definition consumed by the deterministic sim on BOTH sides of the wire:
// the authoritative server (server/authroom.mjs) and the browser labs.
// Routes are expressed with the same platform/box semantics the game world
// uses, so graybox topology can be tuned here before any beauty work.
//
// Layout (top-down, N = +z):
//   • Crucible — raised central deck (y 3.5) with N/S ramps, the power lane
//   • Foundry Walls — E/W cover walls forcing mid rotations
//   • Slag Duct — crouch tunnel shortcut into the NE quadrant
//   • Gantry — stepped platforms up the SW quadrant
//   • Ink Crates — corner cover blocks
// Spawns sit in the four corners; recovery is the sim's kill-plane restore.

export const INKFALL = {
  name: 'Inkfall Foundry (graybox)',
  half: 40,
  killY: -25,
  platforms: [
    // ramps meet the deck edge at y=3.5 (axis-z lerp: y0 at minZ)
    { minX: -3, maxX: 3, minZ: 6, maxZ: 20, y0: 3.5, y1: 0, axis: 'z' },      // North Ramp
    { minX: -3, maxX: 3, minZ: -20, maxZ: -6, y0: 0, y1: 3.5, axis: 'z' },    // South Ramp
    { minX: -8, maxX: 8, minZ: -6, maxZ: 6, y0: 3.5, y1: 3.5, axis: 'z' },    // Crucible Deck
    { minX: -14, maxX: -8, minZ: -10, maxZ: -4, y0: 0.3, y1: 0.3, axis: 'z' },// Gantry Step A
    { minX: -20, maxX: -14, minZ: -10, maxZ: -4, y0: 0.6, y1: 0.6, axis: 'z' }// Gantry Step B
  ],
  boxes: [
    { min: [-26, 0, -2], max: [-14, 3, 2] },     // West Foundry Wall
    { min: [14, 0, -2], max: [26, 3, 2] },       // East Foundry Wall
    { min: [8, 1.25, 8], max: [20, 4, 12] },     // Slag Duct (crouch tunnel)
    { min: [-12, 0, 12], max: [-8, 2.2, 16] },   // Ink Crates NW
    { min: [8, 0, -16], max: [12, 2.2, -12] },   // Ink Crates SE
  ],
  gravLifts: [],
  teleporters: [],
  spawns: [[-30, 0, -30], [30, 0, 30], [-30, 0, 30], [30, 0, -30]],
  callouts: [
    { name: 'Crucible', x: 0, z: 0 },
    { name: 'North Ramp', x: 0, z: 13 },
    { name: 'South Ramp', x: 0, z: -13 },
    { name: 'Slag Duct', x: 14, z: 10 },
    { name: 'Gantry', x: -14, z: -7 },
    { name: 'West Wall', x: -20, z: 0 },
    { name: 'East Wall', x: 20, z: 0 },
  ],
  pickups: [
    { type: 'health', x: 0, y: 3.5, z: 0 },      // contested on the Crucible
    { type: 'ammo', x: -17, y: 0.6, z: -7 },     // Gantry reward
  ],
};
