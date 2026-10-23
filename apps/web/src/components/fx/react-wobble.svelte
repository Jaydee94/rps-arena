<script lang="ts">
  /*
   * Wobble (struck by poison): the sticker turns sickly green and green slime runs down from its top, with
   * a couple of bubbles on its face, while it wobbles like jelly. --tint is the green's end opacity and
   * --ooze how far the slime has run (a vertical scale): the static end pose and the last keyframe both
   * read them (animations.css, "fx: poison / wobble" and "fx static: poison / wobble"). Markup only.
   */
  interface Props {
    gesture: string;
    size: number;
  }

  // The overlay does not copy the sticker, it only tints it; the props are part of the reaction contract.
  let { gesture: _gesture, size: _size }: Props = $props();
</script>

<span class="wobble" aria-hidden="true" style:--tint="0.38" style:--ooze="1">
  <span class="wobble-tint"></span>
  <svg class="art wobble-slime" viewBox="0 0 100 100" focusable="false">
    <path
      class="green"
      d="M-5,-5 L105,-5 L105,14 C98,16 94,18 92,26 C90,32 83,32 82,26 C81,20 75,18 68,20 C62,22 60,30 58,38 C56,44 49,44 48,38 C47,28 42,20 34,20 C27,20 24,24 23,30 C22,35 15,35 15,30 C14,24 8,18 -5,18 Z"
    />
  </svg>
  <svg class="art wobble-bubbles" viewBox="0 0 100 100" focusable="false">
    <circle class="green" cx="28" cy="68" r="5" />
    <circle class="green" cx="74" cy="60" r="4" />
    <circle class="green" cx="62" cy="80" r="3" />
  </svg>
</span>

<style>
  /* Stacks exactly on the sticker (the sticker wrapper is a one-cell grid); stays inside its outline ring. */
  .wobble {
    position: relative;
    display: grid;
    grid-area: 1 / 1;
    clip-path: circle(47% at 50% 50%);
    pointer-events: none;
  }

  /* Out of the grid flow, so they take the sticker's size instead of setting it. */
  .wobble-tint,
  .wobble-slime,
  .wobble-bubbles {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .wobble-tint {
    border-radius: 50%;
    background: var(--green);
  }

  /* The slime hangs from the top edge: it runs down by growing from there. */
  .wobble-slime {
    stroke-width: 3;
    transform-origin: 50% 0;
  }

  .wobble-bubbles {
    stroke-width: 2.5;
  }
</style>
