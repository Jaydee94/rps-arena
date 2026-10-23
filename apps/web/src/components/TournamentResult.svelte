<script lang="ts">
  import { forgetSession, rematch, room } from '../lib/connection';
  import { t } from '../lib/i18n';
  import { participantName } from '../lib/tournament-ui';

  function leave() {
    // Without the stored credentials the reload cannot silently rejoin this room.
    forgetSession();
    location.assign('/');
  }
</script>

<!-- Placeholder: Task 6 replaces this with the podium ceremony. -->
{#if $room?.tournament}
  {@const view = $room}
  {@const tournament = $room.tournament}
  {@const champion = tournament.podium.find((p) => p.rank === 1)?.ids[0] ?? null}
  <main class="tscreen">
    <section class="panel" aria-labelledby="tresult-title">
      <h2 id="tresult-title" class="ribbon">{t('tournament.podium_title')}</h2>
      {#if champion !== null}
        <p class="champion">{t('tournament.champion', { name: participantName(tournament, champion) })}</p>
      {/if}
      <ol class="podium">
        {#each tournament.podium as place (place.rank)}
          {#each place.ids as id (id)}
            <li><span class="rank">{t('tournament.place', { n: place.rank })}</span> <span class="nick">{participantName(tournament, id)}</span></li>
          {/each}
        {/each}
      </ol>
    </section>
    <div class="actions">
      {#if view.isHost}
        <button type="button" class="btn btn-primary" onclick={() => rematch()}>{t('tournament.again')}</button>
      {/if}
      <button type="button" class="btn" onclick={leave}>{t('result.leave')}</button>
    </div>
  </main>
{/if}

<style>
  .tscreen {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    max-width: 48rem;
    margin: 0 auto;
    width: 100%;
  }

  .tscreen > :global(*) {
    min-width: 0;
  }

  .panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  .champion {
    margin: 0;
    overflow-wrap: anywhere;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    letter-spacing: 0.04em;
  }

  .podium {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .podium li {
    overflow-wrap: anywhere;
    font-weight: 700;
  }

  .rank {
    padding: 0 var(--space-2);
    border: 2px solid var(--edge);
    border-radius: var(--radius-pill);
    background: var(--yellow);
    color: var(--on-bright);
    font-size: var(--text-sm);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
</style>
