const DISMISS_KEY = 'kx_sponsor_block_dismissed';

export function isSponsorProbeBlocked(probe, style) {
  if (!probe || !style) return true;
  return style.display === 'none'
    || style.visibility === 'hidden'
    || probe.offsetHeight === 0
    || probe.offsetWidth === 0
    || probe.getClientRects().length === 0;
}

export function installSponsorBlockCheck({ delayMs = 700 } = {}) {
  const warning = document.getElementById('sponsor-block-warning');
  const dismiss = document.getElementById('sponsor-block-dismiss');
  if (!warning || !dismiss) return;

  dismiss.addEventListener('click', () => {
    warning.classList.add('hidden');
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* storage is optional */ }
  });

  try {
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
  } catch { /* continue without persistence */ }

  const probe = document.createElement('div');
  probe.id = 'sponsor-availability-probe';
  // Common filter-list bait names. The element is always off-screen and never
  // reserves layout space; blockers reveal themselves by collapsing it.
  probe.className = 'adsbox ad-banner ad-placement pub_300x250';
  probe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(probe);

  setTimeout(() => {
    const blocked = isSponsorProbeBlocked(probe, getComputedStyle(probe));
    probe.remove();
    warning.dataset.sponsorCheck = blocked ? 'blocked' : 'clear';
    if (blocked) warning.classList.remove('hidden');
  }, delayMs);
}
