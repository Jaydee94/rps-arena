import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, tick } from 'svelte';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { BLUFF_EMOTES, getGestureSet, type RoomView } from '@rps/shared';
import Board from './Board.svelte';
import { setLocale } from '../lib/i18n';
import { actions, resetConnectionMock, roomStore } from '../test/connection-mock';
import { makeRoom } from '../test/fixtures';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

const feed = (room: RoomView) => roomStore.set(room);
const opponentPanel = () => screen.getByRole('region', { name: 'Gegner' });

describe('Board', () => {
  beforeEach(() => {
    setLocale('de');
    resetConnectionMock();
  });

  describe('gesture pad', () => {
    it('shows 3 gesture buttons in classic and 15 in wheel15', () => {
      feed(makeRoom({ config: { mode: 'classic', bestOf: 3 } }));
      const { unmount } = render(Board);
      expect(screen.getAllByRole('radio')).toHaveLength(3);
      unmount();

      feed(makeRoom({ config: { mode: 'wheel15', bestOf: 3 } }));
      render(Board);
      expect(screen.getAllByRole('radio')).toHaveLength(getGestureSet('wheel15').gestures.length);
    });

    it('calls pick exactly once on click and disables every button afterwards', async () => {
      feed(makeRoom());
      render(Board);
      const user = userEvent.setup();

      await user.click(screen.getByRole('radio', { name: 'Stein' }));

      expect(actions.pick).toHaveBeenCalledTimes(1);
      expect(actions.pick).toHaveBeenCalledWith('rock');
      for (const button of screen.getAllByRole('radio')) expect(button).toBeDisabled();
      expect(screen.getByRole('radio', { name: 'Stein' })).toHaveAttribute('aria-checked', 'true');

      await user.click(screen.getByRole('radio', { name: 'Papier' }));
      expect(actions.pick).toHaveBeenCalledTimes(1);
    });

    it('keeps the optimistic pick when an unrelated room update arrives before the ack', async () => {
      feed(makeRoom());
      render(Board);
      await userEvent.setup().click(screen.getByRole('radio', { name: 'Stein' }));

      // same round and phase, new room object (e.g. the opponent locked in)
      feed(makeRoom({ match: { lockedSeats: ['b0'] } }));
      await tick();

      for (const button of screen.getAllByRole('radio')) expect(button).toBeDisabled();
      expect(screen.getByRole('radio', { name: 'Stein' })).toHaveAttribute('aria-checked', 'true');
    });

    it('keeps the optimistic announcement across equal-phase room updates', async () => {
      const bluff = (announces = {}) =>
        makeRoom({ config: { mode: 'bluff', bestOf: 3 }, match: { phase: 'announce', announces } });
      feed(bluff());
      render(Board);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Echse' }));
      feed(bluff({ b0: 'spock' }));
      await tick();
      expect(screen.getByRole('button', { name: 'Überspringen' })).toBeDisabled();
    });

    it('disables the buttons and highlights the server-confirmed pick (e.g. after a reload)', () => {
      feed(makeRoom({ match: { yourPick: 'paper' } }));
      render(Board);
      for (const button of screen.getAllByRole('radio')) expect(button).toBeDisabled();
      expect(screen.getByRole('radio', { name: 'Papier' })).toHaveAttribute('aria-checked', 'true');
    });

    it('moves focus with the arrow keys and picks with Enter', async () => {
      feed(makeRoom());
      render(Board);
      const user = userEvent.setup();
      const [rock, scissors, paper] = screen.getAllByRole('radio');

      await user.tab();
      expect(rock).toHaveFocus();
      await user.keyboard('{ArrowRight}');
      expect(scissors).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(paper).toHaveFocus();
      await user.keyboard('{ArrowRight}');
      expect(rock).toHaveFocus();
      await user.keyboard('{ArrowLeft}');
      expect(paper).toHaveFocus();
      expect(actions.pick).not.toHaveBeenCalled();

      await user.keyboard('{Enter}');
      expect(actions.pick).toHaveBeenCalledTimes(1);
      expect(actions.pick).toHaveBeenCalledWith('paper');
    });

    it('picks with Space as well', async () => {
      feed(makeRoom());
      render(Board);
      const user = userEvent.setup();
      await user.tab();
      await user.keyboard(' ');
      expect(actions.pick).toHaveBeenCalledWith('rock');
    });
  });

  describe('bluff announce phase', () => {
    const bluff = () => makeRoom({ config: { mode: 'bluff', bestOf: 3 }, match: { phase: 'announce' } });

    it('shows emote buttons and a skip button instead of the gesture pad', async () => {
      feed(bluff());
      render(Board);
      const emotes = within(screen.getByRole('group', { name: 'Ansagen' }));
      expect(emotes.getAllByRole('button')).toHaveLength(BLUFF_EMOTES.length);
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();

      await userEvent.setup().click(screen.getByRole('button', { name: 'Überspringen' }));
      expect(actions.announce).toHaveBeenCalledTimes(1);
      expect(actions.announce).toHaveBeenCalledWith(null);
    });

    it('announces the clicked emote and locks the announcement buttons', async () => {
      feed(bluff());
      render(Board);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Echse' }));
      expect(actions.announce).toHaveBeenCalledWith('lizard');
      expect(screen.getByRole('button', { name: 'Überspringen' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Echse' })).toBeDisabled();
    });

    it('shows the opponent announcement live', () => {
      feed(makeRoom({ config: { mode: 'bluff', bestOf: 3 }, match: { phase: 'announce', announces: { b0: 'spock' } } }));
      render(Board);
      expect(within(opponentPanel()).getByText(/Spock/)).toBeInTheDocument();
    });
  });

  describe('opponent status and reveal', () => {
    it('only says that the opponent has chosen, never which gesture, before the reveal', () => {
      feed(makeRoom({ match: { phase: 'pick', lockedSeats: ['b0'] } }));
      render(Board);
      const panel = within(opponentPanel());
      expect(panel.getByText('Gegner hat gewählt')).toBeInTheDocument();
      for (const name of ['Stein', 'Schere', 'Papier']) {
        expect(panel.queryByText(name)).not.toBeInTheDocument();
      }
      expect(opponentPanel().textContent).not.toMatch(/Stein|Schere|Papier/);
    });

    it('shows that the opponent is still thinking while nobody is locked', () => {
      feed(makeRoom());
      render(Board);
      expect(within(opponentPanel()).getByText('Gegner überlegt …')).toBeInTheDocument();
    });

    const revealed = (you: 'a0' | 'b0') =>
      makeRoom({
        you,
        match: {
          phase: 'reveal',
          score: { a: 1, b: 0 },
          lastRound: {
            picks: { a0: 'rock', b0: 'scissors' },
            duels: [{ seats: ['a0', 'b0'], result: 'a' }],
            winner: 'a',
          },
        },
      });

    it('shows both gestures and the round result, and "Weiter" calls next', async () => {
      feed(revealed('a0'));
      render(Board);
      expect(within(opponentPanel()).getByText('Schere')).toBeInTheDocument();
      expect(within(screen.getByRole('region', { name: 'Du' })).getByText('Stein')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Runde gewonnen!');
      expect(screen.queryByText('Gegner hat gewählt')).not.toBeInTheDocument();

      await userEvent.setup().click(screen.getByRole('button', { name: 'Weiter' }));
      expect(actions.next).toHaveBeenCalledTimes(1);
    });

    it('reports the round from the perspective of the own team', () => {
      feed(revealed('b0'));
      render(Board);
      expect(screen.getByRole('status')).toHaveTextContent('Runde verloren!');
      expect(within(opponentPanel()).getByText('Stein')).toBeInTheDocument();
    });

    it('reports a missing pick (timeout) without inventing a gesture', () => {
      feed(
        makeRoom({
          match: {
            phase: 'reveal',
            lastRound: { picks: { a0: 'rock' }, duels: [{ seats: ['a0', 'b0'], result: 'a' }], winner: 'a' },
          },
        }),
      );
      render(Board);
      expect(within(opponentPanel()).getByText('Nichts gewählt')).toBeInTheDocument();
    });

    it('shows both duels in team2v2', () => {
      feed(
        makeRoom({
          config: { mode: 'team2v2', bestOf: 3 },
          match: {
            phase: 'reveal',
            lastRound: {
              picks: { a0: 'rock', b0: 'scissors', a1: 'paper', b1: 'scissors' },
              duels: [
                { seats: ['a0', 'b0'], result: 'a' },
                { seats: ['a1', 'b1'], result: 'b' },
              ],
              winner: 'draw',
            },
          },
        }),
      );
      render(Board);
      expect(screen.getAllByTestId('duel')).toHaveLength(2);
      expect(screen.getByRole('status')).toHaveTextContent('Unentschieden!');
    });

    it('explains the round with a rule line under the panel', () => {
      feed(revealed('a0'));
      render(Board);
      expect(screen.getByText('Stein schlägt Schere')).toBeInTheDocument();
    });

    it('names the winning gesture first from the losing side too', () => {
      feed(revealed('b0'));
      render(Board);
      expect(screen.getByText('Stein schlägt Schere')).toBeInTheDocument();
    });

    it('shows no rule line for a draw', () => {
      feed(
        makeRoom({
          match: {
            phase: 'reveal',
            lastRound: { picks: { a0: 'rock', b0: 'rock' }, duels: [{ seats: ['a0', 'b0'], result: 'draw' }], winner: 'draw' },
          },
        }),
      );
      const { container } = render(Board);
      expect(screen.getAllByTestId('duel')).toHaveLength(1);
      expect(screen.queryByText(/schlägt/)).not.toBeInTheDocument();
      expect(container.textContent).not.toContain('undefined');
    });

    it('shows no rule line and no "undefined" when a pick is missing (timeout)', () => {
      feed(
        makeRoom({
          match: {
            phase: 'reveal',
            lastRound: { picks: { a0: 'rock' }, duels: [{ seats: ['a0', 'b0'], result: 'a' }], winner: 'a' },
          },
        }),
      );
      const { container } = render(Board);
      expect(within(opponentPanel()).getByText('Nichts gewählt')).toBeInTheDocument();
      expect(within(opponentPanel()).queryByText(/undefined/)).not.toBeInTheDocument();
      expect(opponentPanel().querySelector('[data-gesture]')).toBeNull();
      expect(screen.queryByText(/schlägt/)).not.toBeInTheDocument();
      expect(container.textContent).not.toContain('undefined');
    });

    it('labels the reveal stickers with name and gesture, one region per name', () => {
      feed(revealed('a0'));
      render(Board);
      expect(screen.getAllByRole('region', { name: 'Du' })).toHaveLength(1);
      expect(screen.getAllByRole('region', { name: 'Gegner' })).toHaveLength(1);
      expect(screen.getByRole('region', { name: 'Du' })).toHaveTextContent('Du · Stein');
      expect(opponentPanel()).toHaveTextContent('Gegner · Schere');
      expect(screen.getByRole('region', { name: 'Du' }).querySelector('[data-gesture="rock"]')).not.toBeNull();
      // The losing side droops; the winner does not.
      expect(opponentPanel()).toHaveClass('loser');
      expect(screen.getByRole('region', { name: 'Du' })).not.toHaveClass('loser');
    });

    it('draws the panel with speed lines, an impact flash and a burst in each duel', () => {
      feed(revealed('a0'));
      render(Board);
      const duel = screen.getByTestId('duel');
      expect(duel).toHaveClass('clash');
      expect(duel.querySelector('.speed-lines[aria-hidden="true"]')).not.toBeNull();
      expect(duel.querySelector('.impact-flash[aria-hidden="true"]')).not.toBeNull();
      expect(duel.querySelector('.burst--pow')).toHaveTextContent('POW!');
    });

    it('keeps the named regions of both duels in team2v2', () => {
      feed(
        makeRoom({
          config: { mode: 'team2v2', bestOf: 3 },
          match: {
            phase: 'reveal',
            lastRound: {
              picks: { a0: 'rock', b0: 'scissors', a1: 'paper', b1: 'scissors' },
              duels: [
                { seats: ['a0', 'b0'], result: 'a' },
                { seats: ['a1', 'b1'], result: 'b' },
              ],
              winner: 'draw',
            },
          },
        }),
      );
      render(Board);
      const [first, second] = screen.getAllByTestId('duel') as [HTMLElement, HTMLElement];
      expect(within(first).getByRole('region', { name: 'Spieler-a0' })).toHaveTextContent('Stein');
      expect(within(first).getByRole('region', { name: 'Spieler-b0' })).toHaveTextContent('Schere');
      expect(within(second).getByRole('region', { name: 'Spieler-a1' })).toHaveTextContent('Papier');
      expect(within(second).getByRole('region', { name: 'Spieler-b1' })).toHaveTextContent('Schere');
      expect(screen.getAllByRole('region', { name: 'Spieler-a0' })).toHaveLength(1);
      expect(screen.getByText('Stein schlägt Schere')).toBeInTheDocument();
      expect(screen.getByText('Schere schlägt Papier')).toBeInTheDocument();
    });

    it('shows the same rule twice when both 2v2 duels end alike', () => {
      feed(
        makeRoom({
          config: { mode: 'team2v2', bestOf: 3 },
          match: {
            phase: 'reveal',
            lastRound: {
              picks: { a0: 'rock', b0: 'scissors', a1: 'rock', b1: 'scissors' },
              duels: [
                { seats: ['a0', 'b0'], result: 'a' },
                { seats: ['a1', 'b1'], result: 'a' },
              ],
              winner: 'a',
            },
          },
        }),
      );
      render(Board);
      expect(screen.getAllByText('Stein schlägt Schere')).toHaveLength(2);
    });
  });

  describe('comic pick screen', () => {
    it('swaps the thinking bubble for a ZACK star once the opponent has chosen', () => {
      feed(makeRoom());
      const { unmount } = render(Board);
      expect(opponentPanel().querySelector('.burst--zack')).toBeNull();
      unmount();

      feed(makeRoom({ match: { lockedSeats: ['b0'] } }));
      render(Board);
      const panel = within(opponentPanel());
      expect(panel.getByText('Gegner hat gewählt')).toBeInTheDocument();
      expect(opponentPanel().querySelector('.burst--zack')).toHaveTextContent('ZACK!');
    });

    it('puts the seconds inside the timer track', () => {
      feed(makeRoom({ deadline: Date.now() + 5_000 }));
      render(Board);
      const track = screen.getByRole('timer').querySelector('.track');
      expect(track).not.toBeNull();
      expect(within(track as HTMLElement).getByText(/^\d+ s$/)).toBeInTheDocument();
    });

    it('gives each of the 15 wheel gestures a tile tone', () => {
      feed(makeRoom({ config: { mode: 'wheel15', bestOf: 3 } }));
      render(Board);
      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(15);
      for (const radio of radios) expect(radio.className).toMatch(/\btone-[0-6]\b/);
    });

    it('keeps the own nickname in the "Du" region during the pick phase', () => {
      feed(makeRoom());
      render(Board);
      const mine = screen.getByRole('region', { name: 'Du' });
      expect(mine).toHaveTextContent('Spieler-a0');
      expect(screen.getByRole('status')).toHaveTextContent('Wähle deine Geste!');
      expect(opponentPanel()).toHaveTextContent('Spieler-b0');
    });

    it('keeps one status node, and its focus, from the pick to the reveal', async () => {
      feed(makeRoom());
      render(Board);
      const status = screen.getByRole('status');
      status.focus();
      expect(status).toHaveFocus();

      feed(
        makeRoom({
          match: {
            phase: 'reveal',
            score: { a: 1, b: 0 },
            lastRound: { picks: { a0: 'rock', b0: 'scissors' }, duels: [{ seats: ['a0', 'b0'], result: 'a' }], winner: 'a' },
          },
        }),
      );
      await tick();

      expect(screen.getByRole('status')).toBe(status);
      expect(status).toHaveTextContent('Runde gewonnen!');
      expect(status).toHaveFocus();
    });

    it('shows team dots instead of avatars in the 2v2 scoreboard', () => {
      feed(makeRoom({ config: { mode: 'team2v2', bestOf: 3 } }));
      const { container } = render(Board);
      expect(container.querySelectorAll('.scoreboard .team-dot')).toHaveLength(2);
      expect(container.querySelector('.scoreboard [data-avatar]')).toBeNull();
    });
  });

  describe('scoreboard and timer', () => {
    afterEach(() => vi.useRealTimers());

    it('shows round, best-of and the score', () => {
      feed(makeRoom({ match: { round: 2, score: { a: 1, b: 0 } } }));
      render(Board);
      expect(screen.getByText('Runde 2')).toBeInTheDocument();
      expect(screen.getByText('Best of 3')).toBeInTheDocument();
      expect(screen.getByLabelText('Spielstand')).toHaveTextContent('1 : 0');
    });

    it('counts down to the deadline and clamps at 0 when the clock is ahead', () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      vi.setSystemTime(1_000_000);
      feed(makeRoom({ deadline: 1_005_000 }));
      render(Board);
      flushSync();
      expect(screen.getByRole('timer')).toHaveTextContent('5 s');
      vi.advanceTimersByTime(10_000);
      flushSync();
      expect(screen.getByRole('timer')).toHaveTextContent('0 s');
    });

    it('shows no timer without a deadline', () => {
      feed(makeRoom({ deadline: null }));
      render(Board);
      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    });
  });
});
