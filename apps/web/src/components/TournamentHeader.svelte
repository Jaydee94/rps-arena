<script lang="ts">
  import type { PublicTournament } from '@rps/shared';
  import { t } from '../lib/i18n';
  import { currentPairing, matchNumber, participantName, roundLabel } from '../lib/tournament-ui';
  import Bracket from './Bracket.svelte';
  import StandingsTable from './StandingsTable.svelte';

  interface Props {
    tournament: PublicTournament;
  }

  let { tournament }: Props = $props();

  const pairing = $derived(currentPairing(tournament));
  const knockout = $derived(tournament.format === 'knockout');

  /** Knockout: Round n / Semifinal / Final. Round robin: Match i of n (a tie-break says so). */
  const stage = $derived.by(() => {
    if (!pairing) return null;
    if (knockout || pairing.tiebreak) {
      const label = roundLabel(tournament, pairing);
      return t(label.key, label.vars);
    }
    const number = matchNumber(tournament);
    return number ? t('tournament.match_of', number) : null;
  });
</script>

<!-- A slim bar above the board in tournament rooms; the bracket or table folds out on demand (closed by default). -->
<aside class="theader" aria-label={t('tournament.title')}>
  <p class="bar">
    <span class="tag">{t(`tournament.format.${tournament.format}`)}</span>
    {#if stage}<span class="tag stage">{stage}</span>{/if}
    {#if pairing}
      <span class="pairing">{t('tournament.versus', { a: participantName(tournament, pairing.a), b: participantName(tournament, pairing.b) })}</span>
    {/if}
  </p>
  <details class="more">
    <summary>{t(knockout ? 'tournament.bracket' : 'tournament.standings')}</summary>
    <div class="more-body">
      {#if knockout}
        <Bracket {tournament} />
      {:else}
        <StandingsTable {tournament} />
      {/if}
    </div>
  </details>
</aside>

<style>
  .theader {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
    max-width: 48rem;
    margin: 0 auto var(--space-4);
    padding: var(--space-2) var(--space-3);
    border: var(--outline) solid var(--on-bright);
    border-radius: var(--radius-panel);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    margin: 0;
  }

  .tag {
    padding: 0 var(--space-2);
    border: 2px solid var(--on-bright);
    border-radius: var(--radius-pill);
    background: var(--yellow);
    font-family: var(--font-display);
    font-size: var(--text-md);
    letter-spacing: 0.05em;
    line-height: 1.4;
  }

  .tag.stage {
    background: var(--sky);
  }

  .pairing {
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 700;
    line-height: 1.2;
  }

  summary {
    justify-self: start;
    width: max-content;
    max-width: 100%;
    cursor: pointer;
    font-family: var(--font-display);
    font-size: var(--text-md);
    letter-spacing: 0.05em;
  }

  .more-body {
    margin-top: var(--space-2);
  }
</style>
