<script lang="ts">
  import type { PublicParticipant } from '@rps/shared';
  import { t } from '../lib/i18n';
  import Avatar from './Avatar.svelte';

  interface Props {
    participants: PublicParticipant[];
    /** The viewer's own participant id (gets the "You" marker). */
    youId: string | null;
    /** Participant id to mark as host; null when the host is not known to this viewer. */
    hostId?: string | null;
    label: string;
  }

  let { participants, youId, hostId = null, label }: Props = $props();
</script>

<ul class="players" aria-label={label}>
  {#each participants as p (p.id)}
    <li class="player" class:away={!p.connected} data-testid="participant-{p.id}">
      <Avatar id={p.avatar} size={48} />
      <span class="who">
        <span class="nick">{p.nickname}</span>
        {#if p.id === youId || p.id === hostId || !p.connected}
          <span class="tags">
            {#if p.id === youId}<span data-kind="you">{t('tournament.you')}</span>{/if}
            {#if p.id === hostId}<span data-kind="host">{t('tournament.host')}</span>{/if}
            {#if !p.connected}<span data-kind="away">{t('lobby.disconnected')}</span>{/if}
          </span>
        {/if}
      </span>
    </li>
  {/each}
</ul>

<style>
  .players {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .player {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border: var(--border);
    border-radius: var(--radius);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
  }

  .away {
    border-style: dashed;
    box-shadow: none;
    opacity: 0.75;
  }

  .who {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  .nick {
    overflow-wrap: anywhere;
    font-weight: 700;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    font-weight: 700;
  }

  /*
   * The pills sit on a card that is light in both themes (--sticker), so they use bright tokens with the
   * always-dark --on-bright text and outline: never --paper-2 or --surface, which turn dark in dark mode.
   * The three kinds also differ in shape, not only colour: You is sky, Host is yellow, the lost connection
   * is a dashed pill.
   */
  .tags > span {
    padding: 0 var(--space-2);
    border: 2px solid var(--on-bright);
    border-radius: var(--radius-pill);
    background: var(--sticker);
    color: var(--on-bright);
  }

  .tags > [data-kind='you'] {
    background: var(--sky);
  }

  .tags > [data-kind='host'] {
    background: var(--yellow);
  }

  .tags > [data-kind='away'] {
    border-style: dashed;
  }
</style>
