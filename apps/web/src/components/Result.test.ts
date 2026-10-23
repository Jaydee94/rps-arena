import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Result from './Result.svelte';
import { setLocale } from '../lib/i18n';
import { actions, resetConnectionMock, roomStore } from '../test/connection-mock';
import { makeRoom } from '../test/fixtures';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

describe('Result', () => {
  beforeEach(() => {
    setLocale('de');
    resetConnectionMock();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows a win from the perspective of the own team with the final score', () => {
    roomStore.set(makeRoom({ match: { phase: 'finished', winner: 'a', score: { a: 2, b: 1 } } }));
    render(Result);
    expect(screen.getByRole('heading', { name: 'Du hast gewonnen!' })).toBeInTheDocument();
    expect(screen.getByText('Endstand 2 : 1')).toBeInTheDocument();
  });

  it('shows a loss and puts the own score first for team b', () => {
    roomStore.set(makeRoom({ you: 'b0', match: { phase: 'finished', winner: 'a', score: { a: 2, b: 1 } } }));
    render(Result);
    expect(screen.getByRole('heading', { name: 'Diesmal verloren.' })).toBeInTheDocument();
    expect(screen.getByText('Endstand 1 : 2')).toBeInTheDocument();
  });

  it('shows a win with the confetti and the win burst', () => {
    roomStore.set(makeRoom({ match: { phase: 'finished', winner: 'a' } }));
    const { container } = render(Result);
    expect(container.querySelector('.confetti')).not.toBeNull();
    expect(screen.getByText('SIEG!')).toBeInTheDocument();
  });

  it.each([
    ['a', 'Du hast gewonnen!'],
    ['b', 'Diesmal verloren.'],
    [null, 'Spiel vorzeitig beendet'],
  ] as const)('puts the headline (winner %s) in a panel box', (winner, name) => {
    roomStore.set(makeRoom({ match: { phase: 'finished', winner } }));
    render(Result);
    const box = screen.getByRole('heading', { level: 2, name }).closest('.panel');
    expect(box).not.toBeNull();
  });

  describe.each([
    ['de', 'Spiel vorzeitig beendet', 'Endstand 1 : 1', 'Endstand 2 : 0', 'Endstand 0 : 2', 'Das Spiel konnte nicht weitergeführt werden.', 'Nochmal spielen', 'Zum Start'],
    ['en', 'Match ended early', 'Final score 1 : 1', 'Final score 2 : 0', 'Final score 0 : 2', 'The match could not be continued.', 'Play again', 'Back to start'],
  ] as const)('without a winner (%s)', (locale, headline, score, scoreLead, scoreTrail, hint, rematch, leave) => {
    beforeEach(() => {
      setLocale(locale);
      roomStore.set(makeRoom({ you: 'b0', match: { phase: 'finished', winner: null, score: { a: 1, b: 1 } } }));
    });

    it.each([
      ['b0', scoreTrail],
      ['a0', scoreLead],
    ] as const)('keeps the neutral headline and shows a non-zero score (viewer %s)', (you, expected) => {
      roomStore.set(makeRoom({ you, match: { phase: 'finished', winner: null, score: { a: 2, b: 0 } } }));
      render(Result);
      expect(screen.getByRole('heading', { name: headline })).toBeInTheDocument();
      expect(screen.getByText(expected)).toBeInTheDocument();
      expect(screen.queryByText(/niemand|nobody/i)).toBeNull();
    });

    it('shows a neutral headline, no win/lose text and the final score', () => {
      render(Result);
      expect(screen.getByRole('heading', { name: headline })).toBeInTheDocument();
      expect(screen.getByText(score)).toBeInTheDocument();
      expect(screen.getByText(hint)).toBeInTheDocument();
      for (const text of ['Du hast gewonnen!', 'Diesmal verloren.', 'You won the match!', 'Not this time.', 'SIEG!', 'AUA!', 'WIN!', 'OUCH!']) {
        expect(screen.queryByText(text)).toBeNull();
      }
    });

    it('has no confetti, no burst and neither win nor lose styling', () => {
      const { container } = render(Result);
      expect(container.querySelector('.confetti')).toBeNull();
      expect(container.querySelector('.burst-spot')).toBeNull();
      expect(container.querySelector('.result-win, .result-lose')).toBeNull();
    });

    it('keeps the rematch and leave actions', () => {
      render(Result);
      expect(screen.getAllByRole('button').map((b) => b.textContent?.trim())).toEqual([rematch, leave]);
    });
  });

  it('names the winning team in team2v2', () => {
    roomStore.set(
      makeRoom({ config: { mode: 'team2v2', bestOf: 3 }, you: 'b1', match: { phase: 'finished', winner: 'b', score: { a: 0, b: 2 } } }),
    );
    render(Result);
    expect(screen.getByText('Team B gewinnt!')).toBeInTheDocument();
  });

  it('mentions players who left', () => {
    roomStore.set(makeRoom({ match: { phase: 'finished', winner: 'a', forfeited: ['b0'] } }));
    render(Result);
    expect(screen.getByText('Spieler-b0 hat das Spiel verlassen.')).toBeInTheDocument();
  });

  it('offers a rematch after an abandoned match', async () => {
    roomStore.set(makeRoom({ match: { phase: 'finished', winner: null } }));
    render(Result);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Nochmal spielen' }));
    expect(actions.rematch).toHaveBeenCalledTimes(1);
  });

  it('offers a rematch', async () => {
    roomStore.set(makeRoom({ match: { phase: 'finished', winner: 'a' } }));
    render(Result);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Nochmal spielen' }));
    expect(actions.rematch).toHaveBeenCalledTimes(1);
  });

  it('forgets the session and reloads the start page on "Zum Start"', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    roomStore.set(makeRoom({ match: { phase: 'finished', winner: 'a' } }));
    render(Result);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Zum Start' }));
    expect(actions.leaveRoom).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/');
  });
});
