// Shared stamina contract for the legacy controller, deterministic prediction,
// and authoritative server. Sprinting stops at the existing 2-point reserve,
// so the original usable duration was (100 - 2) / 28 = 3.5s. The
// player now receives exactly seven additional seconds without changing the
// familiar 0-100 HUD scale or regeneration behavior.
export const STAMINA_MAX = 100;
export const PLAYER_SPRINT_SECONDS = ((STAMINA_MAX - 2) / 28) + 7;
// Tiny epsilon keeps the quantized 20 Hz authority from granting an extra
// 50ms tick when the meter lands microscopically above the 2-point cutoff.
export const STAMINA_DRAIN = ((STAMINA_MAX - 2) / PLAYER_SPRINT_SECONDS) + 1e-4;
export const STAMINA_REGEN = 14;
export const STAMINA_REGEN_DELAY = 1.2;
