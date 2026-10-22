import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { RoomView } from '@rps/shared';
import Board from './Board.svelte';
import { setLocale } from '../lib/i18n';
import { motion } from '../lib/motion';
import { resetConnectionMock, roomStore } from '../test/connection-mock';
import { makeRoom } from '../test/fixtures';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

const feed = (room: RoomView) => roomStore.set(room);

const picking = () => makeRoom({ match: { phase: 'pick', yourPick: 'rock', lockedSeats: ['a0'] } });
const revealed = (lockedSeats: ('a0' | 'b0')[] = ['a0', 'b0']) =>
  makeRoom({
    match: {
      phase: 'reveal',
      yourPick: 'rock',
      lockedSeats,
      score: { a: 1, b: 0 },
      lastRound: { picks: { a0: 'rock', b0: 'scissors' }, duels: [{ seats: ['a0', 'b0'], result: 'a' }], winner: 'a' },
    },
  });

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion: reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('Board reveal countdown', () => {
  beforeEach(() => {
    setLocale('de');
    resetConnectionMock();
    vi.useFakeTimers();
    motion.countdownBeatMs = 420;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    motion.countdownBeatMs = 0;
  });

  it('counts down before the duels appear when the phase switches to reveal', async () => {
    feed(picking());
    render(Board);
    const statusBefore = screen.getByRole('status');
    feed(revealed());
    await tick();

    expect(screen.getByTestId('countdown')).toBeInTheDocument();
    expect(screen.queryByTestId('duel')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent('Runde gewonnen!');
    expect(screen.getByRole('status')).toHaveTextContent('Gewählt – warte auf die anderen …');
    // The scoreboard keeps the old score: the result is not given away before the duels.
    expect(screen.getByRole('group', { name: 'Spielstand' })).toHaveTextContent('0 : 0');

    vi.advanceTimersByTime(1260);
    await tick();

    expect(screen.getAllByTestId('duel')).toHaveLength(1);
    const statusAfter = screen.getByRole('status');
    expect(statusAfter).toBe(statusBefore);
    expect(statusAfter).toHaveTextContent('Runde gewonnen!');
    expect(screen.getByRole('group', { name: 'Spielstand' })).toHaveTextContent('1 : 0');
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
  });

  it('skips the countdown when the client arrives in the middle of a reveal (reconnect)', async () => {
    feed(revealed());
    render(Board);
    await tick();

    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('duel')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Runde gewonnen!');
  });

  it('neither restarts nor ends the countdown on a second reveal update', async () => {
    feed(picking());
    render(Board);
    feed(revealed(['a0']));
    await tick();
    vi.advanceTimersByTime(840);
    await tick();

    const countdown = screen.getByTestId('countdown');
    feed(revealed(['a0', 'b0']));
    await tick();
    expect(screen.getByTestId('countdown')).toBe(countdown);
    expect(screen.queryByTestId('duel')).not.toBeInTheDocument();

    // The original countdown ends on schedule, not 1260 ms after the second update.
    vi.advanceTimersByTime(420);
    await tick();
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('duel')).toHaveLength(1);
  });

  it('drops the countdown when the phase leaves reveal while it runs', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    feed(picking());
    render(Board);
    feed(revealed());
    await tick();
    expect(screen.getByTestId('countdown')).toBeInTheDocument();

    feed(makeRoom({ match: { phase: 'pick', round: 2 } }));
    await tick();
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
    expect(screen.queryByTestId('duel')).not.toBeInTheDocument();

    vi.advanceTimersByTime(5000);
    await tick();
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
    expect(screen.queryByTestId('duel')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Wähle deine Geste!');
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('jumps straight to the duels on a key press', async () => {
    feed(picking());
    render(Board);
    feed(revealed());
    await tick();
    expect(screen.getByTestId('countdown')).toBeInTheDocument();

    expect(screen.getByRole('group', { name: 'Spielstand' })).toHaveTextContent('0 : 0');
    await fireEvent.keyDown(window, { key: 'Enter' });
    await tick();
    expect(screen.getByRole('group', { name: 'Spielstand' })).toHaveTextContent('1 : 0');
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('duel')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Runde gewonnen!');
  });

  it('keeps the pick-phase look of the status during the countdown and the reveal layout after it', async () => {
    feed(picking());
    const { container } = render(Board);
    feed(revealed());
    await tick();
    const board = container.querySelector('main.board');
    expect(board).not.toHaveClass('revealed');
    expect(screen.getByRole('status')).not.toHaveClass('is-revealed');

    vi.advanceTimersByTime(1260);
    await tick();
    expect(board).toHaveClass('revealed');
    expect(screen.getByRole('status')).toHaveClass('is-revealed');
  });

  it('holds the score during the countdown and shows the new one afterwards in team2v2', async () => {
    const config = { mode: 'team2v2', bestOf: 3 } as const;
    feed(makeRoom({ config, match: { phase: 'pick', yourPick: 'rock', lockedSeats: ['a0'] } }));
    render(Board);
    feed(
      makeRoom({
        config,
        match: {
          phase: 'reveal',
          yourPick: 'rock',
          lockedSeats: ['a0', 'a1', 'b0', 'b1'],
          score: { a: 1, b: 0 },
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
    await tick();

    expect(screen.getByTestId('countdown')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Spielstand' })).toHaveTextContent('0 : 0');

    vi.advanceTimersByTime(1260);
    await tick();
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('duel')).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Spielstand' })).toHaveTextContent('1 : 0');
  });

  it('shows the same score during and after the countdown after a draw round', async () => {
    feed(picking());
    render(Board);
    feed(
      makeRoom({
        match: {
          phase: 'reveal',
          yourPick: 'rock',
          lockedSeats: ['a0', 'b0'],
          score: { a: 0, b: 0 },
          lastRound: { picks: { a0: 'rock', b0: 'rock' }, duels: [{ seats: ['a0', 'b0'], result: 'draw' }], winner: 'draw' },
        },
      }),
    );
    await tick();
    expect(screen.getByTestId('countdown')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Spielstand' })).toHaveTextContent('0 : 0');

    vi.advanceTimersByTime(1260);
    await tick();
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('duel')).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Spielstand' })).toHaveTextContent('0 : 0');
  });

  it('keeps the held score when a second reveal update changes lockedSeats during the countdown', async () => {
    feed(picking());
    render(Board);
    feed(revealed(['a0']));
    await tick();
    vi.advanceTimersByTime(420);
    await tick();
    expect(screen.getByRole('group', { name: 'Spielstand' })).toHaveTextContent('0 : 0');

    const countdown = screen.getByTestId('countdown');
    feed(revealed(['a0', 'b0']));
    await tick();
    expect(screen.getByTestId('countdown')).toBe(countdown);
    expect(screen.getByRole('group', { name: 'Spielstand' })).toHaveTextContent('0 : 0');

    // Still ends on the original schedule (1260 ms after the first reveal update), not later.
    vi.advanceTimersByTime(840);
    await tick();
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Spielstand' })).toHaveTextContent('1 : 0');
  });

  it('reveals at once under reduced motion', async () => {
    stubReducedMotion(true);
    feed(picking());
    render(Board);
    feed(revealed());
    await tick();

    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('duel')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Runde gewonnen!');
  });
});
