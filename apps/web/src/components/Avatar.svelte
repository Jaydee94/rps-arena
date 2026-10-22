<script lang="ts">
  import { avatarIcon } from '../lib/gestures-ui';

  interface Props {
    id: string;
    /** Edge length in px. */
    size?: number;
  }

  let { id, size = 48 }: Props = $props();

  const svg = $derived(avatarIcon(id));
</script>

<!-- Decorative: the nickname (or the avatar's label in the picker) is always next to it. -->
<span class="avatar" class:unknown={svg === null} style:--size="{size}px" data-avatar={id} aria-hidden="true">
  {#if svg}{@html svg}{:else}?{/if}
</span>

<style>
  .avatar {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    line-height: 1;
  }

  .avatar :global(svg) {
    width: 100%;
    height: 100%;
  }

  .unknown {
    border: var(--border);
    background: var(--sticker);
    color: var(--on-bright);
    font-family: var(--font-display);
    font-size: calc(var(--size) * 0.6);
  }
</style>
