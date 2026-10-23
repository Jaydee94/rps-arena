<script lang="ts">
  /*
   * Gust (air): curly wind streaks blow past the struck sticker from the attacker's side, a puff cloud
   * marks where the wind comes from, and leaves tumble along with it. The frame is twice the sticker:
   * the sticker covers the circle r = 50 around 0,0. Markup only; motion: animations.css, "fx: gust / blow".
   *
   * The art is drawn with the attacker towards +x; `.gust-aim` turns it towards the attacker's corner
   * (bottom right for fx--at-mine, top left for fx--at-theirs). The wind blows towards -x.
   */

  /**
   * Bold wind streaks passing around the sticker (never behind it) and well beyond it on the lee side: a gentle
   * wave, the outer ones ending in a curl at the far (-x) end. y offset, start and end x, curl size, stagger.
   */
  const STREAKS = [
    { y: -82, x0: 74, x1: -108, c: 18, d: '0ms' },
    { y: -60, x0: 92, x1: -78, c: 0, d: '90ms' },
    { y: 60, x0: 90, x1: -86, c: 0, d: '40ms' },
    { y: 82, x0: 70, x1: -112, c: 20, d: '130ms' },
    { y: -104, x0: 40, x1: -60, c: 0, d: '170ms' },
    { y: 104, x0: 36, x1: -66, c: 0, d: '200ms' },
  ].map(({ y, x0, x1, c, d }) => {
    const mid = (x0 + x1) / 2;
    const wave = `M${x0},${y} C${mid + 24},${y - 10} ${mid - 24},${y + 10} ${x1},${y}`;
    const curl = c ? ` C${x1 - c},${y} ${x1 - c},${y - c * 1.4} ${x1},${y - c * 1.4} C${x1 + c * 0.7},${y - c * 1.4} ${x1 + c * 0.7},${y - c * 0.5} ${x1},${y - c * 0.6}` : '';
    return { d: wave + curl, delay: d };
  });

  /** Leaves blown along: start, spin, stagger. */
  const LEAVES = [
    { x: 70, y: -40, spin: '-260deg', d: '40ms' },
    { x: 84, y: 8, spin: '300deg', d: '120ms' },
    { x: 66, y: 46, spin: '-220deg', d: '0ms' },
  ];
  const LEAF = 'M-9,0 C-4,-8 4,-8 9,0 C4,8 -4,8 -9,0Z';

  /** The puff cloud the wind comes from. */
  const CLOUD = [
    { x: 84, y: -8, r: 16 },
    { x: 92, y: 16, r: 14 },
    { x: 76, y: 20, r: 12 },
  ];
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  <g class="gust-aim">
    <g class="gust-cloud">
      {#each CLOUD as puff, i (i)}<circle class="white" cx={puff.x} cy={puff.y} r={puff.r} />{/each}
    </g>
    {#each STREAKS as streak, i (i)}
      <g class="gust-streak" style:--d={streak.delay}>
        <path class="gust-under" d={streak.d} />
        <path class="gust-top" d={streak.d} />
      </g>
    {/each}
    {#each LEAVES as leaf, i (i)}
      <g transform="translate({leaf.x} {leaf.y})">
        <path class="green gust-leaf" d={LEAF} style:--spin={leaf.spin} style:--d={leaf.d} />
      </g>
    {/each}
  </g>
</svg>

<style>
  /* Turns the art towards the attacker (the frame never mirrors). */
  .gust-aim {
    transform-box: view-box;
    transform-origin: 0 0;
    rotate: 55deg;
  }

  :global(.fx--at-theirs) .gust-aim {
    rotate: 235deg;
  }

  /* 2v2: the attacker sits beside the struck sticker (slightly above or below), not diagonally. */
  :global(.compact .fx--at-mine) .gust-aim {
    rotate: 12deg;
  }

  :global(.compact .fx--at-theirs) .gust-aim {
    rotate: 193deg;
  }

  .gust-cloud,
  .gust-streak,
  .gust-leaf {
    transform-box: fill-box;
    transform-origin: center;
  }

  /* An outlined tube: a thick dark line under a thinner white one. */
  .gust-under {
    stroke-width: 17;
  }

  .gust-top {
    stroke: var(--white);
    stroke-width: 9;
  }
</style>
