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
    feed(revealed());
    await tick();

    expect(screen.getByTestId('countdown')).toBeInTheDocument();
    expect(screen.queryByTestId('duel')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent('Runde gewonnen!');
    expect(screen.getByRole('status')).toHaveTextContent('Gewählt – warte auf die anderen …');

    vi.advanceTimersByTime(1260);
    await tick();

    expect(screen.getAllByTestId('duel')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Runde gewonnen!');
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

    await fireEvent.keyDown(window, { key: 'Enter' });
    await tick();
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('duel')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Runde gewonnen!');
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
