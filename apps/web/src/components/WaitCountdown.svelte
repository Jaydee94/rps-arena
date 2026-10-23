<script lang="ts">
  import { t } from '../lib/i18n';

  interface Props {
    /** End of the wait (epoch ms); nothing is shown for null. */
    untilMs: number | null;
    /** i18n key with a `{seconds}` placeholder. */
    key: string;
  }

  let { untilMs, key }: Props = $props();

  // A plain text countdown: re-sampled a few times a second, so the shown second never lags; no motion.
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(timer);
  });

  const seconds = $derived(untilMs === null ? null : Math.max(0, Math.ceil((untilMs - now) / 1000)));
</script>

{#if seconds !== null}
  <p class="wait">{t(key, { seconds })}</p>
{/if}

<style>
  .wait {
    margin: 0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
</style>
