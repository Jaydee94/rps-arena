import { describe, expect, it } from 'vitest';
import { AVATARS, BLUFF_EMOTES, getGestureSet, type GestureSetId } from '@rps/shared';
import de from './locales/de.json';
import en from './locales/en.json';
import { avatarIcon, gestureIcon, gestureKey } from './gestures-ui';

const SETS: GestureSetId[] = ['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15'];
const ALL_GESTURES = [...new Set(SETS.flatMap((s) => getGestureSet(s).gestures))];

// The files on disk, independent of the lookup under test.
const idsOf = (files: Record<string, unknown>) =>
  Object.keys(files).map((path) => path.slice(path.lastIndexOf('/') + 1, -'.svg'.length));
const gestureFiles = idsOf(import.meta.glob('../assets/gestures/*.svg', { query: '?url' }));
const avatarFiles = idsOf(import.meta.glob('../assets/avatars/*.svg', { query: '?url' }));

describe('gestures-ui', () => {
  it('covers wheel15 and lizard-spock in the union of all sets', () => {
    expect(ALL_GESTURES).toHaveLength(17);
    for (const id of getGestureSet('wheel15').gestures) expect(ALL_GESTURES).toContain(id);
  });

  it.each(ALL_GESTURES)('has an icon and a translation in both locales for %s', (id) => {
    expect(gestureIcon(id)).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
    expect(gestureKey(id)).toBe(`gesture.${id}`);
    expect(de).toHaveProperty([gestureKey(id)]);
    expect(en).toHaveProperty([gestureKey(id)]);
  });

  it('has a distinct icon for every gesture and an svg file per gesture', () => {
    const icons = ALL_GESTURES.map((id) => gestureIcon(id));
    expect(new Set(icons).size).toBe(ALL_GESTURES.length);
    expect([...gestureFiles].sort()).toEqual([...ALL_GESTURES].sort());
  });

  it('has art for all bluff emotes', () => {
    for (const emote of BLUFF_EMOTES) expect(gestureIcon(emote)).not.toBeNull();
  });

  it.each(AVATARS)('has an svg file and a translation for avatar %s', (id) => {
    expect(avatarFiles).toContain(id);
    expect(avatarIcon(id)).toMatch(/^<svg/);
    expect(de).toHaveProperty([`avatar.${id}`]);
    expect(en).toHaveProperty([`avatar.${id}`]);
  });

  it('returns null for unknown ids', () => {
    expect(gestureIcon('nope')).toBeNull();
    expect(avatarIcon('nope')).toBeNull();
  });

  it('uses only token-driven colors in the art', () => {
    for (const svg of [...ALL_GESTURES.map(gestureIcon), ...AVATARS.map(avatarIcon)]) {
      expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });
});
