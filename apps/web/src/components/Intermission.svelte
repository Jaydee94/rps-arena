<script lang="ts">
  import type { PublicPairing, PublicTournament } from '@rps/shared';
  import { room, skipWait } from '../lib/connection';
  import { t } from '../lib/i18n';
  import { currentPairing, participantById, participantName, roundLabel, upcomingPairing } from '../lib/tournament-ui';
  import Avatar from './Avatar.svelte';
  import Bracket from './Bracket.svelte';
  import StandingsTable from './StandingsTable.svelte';
  import WaitCountdown from './WaitCountdown.svelte';

  /** How the finished pairing was decided, when it was not simply played out. */
  function howDecided(p: PublicPairing): string | null {
    switch (p.decidedBy) {
      case 'coin':
        return t('tournament.coin');
      case 'forfeit':
        return t(p.winner ? 'tournament.forfeit' : 'tournament.forfeit_both');
      case 'bye':
        return t('tournament.no_match');
      default:
        return null;
    }
  }

  function roundName(tournament: PublicTournament, p: PublicPairing): string {
    const label = roundLabel(tournament, p);
    return t(label.key, label.vars);
  }
</script>

<!--
  Between two matches. During the intermission `currentPairingId` still points at the pairing that just finished,
  so the first panel shows its result; the next pairing comes from the same rule the server uses (upcomingPairing).
-->
{#if $room?.tournament}
  {@const view = $room}
  {@const tournament = $room.tournament}
  {@const done = currentPairing(tournament)}
  {@const upcoming = upcomingPairing(tournament)}
  <main class="tinter">
    <section class="panel result" aria-labelledby="tinter-title">
      <h2 id="tinter-title" class="ribbon">{t('tournament.result.title')}</h2>
      {#if done}
        {@const how = howDecided(done)}
        <p class="round-tag">{roundName(tournament, done)}</p>
        <div class="duel">
          {#each [done.a, done.b] as id, i (i)}
            {@const person = participantById(tournament, id)}
            {@const won = id !== null && done.winner === id}
            <div class="fighter" class:winner={won} class:you={id !== null && id === tournament.youId}>
              {#if id === null}
                <span class="nick bye">{t('tournament.bye')}</span>
              {:else}
                <span class="avatar-ring"><Avatar id={person?.avatar ?? ''} size={56} /></span>
                <span class="nick">{person?.nickname ?? ''}</span>
                {#if won}<span class="stamp"><span aria-hidden="true">✓</span> {t('tournament.winner_mark')}</span>{/if}
              {/if}
            </div>
            {#if i === 0}<span class="vs" aria-hidden="true">VS</span>{/if}
          {/each}
        </div>
        {#if done.score}<p class="score">{t('tournament.score', { a: done.score.a, b: done.score.b })}</p>{/if}
        <p class="verdict" role="status">
          {done.winner ? t('tournament.result.winner', { name: participantName(tournament, done.winner) }) : t('tournament.result.none')}
        </p>
        {#if how}<p class="how">{how}</p>{/if}
      {/if}
    </section>

    <section class="panel next" aria-labelledby="tinter-next">
      <h3 id="tinter-next" class="ribbon ribbon--sky">{t('tournament.next_match')}</h3>
      {#if upcoming}
        <div class="next-faces" aria-hidden="true">
          <Avatar id={participantById(tournament, upcoming.a)?.avatar ?? ''} size={40} />
          <Avatar id={participantById(tournament, upcoming.b)?.avatar ?? ''} size={40} />
        </div>
        <p class="versus">
          {t('tournament.versus', { a: participantName(tournament, upcoming.a), b: participantName(tournament, upcoming.b) })}
        </p>
        {#if upcoming.tiebreak}<p class="how">{t('tournament.tiebreak')}</p>{/if}
        <WaitCountdown untilMs={tournament.untilMs} key="tournament.countdown" />
      {:else}
        <p class="versus">{t('tournament.wrapping_up')}</p>
      {/if}
      {#if view.isHost}
        <button type="button" class="btn btn-primary skip" onclick={() => skipWait()}>{t('tournament.skip')}</button>
      {/if}
    </section>

    <!-- Not a labelled section: the bracket brings its own region named the same. -->
    <div class="panel overview">
      <h3 class="ribbon">{t(tournament.format === 'knockout' ? 'tournament.bracket' : 'tournament.standings')}</h3>
      {#if tournament.format === 'knockout'}
        <Bracket {tournament} />
      {:else}
        <StandingsTable {tournament} />
      {/if}
    </div>
  </main>
{/if}

<style>
  .tinter {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--gutter);
    max-width: 48rem;
    margin: 0 auto;
    width: 100%;
  }

  .tinter > :global(*) {
    min-width: 0;
  }

  .panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  /* The result panel: yellow with red dots, like the own side of the scoreboard. */
  .result {
    background-color: var(--yellow);
    background-image: radial-gradient(circle, color-mix(in srgb, var(--red) 45%, transparent) 22%, transparent 25%);
    background-size: 14px 14px;
    color: var(--on-bright);
  }

  .round-tag {
    justify-self: end;
    margin: 0;
    padding: 0 var(--space-3);
    border: var(--outline) solid var(--on-bright);
    border-radius: var(--radius-pill);
    background: var(--sticker);
    font-weight: 700;
    rotate: var(--tilt-2);
  }

  .duel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: stretch;
    gap: var(--space-2);
  }

  .fighter {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-3) var(--space-2);
    border: var(--outline) solid var(--on-bright);
    border-radius: var(--radius-panel);
    background: var(--sticker);
    box-shadow: var(--shadow-sm);
    text-align: center;
  }

  /* The winner: sky fill, a thicker outline and a stamped check mark, not only a colour. */
  .fighter.winner {
    border-width: calc(var(--outline) + 2px);
    background: var(--sky);
    box-shadow: var(--shadow);
    rotate: var(--tilt-1);
  }

  .avatar-ring {
    display: block;
    padding: 2px;
    border: 3px solid var(--on-bright);
    border-radius: 50%;
    background: var(--sticker);
  }

  .nick {
    max-width: 100%;
    overflow-wrap: anywhere;
    font-weight: 700;
    line-height: 1.2;
  }

  .nick.bye {
    font-style: italic;
  }

  .stamp {
    padding: 0 var(--space-2);
    border: 2px solid var(--on-bright);
    border-radius: var(--radius-sm);
    background: var(--yellow);
    font-family: var(--font-display);
    letter-spacing: 0.05em;
    rotate: -4deg;
  }

  .vs {
    align-self: center;
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border: 3px solid var(--on-bright);
    border-radius: 50%;
    background: var(--red);
    color: var(--on-bright);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    rotate: -8deg;
  }

  .score {
    justify-self: center;
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    letter-spacing: 0.04em;
  }

  .verdict {
    justify-self: center;
    max-width: 100%;
    margin: 0;
    padding: var(--space-2) var(--space-5);
    border: var(--outline) solid var(--on-bright);
    border-radius: var(--radius-lg);
    background: var(--sticker);
    box-shadow: var(--shadow-sm);
    text-align: center;
    overflow-wrap: anywhere;
    font-family: var(--font-display);
    font-size: clamp(1.25rem, 6vw, 1.625rem);
    letter-spacing: 0.04em;
    line-height: 1.15;
    text-shadow: 2px 2px 0 var(--yellow);
  }

  .how {
    justify-self: center;
    margin: 0;
    padding: 0 var(--space-3);
    border: 2px solid var(--on-bright);
    border-radius: var(--radius-pill);
    background: var(--pink);
    color: var(--on-bright);
    font-weight: 700;
  }

  .next-faces {
    display: flex;
    gap: var(--space-1);
  }

  .versus {
    margin: 0;
    overflow-wrap: anywhere;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    letter-spacing: 0.04em;
    line-height: 1.15;
  }

  .next > .how {
    justify-self: start;
  }

  .skip {
    justify-self: start;
    max-width: 100%;
  }

  .overview {
    gap: 0;
  }
</style>
