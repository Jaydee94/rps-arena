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

export interface DemoTournamentOptions {
  format?: TournamentFormat;
  /** Participant count, 4 to 8. */
  n?: number;
  phase?: PublicTournament['phase'];
  /** The viewer's participant id (`d0` is the host); null for a plain spectator. */
  youId?: string | null;
  /** Indexes of participants shown as disconnected. */
  disconnected?: number[];
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

export const demoParticipants = (n: number, disconnected: number[] = []): PublicParticipant[] =>
  PEOPLE.slice(0, Math.min(Math.max(n, 1), PEOPLE.length)).map(([nickname, avatar], i) => ({
    id: `d${i}`,
    nickname,
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

/** Plays the next open pairing: the first side wins 2:1 (the second side 2:0 on odd pairing numbers). */
function playNext(state: TournamentState, rng: () => number): TournamentState {
  const pairing = nextPairing(state);
  if (!pairing) return state;
  const aWins = state.pairings.indexOf(pairing) % 2 === 0;
  return recordResult(
    state,
    pairing.id,
    aWins
      ? { winner: 'a', score: { a: 2, b: 1 }, forfeit: null }
      : { winner: 'b', score: { a: 0, b: 2 }, forfeit: null },
    rng,
  );
}

export function demoTournament(options: DemoTournamentOptions = {}): PublicTournament {
  const { format = 'knockout', n = 5, phase = 'lobby', youId = 'd0', disconnected = [] } = options;
  const participants = demoParticipants(n, disconnected);
  const base = { format, participants, youId };
  if (phase === 'lobby') {
    return { ...base, phase, pairings: [], currentPairingId: null, standings: [], podium: [], untilMs: null };
  }

  const rng = seeded(7);
  let state = createTournament(format, participants.map((p) => p.id), rng);
  let currentPairingId: string | null = null;
  let untilMs: number | null = null;

  if (phase === 'match') {
    currentPairingId = nextPairing(state)?.id ?? null;
  } else if (phase === 'intermission') {
    state = playNext(state, rng);
    untilMs = Date.now() + 6000;
  } else if (phase === 'draw') {
    untilMs = Date.now() + 3000;
  } else {
    for (let guard = 0; nextPairing(state) && guard < 100; guard++) state = playNext(state, rng);
  }

  return {
    ...base,
    phase,
    pairings: state.pairings.map(publicPairing),
    currentPairingId,
    standings: standings(state),
    podium: phase === 'finished' ? podium(state) : [],
    untilMs,
  };
}
