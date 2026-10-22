import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraError, startRecognizer as realStart } from './recognizer';

const close = vi.fn();
const recognizeForVideo = vi.fn();
const createFromOptions = vi.fn();
const forVisionTasks = vi.fn();

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: (...args: unknown[]) => forVisionTasks(...args) },
  GestureRecognizer: { createFromOptions: (...args: unknown[]) => createFromOptions(...args) },
}));

const track = { stop: vi.fn() };
const stream = { getTracks: () => [track] } as unknown as MediaStream;
let getUserMedia: ReturnType<typeof vi.fn>;
let video: HTMLVideoElement;
let frameCallbacks: FrameRequestCallback[];
const handles: { stop(): void }[] = [];

// Every started recognizer is stopped afterwards so no visibilitychange listener leaks into the next test.
const startRecognizer: typeof realStart = async (...args) => {
  const handle = await realStart(...args);
  handles.push(handle);
  return handle;
};

beforeEach(() => {
  getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  video = document.createElement('video');
  video.play = vi.fn().mockResolvedValue(undefined);
  frameCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frameCallbacks.push(cb));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  forVisionTasks.mockResolvedValue({ wasmLoaderPath: 'x', wasmBinaryPath: 'y' });
  createFromOptions.mockResolvedValue({ recognizeForVideo, close });
  recognizeForVideo.mockReturnValue({ gestures: [[{ categoryName: 'Victory', score: 0.91 }]] });
});

afterEach(() => {
  handles.splice(0).forEach((handle) => handle.stop());
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const domError = (name: string) => Object.assign(new Error(name), { name });

describe('startRecognizer', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'no_device'],
    ['NotReadableError', 'no_device'],
  ])('maps getUserMedia %s to CameraError(%s)', async (name, code) => {
    getUserMedia.mockRejectedValue(domError(name));

    await expect(startRecognizer(video, vi.fn())).rejects.toMatchObject({ code });
    await expect(startRecognizer(video, vi.fn())).rejects.toBeInstanceOf(CameraError);
  });

  it('reports no_device when the browser has no media devices API', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });

    await expect(startRecognizer(video, vi.fn())).rejects.toMatchObject({ code: 'no_device' });
  });

  it('asks for the front camera in 640x480', async () => {
    await startRecognizer(video, vi.fn());

    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'user', width: 640, height: 480 } });
  });

  it('loads wasm and model from our own origin, GPU first', async () => {
    await startRecognizer(video, vi.fn());

    expect(forVisionTasks).toHaveBeenCalledWith('/mediapipe-wasm');
    expect(createFromOptions).toHaveBeenCalledTimes(1);
    expect(createFromOptions.mock.calls[0]![1]).toMatchObject({
      baseOptions: { modelAssetPath: '/models/gesture_recognizer.task', delegate: 'GPU' },
      runningMode: 'VIDEO',
    });
  });

  it('falls back to the CPU delegate when GPU init throws', async () => {
    createFromOptions.mockRejectedValueOnce(new Error('no webgl'));

    await startRecognizer(video, vi.fn());

    expect(createFromOptions).toHaveBeenCalledTimes(2);
    expect(createFromOptions.mock.calls[1]![1].baseOptions.delegate).toBe('CPU');
  });

  it('throws load_failed and releases the camera when the model cannot be loaded', async () => {
    createFromOptions.mockRejectedValue(new Error('404'));

    await expect(startRecognizer(video, vi.fn())).rejects.toMatchObject({ code: 'load_failed' });
    expect(track.stop).toHaveBeenCalled();
  });

  it('reports the top gesture of each processed frame and "" when no hand is visible', async () => {
    const onFrame = vi.fn();
    Object.defineProperty(video, 'readyState', { value: 4 });
    await startRecognizer(video, onFrame);

    vi.spyOn(performance, 'now').mockReturnValue(1000);
    frameCallbacks.shift()!(1000);
    expect(onFrame).toHaveBeenLastCalledWith('Victory', 0.91);

    recognizeForVideo.mockReturnValue({ gestures: [] });
    vi.spyOn(performance, 'now').mockReturnValue(2000);
    frameCallbacks.shift()!(2000);
    expect(onFrame).toHaveBeenLastCalledWith('', 0);
  });

  it('throttles to about 15 frames per second', async () => {
    const onFrame = vi.fn();
    Object.defineProperty(video, 'readyState', { value: 4 });
    await startRecognizer(video, onFrame);
    const clock = vi.spyOn(performance, 'now');

    for (const at of [1000, 1016, 1033, 1050, 1066]) {
      clock.mockReturnValue(at);
      frameCallbacks.shift()!(at);
    }

    expect(onFrame).toHaveBeenCalledTimes(2); // 1000 and 1066
  });

  it('stop() releases the camera, ends the loop and closes the recognizer (idempotent)', async () => {
    const onFrame = vi.fn();
    Object.defineProperty(video, 'readyState', { value: 4 });
    const handle = await startRecognizer(video, onFrame);

    handle.stop();
    handle.stop();

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
    vi.spyOn(performance, 'now').mockReturnValue(5000);
    frameCallbacks.shift()?.(5000);
    expect(onFrame).not.toHaveBeenCalled();
  });

  it('stops by itself when the page becomes hidden', async () => {
    await startRecognizer(video, vi.fn());

    track.stop.mockClear();
    close.mockClear();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
