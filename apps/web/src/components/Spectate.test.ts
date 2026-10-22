import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { SpectatorView } from '@rps/shared';
import Spectate from './Spectate.svelte';
import { setLocale } from '../lib/i18n';
import { motion } from '../lib/motion';
import { actions, resetConnectionMock, roomStore } from '../test/connection-mock';
import { makeSpectatorRoom } from '../test/fixtures';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

const feed = (room: SpectatorView) => roomStore.set(room);

const picking = (lockedSeats: ('a0' | 'b0')[] = ['b0']) =>
  makeSpectatorRoom({ match: { phase: 'pick', lockedSeats } });
const revealed = (score = { a: 1, b: 0 }) =>
  makeSpectatorRoom({
    match: {
      phase: 'reveal',
      score,
      lastRound: { picks: { a0: 'rock', b0: 'scissors' }, duels: [{ seats: ['a0', 'b0'], result: 'a' }], winner: 'a' },
    },
  });

describe('Spectate', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  describe('pick phase', () => {
    it('shows who has locked in and who is still thinking, never a gesture', () => {
      feed(picking(['b0']));
      render(Spectate);

      expect(screen.getByText('You are watching')).toBeInTheDocument();
      expect(screen.getByText('Spieler-b0 has locked in')).toBeInTheDocument();
      expect(screen.getByText('Spieler-a0 is thinking…')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Spieler-a0' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Spieler-b0' })).toBeInTheDocument();
      for (const gesture of ['Rock', 'Paper', 'Scissors']) expect(screen.queryByText(gesture)).not.toBeInTheDocument();
    });

    it('offers no gesture pad, camera, next button or rules', () => {
      feed(picking());
      render(Spectate);

      expect(screen.queryAllByRole('radio')).toHaveLength(0);
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(document.querySelector('video, .camera')).toBeNull();
    });

    it('shows the scoreboard with both players and without "You", plus the timer', () => {
      feed(makeSpectatorRoom({ deadline: Date.now() + 9000, match: { phase: 'pick', score: { a: 2, b: 1 } } }));
      render(Spectate);

      expect(screen.getByRole('group', { name: 'Score' })).toHaveTextContent('2 : 1');
      expect(screen.getByRole('timer')).toBeInTheDocument();
      expect(screen.queryByText('You')).not.toBeInTheDocument();
      expect(screen.queryByText('Opponent')).not.toBeInTheDocument();
    });

    it('keeps one persistent status node across updates', async () => {
      feed(picking([]));
      render(Spectate);
      const status = screen.getByRole('status');
      expect(screen.getAllByRole('status')).toHaveLength(1);

      feed(picking(['a0']));
      await tick();
      expect(screen.getByRole('status')).toBe(status);
      expect(screen.getByText('Spieler-a0 has locked in')).toBeInTheDocument();
    });
  });

  describe('reveal', () => {
    it('shows both gestures, the duel panel and the result, without a next button', () => {
      feed(revealed());
      render(Spectate);

      expect(screen.getAllByTestId('duel')).toHaveLength(1);
      const duel = screen.getByTestId('duel');
      expect(within(duel).getByText(/Rock/)).toBeInTheDocument();
      expect(within(duel).getByText(/Scissors/)).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Spieler-a0 wins the round!');
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryAllByRole('radio')).toHaveLength(0);
    });

    it('calls a drawn round a draw', () => {
      feed(
        makeSpectatorRoom({
          match: {
            phase: 'reveal',
            lastRound: { picks: { a0: 'rock', b0: 'rock' }, duels: [{ seats: ['a0', 'b0'], result: 'draw' }], winner: 'draw' },
          },
        }),
      );
      render(Spectate);
      expect(screen.getByRole('status')).toHaveTextContent("It's a draw!");
    });
  });

  describe('finished', () => {
    const finished = (winner: 'a' | 'b' | null = 'b') =>
      makeSpectatorRoom({ match: { phase: 'finished', round: 4, score: { a: 1, b: 2 }, winner } });

    it('shows the winner and a way back to the start', async () => {
      const assign = vi.fn();
      vi.stubGlobal('location', { ...window.location, assign });
      feed(finished());
      render(Spectate);

      expect(screen.getByText('Match finished')).toBeInTheDocument();
      expect(screen.getByText('Spieler-b0 wins the match!')).toBeInTheDocument();
      expect(screen.queryByTestId('duel')).not.toBeInTheDocument();

      await userEvent.setup().click(screen.getByRole('button', { name: 'Back to start' }));
      expect(actions.forgetSession).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledWith('/');
      vi.unstubAllGlobals();
    });

    it('does not name a winner when the match was abandoned', () => {
      feed(finished(null));
      render(Spectate);
      expect(screen.getByText('Match ended early')).toBeInTheDocument();
      expect(screen.queryByText(/wins the match/)).not.toBeInTheDocument();
    });
  });

  describe('team mode', () => {
    it('names the teams on the scoreboard and in the result', () => {
      feed(
        makeSpectatorRoom({
          config: { mode: 'team2v2', bestOf: 3 },
          match: { phase: 'finished', score: { a: 2, b: 0 }, winner: 'a' },
        }),
      );
      render(Spectate);
      expect(screen.getByText('Team Red wins the match!')).toBeInTheDocument();
    });
  });

  describe('countdown', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      motion.countdownBeatMs = 420;
    });

    afterEach(() => {
      vi.useRealTimers();
      motion.countdownBeatMs = 0;
      vi.unstubAllGlobals();
    });

    it('counts down after pick -> reveal, holds the score and the old status, then shows the duels', async () => {
      feed(picking(['a0', 'b0']));
      render(Spectate);
      const status = screen.getByRole('status');
      feed(revealed());
      await tick();

      expect(screen.getByTestId('countdown')).toBeInTheDocument();
      expect(screen.queryByTestId('duel')).not.toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Score' })).toHaveTextContent('0 : 0');
      expect(screen.getByRole('status')).not.toHaveTextContent('wins the round');

      vi.advanceTimersByTime(1260);
      await tick();

      expect(screen.getAllByTestId('duel')).toHaveLength(1);
      expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toBe(status);
      expect(screen.getByRole('status')).toHaveTextContent('Spieler-a0 wins the round!');
      expect(screen.getByRole('group', { name: 'Score' })).toHaveTextContent('1 : 0');
    });

    it('ends the countdown on a key press', async () => {
      feed(picking(['a0', 'b0']));
      render(Spectate);
      feed(revealed());
      await tick();
      expect(screen.getByTestId('countdown')).toBeInTheDocument();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      await tick();

      expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('duel')).toHaveLength(1);
      expect(screen.getByRole('group', { name: 'Score' })).toHaveTextContent('1 : 0');
    });

    it('skips the countdown when the spectator arrives in the middle of a reveal', async () => {
      feed(revealed());
      render(Spectate);
      await tick();
      expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('duel')).toHaveLength(1);
    });
  });
});
