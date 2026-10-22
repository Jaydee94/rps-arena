<script lang="ts">
  import { forgetSession, rematch, room } from '../lib/connection';
  import { t } from '../lib/i18n';
  import { teamOf } from '../lib/seats';

  function leave() {
    // Without the stored credentials the reload cannot silently rejoin this room.
    forgetSession();
    location.assign('/');
  }
</script>

{#if $room?.match}
  {@const view = $room}
  {@const match = $room.match}
  {@const myTeam = teamOf(view.you)}
  {@const theirTeam = myTeam === 'a' ? 'b' : 'a'}
  <main class="result card">
    <h2>{t(match.winner === myTeam ? 'result.match_win' : 'result.match_lose')}</h2>
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
    max-width: 32rem;
    margin: 0 auto;
    text-align: center;
  }

  h2 {
    font-size: var(--text-hero);
    text-shadow: var(--shadow-sm);
  }

  .team,
  .score {
    font-family: var(--font-display);
    font-size: var(--text-xl);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3);
  }
</style>
