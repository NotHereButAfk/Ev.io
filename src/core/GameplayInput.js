// Shared desktop/mobile sprint intent. Keeping this in one place prevents the
// legacy controller, deterministic bridge, and authoritative client from
// disagreeing about which Shift key runs.
export function sprintRequested(input, forwardAmount) {
  return input.isDown('ShiftLeft') || input.isDown('ShiftRight')
    || (input.isMobile && forwardAmount > 0);
}
