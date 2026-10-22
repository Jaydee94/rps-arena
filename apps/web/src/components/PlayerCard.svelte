<script lang="ts">
  import { gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';
  import Avatar from './Avatar.svelte';
  import GestureIcon from './GestureIcon.svelte';

  interface Props {
    /** Accessible name of the region, e.g. "Du" or "Gegner". */
    label: string;
    nickname: string;
    /** Avatar id. */
    avatar: string;
    /** Only ever set for the own pick or after the reveal. */
    gesture?: string | null;
    /** Status lines such as "Gegner hat gewählt". */
    notes?: string[];
    /** The reveal has happened but this seat has no pick. */
    missing?: boolean;
    /** Reveal: which side this card flies in from (see animations.css). */
    slam?: 'left' | 'right';
  }

  let { label, nickname, avatar, gesture = null, notes = [], missing = false, slam }: Props = $props();
</script>

<section class="player card" class:slam-left={slam === 'left'} class:slam-right={slam === 'right'} aria-label={label}>
  <header>
    <Avatar id={avatar} size={40} />
    <span class="nick">{nickname}</span>
  </header>
  {#if gesture}
    <p class="gesture">
      <span class="stamp-in"><GestureIcon id={gesture} size={88} /></span>
      <span class="gesture-name">{t(gestureKey(gesture))}</span>
    </p>
  {:else if missing}
    <p class="note">{t('board.no_pick')}</p>
  {/if}
  {#each notes as note (note)}
    <p class="note">{note}</p>
  {/each}
</section>

<style>
  .player {
    display: grid;
    align-content: start;
    gap: var(--space-2);
    min-height: 8rem;
    min-width: 0;
    box-shadow: var(--shadow-sm);
    rotate: var(--tilt-1);
  }

  .player:nth-child(2) {
    rotate: var(--tilt-2);
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .nick {
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 700;
  }

  .gesture {
    display: grid;
    justify-items: center;
    gap: var(--space-2);
  }

  .gesture-name {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    letter-spacing: 0.04em;
  }

  .note {
    font-weight: 700;
  }
</style>
