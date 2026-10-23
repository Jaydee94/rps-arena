<script lang="ts">
  import { t } from '../lib/i18n';
  import ComicBurst from './ComicBurst.svelte';

  interface Props {
    /** Status lines about the opponent, e.g. "Gegner überlegt …". Never contains a gesture before the reveal. */
    notes: string[];
    /** The opponent has locked in: the thought bubble gives way to the ZACK star. */
    locked: boolean;
  }

  let { notes, locked }: Props = $props();
</script>

{#if locked}
  <div class="locked">
    <span class="zack-star"><ComicBurst text={t('burst.zack')} variant="zack" /></span>
    {#each notes as note (note)}
      <p class="note">{note}</p>
    {/each}
  </div>
{:else}
  <div class="think">
    <div class="bubble">
      {#each notes as note (note)}
        <p class="note">{note}</p>
      {/each}
    </div>
    <span class="dots" aria-hidden="true">
      <i class="think-dot"></i>
      <i class="think-dot"></i>
    </span>
  </div>
{/if}

<style>
  .think,
  .locked {
    display: grid;
    justify-items: start;
    gap: var(--space-1);
    min-width: 0;
  }

  .locked {
    justify-items: center;
  }

  .bubble {
    max-width: 100%;
    padding: var(--space-2) var(--space-3);
    border: var(--border);
    border-radius: var(--radius-lg);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
  }

  .note {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: var(--text-sm);
    font-weight: 700;
    line-height: 1.25;
  }

  .locked .note {
    text-align: center;
    color: var(--text);
  }

  /* The tail: two circles, the small one at the end. */
  .dots {
    display: flex;
    align-items: flex-end;
    gap: var(--space-1);
    padding-inline-start: var(--space-4);
  }

  .think-dot {
    display: block;
    width: 0.9rem;
    height: 0.9rem;
    border: calc(var(--outline) / 2) solid var(--edge);
    border-radius: 50%;
    background: var(--sticker);
  }

  .think-dot + .think-dot {
    width: 0.6rem;
    height: 0.6rem;
  }

  /* The wrapper alone carries the tilt and the pop (see the motion stylesheet). */
  .zack-star {
    --burst-size: 6.5rem;
    display: inline-block;
  }

  .zack-star :global(.burst) {
    --burst-tilt: 0deg;
  }
</style>
