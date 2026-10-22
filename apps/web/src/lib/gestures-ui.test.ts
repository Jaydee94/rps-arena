import { describe, expect, it } from 'vitest';
import { AVATARS, getGestureSet, type GestureSetId } from '@rps/shared';
import { avatarEmoji, gestureEmoji, gestureKey } from './gestures-ui';

const SETS: GestureSetId[] = ['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15'];

describe('gestures-ui', () => {
  it('has a distinct placeholder icon for every gesture of every set', () => {
    const ids = [...new Set(SETS.flatMap((s) => getGestureSet(s).gestures))];
    const icons = ids.map((id) => gestureEmoji(id));
    for (const icon of icons) expect(icon).not.toBe('');
    expect(new Set(icons).size).toBe(ids.length);
  });

  it('maps gestures to their i18n key', () => {
    expect(gestureKey('rock')).toBe('gesture.rock');
  });

  it('has an emoji for every avatar and a fallback for unknown ones', () => {
    for (const id of AVATARS) expect(avatarEmoji(id)).not.toBe('❓');
    expect(avatarEmoji('nope')).toBe('❓');
  });
});
