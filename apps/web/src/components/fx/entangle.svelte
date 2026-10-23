<script lang="ts">
  /*
   * Entangle (tree): four leafy vines shoot in from the corners of the frame and curl around the struck
   * sticker (they end behind it; the bind overlay wraps its face). The frame is twice the sticker: the
   * sticker covers the circle r = 50 around 0,0. Markup only; motion: animations.css, "fx: entangle / bind".
   */

  /**
   * One vine: its path from the outer end to the rim, the corner of its box where the outer end sits (it grows
   * from there), and its leaves (position and tilt).
   */
  const VINES = [
    {
      d: 'M-96,62 C-80,40 -70,50 -60,30 C-54,18 -62,8 -50,4',
      ox: '0%',
      oy: '100%',
      leaves: [
        { x: -82, y: 46, rot: -20 },
        { x: -62, y: 22, rot: 60 },
      ],
    },
    {
      d: 'M96,-62 C80,-40 70,-50 60,-30 C54,-18 62,-8 50,-4',
      ox: '100%',
      oy: '0%',
      leaves: [
        { x: 82, y: -46, rot: 160 },
        { x: 62, y: -22, rot: 240 },
      ],
    },
    {
      d: 'M92,78 C76,76 72,60 58,58 C46,56 44,46 36,40',
      ox: '100%',
      oy: '100%',
      leaves: [{ x: 70, y: 64, rot: 110 }],
    },
    {
      d: 'M-92,-78 C-76,-76 -72,-60 -58,-58 C-46,-56 -44,-46 -36,-40',
      ox: '0%',
      oy: '0%',
      leaves: [{ x: -70, y: -64, rot: -70 }],
    },
  ];

  /** A leaf around 0,0, pointing right. */
  const LEAF = 'M-2,0 C3,-8 12,-7 16,0 C12,7 3,8 -2,0 Z';
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  {#each VINES as vine, i (i)}
    <g class="entangle-vine" style:--ox={vine.ox} style:--oy={vine.oy}>
      <path class="entangle-stem" d={vine.d} />
      <path class="entangle-stem-fill" d={vine.d} />
      {#each vine.leaves as leaf, j (j)}
        <path class="green" d={LEAF} transform="translate({leaf.x} {leaf.y}) rotate({leaf.rot})" />
      {/each}
    </g>
  {/each}
</svg>

<style>
  /* Each vine grows out of its outer end (the corner of its box given by --ox / --oy). */
  .entangle-vine {
    transform-box: fill-box;
    transform-origin: var(--ox) var(--oy);
  }

  /* The stem: a thick outline with a green core drawn over it. */
  .entangle-stem {
    stroke-width: 13;
  }

  .entangle-stem-fill {
    stroke: var(--green);
    stroke-width: 7;
  }
</style>
