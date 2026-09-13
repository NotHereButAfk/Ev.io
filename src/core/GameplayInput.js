// Shared desktop/mobile sprint intent. Keeping this in one place prevents the
// legacy controller, deterministic bridge, and authoritative client from
// disagreeing about which Shift key runs.
export function sprintRequested(input, forwardAmount) {
  return input.isDown('ShiftLeft') || input.isDown('ShiftRight')
    || (input.isMobile && forwardAmount > 0);
}

// Five-slot reference layout: Q blink, G smoke, U frag, V planted bomb, E blast.
export function consumeThrowable(input) {
  if (input.consumeJustPressed('KeyU')) return 'frag';
  if (input.consumeJustPressed('KeyV')) return 'timebomb';
  if (input.consumeJustPressed('KeyE')) return 'impulse';
  if (input.consumeJustPressed('KeyG')) return 'smoke';
  if (input.consumeJustPressed('KeyF')) return 'smoke';
  return null;
}
