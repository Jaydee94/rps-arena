<script lang="ts">
  import { BLUFF_EMOTES } from '@rps/shared';
  import { gestureEmoji, gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';

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
        <span aria-hidden="true">{gestureEmoji(emote)}</span>
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

  .bubble {
    border-radius: var(--radius-lg);
    font-family: var(--font-body);
    font-weight: 700;
    font-size: var(--text-md);
  }
</style>
