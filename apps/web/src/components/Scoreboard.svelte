<script lang="ts">
  import type { Side } from '../lib/board';
  import { t } from '../lib/i18n';
  import Avatar from './Avatar.svelte';
  import ComicBurst from './ComicBurst.svelte';

  interface Props {
    left: Side;
    right: Side;
    round: number;
    bestOf: number;
    /** Localized name of the game mode, shown after the best-of. */
    modeName: string;
  }

  let { left, right, round, bestOf, modeName }: Props = $props();
</script>

{#snippet face(side: Side)}
  {#if side.avatar}
    <Avatar id={side.avatar} size={48} />
  {:else}
    <span class="team-dot" data-team={side.team} aria-hidden="true"></span>
  {/if}
{/snippet}

{#snippet panel(side: Side, own: boolean)}
  <div class="side" class:own class:theirs={!own}>
    <div class="fill">
      <span class="face">{@render face(side)}</span>
      <span class="points" aria-hidden="true">{side.score}</span>
      <span class="name">{side.name}</span>
    </div>
  </div>
{/snippet}

<div class="scoreboard">
  <div class="row">
    <!-- The shadow sits on this wrapper: clip-path would cut a box-shadow off. -->
    <div class="panels">
      {@render panel(left, true)}
      {@render panel(right, false)}
    </div>
    <span class="vs" role="group" aria-label={t('board.score_label')}>
      <span class="vs-star" aria-hidden="true"><ComicBurst text="VS" variant="bam" /></span>
      <span class="sr-only">{t('board.score', { a: left.score, b: right.score })}</span>
    </span>
  </div>
  <p class="meta">
    <span>{t('board.round', { round })}</span>
    <span class="right">
      <span>{t('home.best_of', { n: bestOf })}</span>
      <span class="mode">{modeName}</span>
    </span>
  </p>
</div>

<style>
  .scoreboard {
    display: grid;
    gap: var(--space-2);
  }

  .row {
    position: relative;
  }

  .panels {
    display: grid;
    grid-template-columns: 1fr 1fr;
    filter: drop-shadow(5px 5px 0 var(--cast));
  }

  /* The outer shape is the outline, the inner one (.fill) the colour; both are cut at the same slant. */
  .side {
    display: grid;
    min-width: 0;
    padding: var(--outline);
    background: var(--edge);
  }

  .side.own {
    clip-path: polygon(0 0, 100% 0, 92% 100%, 0 100%);
  }

  .side.theirs {
    clip-path: polygon(8% 0, 100% 0, 100% 100%, 0 100%);
  }

  .fill {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    color: var(--on-bright);
  }

  .own .fill {
    background: var(--yellow);
    clip-path: polygon(0 0, 100% 0, 91% 100%, 0 100%);
    padding-inline-end: var(--space-5);
  }

  .theirs .fill {
    background: var(--sky);
    clip-path: polygon(9% 0, 100% 0, 100% 100%, 0 100%);
    padding-inline-start: var(--space-5);
    grid-template-columns: 1fr auto;
  }

  .face {
    display: grid;
    min-width: 0;
  }

  .theirs .face {
    order: 2;
  }

  .points {
    justify-self: end;
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    line-height: 1;
  }

  .theirs .points {
    justify-self: start;
    order: 1;
  }

  .name {
    grid-column: 1 / -1;
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 700;
    line-height: 1.2;
  }

  .theirs .name {
    order: 3;
    text-align: end;
  }

  .team-dot {
    width: 48px;
    height: 48px;
    border: var(--border);
    border-radius: 50%;
    background: var(--red);
    box-shadow: var(--shadow-sm);
  }

  .team-dot[data-team='b'] {
    background: var(--blue);
  }

  /* The VS star sits on the seam between the two panels. */
  .vs {
    position: absolute;
    top: 0;
    left: 50%;
    z-index: var(--z-raised);
    display: grid;
    place-items: center;
    height: 100%;
    translate: -50% 0;
    pointer-events: none;
  }

  .vs-star {
    --burst-size: 3.5rem;
    display: inline-block;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0 var(--space-3);
    font-family: var(--font-display);
    font-size: 1.125rem;
    letter-spacing: 0.04em;
  }

  .right {
    margin-inline-start: auto;
    text-align: end;
  }

  .mode::before {
    content: ' · ';
  }
</style>
