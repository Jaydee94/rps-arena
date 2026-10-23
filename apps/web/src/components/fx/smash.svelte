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

  /** Dust puffs on the rim: position and size. */
  const PUFFS = [
    { x: -52, y: 40, r: 17 },
    { x: 54, y: 36, r: 15 },
    { x: -14, y: 62, r: 19 },
    { x: 26, y: 58, r: 14 },
    { x: -60, y: -18, r: 12 },
  ];

  /** Rock chunks: where they fly (px of the 200-unit frame), how far they spin, and their outline. */
  const CHUNKS = [
    { dx: -96, dy: -58, rot: -220, points: '-8,-6 4,-9 9,1 3,8 -7,5' },
    { dx: -40, dy: -104, rot: 160, points: '-6,-7 7,-5 6,6 -5,7' },
    { dx: 70, dy: -86, rot: 260, points: '-9,-3 0,-9 8,-4 6,7 -6,6' },
    { dx: 104, dy: 10, rot: -180, points: '-5,-8 8,-6 7,5 -7,6' },
    { dx: -104, dy: 30, rot: 200, points: '-7,-5 5,-8 8,3 -2,8' },
    { dx: 36, dy: 96, rot: -140, points: '-6,-6 6,-7 7,5 -6,6' },
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
