import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import CameraToggle from './CameraToggle.svelte';
import { setLocale } from '../lib/i18n';

// The real startRecognizer runs here; only the MediaPipe library is replaced by one that never finishes loading.
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: () => new Promise(() => {}) },
  GestureRecognizer: { createFromOptions: () => new Promise(() => {}) },
}));

const getUserMedia = vi.fn();

describe('CameraToggle while the recognizer is still loading', () => {
  beforeEach(() => {
    setLocale('de');
    getUserMedia.mockReset();
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never opens the camera, so toggling off or leaving cannot leave a stream running', async () => {
    const user = userEvent.setup();
    const { unmount } = render(CameraToggle, { gestures: ['rock'], onpick: vi.fn(), disabled: false });
    const toggle = () => screen.getByRole('button', { name: /Gestensteuerung per Kamera/ });

    await user.click(toggle());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
    expect(getUserMedia).not.toHaveBeenCalled();

    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle());
    unmount();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
