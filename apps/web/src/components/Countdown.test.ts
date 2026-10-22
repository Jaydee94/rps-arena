import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../lib/i18n';
import { motion } from '../lib/motion';
import Countdown from './Countdown.svelte';

beforeEach(() => {
  setLocale('de');
  vi.useFakeTimers();
  motion.countdownBeatMs = 420;
});

afterEach(() => {
  vi.useRealTimers();
  motion.countdownBeatMs = 0;
});

describe('Countdown', () => {
  it('shows the words one beat after the other and keeps the earlier ones', async () => {
    const onDone = vi.fn();
    render(Countdown, { onDone });
    expect(screen.getByText('SCHNICK!')).toBeInTheDocument();
    expect(screen.queryByText('SCHNACK!')).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(420);
    expect(screen.getByText('SCHNICK!')).toBeInTheDocument();
    expect(screen.getByText('SCHNACK!')).toBeInTheDocument();
    expect(screen.queryByText('SCHNUCK!')).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(420);
    expect(screen.getByText('SCHNUCK!')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('calls onDone exactly once after the third beat', async () => {
    const onDone = vi.fn();
    render(Countdown, { onDone });
    await vi.advanceTimersByTimeAsync(1260);
    expect(onDone).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('is hidden from assistive technology and shows two question mark stickers', () => {
    render(Countdown, { onDone: vi.fn() });
    const root = screen.getByTestId('countdown');
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root).toHaveClass('countdown');
    expect(root.querySelectorAll('.qmark')).toHaveLength(2);
  });

  it('skips to onDone on a key press and does not fire again from the timer', async () => {
    const onDone = vi.fn();
    render(Countdown, { onDone });
    await fireEvent.keyDown(window);
    expect(onDone).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('skips to onDone on a pointer press and does not fire again from the timer', async () => {
    const onDone = vi.fn();
    render(Countdown, { onDone });
    await fireEvent.pointerDown(window);
    expect(onDone).toHaveBeenCalledTimes(1);
    await fireEvent.keyDown(window);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not call onDone after unmount', async () => {
    const onDone = vi.fn();
    const { unmount } = render(Countdown, { onDone });
    await vi.advanceTimersByTimeAsync(420);
    unmount();
    await vi.advanceTimersByTimeAsync(5000);
    await fireEvent.keyDown(window);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('calls onDone right away when the beat length is 0', () => {
    motion.countdownBeatMs = 0;
    const onDone = vi.fn();
    render(Countdown, { onDone });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
