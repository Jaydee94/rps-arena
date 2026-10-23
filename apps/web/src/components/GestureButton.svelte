<script lang="ts">
  import { gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';
  import { actionsOf } from '../lib/matchup-fx';
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
    /** The gestures this one beats; shown as a speech bubble on hover/focus (what it does to each) and read as the description. */
    beats?: readonly string[];
    onpick: (gesture: string) => void;
    onkeydown: (event: KeyboardEvent) => void;
    onfocus: () => void;
  }

  let { gesture, selected, disabled, tabindex, tone, large = false, beats = [], onpick, onkeydown, onfocus }: Props = $props();

  const uid = $props.id(); // unique per tile, so every radio points at its own hint
  const hintId = `${uid}-hint`;
</script>

<!-- The tile wraps the radio so that the hint can sit beside it without becoming part of its name. -->
<div class="tile" class:large>
  <button
    type="button"
    role="radio"
    class="gesture tone-{tone % 7}"
    class:selected
    class:large
    aria-checked={selected}
    aria-describedby={beats.length ? hintId : undefined}
    {disabled}
    {tabindex}
    {onkeydown}
    {onfocus}
    onclick={() => onpick(gesture)}
  >
    <span class="art tile-art" style:--i={tone}><GestureIcon id={gesture} size={large ? 92 : 60} /></span>
    <span class="label">{t(gestureKey(gesture))}</span>
  </button>
  {#if beats.length}
    <!-- A speech bubble above the tile, shown on hover and focus. Its text is the description of the radio. -->
    <span class="hint">
      <span class="bubble">
        <span class="hint-text" id={hintId}>{actionsOf(gesture, beats)}</span>
        <span class="hint-icons">
          {#each beats as id (id)}<GestureIcon {id} size={24} sticker={false} />{/each}
        </span>
      </span>
    </span>
  {/if}
</div>

<style>
  /* A coloured tile with a light halftone; the label sits on a white box. */
  .gesture {
    position: relative;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: var(--space-1);
    width: 100%;
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
  /* The tile is the flex item of the pad; the radio fills it and the hint hangs off it. */
  .tile {
    position: relative;
    display: grid;
    width: calc((100% - 2 * var(--pad-gap, var(--space-3))) / 3);
    max-width: 6.5rem;
    min-width: 0;
  }

  .tile.large {
    max-width: 8.5rem;
  }

  /* A slight lean around the pad; the second tile (the middle of the first row) sits a bit higher. Rotation stays on the button. */
  .gesture {
    rotate: var(--tilt, 0deg);
  }
  .tile:nth-child(3n + 1) { --tilt: -1.5deg; }
  .tile:nth-child(3n + 2) { --tilt: 1deg; }
  .tile:nth-child(3n) { --tilt: -0.8deg; }
  .tile:nth-child(2) { top: -8px; }

  .gesture.large {
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

  /*
   * The rule hint: a speech bubble above the tile that shows on hover and keyboard focus. Only
   * opacity and visibility change, nothing moves, and it takes no pointer events, so it never
   * blocks a neighbouring tile. .hint is as wide as the tile and has no height; the bubble hangs
   * from its bottom edge and overflows to the side chosen by --hint-align.
   */
  .hint {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + var(--space-2));
    z-index: var(--z-raised);
    display: flex;
    align-items: flex-end;
    justify-content: var(--hint-align, center);
    height: 0;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  .tile:focus-within .hint {
    opacity: 1;
    visibility: visible;
  }

  @media (hover: hover) {
    .tile:hover .hint {
      opacity: 1;
      visibility: visible;
    }
  }

  .bubble {
    flex: none;
    display: grid;
    gap: var(--space-1);
    width: max-content;
    max-width: min(17rem, calc(100vw - 2 * var(--space-4)));
    padding: var(--space-1) var(--space-2);
    border: calc(var(--outline) / 2) solid var(--edge);
    border-radius: var(--radius);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    font-size: var(--text-sm);
    font-weight: 700;
    line-height: 1.25;
    text-align: start;
  }

  .hint-text {
    overflow-wrap: anywhere;
  }

  .hint-icons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  /* The tail points at the middle of the tile, wherever the bubble itself sits. */
  .hint::after {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    width: 0.625rem;
    height: 0.625rem;
    border-right: calc(var(--outline) / 2) solid var(--edge);
    border-bottom: calc(var(--outline) / 2) solid var(--edge);
    background: var(--sticker);
    translate: -50% -50%;
    rotate: 45deg;
  }

  /*
   * Keep the bubble inside the screen: the tile in the first column hangs it to the right, the one in
   * the last column to the left, a lone last tile (its row is centred) stays centred. The number of
   * columns follows the width of the pad (tiles are 6.5rem, large ones 8.5rem, 0.75rem apart):
   * n columns need n * tile + (n - 1) * gap, e.g. 4 * 6.5rem + 3 * 0.75rem = 28.25rem. The thresholds
   * are in rem like the tiles, so they stay right when the root font size changes.
   */
  .tile:last-child { --hint-align: flex-end; }

  @container pad (width < 28.25rem) {
    .tile:not(.large):nth-child(3n + 1) { --hint-align: flex-start; }
    .tile:not(.large):nth-child(3n) { --hint-align: flex-end; }
    .tile:not(.large):nth-child(3n + 1):last-child { --hint-align: center; }
  }

  @container pad (28.25rem <= width < 35.5rem) {
    .tile:not(.large):nth-child(4n + 1) { --hint-align: flex-start; }
    .tile:not(.large):nth-child(4n) { --hint-align: flex-end; }
    .tile:not(.large):nth-child(4n + 1):last-child { --hint-align: center; }
  }

  @container pad (35.5rem <= width < 42.75rem) {
    .tile:not(.large):nth-child(5n + 1) { --hint-align: flex-start; }
    .tile:not(.large):nth-child(5n) { --hint-align: flex-end; }
    .tile:not(.large):nth-child(5n + 1):last-child { --hint-align: center; }
  }

  @container pad (width >= 42.75rem) {
    .tile:not(.large):nth-child(6n + 1) { --hint-align: flex-start; }
    .tile:not(.large):nth-child(6n) { --hint-align: flex-end; }
    .tile:not(.large):nth-child(6n + 1):last-child { --hint-align: center; }
  }

  @container pad (width < 36.25rem) {
    .tile.large:nth-child(3n + 1) { --hint-align: flex-start; }
    .tile.large:nth-child(3n) { --hint-align: flex-end; }
    .tile.large:nth-child(3n + 1):last-child { --hint-align: center; }
  }

  @container pad (36.25rem <= width < 45.5rem) {
    .tile.large:nth-child(4n + 1) { --hint-align: flex-start; }
    .tile.large:nth-child(4n) { --hint-align: flex-end; }
    .tile.large:nth-child(4n + 1):last-child { --hint-align: center; }
  }

  @container pad (width >= 45.5rem) {
    .tile.large:nth-child(5n + 1) { --hint-align: flex-start; }
    .tile.large:nth-child(5n) { --hint-align: flex-end; }
    .tile.large:nth-child(5n + 1):last-child { --hint-align: center; }
  }
</style>
