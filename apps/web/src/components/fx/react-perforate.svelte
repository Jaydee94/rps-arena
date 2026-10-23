<script lang="ts">
  /*
   * Perforate (struck by shoot): two bullet holes punch into the sticker, one per shot, each a dark hole in a
   * torn white rim with hairline cracks. They sit on the real sticker, inside its silhouette. The holes stay
   * in the static end pose and at the end of the scene (animations.css, "fx: shoot / perforate" and
   * "fx static: shoot / perforate"). Markup only.
   */

  interface Props {
    gesture: string;
    size: number;
  }

  // The overlay draws only holes over the real sticker; the props are part of the reaction art contract.
  let { gesture: _gesture, size: _size }: Props = $props();

  /** The holes in % of the sticker, in shot order (--d matches the shot's delay in shoot.svelte). */
  const HOLES = [
    { x: 36, y: 40, d: '0ms', turn: 0 },
    { x: 60, y: 62, d: '160ms', turn: 40 },
  ];

  // The torn rim round a hole: a ragged 12-point ring around 0,0.
  const RAG = [10, 8, 11, 7.5, 10.5, 8, 11.5, 7, 10, 8.5, 11, 7.5];
  const rim = RAG.map((r, i) => {
    const angle = (i / RAG.length) * Math.PI * 2;
    return `${(r * Math.cos(angle)).toFixed(1)},${(r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
</script>

<span class="perforate" aria-hidden="true">
  <svg class="art perforate-holes" viewBox="0 0 100 100" focusable="false">
    {#each HOLES as hole, i (i)}
      <g transform="translate({hole.x} {hole.y}) rotate({hole.turn})">
        <g class="perforate-hole" style:--d={hole.d}>
          <polyline class="n perforate-crack" points="9,-3 16,-6 20,-4" />
          <polyline class="n perforate-crack" points="-6,8 -9,15 -15,18" />
          <polyline class="n perforate-crack" points="-7,-7 -12,-14" />
          <polygon class="white" points={rim} />
          <circle class="line" r="5.5" />
        </g>
      </g>
    {/each}
  </svg>
</span>

<style>
  /* Stacks exactly on the sticker (the sticker wrapper is a one-cell grid), clipped to its disc. */
  .perforate {
    display: grid;
    grid-area: 1 / 1;
    position: relative;
    clip-path: circle(46% at 50% 50%);
    pointer-events: none;
  }

  /* Out of the grid flow, so it takes the sticker's size instead of setting it. */
  .perforate-holes {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    stroke-width: 2.5;
  }

  .perforate-crack {
    stroke-width: 1.8;
  }

  .perforate-hole {
    transform-box: fill-box;
    transform-origin: center;
  }
</style>
