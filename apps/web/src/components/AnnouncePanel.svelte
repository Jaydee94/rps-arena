<script lang="ts">
  import { BLUFF_EMOTES } from '@rps/shared';
  import { gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';
  import GestureIcon from './GestureIcon.svelte';

  interface Props {
    /** True once an announcement (or skip) was sent: the buttons lock. */
    done: boolean;
    onannounce: (emote: string | null) => void;
  }

  let { done, onannounce }: Props = $props();
</script>

<div class="panel">
  <div class="emotes" role="group" aria-label={t('board.emotes')}>
    {#each BLUFF_EMOTES as emote (emote)}
      <button type="button" class="btn bubble" disabled={done} onclick={() => onannounce(emote)}>
        <GestureIcon id={emote} size={44} sticker={false} />
        <span>{t(gestureKey(emote))}</span>
      </button>
    {/each}
  </div>
  <button type="button" class="btn btn-small" disabled={done} onclick={() => onannounce(null)}>
    {t('bluff.skip')}
  </button>
</div>

<style>
  .panel {
    display: grid;
    justify-items: center;
    gap: var(--space-3);
  }

  .emotes {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3);
  }

  /* Each announcement is a speech bubble with a tail. */
  .bubble {
    position: relative;
    padding-inline: var(--space-4);
    border-radius: var(--radius-lg);
    font-size: var(--text-lg);
  }

  .bubble::after {
    content: '';
    position: absolute;
    bottom: -0.7rem;
    left: 1.6rem;
    width: 1rem;
    height: 1rem;
    border-right: var(--border);
    border-bottom: var(--border);
    background: inherit;
    rotate: 45deg;
  }

</style>
