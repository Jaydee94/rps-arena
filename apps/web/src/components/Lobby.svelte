<script lang="ts">
  import type { SeatId } from '@rps/shared';
  import { moveSeat, room, startMatch } from '../lib/connection';
  import { t } from '../lib/i18n';
  import { canStart, isHost } from '../lib/seats';
  import CopyRow from './CopyRow.svelte';
  import SeatSlot from './SeatSlot.svelte';

  const TEAM_SEATS: { team: 'a' | 'b'; seats: SeatId[] }[] = [
    { team: 'a', seats: ['a0', 'a1'] },
    { team: 'b', seats: ['b0', 'b1'] },
  ];

  let selected = $state<SeatId | null>(null);

  const inviteLink = $derived($room ? `${location.origin}/?room=${$room.code}` : '');

  // Drop the pick-up when that seat was vacated meanwhile.
  $effect(() => {
    if (selected !== null && !$room?.players[selected]) selected = null;
  });

  function moveHere(to: SeatId) {
    if (selected === null) return;
    moveSeat(selected, to);
    selected = null;
  }
</script>

{#if $room}
  {@const view = $room}
  {@const host = isHost(view)}
  {@const teamMode = view.config.mode === 'team2v2'}
  {#snippet slot(seat: SeatId)}
    <SeatSlot
      {seat}
      player={view.players[seat]}
      isYou={view.you === seat}
      isHostSeat={view.hostSeat === seat}
      canMove={teamMode && (host || seat === view.you || !view.players[seat])}
      {selected}
      onselect={(s) => (selected = selected === s ? null : s)}
      onmoveHere={moveHere}
    />
  {/snippet}
  <main class="lobby">
    <h2>{t('lobby.title')}</h2>
    <p>{t('lobby.mode', { mode: t(`mode.${view.config.mode}.name`), n: view.config.bestOf })}</p>

    <section class="card share">
      <p>{t('lobby.share')}</p>
      <CopyRow id="room-code" label={t('home.code')} value={view.code} buttonLabel={t('lobby.copy_code')} large />
      <CopyRow id="room-link" label={t('lobby.link')} value={inviteLink} buttonLabel={t('lobby.copy')} />
    </section>

    {#if teamMode}
      <div class="teams">
        {#each TEAM_SEATS as { team, seats } (team)}
          <div class="team" role="group" aria-label={t(`lobby.team_${team}`)}>
            <h3 class="team-banner" data-team={team}>{t(`lobby.team_${team}`)}</h3>
            {#each seats as seat (seat)}{@render slot(seat)}{/each}
          </div>
        {/each}
      </div>
    {:else}
      <div class="duel">
        {@render slot('a0')}
        {@render slot('b0')}
      </div>
    {/if}

    {#if host}
      <button type="button" class="btn btn-primary" disabled={!canStart(view)} onclick={() => startMatch()}>
        {t('lobby.start')}
      </button>
      {#if !canStart(view)}<p role="status">{t('lobby.waiting')}</p>{/if}
    {:else}
      <p role="status">{t('lobby.waiting_host')}</p>
    {/if}
  </main>
{/if}

<style>
  .lobby {
    display: grid;
    gap: var(--space-4);
    max-width: 48rem;
    margin: 0 auto;
    width: 100%;
  }

  h2 {
    font-size: var(--text-2xl);
  }

  .team-banner {
    justify-self: start;
    padding: 0 var(--space-4);
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--red);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    font-size: var(--text-lg);
    text-shadow: none;
    rotate: -1.5deg;
  }

  .team-banner[data-team='b'] {
    background: var(--blue);
    color: var(--on-blue);
    rotate: 1.5deg;
  }

  .share {
    display: grid;
    gap: var(--space-3);
  }

  .duel,
  .teams {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: var(--space-4);
  }

  .team {
    display: grid;
    align-content: start;
    gap: var(--space-3);
  }

  .lobby > .btn {
    justify-self: start;
  }
</style>
