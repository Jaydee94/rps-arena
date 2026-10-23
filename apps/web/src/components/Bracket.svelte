<script lang="ts">
  import type { PublicPairing, PublicTournament } from '@rps/shared';
  import { t } from '../lib/i18n';
  import { bracketColumns, highlightedPairing, participantById, roundLabel } from '../lib/tournament-ui';
  import Avatar from './Avatar.svelte';

  interface Props {
    tournament: PublicTournament;
  }

  let { tournament }: Props = $props();

  const uid = $props.id();
  const columns = $derived(bracketColumns(tournament));
  const highlight = $derived(highlightedPairing(tournament));

  function columnName(round: number): string {
    const label = roundLabel(tournament, { round, tiebreak: false });
    return t(label.key, label.vars);
  }

  /** How a pairing was decided, when it was not simply played out. */
  function note(p: PublicPairing): string | null {
    if (p.decidedBy === 'coin') return t('tournament.coin');
    if (p.decidedBy === 'forfeit') return t(p.winner ? 'tournament.forfeit' : 'tournament.forfeit_both');
    return null;
  }
</script>

{#snippet slot(p: PublicPairing, id: string | null, score: number | null)}
  {#if id === null}
    <span class="slot empty">{t('tournament.bye')}</span>
  {:else}
    {@const person = participantById(tournament, id)}
    {@const won = p.winner === id}
    <span class="slot" class:winner={won} class:you={id === tournament.youId} class:out={person?.forfeited}>
      <Avatar id={person?.avatar ?? ''} size={28} />
      <span class="who">
        <span class="nick">{person?.nickname ?? ''}</span>
        {#if id === tournament.youId || person?.forfeited}
          <span class="pills">
            {#if id === tournament.youId}<span class="pill" data-kind="you">{t('tournament.you')}</span>{/if}
            {#if person?.forfeited}<span class="pill" data-kind="out">{t('tournament.forfeited')}</span>{/if}
          </span>
        {/if}
      </span>
      {#if score !== null}<span class="score">{score}</span>{/if}
      {#if won}<span class="check" aria-hidden="true">✓</span><span class="sr-only">{t('tournament.winner_mark')}</span>{/if}
    </span>
  {/if}
{/snippet}

<!--
  A list of rounds, each a labelled list of pairings: the meaning never depends on lines or colour. Wide brackets
  scroll sideways inside this wrapper only (focusable, so the keyboard can scroll it too); the page never does.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="bracket-scroll" role="region" aria-label={t('tournament.bracket')} tabindex="0">
  {#if columns.length > 0}
    <ol class="bracket">
      {#each columns as column (column.round)}
        <li class="round" data-round={column.round}>
          <span class="round-name" id="{uid}-r{column.round}">{columnName(column.round)}</span>
          <ol class="pairings" aria-labelledby="{uid}-r{column.round}">
            {#each column.pairings as p, i (i)}
              {#if p}
                {@const current = highlight?.id === p.id}
                {@const how = note(p)}
                <li class="match" class:current data-pairing={p.id} aria-current={current ? 'true' : undefined}>
                  {#if current && highlight}
                    <span class="flag" class:live={highlight.live}>{t(highlight.live ? 'tournament.live' : 'tournament.up_next')}</span>
                  {/if}
                  {@render slot(p, p.a, p.score ? p.score.a : null)}
                  {@render slot(p, p.b, p.score ? p.score.b : null)}
                  {#if how}<span class="note">{how}</span>{/if}
                </li>
              {:else}
                <li class="match open">
                  <span class="slot empty">{t('tournament.open')}</span>
                  <span class="slot empty">{t('tournament.open')}</span>
                </li>
              {/if}
            {/each}
          </ol>
        </li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  /* The only horizontal scroller of the tournament screens; the padding keeps shadows and the flags inside. */
  .bracket-scroll {
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    padding: var(--space-4) var(--space-3) var(--space-3) var(--space-1);
  }

  .bracket {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(11rem, 1fr);
    gap: var(--space-5);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .round {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: var(--space-4);
    min-width: 0;
  }

  .round-name {
    justify-self: start;
    padding: 0 var(--space-3);
    border: var(--outline) solid var(--on-bright);
    border-radius: var(--radius-sm);
    background: var(--yellow);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.04em;
    rotate: var(--tilt-1);
  }

  /* Later rounds sit between the pairings that feed them. */
  .pairings {
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    gap: var(--space-5);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .match {
    position: relative;
    display: grid;
    gap: var(--space-1);
    padding: var(--space-1);
    border: var(--outline) solid var(--on-bright);
    border-radius: var(--radius-sm);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
  }

  /* A short decorative line towards the next round; the lists carry the meaning. */
  .round:not(:last-child) .match::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 100%;
    width: calc(var(--space-5) + var(--outline));
    border-top: var(--outline) solid var(--edge);
  }

  /* The pairing in play (or up next): another fill, a bigger shadow and a named flag, never colour alone. */
  .match.current {
    background: var(--sky);
    box-shadow: var(--shadow);
  }

  .match.open {
    border-style: dashed;
    box-shadow: none;
  }

  .flag {
    position: absolute;
    top: calc(-1 * var(--space-4));
    right: var(--space-2);
    padding: 0 var(--space-2);
    border: 2px solid var(--on-bright);
    border-radius: var(--radius-pill);
    background: var(--yellow);
    color: var(--on-bright);
    font-family: var(--font-display);
    font-size: var(--text-md);
    letter-spacing: 0.05em;
    line-height: 1.3;
    rotate: var(--tilt-2);
  }

  .flag.live {
    background: var(--pink);
  }

  .slot {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--space-2);
    min-height: 2.5rem;
    padding: var(--space-1) var(--space-2);
    border: 3px solid transparent;
    border-radius: 4px;
  }

  /* The winner: yellow, a thick outline and a check mark. */
  .slot.winner {
    border-color: var(--on-bright);
    background: var(--yellow);
  }

  .slot.empty {
    display: flex;
    border: 2px dashed var(--on-bright);
    font-weight: 700;
    font-style: italic;
  }

  .who {
    display: grid;
    min-width: 0;
  }

  .nick {
    overflow-wrap: anywhere;
    font-weight: 700;
    line-height: 1.15;
  }

  .out .nick {
    text-decoration: line-through;
  }

  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .pill {
    padding: 0 var(--space-2);
    border: 2px solid var(--on-bright);
    border-radius: var(--radius-pill);
    background: var(--sky);
    color: var(--on-bright);
    font-size: 0.8125rem;
    font-weight: 700;
    line-height: 1.3;
  }

  .pill[data-kind='out'] {
    border-style: dashed;
    background: var(--sticker);
  }

  .score {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    line-height: 1;
  }

  .check {
    display: grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--on-bright);
    color: var(--yellow);
    font-weight: 700;
    line-height: 1;
  }

  .note {
    justify-self: start;
    margin: 0 var(--space-1) var(--space-1);
    padding: 0 var(--space-2);
    border: 2px solid var(--on-bright);
    border-radius: var(--radius-pill);
    background: var(--pink);
    color: var(--on-bright);
    font-size: 0.8125rem;
    font-weight: 700;
  }
</style>
