<script lang="ts">
  import type { Side } from '../lib/board';
  import { t } from '../lib/i18n';
  import Avatar from './Avatar.svelte';

  interface Props {
    left: Side;
    right: Side;
    round: number;
    bestOf: number;
  }

  let { left, right, round, bestOf }: Props = $props();
</script>

{#snippet face(side: Side)}
  {#if side.avatar}
    <Avatar id={side.avatar} size={52} />
  {:else}
    <span class="team-dot" data-team={side.team} aria-hidden="true"></span>
  {/if}
{/snippet}

<div class="scoreboard card">
  <div class="side">
    {@render face(left)}
    <span class="name">{left.name}</span>
  </div>
  <div class="score">
    <span class="points" role="group" aria-label={t('board.score_label')}>
      {t('board.score', { a: left.score, b: right.score })}
    </span>
    <span class="meta">
      <span>{t('board.round', { round })}</span>
      <span>{t('home.best_of', { n: bestOf })}</span>
    </span>
  </div>
  <div class="side right">
    {@render face(right)}
    <span class="name">{right.name}</span>
  </div>
</div>

<style>
  .scoreboard {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--space-3);
    padding-block: var(--space-3);
  }

  .side {
    display: grid;
    justify-items: start;
    gap: var(--space-1);
    min-width: 0;
  }

  .side.right {
    justify-items: end;
    text-align: right;
  }

  .team-dot {
    width: 52px;
    height: 52px;
    border: var(--border);
    border-radius: 50%;
    background: var(--red);
    box-shadow: var(--shadow-sm);
  }

  .team-dot[data-team='b'] {
    background: var(--blue);
  }

  .name {
    max-width: 100%;
    overflow-wrap: anywhere;
    font-weight: 700;
    line-height: 1.2;
  }

  .score {
    display: grid;
    justify-items: center;
  }

  .points {
    padding: 0 var(--space-3);
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--yellow);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    line-height: 1.1;
    white-space: nowrap;
    rotate: -2deg;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0 var(--space-2);
    margin-top: var(--space-1);
    font-size: var(--text-sm);
    font-weight: 700;
  }

  .meta span + span::before {
    content: '· ';
  }
</style>
