<script lang="ts">
  import { gestureIcon } from '../lib/gestures-ui';

  interface Props {
    id: string;
    /** Edge length of the icon disc in px. */
    size?: number;
    /** Draw the icon on a round paper sticker (default). */
    sticker?: boolean;
    /** A decorative copy (e.g. a shard of a broken sticker): carries no data-gesture, so it is never counted. */
    copy?: boolean;
  }

  let { id, size = 56, sticker = true, copy = false }: Props = $props();

  const svg = $derived(gestureIcon(id));
</script>

<!-- Decorative: every use is paired with the gesture's text label. -->
<span class="gesture-icon" class:sticker style:--size="{size}px" data-gesture={copy ? undefined : id} aria-hidden="true">
  {#if svg}{@html svg}{:else}?{/if}
</span>

<style>
  .gesture-icon {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: var(--size);
    height: var(--size);
    font-family: var(--font-display);
    font-size: calc(var(--size) * 0.6);
    line-height: 1;
  }

  .sticker {
    padding: calc(var(--size) * 0.1);
    border: var(--border);
    border-radius: 50%;
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
  }

  .gesture-icon :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
