<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { createHoldConfirmer } from '../lib/camera/hold';
  import { mapGesture, type Pose } from '../lib/camera/mapping';
  import { CameraError, startRecognizer, type CameraErrorCode, type RecognizerHandle } from '../lib/camera/recognizer';
  import { gestureEmoji, gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';

  interface Props {
    /** The gestures of the current round; a recognized pose outside of it is ignored. */
    gestures: readonly string[];
    /** Called once with the confirmed pose. */
    onpick: (gesture: string) => void;
    /** Already picked: the camera keeps running but a confirmed pose is ignored. */
    disabled: boolean;
  }

  let { gestures, onpick, disabled }: Props = $props();

  const HOLD_MS = 900;
  const MIN_SCORE = 0.7;
  const RING_RADIUS = 46;
  const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

  const confirmer = createHoldConfirmer({ holdMs: HOLD_MS, minScore: MIN_SCORE });

  // Deliberately plain state: the camera consent is never stored anywhere.
  let enabled = $state(false);
  let loading = $state(false);
  let error = $state<CameraErrorCode | null>(null);
  let pose = $state<Pose | null>(null);
  let progress = $state(0);
  let video = $state<HTMLVideoElement>();

  let handle: RecognizerHandle | null = null;
  let session = 0; // invalidates a start that finishes after the toggle was switched off

  // A new round (or any return to "can pick") starts with a clean hold.
  $effect(() => {
    if (!disabled) {
      confirmer.reset();
      progress = 0;
    }
  });

  function onFrame(name: string, score: number) {
    pose = mapGesture(name);
    const confirmed = confirmer.push(pose, score, performance.now());
    progress = confirmer.progress();
    if (confirmed && !disabled && gestures.includes(confirmed)) onpick(confirmed);
  }

  function shutDown() {
    session++;
    handle?.stop();
    handle = null;
    enabled = false;
    loading = false;
    pose = null;
    progress = 0;
    confirmer.reset();
  }

  async function turnOn() {
    error = null;
    enabled = true;
    loading = true;
    const mine = ++session;
    await tick(); // the <video> has to exist before the stream is attached
    try {
      const started = await startRecognizer(video as HTMLVideoElement, onFrame);
      if (mine !== session) {
        started.stop();
        return;
      }
      handle = started;
      loading = false;
    } catch (caught) {
      if (mine !== session) return;
      shutDown();
      error = caught instanceof CameraError ? caught.code : 'load_failed';
    }
  }

  function toggle() {
    if (enabled) shutDown();
    else void turnOn();
  }

  function onvisibilitychange() {
    if (document.visibilityState === 'hidden' && enabled) shutDown();
  }

  onDestroy(() => {
    session++;
    handle?.stop();
    handle = null;
  });

  const poseLabel = $derived(
    loading ? t('camera.loading') : pose ? `${gestureEmoji(pose)} ${t(gestureKey(pose))}` : t('camera.pose_none'),
  );
</script>

<svelte:document {onvisibilitychange} />

<section class="camera" aria-label={t('camera.title')}>
  <div class="head">
    <button type="button" class="btn btn-small" aria-pressed={enabled} onclick={toggle}>
      <span aria-hidden="true">📷</span>
      {t('camera.title')}
    </button>
    <span class="badge">{t('camera.badge')}</span>
  </div>

  <div class="problem" role="alert">
    {#if error}<p>{t(`camera.${error}`)}</p>{/if}
  </div>

  {#if enabled}
    <div class="stage">
      <!-- The stream only lives in this element: it is never recorded, uploaded or copied anywhere. -->
      <video bind:this={video} muted playsinline aria-hidden="true"></video>
      <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="track" cx="50" cy="50" r={RING_RADIUS} />
        <circle
          class="bar"
          cx="50"
          cy="50"
          r={RING_RADIUS}
          stroke-dasharray={RING_LENGTH}
          stroke-dashoffset={RING_LENGTH * (1 - progress)}
        />
      </svg>
    </div>
    <p class="pose">{poseLabel}</p>
    <p class="note">{t('camera.hold')}</p>
  {/if}

  <p class="note">{t('camera.experimental')}</p>
  <p class="note">{t('camera.privacy')}</p>
</section>

<style>
  .camera {
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border: var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }

  .badge {
    padding: var(--space-1) var(--space-2);
    border: var(--border);
    border-radius: var(--radius-pill);
    background: var(--pink);
    color: var(--on-bright);
    font-size: var(--text-sm);
    font-weight: 700;
  }

  .problem:not(:empty) {
    padding: var(--space-2) var(--space-3);
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--danger);
    color: var(--on-bright);
    font-weight: 700;
  }

  .stage {
    position: relative;
    width: 11rem;
    aspect-ratio: 1;
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
    background: var(--paper-2);
    transform: scaleX(-1); /* mirrored, like a mirror */
  }

  .ring {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);
    pointer-events: none;
  }

  .ring circle {
    fill: none;
    stroke-width: 6;
  }

  .track {
    stroke: var(--ink);
    opacity: 0.25;
  }

  .bar {
    stroke: var(--yellow);
    stroke-linecap: round;
  }

  .pose {
    font-family: var(--font-display);
    font-size: var(--text-lg);
  }

  .note {
    margin: 0;
    max-width: 28rem;
    text-align: center;
    font-size: var(--text-sm);
    color: var(--ink-soft);
  }
</style>
