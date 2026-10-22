/**
 * Icon and i18n lookups for gestures and avatars. The SVG art lives in
 * src/assets/{gestures,avatars}/<id>.svg and is inlined as raw markup so it can be
 * themed through the tokens (see styles/art.css). Ids match @rps/shared.
 */
function byId(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([path, svg]) => [path.slice(path.lastIndexOf('/') + 1, -'.svg'.length), svg]),
  );
}

export const GESTURE_ICONS: Readonly<Record<string, string>> = byId(
  import.meta.glob<string>('../assets/gestures/*.svg', { query: '?raw', import: 'default', eager: true }),
);

export const AVATAR_ICONS: Readonly<Record<string, string>> = byId(
  import.meta.glob<string>('../assets/avatars/*.svg', { query: '?raw', import: 'default', eager: true }),
);

/** The SVG markup of a gesture, or null for an id without art. */
export const gestureIcon = (id: string): string | null => GESTURE_ICONS[id] ?? null;
export const gestureKey = (id: string): string => `gesture.${id}`;
/** The SVG markup of an avatar, or null for an unknown id. */
export const avatarIcon = (id: string): string | null => AVATAR_ICONS[id] ?? null;
