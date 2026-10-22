<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n';
  import { COUNTDOWN_BEATS, motion } from '../lib/motion';

  interface Props {
    onDone: () => void;
  }

  let { onDone }: Props = $props();

  // Beat 0 shows the first word, 1 the first two, 2 all three. Words stack up and pop in when they mount.
  let beat = $state(0);
  const WORDS = [1, 2, 3] as const;

  onMount(() => {
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', finish);
      window.removeEventListener('keydown', finish);
    };
    // Whatever ends the countdown first (last beat, tap, key, switched off) wins; onDone runs once.
    function finish() {
      if (finished) return;
      finished = true;
      stop();
      onDone();
    }

    const beatMs = motion.countdownBeatMs;
    if (beatMs <= 0) {
      finish();
      return stop;
    }

    window.addEventListener('pointerdown', finish);
    window.addEventListener('keydown', finish);
    const tick = () => {
      if (beat < COUNTDOWN_BEATS - 1) {
        beat += 1;
        timer = setTimeout(tick, beatMs);
      } else {
        finish();
      }
    };
    timer = setTimeout(tick, beatMs);

    return stop;
  });
</script>

<div class="countdown" data-testid="countdown" aria-hidden="true">
  <div class="marks">
    <span class="qmark qmark--yellow">?</span>
    <span class="qmark qmark--sky">?</span>
  </div>
  <div class="words">
    {#each WORDS as n (n)}
      {#if beat >= n - 1}
        <span class="word word--{n}">{t(`countdown.${n}`)}</span>
      {/if}
    {/each}
  </div>
</div>

<style>
  .countdown {
    display: grid;
    justify-items: center;
    gap: var(--space-5);
    padding-block: var(--space-6);
    width: 100%;
  }

  .marks {
    display: flex;
    justify-content: center;
    gap: var(--space-5);
    /* Room for the hop of the stickers. */
    padding-top: 2.75rem;
  }

  .qmark {
    display: grid;
    place-items: center;
    width: 104px;
    height: 104px;
    border: var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    color: var(--on-bright);
    font-family: var(--font-display);
    font-size: 4.5rem;
    line-height: 1;
  }

  .qmark--yellow {
    background: var(--yellow);
  }

  .qmark--sky {
    background: var(--sky);
  }

  .words {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3);
    min-height: 4.5rem;
    max-width: 100%;
  }

  .word {
    padding: var(--space-2) var(--space-4);
    border: var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
    background: var(--sticker);
    color: var(--on-bright);
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 9vw, 2.75rem);
    line-height: 1.1;
    letter-spacing: 0.03em;
    rotate: -5deg;
  }

  .word--2 {
    background: var(--yellow);
  }

  .word--3 {
    background: var(--red);
    color: var(--white);
    -webkit-text-stroke: var(--outline) var(--line);
    paint-order: stroke fill;
  }
</style>
