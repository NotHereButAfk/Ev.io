// Inline pictograms stay sharp on high-density phones and require no image fetch.
const paths = {
  abilities: '<circle cx="32" cy="32" r="24" stroke-width="7"/><path d="M32 54V25m-12 11 12-13 12 13" stroke-width="8"/>',
  profile: '<circle cx="32" cy="32" r="27"/><circle cx="32" cy="24" r="11"/><path d="M11 50c2-20 40-20 42 0"/>',
  settings: '<path d="m26 5 12 0 2 9 7 4 9-2 6 10-7 6v8l7 6-6 10-9-2-7 4-2 9H26l-2-9-7-4-9 2-6-10 7-6v-8l-7-6 6-10 9 2 7-4z" transform="translate(4 -2) scale(.88)" fill="currentColor"/><circle cx="32" cy="30" r="12" fill="#080808" stroke="#080808"/>',
  menu: '<path d="m32 3 29 29-29 29L3 32z" fill="currentColor"/><path d="M18 24h28M18 32h28M18 40h28" stroke="#333" stroke-width="4"/>',
  aim: '<circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="4" fill="currentColor"/><path d="M32 5v12m0 30v12M5 32h12m30 0h12"/>',
  reload: '<path d="m32 5 27 27-27 27L5 32zM22 22v23m10-23v23m10-23v23"/><path d="m19 22 3-7 3 7m4 0 3-7 3 7m4 0 3-7 3 7" fill="currentColor"/>',
  grenade: '<g transform="rotate(35 32 32)"><rect x="23" y="24" width="19" height="28" rx="3" fill="currentColor"/><path d="M27 24V14h13l9 10M26 14V9h15v5"/></g>',
  fire: '<path d="m7 35 14-10-2 12 17-23-3 19 20-12-13 22 13-3-25 17 5-15-19 8 7-12-14 8z" fill="currentColor"/><path d="m15 15 2 9M43 7l-5 10M54 14l-7 7"/>',
  swap: '<path d="M7 21h46m-10-9 10 9-10 9M57 43H11m10-9-10 9 10 9" stroke-width="6"/>',
  jump: '<circle cx="25" cy="12" r="6" fill="currentColor"/><path d="m17 31 7-12 10 9 8-3M24 22l2 18-10 13m10-13 11 3-2 13M45 46V13m-8 8 8-8 8 8" stroke-width="6"/>',
  ability: '<circle cx="36" cy="12" r="6" fill="currentColor"/><path d="m28 23 9-4 7 13 9 1M34 24l-5 15-9 13m10-13 12 3 5 13M7 24h13M3 33h15M7 42h9" stroke-width="5"/>',
  slide: '<circle cx="35" cy="14" r="6" fill="currentColor"/><path d="m34 24-10 9 15 7-10 11H13m11-18 16-4 10 6M8 19h13M4 27h12" stroke-width="6"/>',
};
export function mobileIcon(name) {
  return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="round">${paths[name] || ''}</svg>`;
}
