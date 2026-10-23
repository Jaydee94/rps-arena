/**
 * DEV-ONLY: builds realistic `PublicTournament` objects for the demo screens (`?demo=tournament-*`).
 * It plays the real pure tournament logic from @rps/shared with a fixed rng, so draws, pairings,
 * standings and podium are valid for any format, size and phase. Task 6 reuses it for bracket and table demos.
 */
import {
  createTournament,
  nextPairing,
  podium,
  recordResult,
  standings,
  type MatchOutcome,
  type Pairing,
  type PublicPairing,
  type PublicParticipant,
  type PublicTournament,
  type TournamentFormat,
  type TournamentState,
} from '@rps/shared';

const PEOPLE: [string, string][] = [
  ['Lightning Larry', 'fox'],
  ['Pixel Paula', 'robot'],
  ['Captain Crunch', 'dino'],
  ['Gerda', 'owl'],
  ['Eine Spielerin mit sehr langem Namen', 'unicorn'],
  ['Max', 'panda'],
  ['Wim', 'frog'],
  ['Zoe', 'cat'],
];

/** 16 characters without a space: the longest nickname the layout must survive. */
const LONG_NAMES = [
  'Wwwwwwwwwwwwwwww',
  'MMMMMMMMMMMMMMMM',
  'Superlongnicknam',
  'Donaudampfschiff',
  'Quetzalcoatlus99',
  'Xylophonspielerz',
  'Mmmmmmmmmmmmmmmm',
  'WWWWWWWWWWWWWWWW',
];

/**
 * How a demo pairing ends: a side wins, a no-winner draw (knockout: coin flip), or a forfeit of one or both sides.
 */
export type DemoOutcome = 'a' | 'b' | 'coin' | 'forfeit-a' | 'forfeit-b' | 'forfeit-both';

export interface DemoTournamentOptions {
  format?: TournamentFormat;
  /** Participant count, 4 to 8. */
  n?: number;
  phase?: PublicTournament['phase'];
  /** The viewer's participant id (`d0` is the host); null for a plain spectator. */
  youId?: string | null;
  /** Indexes of participants shown as disconnected. */
  disconnected?: number[];
  /** Pairings played before the snapshot (match: before the running one; intermission: including the one that just ended). */
  played?: number;
  /** The result of the k-th played pairing (default: the first side wins 2:1 on even, the second 2:0 on odd pairings). */
  outcome?: (pairing: Pairing, k: number) => DemoOutcome;
  /** 16-character nicknames without spaces. */
  long?: boolean;
}

/** A fixed, repeatable rng (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export const demoParticipants = (n: number, disconnected: number[] = [], long = false): PublicParticipant[] =>
  PEOPLE.slice(0, Math.min(Math.max(n, 1), PEOPLE.length)).map(([nickname, avatar], i) => ({
    id: `d${i}`,
    nickname: long ? (LONG_NAMES[i] ?? nickname) : nickname,
    avatar,
    connected: !disconnected.includes(i),
    forfeited: false,
  }));

const publicPairing = (p: Pairing): PublicPairing => ({
  id: p.id,
  round: p.round,
  a: p.a,
  b: p.b,
  bestOf: p.bestOf,
  tiebreak: p.tiebreak,
  winner: p.result?.winner ?? null,
  decidedBy: p.result?.decidedBy ?? null,
  score: p.result?.score ?? null,
});

const defaultOutcome = (_pairing: Pairing, k: number): DemoOutcome => (k % 2 === 0 ? 'a' : 'b');

function matchOutcome(outcome: DemoOutcome, bestOf: 1 | 3, k: number): MatchOutcome {
  const full = bestOf === 1 ? 1 : 2;
  const close = bestOf === 1 ? 0 : k % 3 === 0 ? 0 : 1;
  switch (outcome) {
    case 'a':
      return { winner: 'a', score: { a: full, b: close }, forfeit: null };
    case 'b':
      return { winner: 'b', score: { a: close, b: full }, forfeit: null };
    case 'coin':
      return { winner: null, score: { a: bestOf === 1 ? 0 : 1, b: bestOf === 1 ? 0 : 1 }, forfeit: null };
    case 'forfeit-a':
      return { winner: null, score: { a: 0, b: 1 }, forfeit: 'a' };
    case 'forfeit-b':
      return { winner: null, score: { a: 1, b: 0 }, forfeit: 'b' };
    case 'forfeit-both':
      return { winner: null, score: { a: 0, b: 0 }, forfeit: 'both' };
  }
}

/** Plays the next open pairing with the given outcome; returns the new state and the played pairing's id. */
function playNext(
  state: TournamentState,
  rng: () => number,
  k: number,
  outcome: (pairing: Pairing, k: number) => DemoOutcome,
): [TournamentState, string | null] {
  const pairing = nextPairing(state);
  if (!pairing) return [state, null];
  return [recordResult(state, pairing.id, matchOutcome(outcome(pairing, k), pairing.bestOf, k), rng), pairing.id];
}

export function demoTournament(options: DemoTournamentOptions = {}): PublicTournament {
  const {
    format = 'knockout',
    n = 5,
    phase = 'lobby',
    youId = 'd0',
    disconnected = [],
    outcome = defaultOutcome,
    long = false,
  } = options;
  const participants = demoParticipants(n, disconnected, long);
  const base = { format, youId, hostId: 'd0' };
  if (phase === 'lobby') {
    return { ...base, participants, phase, pairings: [], currentPairingId: null, standings: [], podium: [], untilMs: null };
  }

  const rng = seeded(7);
  let state = createTournament(format, participants.map((p) => p.id), rng);
  let currentPairingId: string | null = null;
  let untilMs: number | null = null;
  const toPlay =
    phase === 'draw' ? 0 : phase === 'finished' ? 100 : (options.played ?? (phase === 'intermission' ? 1 : 0));
  for (let k = 0; k < toPlay && nextPairing(state); k++) {
    const [next, id] = playNext(state, rng, k, outcome);
    state = next;
    currentPairingId = id;
  }

  if (phase === 'match') currentPairingId = nextPairing(state)?.id ?? null;
  if (phase === 'intermission') untilMs = Date.now() + 6000;
  if (phase === 'draw') untilMs = Date.now() + 3000;

  const forfeited = new Set(state.forfeited);
  return {
    ...base,
    participants: participants.map((p) => ({ ...p, forfeited: forfeited.has(p.id) })),
    phase,
    pairings: state.pairings.map(publicPairing),
    currentPairingId,
    standings: standings(state),
    podium: phase === 'finished' ? podium(state) : [],
    untilMs,
  };
}
