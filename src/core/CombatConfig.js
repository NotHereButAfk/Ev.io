// Shared health regeneration contract for local and authoritative matches.
// Damage restarts the five-second delay; surviving players then recover at a
// steady rate until full health. Dead players never regenerate.
export const HEALTH_REGEN_DELAY = 5;
export const HEALTH_REGEN_RATE = 10;
