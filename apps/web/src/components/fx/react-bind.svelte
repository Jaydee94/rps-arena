<script lang="ts">
  /*
   * Bind (struck by entangle): leafy vines lash across the sticker's face and hold it tight. Each band grows
   * from its left end; --wrap is how far it has grown (a horizontal scale): the static end pose and the last
   * keyframe both read it (animations.css, "fx: entangle / bind" and "fx static: entangle / bind").
   * Markup only.
   */
  interface Props {
    gesture: string;
    size: number;
  }

  // The vines lie over the sticker without copying it; the props are part of the reaction contract.
  let { gesture: _gesture, size: _size }: Props = $props();

  /** The bands across the face (in % of the sticker) and their leaves (position and tilt). */
  const BANDS = [
    { d: 'M-4,26 C20,36 34,16 56,28 C76,39 88,26 104,34', leaves: [{ x: 40, y: 22, rot: -40 }, { x: 82, y: 30, rot: 30 }] },
    { d: 'M-4,74 C18,62 40,82 60,68 C78,56 92,70 104,62', leaves: [{ x: 74, y: 60, rot: -30 }, { x: 16, y: 70, rot: 200 }] },
  ];

  const LEAF = 'M-1,0 C2,-5 7,-5 10,0 C7,5 2,5 -1,0 Z';
</script>

<span class="bind" aria-hidden="true" style:--wrap="1">
  {#each BANDS as band, i (i)}
    <svg class="art bind-band" viewBox="0 0 100 100" focusable="false" style:--i={i}>
      <path class="bind-stem" d={band.d} />
      <path class="bind-stem-fill" d={band.d} />
      {#each band.leaves as leaf, j (j)}
        <path class="green" d={LEAF} transform="translate({leaf.x} {leaf.y}) rotate({leaf.rot})" />
      {/each}
    </svg>
  {/each}
</span>

<style>
  /* Stacks exactly on the sticker (the sticker wrapper is a one-cell grid); nothing leaves its silhouette. */
  .bind {
    position: relative;
    display: grid;
    grid-area: 1 / 1;
    clip-path: circle(50% at 50% 50%);
    pointer-events: none;
  }

  /* Out of the grid flow, so it takes the sticker's size instead of setting it; grows from its left end. */
  .bind-band {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform-origin: 0 50%;
  }

  .bind-stem {
    stroke-width: 9;
  }

  .bind-stem-fill {
    stroke: var(--green);
    stroke-width: 5;
  }

  .bind-band .green {
    stroke-width: 2;
  }
</style>
