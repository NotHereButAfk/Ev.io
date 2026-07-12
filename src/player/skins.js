// Character body-tint catalog. Emptied — there are no selectable player skins.
// A single hardcoded default keeps the base soldier rendering; it is NOT part
// of the catalog array, so it never shows up in any shop / inventory skin list.
export const SKINS = [];

const DEFAULT_SKIN = { id: 'default', name: 'Default', primary: 0xe9edf2, secondary: 0x3a4048 };

export function getSkin(id) {
  return SKINS.find((s) => s.id === id) || DEFAULT_SKIN;
}
