export function rendererPixelRatio(quality, devicePixelRatio = 1) {
  if (quality === 'high') return Math.min(devicePixelRatio, 2);
  if (quality === 'low') return 0.6;
  return 1;
}

export function postFxPixelRatio(quality, devicePixelRatio = 1) {
  // Bloom uses several full-screen buffers. Keeping high at 1.5x still looks
  // crisp while avoiding the 4x pixel workload that a 2x buffer creates.
  if (quality === 'high') return Math.min(devicePixelRatio, 1.5);
  if (quality === 'low') return 0.6;
  return 1;
}

export function bloomEnabled(quality) {
  // Bloom re-renders the full scene through several full-screen buffers. Keep
  // it as an explicit high-quality extra; medium is the default gameplay mode
  // and should prioritize steady input/frame latency on integrated GPUs.
  return quality === 'high';
}

export function lowerRuntimeQuality(quality) {
  if (quality === 'high') return 'medium';
  if (quality === 'medium') return 'low';
  return 'low';
}

export function shouldReduceRuntimeQuality(elapsed, frames, slowFrames) {
  if (elapsed < 2.5 || frames < 30) return false;
  const averageFrameSeconds = elapsed / frames;
  return averageFrameSeconds > 0.0215 || slowFrames / frames > 0.18;
}
