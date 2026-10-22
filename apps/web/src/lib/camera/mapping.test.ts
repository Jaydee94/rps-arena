import { describe, expect, it } from 'vitest';
import { mapGesture } from './mapping';

describe('mapGesture', () => {
  it.each([
    ['Closed_Fist', 'rock'],
    ['Open_Palm', 'paper'],
    ['Victory', 'scissors'],
  ])('maps %s to %s', (name, expected) => {
    expect(mapGesture(name)).toBe(expected);
  });

  it.each(['Thumb_Up', 'Thumb_Down', 'Pointing_Up', 'ILoveYou', 'None', '', 'closed_fist'])(
    'maps %j to null',
    (name) => {
      expect(mapGesture(name)).toBeNull();
    },
  );
});
