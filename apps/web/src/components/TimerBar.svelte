<script lang="ts">
  import type { PublicMatch } from '@rps/shared';
  import { t } from '../lib/i18n';
  import { fraction, phaseDuration, remainingMs, startCountdown } from '../lib/timer';

  interface Props {
    deadline: number | null;
    phase: PublicMatch['phase'];
  }

  let { deadline, phase }: Props = $props();

  // Updated by the countdown; until its first tick the value is computed directly.
  let ticked = $state<number | null>(null);
  const remaining = $derived(ticked ?? (deadline === null ? 0 : remainingMs(deadline)));
  const share = $derived(fraction(remaining, phaseDuration(phase)));
  // Last 5 s: the bar turns yellow, in the last 2 s red and shaky (see animations.css).
  const warn = $derived(remaining <= 5000);
  const urgent = $derived(remaining <= 2000);

  $effect(() => {
    if (deadline === null) return;
    return startCountdown(deadline, (ms) => (ticked = ms));
  });
</script>

{#if deadline !== null}
  <div class="timer" role="timer" aria-label={t('board.timer_label')}>
    <div class="track" aria-hidden="true">
      <div class="bar" class:warn class:urgent style:width="{share * 100}%"></div>
    </div>
    <span class="seconds" class:urgent>{t('board.timer', { seconds: Math.ceil(remaining / 1000) })}</span>
  </div>
{/if}

<style>
  .timer {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .track {
    flex: 1;
    height: 1.25rem;
    overflow: hidden;
    border: var(--border);
    border-radius: var(--radius-pill);
    background: var(--sticker);
    box-shadow: var(--shadow-sm);
  }

  .bar {
    height: 100%;
    background: var(--teal);
  }

  .bar.warn {
    background: var(--yellow);
  }

  .bar.urgent {
    background: var(--danger);
  }

  .seconds {
    min-width: 3.5rem;
    text-align: right;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    line-height: 1;
  }
</style>
