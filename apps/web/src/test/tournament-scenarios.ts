import type { PublicTournament, StandingRow } from '@rps/shared';
import { makePairing, makeTournament } from './fixtures';

/**
 * An 8-player knockout in the semifinal round (3 columns: Round 1, Semifinal, Final):
 * r1-1 p0 beats p1 2:1, r1-2 p3 wins a 1:1 by coin flip, r1-3 p4 wins by p5's forfeit,
 * r1-4 p6 and p7 both forfeited, so r2-2 gives p4 a bye. r2-1 p0 vs p3 is running.
 */
export function knockout8(overrides: Partial<PublicTournament> = {}): PublicTournament {
  const tournament = makeTournament({
    n: 8,
    phase: 'match',
    pairings: [
      makePairing({ id: 'r1-1', a: 'p0', b: 'p1', winner: 'p0', decidedBy: 'match', score: { a: 2, b: 1 } }),
      makePairing({ id: 'r1-2', a: 'p2', b: 'p3', winner: 'p3', decidedBy: 'coin', score: { a: 1, b: 1 } }),
      makePairing({ id: 'r1-3', a: 'p4', b: 'p5', winner: 'p4', decidedBy: 'forfeit', score: { a: 1, b: 0 } }),
      makePairing({ id: 'r1-4', a: 'p6', b: 'p7', winner: null, decidedBy: 'forfeit', score: null }),
      makePairing({ id: 'r2-1', round: 2, a: 'p0', b: 'p3' }),
      makePairing({ id: 'r2-2', round: 2, a: 'p4', b: null, winner: 'p4', decidedBy: 'bye' }),
    ],
    currentPairingId: 'r2-1',
    ...overrides,
  });
  for (const id of ['p5', 'p6', 'p7']) {
    const p = tournament.participants.find((x) => x.id === id);
    if (p) p.forfeited = true;
  }
  return tournament;
}

const row = (participantId: string, rank: number, wins: number, losses: number, won: number, lost: number): StandingRow => ({
  participantId,
  played: wins + losses,
  wins,
  losses,
  roundsWon: won,
  roundsLost: lost,
  rank,
});

/**
 * A 6-player round robin after the regular matches: p0, p1 and p2 share 1st place and play tie-breaks
 * (p0 beat p1 1:0, p1 vs p2 is next); p4 and p5 share 5th place. The viewer is p2.
 */
export function roundRobin6(overrides: Partial<PublicTournament> = {}): PublicTournament {
  return makeTournament({
    n: 6,
    format: 'roundrobin',
    phase: 'intermission',
    youId: 'p2',
    pairings: [
      makePairing({ id: 'r1-1', a: 'p0', b: 'p5', winner: 'p0', decidedBy: 'match', score: { a: 2, b: 0 } }),
      makePairing({ id: 'r6-1', round: 6, a: 'p0', b: 'p1', bestOf: 1, tiebreak: true, winner: 'p0', decidedBy: 'match', score: { a: 1, b: 0 } }),
      makePairing({ id: 'r6-2', round: 6, a: 'p1', b: 'p2', bestOf: 1, tiebreak: true }),
    ],
    currentPairingId: 'r6-1',
    standings: [
      row('p0', 1, 4, 1, 9, 4),
      row('p1', 1, 4, 1, 8, 5),
      row('p2', 1, 4, 1, 7, 3),
      row('p3', 4, 2, 3, 5, 6),
      row('p4', 5, 0, 5, 2, 10),
      row('p5', 5, 1, 4, 3, 9),
    ],
    ...overrides,
  });
}
