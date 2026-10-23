<script lang="ts">
  /*
   * Poison (lizard): a green venom splat bursts behind the struck sticker, drops spray off it and toxic
   * bubbles rise and pop around the rim. The frame is twice the sticker: the sticker covers the circle
   * r = 50 around 0,0. Markup only; motion: animations.css, "fx: poison / wobble".
   */

  // A blobby splat: 10 lobes with a fixed wobble, so it stays the same between renders.
  const LOBES = 10;
  const REACH = [84, 72, 90, 70, 80, 86, 68, 92, 74, 82];
  const splat = (() => {
    const at = (i: number, r: number) => {
      const angle = (i / LOBES) * Math.PI * 2 - Math.PI / 2;
      return `${(r * Math.cos(angle)).toFixed(1)},${(r * Math.sin(angle)).toFixed(1)}`;
    };
    // Each lobe bulges out to its reach between two dents at r = 60.
    const parts = Array.from({ length: LOBES }, (_, i) => `Q${at(i + 0.5, (REACH[i] ?? 80) * 1.12)} ${at(i + 1, 60)}`);
    return `M${at(0, 60)} ${parts.join(' ')} Z`;
  })();

  /** Venom drops flying straight out of the splat: their direction in degrees from the top. */
  const DROPS = [-60, 50, -115, 105, -10];

  /** Toxic bubbles on the rim: position, size and how far they rise. */
  const BUBBLES = [
    { x: -62, y: -30, r: 9, rise: -40 },
    { x: 58, y: -44, r: 7, rise: -34 },
    { x: -40, y: -62, r: 6, rise: -30 },
    { x: 70, y: 10, r: 8, rise: -38 },
    { x: -72, y: 18, r: 6, rise: -30 },
    { x: 26, y: -70, r: 8, rise: -36 },
  ];
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  <path class="green poison-splat" d={splat} />
  {#each DROPS as angle (angle)}
    <!-- Drawn pointing up (round end outwards), turned to its direction; it flies along its own up. -->
    <g transform="rotate({angle})">
      <path class="green poison-drop" d="M0,-38 C5,-46 9,-50 9,-55 A9,9 0 0 0 -9,-55 C-9,-50 -5,-46 0,-38 Z" />
    </g>
  {/each}
  {#each BUBBLES as bubble, i (i)}
    <circle class="green poison-bubble" cx={bubble.x} cy={bubble.y} r={bubble.r} style:--rise="{bubble.rise}px" />
  {/each}
</svg>

<style>
  .poison-splat,
  .poison-drop,
  .poison-bubble {
    transform-box: fill-box;
    transform-origin: center;
  }

  .poison-bubble {
    stroke-width: 3;
  }
</style>
