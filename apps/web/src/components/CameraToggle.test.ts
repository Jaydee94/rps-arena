import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import CameraToggle from './CameraToggle.svelte';
import { CameraError, startRecognizer } from '../lib/camera/recognizer';
import { setLocale } from '../lib/i18n';
import de from '../lib/locales/de.json';
import en from '../lib/locales/en.json';

vi.mock('../lib/camera/recognizer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/camera/recognizer')>()),
  startRecognizer: vi.fn(),
}));

type OnFrame = (name: string, score: number) => void;

const CLASSIC = ['rock', 'paper', 'scissors'];
const start = vi.mocked(startRecognizer);
const stop = vi.fn();
let onFrame: OnFrame;
let now = 0;

/** Makes the next startRecognizer() succeed and captures the frame callback. */
function recognizerWorks() {
  start.mockImplementation((_video, callback) => {
    onFrame = callback;
    return Promise.resolve({ stop });
  });
}

/** Feeds frames of the same pose from `from` to `to` ms in 100 ms steps. */
function hold(name: string, from: number, to: number, score = 0.9) {
  for (let at = from; at <= to; at += 100) {
    now = at;
    onFrame(name, score);
  }
}

const toggle = () => screen.getByRole('button', { name: /Gestensteuerung per Kamera|Camera gesture control/ });

async function enable(props: Partial<{ disabled: boolean; gestures: string[] }> = {}) {
  const onpick = vi.fn();
  const view = render(CameraToggle, { gestures: CLASSIC, onpick, disabled: false, ...props });
  await userEvent.setup().click(toggle());
  await waitFor(() => expect(start).toHaveBeenCalled());
  return { onpick, ...view };
}

describe('CameraToggle', () => {
  beforeEach(() => {
    setLocale('de');
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    start.mockReset();
    stop.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is off by default and starts nothing on mount', () => {
    render(CameraToggle, { gestures: CLASSIC, onpick: vi.fn(), disabled: false });

    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    expect(start).not.toHaveBeenCalled();
    expect(document.querySelector('video')).toBeNull();
    expect(screen.getByText(de['camera.privacy'])).toBeInTheDocument();
    expect(screen.getByText(de['camera.experimental'])).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeEmptyDOMElement();
  });

  it('never persists the camera consent', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    recognizerWorks();
    await enable();

    expect(setItem).not.toHaveBeenCalled();
  });

  it('starts the recognizer on a muted inline video once enabled', async () => {
    recognizerWorks();
    await enable();

    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video!.muted).toBe(true);
    expect(video).toHaveAttribute('playsinline');
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]![0]).toBe(video);
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(de['camera.hold'])).toBeInTheDocument();
  });

  it.each(['denied', 'no_device', 'load_failed'] as const)(
    'shows the localized %s message, switches off and stays retryable',
    async (code) => {
      start.mockRejectedValue(new CameraError(code));
      await enable();

      expect(await screen.findByRole('alert')).toHaveTextContent(de[`camera.${code}`]);
      expect(toggle()).toHaveAttribute('aria-pressed', 'false');
      expect(toggle()).toBeEnabled();
      expect(document.querySelector('video')).toBeNull();

      recognizerWorks();
      await userEvent.setup().click(toggle());
      await waitFor(() => expect(toggle()).toHaveAttribute('aria-pressed', 'true'));
      expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    },
  );

  it('localizes the error message in English', async () => {
    setLocale('en');
    start.mockRejectedValue(new CameraError('denied'));
    await enable();

    expect(await screen.findByRole('alert')).toHaveTextContent(en['camera.denied']);
  });

  it('treats an unexpected error as load_failed', async () => {
    start.mockRejectedValue(new Error('boom'));
    await enable();

    expect(await screen.findByRole('alert')).toHaveTextContent(de['camera.load_failed']);
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onpick exactly once for a confirmed gesture', async () => {
    recognizerWorks();
    const { onpick } = await enable();

    hold('Closed_Fist', 0, 800);
    expect(onpick).not.toHaveBeenCalled();
    hold('Closed_Fist', 900, 3000);

    expect(onpick).toHaveBeenCalledTimes(1);
    expect(onpick).toHaveBeenCalledWith('rock');
  });

  it('does not pick when the pose changes before the hold time is over', async () => {
    recognizerWorks();
    const { onpick } = await enable();

    hold('Closed_Fist', 0, 600);
    hold('Open_Palm', 700, 1400);
    hold('None', 1500, 1600);
    hold('Closed_Fist', 1700, 2400);

    expect(onpick).not.toHaveBeenCalled();
  });

  it('ignores gestures that are not part of the offered set', async () => {
    recognizerWorks();
    const { onpick } = await enable({ gestures: ['rock', 'scissors'] });

    hold('Open_Palm', 0, 2000);

    expect(onpick).not.toHaveBeenCalled();
  });

  it('ignores a confirmed gesture while disabled and resets when enabled again', async () => {
    recognizerWorks();
    const { onpick, rerender } = await enable({ disabled: true });

    hold('Closed_Fist', 0, 2000);
    expect(onpick).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled(); // the recognizer keeps running

    await rerender({ gestures: CLASSIC, onpick, disabled: false });
    hold('Closed_Fist', 2100, 2900); // 800 ms since the reset: not enough yet
    expect(onpick).not.toHaveBeenCalled();
    hold('Closed_Fist', 3000, 3100);
    expect(onpick).toHaveBeenCalledTimes(1);
    expect(onpick).toHaveBeenCalledWith('rock');
  });

  it('stops the recognizer when toggled off', async () => {
    recognizerWorks();
    await enable();

    await userEvent.setup().click(toggle());

    expect(stop).toHaveBeenCalledTimes(1);
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    expect(document.querySelector('video')).toBeNull();
  });

  it('stops the recognizer when the component is destroyed', async () => {
    recognizerWorks();
    const { unmount } = await enable();

    unmount();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('stops a recognizer that finishes starting after the toggle was switched off', async () => {
    let resolve!: (handle: { stop(): void }) => void;
    start.mockImplementation(
      () => new Promise((done) => { resolve = done; }),
    );
    await enable();

    await userEvent.setup().click(toggle()); // off again while still loading
    resolve({ stop });

    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('aborts a start that is still loading when toggled off or destroyed, without showing an error', async () => {
    const signals: AbortSignal[] = [];
    start.mockImplementation((_video, _callback, signal) => {
      signals.push(signal!);
      return new Promise((_resolve, reject) =>
        signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
      );
    });
    const { unmount } = await enable();
    expect(signals[0]!.aborted).toBe(false);

    await userEvent.setup().click(toggle());

    expect(signals[0]!.aborted).toBe(true);
    await tick();
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');

    await userEvent.setup().click(toggle());
    await waitFor(() => expect(signals).toHaveLength(2));
    unmount();
    expect(signals[1]!.aborted).toBe(true);
  });

  it('switches off and stops when the page becomes hidden', async () => {
    recognizerWorks();
    await enable();

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(toggle()).toHaveAttribute('aria-pressed', 'false'));
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
