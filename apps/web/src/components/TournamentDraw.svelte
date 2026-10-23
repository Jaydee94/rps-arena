<script lang="ts">
  import type { PublicTournament } from '@rps/shared';
  import { room, skipWait } from '../lib/connection';
  import { t } from '../lib/i18n';
  import { prefersReducedMotion } from '../lib/motion';
  import { drawSlots, participantById } from '../lib/tournament-ui';
  import Avatar from './Avatar.svelte';
  import ParticipantList from './ParticipantList.svelte';
  import WaitCountdown from './WaitCountdown.svelte';

  // Decided once per mount: under reduced motion the drawn pairings simply stand there, no whirl.
  const animate = !prefersReducedMotion();

  interface Slot {
    id: string;
    kind: 'pairing' | 'sitout';
    names: (string | null)[];
  }

  function slotsOf(tournament: PublicTournament): Slot[] {
    const { pairings, sittingOut } = drawSlots(tournament);
    return [
      ...pairings.map((p): Slot => ({ id: p.id, kind: 'pairing', names: [p.a, p.b] })),
      ...sittingOut.map((id): Slot => ({ id: `out-${id}`, kind: 'sitout', names: [id] })),
    ];
  }

  /** Where name number k starts its whirl: spread around the slot on a golden-angle spiral (in % of its own box). */
  function from(k: number): { x: string; y: string } {
    const angle = k * 2.4;
    return { x: `${Math.round(Math.cos(angle) * 130)}%`, y: `${Math.round(Math.sin(angle) * 260)}%` };
  }
</script>

{#snippet name(tournament: PublicTournament, id: string | null, k: number)}
  {@const start = from(k)}
  {#if id === null}
    <span class="chip-name bye" class:draw-whirl={animate} style:--k={k} style:--from-x={start.x} style:--from-y={start.y}>
      {t('tournament.bye')}
    </span>
  {:else}
    {@const person = participantById(tournament, id)}
    <span
      class="chip-name"
      class:you={id === tournament.youId}
      class:draw-whirl={animate}
      style:--k={k}
      style:--from-x={start.x}
      style:--from-y={start.y}
    >
      <Avatar id={person?.avatar ?? ''} size={32} />
      <span class="nick">{person?.nickname ?? ''}</span>
    </span>
  {/if}
{/snippet}

<!-- The draw: the names whirl in and land in their first-round slots (motion: TOURNAMENT section of animations.css). -->
{#if $room?.tournament}
  {@const view = $room}
  {@const tournament = $room.tournament}
  {@const slots = slotsOf(tournament)}
  <main class="tdraw">
    <section class="panel stage" aria-labelledby="tdraw-title">
      <h2 id="tdraw-title" class="ribbon">{t('tournament.draw')}</h2>
      <p class="meta">
        <span class="tag">{t('tournament.format')}: {t(`tournament.format.${tournament.format}`)}</span>
        <span class="tag">{t('tournament.mode', { mode: t(`mode.${view.config.mode}.name`) })}</span>
      </p>
      <p class="hint">{t('tournament.draw_hint')}</p>
      {#if slots.length > 0}
        <ol class="slots" aria-label={t('tournament.first_round')}>
          {#each slots as slot, i (slot.id)}
            {@const k = slots.slice(0, i).reduce((n, s) => n + s.names.length, 0)}
            <li class="slot" class:draw-slot={animate} class:sitout={slot.kind === 'sitout'} data-pairing={slot.id} style:--i={i}>
              {@render name(tournament, slot.names[0] ?? null, k)}
              {#if slot.kind === 'pairing'}
                <span class="vs" class:draw-vs={animate} style:--k={k + 1} aria-hidden="true">VS</span>
                {@render name(tournament, slot.names[1] ?? null, k + 1)}
              {:else}
                <span class="sitout-label">{t('tournament.sits_out')}</span>
              {/if}
            </li>
          {/each}
        </ol>
      {:else}
        <ParticipantList participants={tournament.participants} youId={tournament.youId} hostId={tournament.hostId} label={t('tournament.player_list')} />
      {/if}
    </section>
    <div class="foot">
      <WaitCountdown untilMs={tournament.untilMs} key="tournament.draw_countdown" />
      {#if view.isHost}
        <button type="button" class="btn btn-primary" onclick={() => skipWait()}>{t('tournament.skip')}</button>
      {/if}
    </div>
  </main>
{/if}

<style>
  .tdraw {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--gutter);
    max-width: 48rem;
    margin: 0 auto;
    width: 100%;
  }

  .tdraw > :global(*) {
    min-width: 0;
  }

  /* The stage: a blue panel with the big pink dots, like the start screen's hero. */
  .stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
    background-color: var(--blue);
    background-image: radial-gradient(circle, var(--dot-panel) 28%, transparent 31%);
    background-size: var(--dot-panel-size) var(--dot-panel-size);
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
    border: var(--outline) solid var(--on-bright);
    border-radius: var(--radius-pill);
    background: var(--yellow);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    font-size: var(--text-sm);
    font-weight: 700;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .hint {
    justify-self: start;
    max-width: 100%;
    margin: 0;
    padding: var(--space-1) var(--space-3);
    border: var(--outline) solid var(--on-bright);
    border-radius: var(--radius-sm);
    background: var(--sticker);
    color: var(--on-bright);
    font-weight: 700;
    overflow-wrap: anywhere;
    rotate: var(--tilt-1);
  }

  .slots {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr));
    gap: var(--space-3);
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
  }

  /* One drawn pairing: name – VS – name, on a light card. */
  .slot {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    border: var(--outline) solid var(--on-bright);
    border-radius: var(--radius-panel);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
  }

  .slot.sitout {
    grid-template-columns: minmax(0, 1fr) auto;
    border-style: dashed;
  }

  /* Avatar and name side by side when the name fits, the name below the avatar when the card is narrow. */
  .chip-name {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-1) var(--space-2);
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    border: 3px solid var(--on-bright);
    border-radius: var(--radius-sm);
    text-align: center;
    background: var(--yellow);
    color: var(--on-bright);
  }

  .slot > .chip-name:last-child {
    background: var(--sky);
  }

  .chip-name.you {
    box-shadow: inset 0 0 0 2px var(--on-bright);
    font-style: italic;
  }

  .slot > .chip-name.bye {
    justify-content: center;
    min-height: 2.75rem;
    border-style: dashed;
    background: var(--sticker);
    font-style: italic;
    font-weight: 700;
  }

  .nick {
    flex: 1 1 6rem;
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 700;
    line-height: 1.15;
  }

  .vs {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 3px solid var(--on-bright);
    border-radius: 50%;
    background: var(--red);
    color: var(--on-bright);
    font-family: var(--font-display);
    rotate: -8deg;
  }

  .sitout-label {
    padding: 0 var(--space-2);
    border: 2px dashed var(--on-bright);
    border-radius: var(--radius-pill);
    font-weight: 700;
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
</style>
