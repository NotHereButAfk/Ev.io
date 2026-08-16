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
  return quality !== 'low';
}
