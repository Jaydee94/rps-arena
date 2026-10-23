import { describe, expect, it } from 'vitest';
import { makePairing, makeTournament } from '../test/fixtures';
import { knockout8, roundRobin6 } from '../test/tournament-scenarios';
import {
  bracketColumns,
  currentPairing,
  drawSlots,
  highlightedPairing,
  knockoutRoundCount,
  matchNumber,
  roundLabel,
  sharedRanks,
} from './tournament-ui';

describe('tournament-ui helpers', () => {
  it('counts knockout rounds from the first round and pads unpaired rounds', () => {
    const tournament = knockout8();
    expect(knockoutRoundCount(tournament)).toBe(3);
    const columns = bracketColumns(tournament);
    expect(columns.map((c) => c.pairings.length)).toEqual([4, 2, 1]);
    expect(columns[2]?.pairings).toEqual([null]);
    expect(columns[1]?.pairings.map((p) => p?.id)).toEqual(['r2-1', 'r2-2']);
    expect(bracketColumns(makeTournament())).toEqual([]);
  });

  it('names knockout rounds from the end, tie-breaks and plain rounds', () => {
    const tournament = knockout8();
    expect(roundLabel(tournament, { round: 3, tiebreak: false }).key).toBe('tournament.final');
    expect(roundLabel(tournament, { round: 2, tiebreak: false }).key).toBe('tournament.semifinal');
    expect(roundLabel(tournament, { round: 1, tiebreak: false })).toEqual({ key: 'tournament.round', vars: { n: 1 } });
    expect(roundLabel(roundRobin6(), { round: 6, tiebreak: true }).key).toBe('tournament.tiebreak');
    expect(roundLabel(roundRobin6(), { round: 2, tiebreak: false })).toEqual({ key: 'tournament.round', vars: { n: 2 } });
  });

  it('finds the current pairing and its match number', () => {
    expect(currentPairing(knockout8())?.id).toBe('r2-1');
    expect(matchNumber(knockout8())).toEqual({ i: 5, n: 6 });
    expect(matchNumber(knockout8({ currentPairingId: null }))).toBeNull();
  });

  it('highlights the running pairing in a match, the next one in the intermission, none at the end', () => {
    expect(highlightedPairing(knockout8())).toEqual({ id: 'r2-1', live: true });
    expect(highlightedPairing(knockout8({ phase: 'intermission', currentPairingId: 'r1-4' }))).toEqual({ id: 'r2-1', live: false });
    expect(highlightedPairing(knockout8({ phase: 'finished' }))).toBeNull();
  });

  it('finds the shared ranks', () => {
    expect([...sharedRanks(roundRobin6())].sort()).toEqual([1, 5]);
  });

  it('lists the first round of the draw and who sits it out', () => {
    const tournament = makeTournament({
      n: 5,
      format: 'roundrobin',
      phase: 'draw',
      pairings: [makePairing({ id: 'r1-1', a: 'p0', b: 'p1' }), makePairing({ id: 'r1-2', a: 'p2', b: 'p3' }), makePairing({ id: 'r2-1', round: 2, a: 'p4', b: 'p0' })],
    });
    const slots = drawSlots(tournament);
    expect(slots.pairings.map((p) => p.id)).toEqual(['r1-1', 'r1-2']);
    expect(slots.sittingOut).toEqual(['p4']);
    expect(drawSlots(makeTournament({ phase: 'draw' }))).toEqual({ pairings: [], sittingOut: [] });
  });
});
