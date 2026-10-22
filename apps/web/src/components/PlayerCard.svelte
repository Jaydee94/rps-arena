<script lang="ts">
  import { gestureEmoji, gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';

  interface Props {
    /** Accessible name of the region, e.g. "Du" or "Gegner". */
    label: string;
    nickname: string;
    avatar: string;
    /** Only ever set for the own pick or after the reveal. */
    gesture?: string | null;
    /** Status lines such as "Gegner hat gewählt". */
    notes?: string[];
    /** The reveal has happened but this seat has no pick. */
    missing?: boolean;
  }

  let { label, nickname, avatar, gesture = null, notes = [], missing = false }: Props = $props();
</script>

<section class="player card" aria-label={label}>
  <header>
    <span class="avatar" aria-hidden="true">{avatar}</span>
    <span class="nick">{nickname}</span>
  </header>
  {#if gesture}
    <p class="gesture">
      <span class="icon" aria-hidden="true">{gestureEmoji(gesture)}</span>
      <span>{t(gestureKey(gesture))}</span>
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
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .avatar {
    font-size: var(--text-xl);
    line-height: 1;
  }

  .nick {
    overflow-wrap: anywhere;
    font-weight: 700;
  }

  .gesture {
    display: grid;
    justify-items: center;
    font-family: var(--font-display);
    font-size: var(--text-xl);
  }

  .icon {
    font-size: var(--text-hero);
    line-height: 1;
  }

  .note {
    font-weight: 700;
  }
</style>
