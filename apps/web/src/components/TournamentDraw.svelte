<script lang="ts">
  import { room, skipWait } from '../lib/connection';
  import { t } from '../lib/i18n';
  import ParticipantList from './ParticipantList.svelte';
</script>

<!-- Placeholder: Task 6 replaces this with the animated draw. -->
{#if $room?.tournament}
  {@const view = $room}
  {@const tournament = $room.tournament}
  <main class="tscreen">
    <section class="panel" aria-labelledby="tdraw-title">
      <h2 id="tdraw-title" class="ribbon">{t('tournament.draw')}</h2>
      <p>{t('tournament.draw_hint')}</p>
      <ParticipantList participants={tournament.participants} youId={tournament.youId} label={t('tournament.player_list')} />
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

  .panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  .panel > p {
    margin: 0;
    font-weight: 700;
  }

  .tscreen > .btn {
    justify-self: start;
  }
</style>
