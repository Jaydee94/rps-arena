<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { createHoldConfirmer } from '../lib/camera/hold';
  import { mapGesture, type Pose } from '../lib/camera/mapping';
  import { CameraError, startRecognizer, type CameraErrorCode, type RecognizerHandle } from '../lib/camera/recognizer';
  import { gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';
  import GestureIcon from './GestureIcon.svelte';

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
  let session = 0; // second line of defence: invalidates a start that finishes after the toggle was switched off
  let abort: AbortController | null = null; // cancels a start that is still loading or opening the camera

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

  function cancelStart() {
    session++;
    abort?.abort();
    abort = null;
  }

  function shutDown() {
    cancelStart();
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
    cancelStart();
    const mine = session;
    const controller = (abort = new AbortController());
    await tick(); // the <video> has to exist before the stream is attached
    try {
      const started = await startRecognizer(video as HTMLVideoElement, onFrame, controller.signal);
      if (mine !== session) {
        started.stop();
        return;
      }
      handle = started;
      loading = false;
    } catch (caught) {
      if (mine !== session || (caught as { name?: string } | null)?.name === 'AbortError') return; // a cancel is silent
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
    cancelStart();
    handle?.stop();
    handle = null;
  });

  const poseLabel = $derived(loading ? t('camera.loading') : pose ? t(gestureKey(pose)) : t('camera.pose_none'));
</script>

<svelte:document {onvisibilitychange} />

<section class="camera" aria-label={t('camera.title')}>
  <div class="head">
    <button type="button" class="btn btn-small" aria-pressed={enabled} onclick={toggle}>
      <svg class="cam-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h3l1.5-2h7L17 7h3v12H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
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
    <p class="pose">
      {#if !loading && pose}<GestureIcon id={pose} size={36} />{/if}
      <span>{poseLabel}</span>
    </p>
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

  .cam-icon {
    width: 1.25em;
    height: 1.25em;
    vertical-align: -0.2em;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linejoin: round;
  }

  .pose {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
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
