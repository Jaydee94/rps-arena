<script lang="ts">
  import { TOURNAMENT_MAX_PLAYERS, TOURNAMENT_MIN_PLAYERS } from '@rps/shared';
  import { room, startMatch } from '../lib/connection';
  import { t } from '../lib/i18n';
  import CopyRow from './CopyRow.svelte';
  import ParticipantList from './ParticipantList.svelte';
  import RulesPanel from './RulesPanel.svelte';
  import SpectatorBadge from './SpectatorBadge.svelte';

  const inviteLink = $derived($room ? `${location.origin}/?room=${$room.code}` : '');
</script>

{#if $room?.tournament}
  {@const view = $room}
  {@const tournament = $room.tournament}
  {@const connected = tournament.participants.filter((p) => p.connected).length}
  {@const canStart = connected >= TOURNAMENT_MIN_PLAYERS}
  {@const watching = view.role === 'spectator' && view.me === null && tournament.youId === null}
  <main class="tlobby">
    <section class="panel roster" aria-labelledby="tlobby-title">
      <h2 id="tlobby-title" class="ribbon">{t('tournament.title')}</h2>
      <p class="meta">
        <span class="tag">{t('tournament.format')}: {t(`tournament.format.${tournament.format}`)}</span>
        <span class="tag">{t('tournament.mode', { mode: t(`mode.${view.config.mode}.name`) })}</span>
      </p>
      <p class="count">{t('tournament.players', { n: tournament.participants.length, max: TOURNAMENT_MAX_PLAYERS })}</p>
      <!-- The public view has no host id: the host marker is only known for yourself (isHost is authoritative). -->
      <ParticipantList
        participants={tournament.participants}
        youId={tournament.youId}
        hostId={view.isHost ? tournament.youId : null}
        label={t('tournament.player_list')}
      />
    </section>

    <SpectatorBadge spectators={view.spectators} />

    <section class="panel share">
      <p>{t('lobby.share')}</p>
      <CopyRow id="room-code" label={t('home.code')} value={view.code} buttonLabel={t('lobby.copy_code')} large />
      <CopyRow id="room-link" label={t('lobby.link')} value={inviteLink} buttonLabel={t('lobby.copy')} />
    </section>

    <RulesPanel mode={view.config.mode} />

    {#if watching}
      <p class="note" role="status">{t('tournament.spectators_note')}</p>
    {:else if view.isHost}
      <button
        type="button"
        class="btn btn-primary start"
        disabled={!canStart}
        aria-describedby={canStart ? undefined : 'tlobby-need'}
        onclick={() => startMatch()}
      >
        {t('tournament.start')}
      </button>
      {#if !canStart}
        <p id="tlobby-need" role="status">{t('tournament.need_players', { min: TOURNAMENT_MIN_PLAYERS })}</p>
      {/if}
    {:else}
      <p role="status">{t('tournament.waiting_host')}</p>
    {/if}
  </main>
{/if}

<style>
  .tlobby {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    max-width: 48rem;
    margin: 0 auto;
    width: 100%;
  }

  .tlobby > :global(*) {
    min-width: 0;
  }

  .roster {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  .share {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
  }

  .tag {
    max-width: 100%;
    padding: 0 var(--space-3);
    border: var(--border);
    border-radius: var(--radius-pill);
    background: var(--yellow);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    font-size: var(--text-sm);
    font-weight: 700;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .count {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    letter-spacing: 0.04em;
  }

  .note {
    margin: 0;
    padding: var(--space-3);
    border: var(--outline) dashed var(--edge);
    border-radius: var(--radius-sm);
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .tlobby > .start {
    justify-self: start;
    max-width: 100%;
  }
</style>
