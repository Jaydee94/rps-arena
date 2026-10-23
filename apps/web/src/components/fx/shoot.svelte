<script lang="ts">
  /*
   * Shoot (gun): two shots streak in from the attacker as tracers, sparks flash where they strike the rim and
   * splinters spray back out of the entry holes. Drawn for an attacker at the top left (the struck sticker is the
   * opponent's) and turned round for one at the bottom right. Frame: the sticker is the circle r = 50
   * around 0,0. Markup only; motion: animations.css, "fx: shoot / perforate".
   */

  /**
   * The two shots: where each strikes the rim, the heading of its tracer (degrees, towards the centre), and
   * how long after the first it lands. They come in from the left and from above, clear of the burst.
   */
  const SHOTS = [
    { x: -49, y: -9, turn: 10, d: '0ms' },
    { x: -13, y: -48, turn: 75, d: '160ms' },
  ];

  /**
   * Splinters spraying back out of the entry holes: start, flight (frame units) and spin. They stay on the
   * attacker's side (left / above), so once turned round for the own card none flies under its name tag
   * (above) or out at the panel edge (left).
   */
  const BITS = [
    { x: -46, y: -8, dx: -26, dy: -12, rot: 200, d: '0ms' },
    { x: -46, y: -10, dx: -24, dy: 10, rot: -160, d: '0ms' },
    { x: -12, y: -46, dx: -14, dy: -22, rot: 140, d: '160ms' },
    { x: -14, y: -44, dx: 12, dy: -22, rot: -220, d: '160ms' },
  ];

  // A 10-spike flash around 0,0.
  const SPARK = Array.from({ length: 20 }, (_, i) => {
    const angle = (i / 20) * Math.PI * 2;
    const radius = i % 2 === 0 ? 32 : 13;
    return `${(radius * Math.cos(angle)).toFixed(1)},${(radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  <g class="shoot-aim">
    <!-- A box far round the frame, centred on the sticker: the aim group turns round the sticker centre. -->
    <rect class="n nostroke" x="-300" y="-300" width="600" height="600" />
    {#each BITS as bit, i (i)}
      <g class="shoot-spot" transform="translate({bit.x} {bit.y})">
        <polygon class="grey shoot-bit" points="-7,-5 7,-7 6,6 -6,5" style:--dx="{bit.dx}px" style:--dy="{bit.dy}px" style:--spin="{bit.rot}deg" style:--d={bit.d} />
      </g>
    {/each}
    {#each SHOTS as shot, i (i)}
      <g transform="translate({shot.x} {shot.y})">
        <polygon class="yellow shoot-spark" points={SPARK} style:--d={shot.d} />
      </g>
      <g transform="translate({shot.x} {shot.y}) rotate({shot.turn})">
        <g class="shoot-tracer" style:--d={shot.d}>
          <polygon class="yellow" points="-90,-1.5 -10,-6 0,0 -10,6 -90,1.5" />
          <ellipse class="grey" cx="-4" cy="0" rx="8" ry="5" />
        </g>
      </g>
    {/each}
  </g>
</svg>

<style>
  .shoot-aim,
  .shoot-spark,
  .shoot-bit,
  .shoot-tracer {
    transform-box: fill-box;
    transform-origin: center;
  }

  /* Turned round when the attacker sits at the bottom right (the struck sticker is the own one). */
  :global(.fx--at-mine) .shoot-aim {
    scale: -1 -1;
  }

  .shoot-spark {
    stroke-width: 3;
  }

  .shoot-tracer {
    stroke-width: 2.5;
  }
</style>
