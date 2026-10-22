<script lang="ts">
  import type { PublicSpectator } from '@rps/shared';
  import { t } from '../lib/i18n';

  interface Props {
    spectators: PublicSpectator[];
  }

  let { spectators }: Props = $props();

  const count = $derived(spectators.length);
  const names = $derived(spectators.map((spectator) => spectator.nickname).join(', '));
</script>

<!-- Read-only: how many people are watching; the names only as a tooltip. Nothing without spectators. -->
{#if count > 0}
  <p class="spectator-badge" title={names}>{count === 1 ? t('spectate.count_one') : t('spectate.count', { n: count })}</p>
{/if}

<style>
  .spectator-badge {
    justify-self: start;
    max-width: 100%;
    margin: 0;
    padding: 0 var(--space-3);
    border: var(--border);
    border-radius: var(--radius-pill);
    background: var(--sky);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    font-size: var(--text-sm);
    font-weight: 700;
    line-height: 1.5;
  }
</style>
