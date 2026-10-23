<script lang="ts">
  import type { PublicTournament } from '@rps/shared';
  import { t } from '../lib/i18n';
  import { participantById } from '../lib/tournament-ui';
  import Avatar from './Avatar.svelte';

  interface Props {
    tournament: PublicTournament;
  }

  let { tournament }: Props = $props();

  // Best first in the DOM (and for screen readers); CSS stands them as 2 – 1 – 3.
  const places = $derived([...tournament.podium].sort((x, y) => x.rank - y.rank));
  const AVATAR = { 1: 72, 2: 56, 3: 48 } as const;
</script>

<ol class="podium" aria-label={t('tournament.podium_title')}>
  {#each places as place (place.rank)}
    {@const shared = place.ids.length > 1}
    <li class="place" data-rank={place.rank}>
      <ul class="people" class:shared>
        {#each place.ids as id (id)}
          {@const person = participantById(tournament, id)}
          <li class="person" class:you={id === tournament.youId}>
            <span class="avatar-ring"><Avatar id={person?.avatar ?? ''} size={shared ? 40 : AVATAR[place.rank]} /></span>
            <span class="nick">{person?.nickname ?? ''}</span>
            {#if id === tournament.youId}<span class="pill">{t('tournament.you')}</span>{/if}
          </li>
        {/each}
      </ul>
      <div class="step">
        <span class="digit" aria-hidden="true">{place.rank}</span>
        <span class="label">{t('tournament.place', { n: place.rank })}</span>
        {#if shared}<span class="pill shared-pill">{t('tournament.shared_place')}</span>{/if}
      </div>
    </li>
  {/each}
</ol>

<style>
  .podium {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-areas: 'second first third';
    align-items: end;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .place {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }

  .place[data-rank='1'] {
    grid-area: first;
  }

  .place[data-rank='2'] {
    grid-area: second;
  }

  .place[data-rank='3'] {
    grid-area: third;
  }

  /* Shared places stand side by side on one step. */
  .people {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: end;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .person {
    display: grid;
    justify-items: center;
    gap: var(--space-1);
    min-width: 0;
    max-width: 100%;
    text-align: center;
  }

  .shared .person {
    flex: 1 1 3rem;
  }

  .avatar-ring {
    display: block;
    padding: 2px;
    border: var(--outline) solid var(--on-bright);
    border-radius: 50%;
    background: var(--sticker);
    box-shadow: var(--shadow-sm);
  }

  .you .avatar-ring {
    background: var(--sky);
  }

  .nick {
    max-width: 100%;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--sticker);
    color: var(--on-bright);
    overflow-wrap: anywhere;
    font-size: var(--text-sm);
    font-weight: 700;
    line-height: 1.2;
  }

  .place[data-rank='1'] .nick {
    font-size: var(--text-md);
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

  /* The steps: heights and inks tell the places apart, and so do the big numbers. */
  .step {
    display: grid;
    align-content: start;
    justify-items: center;
    gap: var(--space-1);
    min-height: 4.5rem;
    padding: var(--space-2) var(--space-1);
    border: var(--outline) solid var(--on-bright);
    border-radius: var(--radius-panel) var(--radius-panel) 0 0;
    background: var(--pink);
    color: var(--on-bright);
    box-shadow: var(--shadow-panel);
    text-align: center;
  }

  .place[data-rank='1'] .step {
    min-height: 8rem;
    background: var(--yellow);
  }

  .place[data-rank='2'] .step {
    min-height: 6rem;
    background: var(--sky);
  }

  .digit {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    line-height: 1;
  }

  .place[data-rank='1'] .digit {
    font-size: calc(var(--text-2xl) * 1.4);
  }

  .label {
    overflow-wrap: anywhere;
    font-size: var(--text-sm);
    font-weight: 700;
    line-height: 1.2;
  }

  .shared-pill {
    background: var(--sticker);
  }
</style>
