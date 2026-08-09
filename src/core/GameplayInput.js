// Shared desktop/mobile sprint intent. Keeping this in one place prevents the
// legacy controller, deterministic bridge, and authoritative client from
// disagreeing about which Shift key runs.
export function sprintRequested(input, forwardAmount) {
  return input.isDown('ShiftLeft') || input.isDown('ShiftRight')
    || (input.isMobile && forwardAmount > 0);
}

// HUD and gameplay share one throwable contract: G is frag, F is smoke.
export function consumeThrowable(input) {
  if (input.consumeJustPressed('KeyG')) return 'frag';
  if (input.consumeJustPressed('KeyF')) return 'smoke';
  return null;
}
