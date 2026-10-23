import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { PublicTournament } from '@rps/shared';
import App from './App.svelte';
import { setLocale } from './lib/i18n';
import { actions, resetConnectionMock, roomStore } from './test/connection-mock';
import { makeRoom, makeSpectatorRoom, makeTournament } from './test/fixtures';

vi.mock('./lib/connection', async () => (await import('./test/connection-mock')).connectionMock);

type Phase = PublicTournament['phase'];

const pairing = {
  id: 'r1-0',
  round: 1,
  a: 'p0',
  b: 'p1',
  bestOf: 3 as const,
  tiebreak: false,
  winner: null,
  decidedBy: null,
  score: null,
};

/** A participant who is not in the running pairing (or any participant outside a match): a spectator view with `me`. */
function participantView(phase: Phase, host: boolean, extra: Partial<PublicTournament> = {}) {
  const youId = host ? 'p0' : 'p2';
  return makeSpectatorRoom({
    isHost: host,
    me: { id: youId },
    tournament: makeTournament({ n: 5, phase, youId, ...extra }),
  });
}

const screenOf = (container: HTMLElement) => container.querySelector('.app')?.getAttribute('data-screen');

describe('App routing for tournaments', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  it('shows the tournament lobby for every role in phase lobby', () => {
    roomStore.set(participantView('lobby', true));
    const { container } = render(App);
    expect(screen.getByRole('button', { name: 'Start tournament' })).toBeInTheDocument();
    expect(screenOf(container)).toBe('tournament-lobby');
    expect(container.querySelectorAll('main')).toHaveLength(1);
  });

  it('shows the lobby to a plain lobby spectator (no me)', () => {
    roomStore.set(makeSpectatorRoom({ tournament: makeTournament({ n: 8, youId: null }) }));
    const { container } = render(App);
    expect(screenOf(container)).toBe('tournament-lobby');
    expect(screen.getByText(/You're watching along/)).toBeInTheDocument();
  });

  it('does not show the duel lobby or the spectate screen in the lobby phase', () => {
    roomStore.set(participantView('lobby', false));
    render(App);
    expect(screen.queryByTestId('spectate')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Lobby' })).not.toBeInTheDocument();
  });

  describe('draw', () => {
    it('shows the participant names and the host a Skip button', async () => {
      roomStore.set(participantView('draw', true, { untilMs: Date.now() + 3000 }));
      const { container } = render(App);
      expect(screenOf(container)).toBe('tournament-draw');
      expect(container.querySelectorAll('main')).toHaveLength(1);
      expect(screen.getByRole('heading', { name: 'The draw' })).toBeInTheDocument();
      expect(screen.getByText('Spieler-p4')).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole('button', { name: 'Skip' }));
      expect(actions.skipWait).toHaveBeenCalledTimes(1);
    });

    it('shows others no Skip button', () => {
      roomStore.set(participantView('draw', false));
      render(App);
      expect(screen.getByRole('heading', { name: 'The draw' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    });
  });

  describe('match', () => {
    const running = { phase: 'match' as const, pairings: [pairing], currentPairingId: 'r1-0' };

    it('shows the Board to a member of the pairing (player view)', () => {
      roomStore.set(
        makeRoom({
          you: 'a0',
          isHost: false,
          match: { phase: 'pick' },
          tournament: makeTournament({ n: 5, youId: 'p0', ...running }),
        }),
      );
      const { container } = render(App);
      expect(screen.getByRole('region', { name: 'Opponent' })).toBeInTheDocument();
      expect(screenOf(container)).toBe('board');
    });

    it('shows Spectate to a waiting participant (spectator view with me), even as the host', () => {
      roomStore.set(
        makeSpectatorRoom({
          isHost: true,
          me: { id: 'p3' },
          match: { phase: 'pick' },
          tournament: makeTournament({ n: 5, youId: 'p3', ...running }),
        }),
      );
      const { container } = render(App);
      expect(screen.getByTestId('spectate')).toBeInTheDocument();
      expect(screenOf(container)).toBe('spectate');
    });

    it('shows Spectate to a plain spectator', () => {
      roomStore.set(
        makeSpectatorRoom({ match: { phase: 'pick' }, tournament: makeTournament({ n: 5, youId: null, ...running }) }),
      );
      render(App);
      expect(screen.getByTestId('spectate')).toBeInTheDocument();
    });

    it('switches from the Board to Spectate when the next pairing does not include the player', async () => {
      roomStore.set(
        makeRoom({ match: { phase: 'pick' }, tournament: makeTournament({ n: 5, youId: 'p0', ...running }) }),
      );
      render(App);
      expect(screen.getByRole('region', { name: 'Opponent' })).toBeInTheDocument();
      roomStore.set(
        makeSpectatorRoom({
          me: { id: 'p0' },
          isHost: true,
          match: { phase: 'pick' },
          tournament: makeTournament({ n: 5, youId: 'p0', ...running, pairings: [{ ...pairing, id: 'r1-1', a: 'p2', b: 'p3' }] }),
        }),
      );
      expect(await screen.findByTestId('spectate')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Opponent' })).not.toBeInTheDocument();
    });

    it('switches from the Board to the intermission when the pairing ends for a player', async () => {
      roomStore.set(
        makeRoom({ match: { phase: 'pick' }, tournament: makeTournament({ n: 5, youId: 'p0', ...running }) }),
      );
      render(App);
      expect(screen.getByRole('region', { name: 'Opponent' })).toBeInTheDocument();
      roomStore.set(participantView('intermission', true));
      expect(await screen.findByRole('heading', { name: 'Next match' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Opponent' })).not.toBeInTheDocument();
    });
  });

  describe('intermission', () => {
    it('shows the next-match text and the host a Skip button', async () => {
      roomStore.set(participantView('intermission', true, { untilMs: Date.now() + 6000 }));
      const { container } = render(App);
      expect(screenOf(container)).toBe('tournament-intermission');
      expect(container.querySelectorAll('main')).toHaveLength(1);
      expect(screen.getByRole('heading', { name: 'Next match' })).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole('button', { name: 'Skip' }));
      expect(actions.skipWait).toHaveBeenCalledTimes(1);
    });

    it('names the next pairing and skips forfeited participants', () => {
      const other = { ...pairing, id: 'r1-1', a: 'p2', b: 'p3' };
      const tournament = makeTournament({
        n: 5,
        phase: 'intermission',
        youId: 'p0',
        pairings: [{ ...pairing, winner: 'p0', decidedBy: 'match' as const }, { ...other, a: 'p1', b: 'p2' }, other],
      });
      tournament.participants[1]!.forfeited = true;
      roomStore.set(makeSpectatorRoom({ isHost: true, me: { id: 'p0' }, tournament }));
      render(App);
      expect(screen.getByText('Spieler-p2 vs Spieler-p3')).toBeInTheDocument();
    });

    it('shows a neutral text when no pairing is left', () => {
      const tournament = makeTournament({
        n: 5,
        phase: 'intermission',
        youId: 'p0',
        pairings: [{ ...pairing, winner: 'p0', decidedBy: 'match' as const }, { ...pairing, id: 'r1-1', a: 'p2', b: null }],
      });
      roomStore.set(makeSpectatorRoom({ me: { id: 'p0' }, tournament }));
      render(App);
      expect(screen.getByText('Wrapping up …')).toBeInTheDocument();
    });

    it('routes a pairing member in the intermission here too, and gives non-hosts no Skip', () => {
      roomStore.set(
        makeRoom({ isHost: false, tournament: makeTournament({ n: 5, phase: 'intermission', youId: 'p1' }) }),
      );
      render(App);
      expect(screen.getByRole('heading', { name: 'Next match' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    });
  });

  describe('finished', () => {
    const podium = [
      { rank: 1 as const, ids: ['p2'] },
      { rank: 2 as const, ids: ['p0'] },
      { rank: 3 as const, ids: ['p1', 'p4'] },
    ];

    it('names the podium; the host can play again and everyone can leave', async () => {
      roomStore.set(participantView('finished', true, { podium }));
      const { container } = render(App);
      expect(screenOf(container)).toBe('tournament-result');
      expect(container.querySelectorAll('main')).toHaveLength(1);
      expect(screen.getByRole('heading', { name: 'Podium' })).toBeInTheDocument();
      expect(screen.getByText('Spieler-p2 is the champion!')).toBeInTheDocument();
      expect(screen.getByText('Spieler-p4')).toBeInTheDocument();
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Play again' }));
      expect(actions.rematch).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Back to start' })).toBeInTheDocument();
    });

    it('gives non-hosts and spectators no Play again, but Back to start', async () => {
      roomStore.set(participantView('finished', false, { podium }));
      const { unmount } = render(App);
      expect(screen.queryByRole('button', { name: 'Play again' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Back to start' })).toBeInTheDocument();
      unmount();

      roomStore.set(makeSpectatorRoom({ tournament: makeTournament({ n: 5, phase: 'finished', youId: null, podium }) }));
      render(App);
      expect(screen.queryByRole('button', { name: 'Play again' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Back to start' })).toBeInTheDocument();
    });

    it('forgets the session when leaving', async () => {
      const assign = vi.fn();
      vi.stubGlobal('location', { ...window.location, assign, origin: window.location.origin });
      roomStore.set(participantView('finished', false, { podium }));
      render(App);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Back to start' }));
      expect(actions.leaveRoom).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledWith('/');
      vi.unstubAllGlobals();
    });
  });
});

describe('App routing for duels (regression)', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  it('still routes duel rooms to lobby, board and result', () => {
    roomStore.set(makeRoom({ match: null }));
    const { container, unmount } = render(App);
    expect(screenOf(container)).toBe('lobby');
    unmount();

    roomStore.set(makeRoom({ match: { phase: 'pick' } }));
    const second = render(App);
    expect(screenOf(second.container)).toBe('board');
    second.unmount();

    roomStore.set(makeRoom({ match: { phase: 'finished', winner: 'a' } }));
    const third = render(App);
    expect(screenOf(third.container)).toBe('result');
    third.unmount();

    roomStore.set(makeSpectatorRoom({ match: { phase: 'pick' } }));
    const fourth = render(App);
    expect(screenOf(fourth.container)).toBe('spectate');
  });

  it('treats a duel view with tournament null as no tournament', () => {
    roomStore.set(makeRoom({ match: null, tournament: null }));
    render(App);
    expect(screen.getByRole('heading', { name: 'Lobby' })).toBeInTheDocument();
  });
});
