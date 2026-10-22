import type { GestureRecognizer } from '@mediapipe/tasks-vision';

export type CameraErrorCode = 'denied' | 'no_device' | 'load_failed';

export class CameraError extends Error {
  readonly code: CameraErrorCode;

  constructor(code: CameraErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = 'CameraError';
    this.code = code;
  }
}

export interface RecognizerHandle {
  stop(): void;
}

// Everything is served from our own origin (see scripts/fetch-model.mjs): no request ever goes to a CDN.
const WASM_PATH = '/mediapipe-wasm';
const MODEL_PATH = '/models/gesture_recognizer.task';
const MIN_FRAME_GAP_MS = 66; // ~15 fps is plenty for a 900 ms hold and keeps the CPU/GPU cool

function cameraErrorFrom(error: unknown): CameraError {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return new CameraError('denied', { cause: error });
  // missing, busy or unsuitable camera
  return new CameraError('no_device', { cause: error });
}

async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('no_device');
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
  } catch (error) {
    throw cameraErrorFrom(error);
  }
}

async function createRecognizer(): Promise<GestureRecognizer> {
  // The library (and its chunk) is only fetched once the user switches the camera on.
  const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  const create = (delegate: 'GPU' | 'CPU') =>
    GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO',
      numHands: 1,
    });
  try {
    return await create('GPU');
  } catch {
    return await create('CPU');
  }
}

function abortError(): DOMException {
  return new DOMException('The camera start was cancelled.', 'AbortError');
}

/**
 * Loads the recognizer, then opens the webcam, shows it in `video` and reports the top gesture of
 * ~15 frames per second (`''` / 0 when no hand is visible). The image never leaves the browser.
 *
 * The camera is opened LAST so that nothing holds the webcam while the (slow) model loads. If `signal`
 * is aborted at any point, everything acquired so far is released and the promise rejects with an
 * `AbortError` (a cancel, not a failure).
 */
export async function startRecognizer(
  video: HTMLVideoElement,
  onFrame: (name: string, score: number) => void,
  signal?: AbortSignal,
): Promise<RecognizerHandle> {
  if (signal?.aborted) throw abortError();

  let recognizer: GestureRecognizer;
  try {
    recognizer = await createRecognizer();
  } catch (error) {
    if (signal?.aborted) throw abortError();
    throw new CameraError('load_failed', { cause: error });
  }
  if (signal?.aborted) {
    recognizer.close();
    throw abortError();
  }

  let stream: MediaStream;
  try {
    stream = await openCamera();
  } catch (error) {
    recognizer.close();
    throw signal?.aborted ? abortError() : error;
  }
  const releaseCamera = () => stream.getTracks().forEach((track) => track.stop());
  if (signal?.aborted) {
    releaseCamera();
    recognizer.close();
    throw abortError();
  }

  let stopped = false;
  let lastFrameAt = -Infinity;
  let cancelLoop = () => {};

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelLoop();
    document.removeEventListener('visibilitychange', onVisibility);
    releaseCamera();
    video.srcObject = null;
    recognizer.close();
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') stop();
  }

  function process() {
    const now = performance.now();
    if (now - lastFrameAt < MIN_FRAME_GAP_MS || video.readyState < 2) return;
    lastFrameAt = now;
    try {
      const top = recognizer.recognizeForVideo(video, now).gestures[0]?.[0];
      onFrame(top?.categoryName ?? '', top?.score ?? 0);
    } catch {
      onFrame('', 0); // a failed frame counts as "no hand"
    }
  }

  function loop() {
    if (typeof video.requestVideoFrameCallback === 'function') {
      const id = video.requestVideoFrameCallback(tick);
      cancelLoop = () => video.cancelVideoFrameCallback(id);
    } else {
      const id = requestAnimationFrame(tick);
      cancelLoop = () => cancelAnimationFrame(id);
    }
  }

  function tick() {
    if (stopped) return;
    process();
    loop();
  }

  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  document.addEventListener('visibilitychange', onVisibility);
  video.play().catch(() => {}); // autoplay is allowed for muted video; a failure just leaves a still frame
  loop();

  return { stop };
}
