import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Board from './Board.svelte';
import { CameraError, startRecognizer } from '../lib/camera/recognizer';
import { setLocale } from '../lib/i18n';
import de from '../lib/locales/de.json';
import { actions, resetConnectionMock, roomStore } from '../test/connection-mock';
import { makeRoom } from '../test/fixtures';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);
vi.mock('../lib/camera/recognizer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/camera/recognizer')>()),
  startRecognizer: vi.fn(),
}));

const start = vi.mocked(startRecognizer);
const toggle = () => screen.queryByRole('button', { name: /Gestensteuerung per Kamera/ });

describe('Board camera toggle', () => {
  beforeEach(() => {
    setLocale('de');
    resetConnectionMock();
    start.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['classic', 'team2v2'] as const)('is offered in %s mode', (mode) => {
    roomStore.set(makeRoom({ config: { mode, bestOf: 3 } }));
    render(Board);

    expect(toggle()).toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
  });

  it.each(['lizard-spock', 'wheel7', 'wheel9', 'wheel15', 'bluff'] as const)('is not offered in %s mode', (mode) => {
    roomStore.set(makeRoom({ config: { mode, bestOf: 3 } }));
    render(Board);

    expect(toggle()).toBeNull();
  });

  it('picks through the normal pick handler, exactly once, and keeps the optimistic lock', async () => {
    let onFrame!: (name: string, score: number) => void;
    const stop = vi.fn();
    start.mockImplementation((_video, callback) => {
      onFrame = callback;
      return Promise.resolve({ stop });
    });
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    roomStore.set(makeRoom());
    render(Board);

    await userEvent.setup().click(toggle()!);
    await waitFor(() => expect(start).toHaveBeenCalled());
    for (now = 0; now <= 3000; now += 100) onFrame('Open_Palm', 0.95);

    expect(actions.pick).toHaveBeenCalledTimes(1);
    expect(actions.pick).toHaveBeenCalledWith('paper');
    await waitFor(() => {
      for (const button of screen.getAllByRole('radio')) expect(button).toBeDisabled();
    });
    expect(screen.getByRole('radio', { name: 'Papier' })).toHaveAttribute('aria-checked', 'true');
    expect(stop).not.toHaveBeenCalled(); // keeps running for the next round
  });

  it('keeps the gesture buttons usable when the camera is denied', async () => {
    start.mockRejectedValue(new CameraError('denied'));
    roomStore.set(makeRoom());
    render(Board);

    await userEvent.setup().click(toggle()!);

    expect(await screen.findByRole('alert')).toHaveTextContent(de['camera.denied']);
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    const buttons = screen.getAllByRole('radio');
    expect(buttons).toHaveLength(3);
    for (const button of buttons) expect(button).toBeEnabled();

    await userEvent.setup().click(screen.getByRole('radio', { name: 'Stein' }));
    expect(actions.pick).toHaveBeenCalledWith('rock');
  });

  it('stops the camera when the board is left', async () => {
    const stop = vi.fn();
    start.mockResolvedValue({ stop });
    roomStore.set(makeRoom());
    const { unmount } = render(Board);
    await userEvent.setup().click(toggle()!);
    await waitFor(() => expect(start).toHaveBeenCalled());
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-pressed', 'true'));

    unmount();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
