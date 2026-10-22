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
  // Last 5 s: the bar turns yellow, in the last 2 s red and the whole track shakes (see animations.css).
  const warn = $derived(remaining <= 5000);
  const urgent = $derived(remaining <= 2000);

  $effect(() => {
    if (deadline === null) return;
    return startCountdown(deadline, (ms) => (ticked = ms));
  });
</script>

{#if deadline !== null}
  <div class="timer" role="timer" aria-label={t('board.timer_label')}>
    <div class="track" class:urgent>
      <div class="bar" class:warn class:urgent style:width="{share * 100}%" aria-hidden="true"></div>
      <span class="seconds" class:urgent>{t('board.timer', { seconds: Math.ceil(remaining / 1000) })}</span>
    </div>
  </div>
{/if}

<style>
  .track {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    height: 26px;
    overflow: hidden;
    border: var(--border);
    border-radius: var(--radius-pill);
    background: var(--sticker);
    box-shadow: var(--shadow-sm);
  }

  .bar {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--teal);
  }

  /* Diagonal stripes on the bar; the motion is in the shared motion stylesheet. */
  .bar::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: repeating-linear-gradient(-45deg, transparent 0 8px, rgb(23 15 46 / 14%) 8px 16px);
    background-size: 22.63px 22.63px;
  }

  .bar.warn {
    background: var(--yellow);
  }

  .bar.urgent {
    background: var(--danger);
  }

  /* The number sits inside the track, on the right, above the bar. */
  .seconds {
    position: relative;
    padding-inline: var(--space-3);
    color: var(--on-bright);
    font-family: var(--font-display);
    font-size: var(--text-md);
    letter-spacing: 0.04em;
    line-height: 1;
  }
</style>
