<script lang="ts">
  import { leaveRoom, playerRoom, rematch } from '../lib/connection';
  import { t } from '../lib/i18n';
  import { teamOf } from '../lib/seats';
  import Avatar from './Avatar.svelte';
  import ComicBurst from './ComicBurst.svelte';
  import Confetti from './Confetti.svelte';

  function leave() {
    // Without the stored credentials the reload cannot silently rejoin this room.
    leaveRoom();
    location.assign('/');
  }
</script>

{#if $playerRoom?.match}
  {@const view = $playerRoom}
  {@const match = $playerRoom.match}
  {@const myTeam = teamOf(view.you)}
  {@const theirTeam = myTeam === 'a' ? 'b' : 'a'}
  {@const abandoned = match.winner === null}
  {@const won = match.winner === myTeam}
  {#if won}<Confetti />{/if}
  <main class="result card" class:result-win={won} class:result-lose={!won && !abandoned}>
    <div class="stage">
      <span class="avatar-hero"><Avatar id={view.players[view.you]?.avatar ?? ''} size={112} /></span>
      {#if !abandoned}
        <span class="burst-spot">
          <ComicBurst text={t(won ? 'burst.win' : 'burst.lose')} variant={won ? 'win' : 'lose'} />
        </span>
      {/if}
    </div>
    {#if abandoned}
      <div class="panel headline-box"><h2 class="headline">{t('result.abandoned.title')}</h2></div>
      <p class="hint">{t('result.abandoned.hint')}</p>
    {:else}
      <div class="panel headline-box">
        <h2 class="headline">{t(won ? 'result.match_win' : 'result.match_lose')}</h2>
      </div>
    {/if}
    {#if match.winner && view.config.mode === 'team2v2'}
      <p class="team">{t('result.team_win', { team: match.winner.toUpperCase() })}</p>
    {/if}
    <p class="score">
      {t('result.final_score', { mine: match.score[myTeam], theirs: match.score[theirTeam] })}
    </p>
    {#each match.forfeited as seat (seat)}
      <p>{t('result.forfeit', { name: view.players[seat]?.nickname ?? seat })}</p>
    {/each}
    <div class="actions">
      <button type="button" class="btn btn-primary" onclick={() => rematch()}>{t('result.rematch')}</button>
      <button type="button" class="btn" onclick={leave}>{t('result.leave')}</button>
    </div>
  </main>
{/if}

<style>
  .result {
    display: grid;
    justify-items: center;
    gap: var(--space-4);
    width: 100%;
    max-width: 32rem;
    margin: 0 auto;
    padding: var(--space-6) var(--space-4);
    text-align: center;
  }

  .stage {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    min-height: 9rem;
  }

  .avatar-hero {
    display: block;
    padding: var(--space-1);
    border: var(--border);
    border-radius: 50%;
    background: var(--sticker);
    box-shadow: var(--shadow);
  }

  .burst-spot {
    --burst-size: 8.5rem;
    display: block;
    margin-left: -1.5rem;
    translate: 0 -1rem;
  }

  .headline-box {
    max-width: 100%;
    padding: var(--space-3) var(--space-5);
    background: var(--sticker);
    color: var(--on-bright);
  }

  h2 {
    font-size: var(--text-hero);
    text-wrap: balance;
  }

  .hint {
    max-width: 24rem;
    color: var(--ink-soft);
  }

  .team,
  .score {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    letter-spacing: 0.04em;
  }

  .score {
    padding: 0 var(--space-4);
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--yellow);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    rotate: -1.5deg;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3);
  }
</style>
