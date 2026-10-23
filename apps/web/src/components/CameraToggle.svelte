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
  <button type="button" class="row" aria-pressed={enabled} onclick={toggle}>
    <svg class="cam-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h3l1.5-2h7L17 7h3v12H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
    <span class="title">{t('camera.title')}</span>
    <span class="knob" aria-hidden="true"></span>
  </button>
  <p class="sub"><span class="badge">{t('camera.badge')}</span> {t('camera.privacy')}</p>

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
</section>

<style>
  /* One row on a white sticker panel: icon, title, switch; the privacy line hangs underneath. */
  .camera {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-3);
    border: var(--border);
    border-radius: var(--radius-panel);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: 2.75rem;
    padding: 0;
    border: 0;
    background: none;
    text-align: start;
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.04em;
    line-height: 1.15;
  }

  /* The switch is decorative; the button state is aria-pressed. */
  .knob {
    position: relative;
    flex: none;
    width: 58px;
    height: 34px;
    border: var(--border);
    border-radius: var(--radius-pill);
    background: var(--grey);
  }

  .knob::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 2px;
    width: 22px;
    height: 22px;
    border: calc(var(--outline) / 2) solid var(--edge);
    border-radius: 50%;
    background: var(--sticker);
    translate: 0 -50%;
  }

  .row[aria-pressed='true'] .knob {
    background: var(--teal);
  }

  .row[aria-pressed='true'] .knob::before {
    left: auto;
    right: 2px;
  }

  /* Plain inline flow: the pill leads the text and the text wraps under it, so no separator can dangle. */
  .sub {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .badge {
    display: inline-block;
    margin-inline-end: var(--space-1);
    padding: 0 var(--space-2);
    border: calc(var(--outline) / 2) solid var(--edge);
    border-radius: var(--radius-pill);
    background: var(--yellow);
    color: var(--on-bright);
    font-weight: 700;
    line-height: 1.3;
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
    justify-self: center;
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
    stroke: var(--line);
    opacity: 0.25;
  }

  .bar {
    stroke: var(--yellow);
    stroke-linecap: round;
  }

  .cam-icon {
    flex: none;
    width: 1.75rem;
    height: 1.75rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linejoin: round;
  }

  .pose {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-lg);
  }

  .note {
    margin: 0;
    font-size: var(--text-sm);
    opacity: 0.8;
  }
</style>
