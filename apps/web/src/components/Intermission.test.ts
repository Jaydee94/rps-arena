import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { PublicPairing, PublicTournament } from '@rps/shared';
import Intermission from './Intermission.svelte';
import { setLocale } from '../lib/i18n';
import { actions, resetConnectionMock, roomStore } from '../test/connection-mock';
import { makePairing, makeSpectatorRoom, makeTournament } from '../test/fixtures';
import { knockout8, roundRobin6 } from '../test/tournament-scenarios';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

/** p0 beat p1 2:1 in r1-1 (just finished); r1-2 p2 vs p3 plays next. */
function tournamentWith(finished: Partial<PublicPairing>, extra: Partial<PublicTournament> = {}) {
  return makeTournament({
    n: 5,
    phase: 'intermission',
    pairings: [
      makePairing({ id: 'r1-1', a: 'p0', b: 'p1', winner: 'p0', decidedBy: 'match', score: { a: 2, b: 1 }, ...finished }),
      makePairing({ id: 'r1-2', a: 'p2', b: 'p3' }),
      makePairing({ id: 'r1-3', a: 'p4', b: null, winner: 'p4', decidedBy: 'bye' }),
    ],
    currentPairingId: 'r1-1',
    untilMs: Date.now() + 6000,
    ...extra,
  });
}

function show(tournament: PublicTournament, host = false) {
  roomStore.set(makeSpectatorRoom({ isHost: host, me: { id: tournament.youId ?? 'p0' }, tournament }));
  return render(Intermission);
}

const resultPanel = () => screen.getByRole('heading', { level: 2 }).closest('section') as HTMLElement;

describe('Intermission', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  afterEach(() => vi.useRealTimers());

  it('has one main, one h2 and one status line', () => {
    const { container } = show(tournamentWith({}));
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelectorAll('h2')).toHaveLength(1);
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it('shows the result of the pairing that just finished', () => {
    show(tournamentWith({}));
    const panel = resultPanel();
    expect(within(panel).getByRole('status')).toHaveTextContent('Spieler-p0 wins!');
    expect(within(panel).getByText('Score 2 : 1')).toBeInTheDocument();
    expect(within(panel).getByText('Spieler-p1')).toBeInTheDocument();
    expect(within(panel).getByText('Round 1')).toBeInTheDocument();
  });

  it('says when a coin flip decided it', () => {
    show(tournamentWith({ winner: 'p1', decidedBy: 'coin', score: { a: 1, b: 1 } }));
    expect(within(resultPanel()).getByRole('status')).toHaveTextContent('Spieler-p1 wins!');
    expect(within(resultPanel()).getByText('Decided by coin flip')).toBeInTheDocument();
  });

  it('says when a forfeit decided it, also when both sides forfeited', () => {
    const { unmount } = show(tournamentWith({ decidedBy: 'forfeit', score: null }));
    expect(within(resultPanel()).getByText('Won by forfeit')).toBeInTheDocument();
    unmount();
    show(tournamentWith({ winner: null, decidedBy: 'forfeit', score: null }));
    expect(within(resultPanel()).getByRole('status')).toHaveTextContent('Nobody wins this match');
    expect(within(resultPanel()).getByText('Both forfeited')).toBeInTheDocument();
  });

  it('names the next match', () => {
    show(tournamentWith({}));
    expect(screen.getByRole('heading', { name: 'Next match' })).toBeInTheDocument();
    expect(screen.getByText('Spieler-p2 vs Spieler-p3')).toBeInTheDocument();
  });

  it('says the tournament is wrapping up when nothing is left to play', () => {
    const tournament = tournamentWith({});
    tournament.pairings = tournament.pairings.filter((p) => p.id !== 'r1-2');
    show(tournament);
    expect(screen.getByText('Wrapping up …')).toBeInTheDocument();
    expect(screen.queryByText(/Next match in/)).not.toBeInTheDocument();
  });

  it('counts down to untilMs every second', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-23T10:00:00Z') });
    show(tournamentWith({}, { untilMs: Date.now() + 6000 }));
    expect(screen.getByText('Next match in 6 s')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByText('Next match in 4 s')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(screen.getByText('Next match in 0 s')).toBeInTheDocument();
  });

  it('gives only the host Skip', async () => {
    const { unmount } = show(tournamentWith({}), false);
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    unmount();
    show(tournamentWith({}), true);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Skip' }));
    expect(actions.skipWait).toHaveBeenCalledTimes(1);
  });

  it('shows the bracket for a knockout', () => {
    show(knockout8({ phase: 'intermission', currentPairingId: 'r1-4' }));
    expect(screen.getByRole('region', { name: 'Bracket' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the table and the tie-break label for a round robin', () => {
    show(roundRobin6());
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(within(resultPanel()).getByText('Tie-break')).toBeInTheDocument();
    expect(screen.getByText('Spieler-p1 vs Spieler-p2')).toBeInTheDocument();
  });
});
