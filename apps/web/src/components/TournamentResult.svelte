<script lang="ts">
  import { forgetSession, rematch, room } from '../lib/connection';
  import { t } from '../lib/i18n';
  import { participantName } from '../lib/tournament-ui';
  import Bracket from './Bracket.svelte';
  import Confetti from './Confetti.svelte';
  import Podium from './Podium.svelte';
  import StandingsTable from './StandingsTable.svelte';

  function leave() {
    // Without the stored credentials the reload cannot silently rejoin this room.
    forgetSession();
    location.assign('/');
  }
</script>

<!-- The award ceremony: the podium, the champion's name, the final bracket or table to look up, and the way out. -->
{#if $room?.tournament}
  {@const view = $room}
  {@const tournament = $room.tournament}
  {@const champions = tournament.podium.find((p) => p.rank === 1)?.ids ?? []}
  {@const youWon = tournament.youId !== null && champions.includes(tournament.youId)}
  {#if youWon}<Confetti />{/if}
  <main class="tresult" class:champion-view={youWon}>
    <section class="panel ceremony" aria-labelledby="tresult-title">
      <h2 id="tresult-title" class="ribbon">{t('tournament.podium_title')}</h2>
      {#if champions.length > 0}
        <p class="champion">{t('tournament.champion', { name: champions.map((id) => participantName(tournament, id)).join(' & ') })}</p>
      {/if}
      <Podium {tournament} />
    </section>

    <details class="final">
      <summary>{t('tournament.final_results')}</summary>
      <div class="final-body">
        {#if tournament.format === 'knockout'}
          <Bracket {tournament} />
        {:else}
          <StandingsTable {tournament} />
        {/if}
      </div>
    </details>

    <div class="actions">
      {#if view.isHost}
        <button type="button" class="btn btn-primary" onclick={() => rematch()}>{t('tournament.again')}</button>
      {/if}
      <button type="button" class="btn" onclick={leave}>{t('result.leave')}</button>
    </div>
  </main>
{/if}

<style>
  .tresult {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--gutter);
    max-width: 48rem;
    margin: 0 auto;
    width: 100%;
  }

  .tresult > :global(*) {
    min-width: 0;
  }

  .ceremony {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-5);
    background-color: var(--blue);
    background-image: radial-gradient(circle, var(--dot-panel) 28%, transparent 31%);
    background-size: var(--dot-panel-size) var(--dot-panel-size);
  }

  /* The champion's name in a speech-bubble box. */
  .champion {
    justify-self: center;
    max-width: 100%;
    margin: 0;
    padding: var(--space-2) var(--space-5);
    border: var(--outline) solid var(--on-bright);
    border-radius: var(--radius-lg);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    text-align: center;
    overflow-wrap: anywhere;
    text-wrap: balance;
    font-family: var(--font-display);
    font-size: clamp(1.5rem, 7vw, 2.25rem);
    letter-spacing: 0.04em;
    line-height: 1.1;
    text-shadow: 2px 2px 0 var(--yellow);
    rotate: var(--tilt-1);
  }

  .final {
    padding: var(--space-3) var(--space-4);
    border: var(--border);
    border-radius: var(--radius-panel);
    background: var(--surface);
    box-shadow: var(--shadow-panel);
  }

  summary {
    cursor: pointer;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.05em;
    line-height: 1.2;
  }

  .final-body {
    margin-top: var(--space-3);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
</style>
