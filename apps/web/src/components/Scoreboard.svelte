<script lang="ts">
  import type { Side } from '../lib/board';
  import { t } from '../lib/i18n';

  interface Props {
    left: Side;
    right: Side;
    round: number;
    bestOf: number;
  }

  let { left, right, round, bestOf }: Props = $props();
</script>

<div class="scoreboard card">
  <div class="side">
    <span class="avatar" aria-hidden="true">{left.avatar}</span>
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
    <span class="avatar" aria-hidden="true">{right.avatar}</span>
    <span class="name">{right.name}</span>
  </div>
</div>

<style>
  .scoreboard {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--space-3);
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

  .avatar {
    font-size: var(--text-xl);
    line-height: 1;
  }

  .name {
    max-width: 100%;
    overflow-wrap: anywhere;
    font-weight: 700;
  }

  .score {
    display: grid;
    justify-items: center;
  }

  .points {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    line-height: 1;
  }

  .meta {
    display: flex;
    gap: var(--space-2);
    font-size: var(--text-sm);
    font-weight: 700;
  }

  .meta span + span::before {
    content: '· ';
  }
</style>
