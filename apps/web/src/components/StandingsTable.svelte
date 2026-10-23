<script lang="ts">
  import type { PublicPairing, PublicTournament } from '@rps/shared';
  import { t } from '../lib/i18n';
  import { highlightedPairing, participantById, sharedRanks } from '../lib/tournament-ui';
  import Avatar from './Avatar.svelte';

  interface Props {
    tournament: PublicTournament;
  }

  let { tournament }: Props = $props();

  const shared = $derived(sharedRanks(tournament));
  const tiebreaks = $derived(tournament.pairings.filter((p) => p.tiebreak));
  const highlight = $derived(highlightedPairing(tournament));
  const name = (id: string | null) => participantById(tournament, id)?.nickname ?? '';
</script>

{#snippet side(p: PublicPairing, id: string | null)}
  <span class="side" class:winner={id !== null && p.winner === id}>
    <span class="nick">{name(id)}</span>{#if id !== null && p.winner === id}<span class="check" aria-hidden="true">✓</span><span class="sr-only">{t('tournament.winner_mark')}</span>{/if}
  </span>
{/snippet}

<!-- Narrow screens get short column labels; the full words stay in the accessibility tree at every width. -->
<div class="table-scroll">
  <table class="standings">
    <caption>{t('tournament.table.caption')}</caption>
    <thead>
      <tr>
        <th scope="col" class="num">{t('tournament.table.rank')}</th>
        <th scope="col" class="name">{t('tournament.table.name')}</th>
        <th scope="col" class="num">
          <span class="long">{t('tournament.table.wins')}</span><span class="short" aria-hidden="true">{t('tournament.table.wins_short')}</span>
        </th>
        <th scope="col" class="num">
          <span class="long">{t('tournament.table.losses')}</span><span class="short" aria-hidden="true">{t('tournament.table.losses_short')}</span>
        </th>
        <th scope="col" class="num">
          <span class="long">{t('tournament.table.rounds')}</span><span class="short" aria-hidden="true">{t('tournament.table.rounds_short')}</span>
        </th>
      </tr>
    </thead>
    <tbody>
      {#each tournament.standings as row (row.participantId)}
        {@const person = participantById(tournament, row.participantId)}
        {@const mine = row.participantId === tournament.youId}
        <tr class:you={mine} class:top={row.rank === 1}>
          <td class="num rank">
            {row.rank}.{#if shared.has(row.rank)}<span class="pill shared">{t('tournament.shared_place')}</span>{/if}
          </td>
          <th scope="row" class="name">
            <span class="person">
              <Avatar id={person?.avatar ?? ''} size={28} />
              <span class="nick">{person?.nickname ?? ''}</span>
              {#if mine}<span class="pill" data-kind="you">{t('tournament.you')}</span>{/if}
              {#if person?.forfeited}<span class="pill" data-kind="out">{t('tournament.forfeited')}</span>{/if}
            </span>
          </th>
          <td class="num">{row.wins}</td>
          <td class="num">{row.losses}</td>
          <td class="num">{row.roundsWon}:{row.roundsLost}</td>
        </tr>
      {/each}
    </tbody>
    {#if tiebreaks.length > 0}
      <tbody class="tiebreaks">
        {#each tiebreaks as p (p.id)}
          {@const current = highlight?.id === p.id}
          <tr class="tiebreak" class:current aria-current={current ? 'true' : undefined}>
            <th scope="row" class="tb-label"><span class="pill tb">{t('tournament.tiebreak')}</span></th>
            <td colspan="4" class="tb-match">
              {@render side(p, p.a)}
              <span class="tb-score">{p.score ? `${p.score.a} : ${p.score.b}` : t('tournament.vs')}</span>
              {@render side(p, p.b)}
              {#if p.decidedBy === 'coin'}<span class="pill note">{t('tournament.coin')}</span>{/if}
              {#if current && highlight}<span class="pill flag">{t(highlight.live ? 'tournament.live' : 'tournament.up_next')}</span>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    {/if}
  </table>
</div>

<style>
  /* Room on the right and below for the hard shadow, which the scroll box would otherwise cut. */
  .table-scroll {
    max-width: 100%;
    overflow-x: auto;
    padding: 0 var(--space-2) var(--space-2) 0;
    container: standings / inline-size;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border: var(--outline) solid var(--on-bright);
    border-radius: var(--radius-sm);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }

  caption {
    padding: 0 0 var(--space-2) var(--space-1);
    caption-side: top;
    text-align: start;
    font-size: var(--text-sm);
    font-weight: 700;
  }

  th,
  td {
    padding: var(--space-2) var(--space-1);
    border-top: 2px solid var(--on-bright);
    text-align: start;
    vertical-align: middle;
  }

  thead th {
    border-top: 0;
    background: var(--yellow);
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 400;
    letter-spacing: 0.04em;
  }

  .num {
    width: 1%;
    white-space: nowrap;
    text-align: center;
    font-weight: 700;
  }

  .rank {
    text-align: start;
  }

  .name {
    min-width: 6rem;
  }

  th:first-child,
  td:first-child {
    padding-inline-start: var(--space-2);
  }

  th:last-child,
  td:last-child {
    padding-inline-end: var(--space-2);
  }

  tbody .name {
    font-weight: 400;
  }

  .person {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
  }

  .nick {
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 700;
  }

  /* Your row: sky fill, a thick outline on its first cell and the You pill. */
  tr.you > * {
    background: var(--sky);
  }

  tr.you > :first-child {
    box-shadow: inset var(--outline) 0 0 var(--on-bright);
  }

  .pill {
    display: inline-block;
    margin-inline-start: var(--space-1);
    padding: 0 var(--space-2);
    border: 2px solid var(--on-bright);
    border-radius: var(--radius-pill);
    background: var(--sticker);
    color: var(--on-bright);
    font-family: var(--font-body);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.3;
    white-space: nowrap;
  }

  .pill[data-kind='you'] {
    margin: 0;
    background: var(--sky);
  }

  tr.you .pill[data-kind='you'] {
    background: var(--yellow);
  }

  .pill[data-kind='out'] {
    margin: 0;
    border-style: dashed;
  }

  .pill.shared {
    display: block;
    width: max-content;
    margin: var(--space-1) 0 0;
    background: var(--yellow);
  }

  /* Tie-break matches: their own rows below the ranking, set apart by a dashed line and a pink label. */
  .tiebreaks tr:first-child > * {
    border-top: var(--outline) dashed var(--on-bright);
  }

  .pill.tb {
    margin: 0;
    background: var(--pink);
  }

  .tb-match {
    white-space: normal;
  }

  .tb-match > * {
    vertical-align: middle;
  }

  .side {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-width: 100%;
  }

  .side.winner .nick {
    text-decoration: underline;
    text-decoration-thickness: 3px;
  }

  .tb-score {
    margin-inline: var(--space-2);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    white-space: nowrap;
  }

  .check {
    display: inline-grid;
    place-items: center;
    width: 1.375rem;
    height: 1.375rem;
    border-radius: 50%;
    background: var(--on-bright);
    color: var(--yellow);
    font-size: 0.8125rem;
    line-height: 1;
  }

  .pill.note {
    background: var(--pink);
  }

  .pill.flag {
    background: var(--yellow);
  }

  tr.current > * {
    background: var(--sky);
  }

  /* Narrow: the short labels show, the long ones are only read out. */
  .long {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @container standings (width >= 30rem) {
    .long {
      position: static;
      width: auto;
      height: auto;
      overflow: visible;
      clip-path: none;
    }

    .short {
      display: none;
    }
  }
</style>
