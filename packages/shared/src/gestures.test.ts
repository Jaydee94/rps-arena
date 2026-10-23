import { describe, expect, it } from 'vitest';
import { duel, gestureBeats, getGestureSet, gestureSetFor } from './gestures';
import type { GestureSetId, ModeId } from './gestures';

const SET_IDS: GestureSetId[] = ['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15'];

const WHEEL15 = [
  'rock',
  'fire',
  'scissors',
  'snake',
  'human',
  'tree',
  'wolf',
  'sponge',
  'paper',
  'air',
  'water',
  'dragon',
  'devil',
  'lightning',
  'gun',
];

describe('gesture sets', () => {
  it('uses the classic circle order', () => {
    expect(getGestureSet('classic').gestures).toEqual(['rock', 'scissors', 'paper']);
  });

  it('uses the lizard-spock circle order', () => {
    expect(getGestureSet('lizard-spock').gestures).toEqual([
      'rock',
      'scissors',
      'lizard',
      'paper',
      'spock',
    ]);
  });

  it('wheel15 matches the 15 name list', () => {
    expect(getGestureSet('wheel15').gestures).toEqual(WHEEL15);
  });

  it.each([
    ['wheel7', 7],
    ['wheel9', 9],
  ] as const)('%s has %i unique gestures drawn from wheel15 in its order', (id, size) => {
    const { gestures } = getGestureSet(id);
    expect(gestures).toHaveLength(size);
    expect(new Set(gestures).size).toBe(size);
    const positions = gestures.map((g) => WHEEL15.indexOf(g));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
  });

  it('carries its own id', () => {
    for (const id of SET_IDS) expect(getGestureSet(id).id).toBe(id);
  });

  it('maps every mode to a gesture set', () => {
    const expected: Record<ModeId, GestureSetId> = {
      classic: 'classic',
      'lizard-spock': 'lizard-spock',
      wheel7: 'wheel7',
      wheel9: 'wheel9',
      wheel15: 'wheel15',
      bluff: 'lizard-spock',
      team2v2: 'classic',
    };
    for (const [mode, setId] of Object.entries(expected)) {
      expect(gestureSetFor(mode as ModeId).id).toBe(setId);
    }
  });
});

describe('duel', () => {
  const classic = getGestureSet('classic');
  const lizardSpock = getGestureSet('lizard-spock');

  it('resolves classic duels', () => {
    expect(duel(classic, 'rock', 'scissors')).toBe('a');
    expect(duel(classic, 'rock', 'paper')).toBe('b');
    expect(duel(classic, 'paper', 'paper')).toBe('draw');
  });

  it('resolves lizard-spock duels', () => {
    expect(duel(lizardSpock, 'lizard', 'spock')).toBe('a');
    expect(duel(lizardSpock, 'lizard', 'paper')).toBe('a');
    expect(duel(lizardSpock, 'spock', 'rock')).toBe('a');
    expect(duel(lizardSpock, 'spock', 'scissors')).toBe('a');
    expect(duel(lizardSpock, 'rock', 'lizard')).toBe('a');
    expect(duel(lizardSpock, 'rock', 'scissors')).toBe('a');
  });

  it('throws on an unknown gesture', () => {
    expect(() => duel(classic, 'rock', 'fire')).toThrow();
    expect(() => duel(classic, 'fire', 'rock')).toThrow();
  });

  describe.each(SET_IDS)('%s', (id) => {
    const set = getGestureSet(id);
    const n = set.gestures.length;

    it('is antisymmetric for every pair', () => {
      const opposite = { a: 'b', b: 'a', draw: 'draw' } as const;
      for (const x of set.gestures) {
        for (const y of set.gestures) {
          expect(duel(set, x, y)).toBe(opposite[duel(set, y, x)]);
        }
      }
    });

    it('lets each gesture beat and lose to exactly (n-1)/2 others', () => {
      for (const x of set.gestures) {
        const results = set.gestures.map((y) => duel(set, x, y));
        expect(results.filter((r) => r === 'a')).toHaveLength((n - 1) / 2);
        expect(results.filter((r) => r === 'b')).toHaveLength((n - 1) / 2);
        expect(results.filter((r) => r === 'draw')).toHaveLength(1);
      }
    });
  });
});

describe('gestureBeats', () => {
  it('lists what each classic gesture beats', () => {
    const classic = getGestureSet('classic');
    expect(gestureBeats(classic, 'rock')).toEqual(['scissors']);
    expect(gestureBeats(classic, 'paper')).toEqual(['rock']);
    expect(gestureBeats(classic, 'scissors')).toEqual(['paper']);
  });

  it('lets every lizard-spock gesture beat exactly 2 in circle order', () => {
    const set = getGestureSet('lizard-spock');
    for (const g of set.gestures) expect(gestureBeats(set, g)).toHaveLength(2);
    expect(gestureBeats(set, 'rock')).toEqual(['scissors', 'lizard']);
    expect(gestureBeats(set, 'spock')).toEqual(['rock', 'scissors']);
  });

  it('lets every wheel15 gesture beat exactly 7', () => {
    const set = getGestureSet('wheel15');
    for (const g of set.gestures) expect(gestureBeats(set, g)).toHaveLength(7);
  });

  it.each(SET_IDS)('agrees with duel for every pair in %s', (id) => {
    const set = getGestureSet(id);
    for (const a of set.gestures) {
      for (const b of set.gestures) {
        expect(gestureBeats(set, a).includes(b)).toBe(duel(set, a, b) === 'a');
      }
    }
  });

  it('throws on a gesture outside the set', () => {
    expect(() => gestureBeats(getGestureSet('classic'), 'lizard')).toThrow(/Unknown gesture/);
  });
});
