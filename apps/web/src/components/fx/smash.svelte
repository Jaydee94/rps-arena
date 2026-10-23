<script lang="ts">
  /*
   * Smash (rock): a white impact star behind the struck sticker, dust puffs around its rim and rock
   * chunks bursting out. The frame is twice the sticker: the sticker covers the circle r = 50 around 0,0.
   * Markup only; motion: animations.css, "fx: smash / crumble".
   */

  // A jagged 12-spike star with a fixed wobble, so it stays the same between renders.
  const SPIKES = 12;
  const WOBBLE = [6, -4, 9, -2, 5, -7, 8, -3, 4, -6, 7, -1];
  const star = Array.from({ length: SPIKES * 2 }, (_, i) => {
    const angle = (i / (SPIKES * 2)) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? 86 + (WOBBLE[i / 2] ?? 0) : 58;
    return `${(radius * Math.cos(angle)).toFixed(1)},${(radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');

  /** Dust puffs all around the rim (one side is always hidden by the name tag): position and size. */
  const PUFFS = [
    { x: -60, y: 26, r: 17 },
    { x: 58, y: -30, r: 15 },
    { x: -34, y: -54, r: 14 },
    { x: 46, y: 46, r: 16 },
    { x: -56, y: -16, r: 12 },
    { x: 20, y: -62, r: 12 },
  ];

  /** Rock chunks: where they fly (px of the 200-unit frame), how far they spin, and their outline. */
  const CHUNKS = [
    { dx: -104, dy: -62, rot: -220, points: '-13,-10 6,-14 14,2 5,13 -11,8' },
    { dx: -44, dy: -112, rot: 160, points: '-10,-11 11,-8 10,10 -8,11' },
    { dx: 78, dy: -92, rot: 260, points: '-14,-5 0,-14 13,-6 10,11 -10,10' },
    { dx: 112, dy: 8, rot: -180, points: '-8,-12 12,-9 11,8 -11,10' },
    { dx: -112, dy: 34, rot: 200, points: '-11,-8 8,-12 12,5 -3,12' },
    { dx: 40, dy: 104, rot: -140, points: '-9,-9 9,-11 11,8 -9,9' },
  ];
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  <polygon class="white smash-star" points={star} />
  {#each PUFFS as puff, i (i)}
    <circle class="grey smash-puff" cx={puff.x} cy={puff.y} r={puff.r} style:--dx="{-puff.x / 2}px" style:--dy="{-puff.y / 2}px" />
  {/each}
  {#each CHUNKS as chunk, i (i)}
    <polygon class="grey smash-chunk" points={chunk.points} style:--dx="{chunk.dx}px" style:--dy="{chunk.dy}px" style:--spin="{chunk.rot}deg" />
  {/each}
</svg>

<style>
  .smash-star,
  .smash-puff,
  .smash-chunk {
    transform-box: fill-box;
    transform-origin: center;
  }

  /* The star's outline is thicker than the art stroke: it is the loudest line of the scene. */
  .smash-star {
    stroke-width: 5;
  }
</style>
