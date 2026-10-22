<script lang="ts">
  import { AVATARS } from '@rps/shared';
  import { t } from '../lib/i18n';
  import Avatar from './Avatar.svelte';

  interface Props {
    value: string;
  }

  let { value = $bindable() }: Props = $props();

  let grid: HTMLDivElement | undefined = $state();
  let mounted = false;

  // Keeps the chosen tile visible inside the scroll container (no animation: scroll-behavior stays auto).
  // Keyboard focus already scrolls natively; this covers clicks on half-visible tiles and the initial value.
  $effect(() => {
    const current = value;
    if (!grid) return;
    const input = [...grid.querySelectorAll('input')].find((el) => el.value === current);
    const tile = input?.closest('label');
    const first = !mounted;
    mounted = true;
    if (!tile) return;
    // On mount only correct a tile that is outside the grid; never move the page for a visible one.
    if (first) {
      const outer = grid.getBoundingClientRect();
      const inner = tile.getBoundingClientRect();
      if (inner.top >= outer.top && inner.bottom <= outer.bottom) return;
    }
    tile.scrollIntoView?.({ block: 'nearest' });
  });
</script>

<fieldset class="group">
  <legend>{t('home.avatar')}</legend>
  <div class="avatars" bind:this={grid}>
    {#each AVATARS as avatar (avatar)}
      <label class="chip avatar-chip">
        <input type="radio" name="avatar" value={avatar} bind:group={value} aria-label={t(`avatar.${avatar}`)} />
        <Avatar id={avatar} size={48} />
        <!-- Not only color: the chosen tile gets a check badge hanging over its corner. -->
        {#if value === avatar}<span class="check-badge" aria-hidden="true">✓</span>{/if}
      </label>
    {/each}
  </div>
</fieldset>

<style>
  /*
   * Scrolls instead of growing: 32 tiles in a grid showing 2.5 rows, the half-visible third row tells
   * that there is more. The padding keeps the check badge (which hangs over the tile corner), the
   * focus ring and the tile shadow from being cut off by the overflow clip; scroll-padding does the
   * same when a tile is scrolled into view.
   */
  .avatars {
    --tile: 72px;
    --pad: var(--space-3);
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-3);
    padding: var(--pad);
    max-height: calc(var(--pad) + 2.5 * var(--tile) + 2 * var(--space-3));
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scroll-padding: var(--pad);
  }

  .avatar-chip {
    justify-content: center;
    min-width: 0;
    min-height: var(--tile);
    padding: var(--space-1);
    border-radius: 14px;
  }

  /* The shared chip check mark is replaced by the badge element. */
  .avatar-chip:has(input:checked)::after {
    content: none;
  }

  .check-badge {
    position: absolute;
    top: -0.55rem;
    right: -0.55rem;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 3px solid var(--line);
    border-radius: 50%;
    background: var(--red);
    color: var(--on-bright);
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1;
    rotate: -6deg;
  }
</style>
