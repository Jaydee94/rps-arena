/** Game modes offered by the arena. */
export type ModeId =
  | 'classic'
  | 'lizard-spock'
  | 'wheel7'
  | 'wheel9'
  | 'wheel15'
  | 'bluff'
  | 'team2v2';

export type GestureSetId = 'classic' | 'lizard-spock' | 'wheel7' | 'wheel9' | 'wheel15';

export interface GestureSet {
  id: GestureSetId;
  /** Gestures in circle order: each one beats the next (n-1)/2 gestures. */
  gestures: readonly string[];
}

// The 15 gesture list, in circle order.
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
] as const;

// wheel7 / wheel9 are evenly spread subsets of WHEEL15 (indices round(i * 15 / n)),
// kept in WHEEL15 order so icons and translations can be reused.
// wheel7 = WHEEL15 indices 0, 2, 4, 6, 9, 11, 13
const WHEEL7 = ['rock', 'scissors', 'human', 'wolf', 'air', 'dragon', 'lightning'] as const;
// wheel9 = WHEEL15 indices 0, 2, 3, 5, 7, 8, 10, 12, 13
const WHEEL9 = [
  'rock',
  'scissors',
  'snake',
  'tree',
  'sponge',
  'paper',
  'water',
  'devil',
  'lightning',
] as const;

const GESTURE_SETS: Record<GestureSetId, GestureSet> = {
  classic: { id: 'classic', gestures: ['rock', 'scissors', 'paper'] },
  'lizard-spock': {
    id: 'lizard-spock',
    gestures: ['rock', 'scissors', 'lizard', 'paper', 'spock'],
  },
  wheel7: { id: 'wheel7', gestures: WHEEL7 },
  wheel9: { id: 'wheel9', gestures: WHEEL9 },
  wheel15: { id: 'wheel15', gestures: WHEEL15 },
};

export function getGestureSet(id: GestureSetId): GestureSet {
  return GESTURE_SETS[id];
}

/**
 * The gesture set a mode plays with. Design decision: bluff uses lizard-spock
 * and team2v2 uses classic; every other mode uses the set of the same name.
 */
export function gestureSetFor(mode: ModeId): GestureSet {
  switch (mode) {
    case 'bluff':
      return GESTURE_SETS['lizard-spock'];
    case 'team2v2':
      return GESTURE_SETS.classic;
    default:
      return GESTURE_SETS[mode];
  }
}

/** Resolves a duel: 'a' if gesture a wins, 'b' if b wins. Throws on a gesture outside the set. */
export function duel(set: GestureSet, a: string, b: string): 'a' | 'b' | 'draw' {
  const n = set.gestures.length;
  const i = set.gestures.indexOf(a);
  const j = set.gestures.indexOf(b);
  if (i < 0) throw new Error(`Unknown gesture "${a}" for set ${set.id}`);
  if (j < 0) throw new Error(`Unknown gesture "${b}" for set ${set.id}`);
  const distance = (j - i + n) % n;
  if (distance === 0) return 'draw';
  return distance <= (n - 1) / 2 ? 'a' : 'b';
}

/**
 * The gestures `gesture` beats, in circle order: the next (n-1)/2 gestures, wrapping around.
 * Same rule as `duel`. Throws on a gesture outside the set.
 */
export function gestureBeats(set: Pick<GestureSet, 'gestures'> & { id?: string }, gesture: string): string[] {
  const n = set.gestures.length;
  const i = set.gestures.indexOf(gesture);
  if (i < 0) throw new Error(`Unknown gesture "${gesture}" for set ${set.id ?? 'custom'}`);
  const beaten: string[] = [];
  for (let step = 1; step <= (n - 1) / 2; step++) beaten.push(set.gestures[(i + step) % n] as string);
  return beaten;
}
