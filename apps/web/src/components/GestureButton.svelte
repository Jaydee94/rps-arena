<script lang="ts">
  import { gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';
  import GestureIcon from './GestureIcon.svelte';

  interface Props {
    gesture: string;
    selected: boolean;
    disabled: boolean;
    tabindex: 0 | -1;
    /** Index in the pad; picks the tile colour (pink, yellow, teal, orange, green, sky, red, then again). */
    tone: number;
    /** Few gestures (classic, lizard-spock): bigger buttons. */
    large?: boolean;
    onpick: (gesture: string) => void;
    onkeydown: (event: KeyboardEvent) => void;
    onfocus: () => void;
  }

  let { gesture, selected, disabled, tabindex, tone, large = false, onpick, onkeydown, onfocus }: Props = $props();
</script>

<button
  type="button"
  role="radio"
  class="gesture tone-{tone % 7}"
  class:selected
  class:large
  aria-checked={selected}
  {disabled}
  {tabindex}
  {onkeydown}
  {onfocus}
  onclick={() => onpick(gesture)}
>
  <span class="art tile-art" style:--i={tone}><GestureIcon id={gesture} size={large ? 92 : 60} /></span>
  <span class="label">{t(gestureKey(gesture))}</span>
</button>

<style>
  /* A coloured tile with a light halftone; the label sits on a white box. */
  .gesture {
    position: relative;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: var(--space-1);
    width: calc((100% - 2 * var(--pad-gap, var(--space-3))) / 3);
    max-width: 6.5rem;
    min-width: 0;
    min-height: 5.8rem;
    padding: var(--space-2) var(--space-1);
    border: var(--border);
    border-radius: var(--radius);
    background-color: var(--sticker);
    background-image: radial-gradient(circle, var(--dot-on-tile) 2px, transparent 2.5px);
    background-size: 12px 12px;
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
  }

  .tone-0 { background-color: var(--pink); }
  .tone-1 { background-color: var(--yellow); }
  .tone-2 { background-color: var(--teal); }
  .tone-3 { background-color: var(--orange); }
  .tone-4 { background-color: var(--green); }
  .tone-5 { background-color: var(--sky); }
  .tone-6 { background-color: var(--red); }

  /* A slight lean around the pad; the second tile (the middle of the first row) sits a bit higher. Rotation stays on the button. */
  .gesture {
    rotate: var(--tilt, 0deg);
  }
  .gesture:nth-child(3n + 1) { --tilt: -1.5deg; }
  .gesture:nth-child(3n + 2) { --tilt: 1deg; }
  .gesture:nth-child(3n) { --tilt: -0.8deg; }
  .gesture:nth-child(2) { top: -8px; }

  .gesture.large {
    width: calc((100% - 2 * var(--pad-gap, var(--space-3))) / 3);
    max-width: 8.5rem;
    min-height: 9rem;
  }

  .art {
    display: grid;
    justify-items: center;
    width: 100%;
    padding-top: 6px; /* room for the resting bob so the sticker never reaches the border */
  }

  /* The sticker may shrink on narrow screens instead of overflowing the tile. */
  .art :global(.gesture-icon) {
    width: min(var(--size), 100%);
    height: auto;
    aspect-ratio: 1;
  }

  .label {
    max-width: 100%;
    padding: 0 var(--space-1);
    border: calc(var(--outline) / 2) solid var(--edge);
    border-radius: var(--radius-sm);
    background: var(--sticker);
    overflow-wrap: anywhere;
    text-align: center;
    font-family: var(--font-display);
    font-size: var(--text-md);
    letter-spacing: 0.05em;
    line-height: 1.2;
  }

  /* Long names such as SCISSORS must fit the narrowest tile (about 104 px at 360 px). */
  .large .label {
    font-size: clamp(1rem, 4.8vw, var(--text-lg));
    letter-spacing: 0.02em;
  }

  .gesture:disabled {
    cursor: not-allowed;
    box-shadow: none;
  }

  .gesture:disabled:not(.selected) {
    opacity: 0.55;
  }

  /* Selected is shown by a thicker offset and a check mark, never by color alone. */
  .gesture.selected {
    box-shadow: var(--shadow);
  }

  .selected .label::after {
    content: ' ✓';
  }
</style>
