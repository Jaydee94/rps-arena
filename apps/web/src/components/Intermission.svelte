<script lang="ts">
  import { room, skipWait } from '../lib/connection';
  import { t } from '../lib/i18n';
  import { participantName } from '../lib/tournament-ui';
</script>

<!-- Placeholder: Task 6 replaces this with the bracket / table. -->
{#if $room?.tournament}
  {@const view = $room}
  {@const tournament = $room.tournament}
  {@const upcoming = tournament.pairings.find((p) => p.decidedBy === null && p.a !== null && p.b !== null)}
  <main class="tscreen">
    <section class="panel" aria-labelledby="tinter-title">
      <h2 id="tinter-title" class="ribbon">{t('tournament.next_match')}</h2>
      {#if upcoming}
        <p class="versus">
          {t('tournament.versus', { a: participantName(tournament, upcoming.a), b: participantName(tournament, upcoming.b) })}
        </p>
      {/if}
    </section>
    {#if view.isHost}
      <button type="button" class="btn btn-primary" onclick={() => skipWait()}>{t('tournament.skip')}</button>
    {/if}
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

  .versus {
    margin: 0;
    overflow-wrap: anywhere;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    letter-spacing: 0.04em;
  }

  .tscreen > .btn {
    justify-self: start;
  }
</style>
