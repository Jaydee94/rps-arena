<script lang="ts">
  /*
   * Wrap (paper): a ruled sheet sails in from the attacker's side and lands on the struck sticker, where the
   * cover reaction's own sheet takes over, while two swirl lines wind round it. Frame: the sticker is
   * the circle r = 50 around 0,0; the attacker sits bottom right (fx--at-mine) or top left (fx--at-theirs).
   * Markup only; motion: animations.css, "fx: wrap / cover".
   */

  /** Ruled lines on the sheet (y), drawn across its full width. */
  const RULES = [-56, -36, -16, 4, 24, 44, 64];

  /** Swirl arcs around the sticker: radius and the arc's start and end angle (degrees). */
  const SWIRLS = [
    { r: 74, from: 200, to: 320 },
    { r: 82, from: 20, to: 140 },
  ];

  const arc = ({ r, from, to }: { r: number; from: number; to: number }) => {
    const point = (deg: number) => `${(r * Math.cos((deg * Math.PI) / 180)).toFixed(1)},${(r * Math.sin((deg * Math.PI) / 180)).toFixed(1)}`;
    return `M ${point(from)} A ${r} ${r} 0 0 1 ${point(to)}`;
  };
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  <g transform="rotate(-12)">
    <g class="wrap-sheet">
      <path class="white" d="M -82,-82 H 56 L 82,-56 V 82 H -82 Z" />
      {#each RULES as y (y)}
        <line class="st-sky wrap-rule" x1="-72" y1={y} x2="72" y2={y} />
      {/each}
      <!-- The dog-eared corner. -->
      <path class="grey" d="M 56,-82 V -56 H 82 Z" />
    </g>
  </g>
  <g class="wrap-swirl">
    <!-- A box far round the frame, centred on the sticker: the swirl turns around the sticker centre. -->
    <rect class="n nostroke" x="-300" y="-300" width="600" height="600" />
    {#each SWIRLS as swirl, i (i)}
      <path class="wrap-string" d={arc(swirl)} />
      <path class="st-yellow wrap-string-top" d={arc(swirl)} />
    {/each}
  </g>
</svg>

<style>
  .wrap-sheet,
  .wrap-swirl {
    transform-box: fill-box;
    transform-origin: center;
  }

  .wrap-sheet {
    stroke-width: 4;
    --from: 1;
  }

  /* The sign of "towards the attacker" on both axes of the unmirrored frame. */
  :global(.fx--at-theirs) .wrap-sheet {
    --from: -1;
  }

  .wrap-rule {
    stroke-width: 2;
  }

  /* String drawn twice: a dark underlay and a yellow top line (an outlined tube). */
  .wrap-string {
    stroke-width: 11;
  }

  .wrap-string-top {
    stroke-width: 5;
  }
</style>
