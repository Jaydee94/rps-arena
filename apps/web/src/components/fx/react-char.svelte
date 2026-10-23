<script lang="ts">
  /*
   * Char (struck by burn): flames lick up over the lower half of the sticker (in front of it, so the fire reads
   * even where the burst covers the attack art), then die down; what is left is a charred sticker: a ragged
   * black burnt rim with glowing embers in it, soot blotches on its face and dark smoke curling off its top.
   * Decorative, stacked on the sticker and clipped to its disc. The end pose (flames out, soot, smoke lift)
   * lives in animations.css, "fx static: burn / char, extinguish".
   * Markup only; it ignores the overlay props ({ gesture, size }): the sticker itself stays underneath.
   */

  /** One flame tongue pointing up from its base at 0,0: height h, half width w (as in burn.svelte). */
  const tongue = (h: number, w: number): string =>
    [
      'M0,0',
      `C${-w},0 ${-w * 1.05},${-h * 0.42} ${-w * 0.45},${-h * 0.66}`,
      `C${-w * 0.2},${-h * 0.76} ${-w * 0.3},${-h * 0.9} ${-w * 0.05},${-h}`,
      `C${w * 0.3},${-h * 0.82} ${w * 1.1},${-h * 0.56} ${w * 0.85},${-h * 0.24}`,
      `C${w * 0.7},${-h * 0.06} ${w * 0.4},0 0,0Z`,
    ].join(' ');

  /** Flames rising from the bottom of the disc, in % of the sticker: base x, height, lean, stagger. */
  const FLAMES = [
    { x: 22, h: 40, lean: -14, d: '40ms' },
    { x: 78, h: 42, lean: 14, d: '90ms' },
    { x: 36, h: 54, lean: -6, d: '0ms' },
    { x: 64, h: 56, lean: 6, d: '60ms' },
    { x: 50, h: 62, lean: 0, d: '20ms' },
  ].map(({ x, h, lean, d }) => ({
    at: `translate(${x} 104) rotate(${lean})`,
    outer: tongue(h, h * 0.4),
    inner: tongue(h * 0.56, h * 0.22),
    d,
  }));

  /**
   * The burnt rim: everything outside a ragged ring (radius 38-47 around the centre, an irregular pattern so it
   * does not read as a cog). Drawn as one even-odd path, so the middle of the sticker stays readable.
   */
  const RAGGED = Array.from({ length: 44 }, (_, i) => {
    const angle = (i / 44) * Math.PI * 2;
    const radius = [46, 42, 44, 39, 47, 43, 45, 40, 44, 38, 46][i % 11] ?? 43;
    return `${(50 + radius * Math.cos(angle)).toFixed(1)},${(50 + radius * Math.sin(angle)).toFixed(1)}`;
  });
  const RIM = `M-5,-5 H105 V105 H-5Z M${RAGGED.join(' L')}Z`;

  /** Soot blotches on the face, in % of the sticker. */
  const SMUDGES = [
    'M14,62 C10,50 20,42 28,47 C35,51 33,62 26,66 C21,69 16,68 14,62Z',
    'M66,76 C70,66 84,66 87,74 C90,83 80,90 72,87 C67,85 64,81 66,76Z',
    'M70,20 C77,13 90,20 87,30 C85,37 75,38 71,32 C68,28 67,24 70,20Z',
    'M38,30 C42,26 48,28 47,33 C46,37 40,38 38,35 C37,33 37,31 38,30Z',
  ];

  /** Embers still glowing in the burnt rim. */
  const EMBERS = [
    { x: 12, y: 40, r: 2.6 },
    { x: 84, y: 58, r: 3 },
    { x: 30, y: 88, r: 2.4 },
    { x: 58, y: 10, r: 2.2 },
  ];
</script>

<span class="char" aria-hidden="true">
  <span class="char-soot"></span>
  <svg class="art char-marks" viewBox="0 0 100 100" focusable="false">
    <path class="line char-rim" fill-rule="evenodd" d={RIM} />
    {#each SMUDGES as d (d)}<path class="line char-smudge" {d} />{/each}
    {#each EMBERS as ember (ember.x)}<circle class="orange char-ember" cx={ember.x} cy={ember.y} r={ember.r} />{/each}
    <g class="char-smoke">
      <path class="char-wisp-under" d="M40,26 C36,22 42,18 39,13 C37,10 40,7 42,5" />
      <path class="char-wisp-under" d="M58,28 C62,24 56,20 60,15 C62,12 59,9 58,6" />
      <path class="char-wisp" d="M40,26 C36,22 42,18 39,13 C37,10 40,7 42,5" />
      <path class="char-wisp" d="M58,28 C62,24 56,20 60,15 C62,12 59,9 58,6" />
    </g>
  </svg>
  <svg class="art char-fire" viewBox="0 0 100 100" focusable="false">
    {#each FLAMES as flame (flame.at)}
      <g transform={flame.at}>
        <g class="char-flame" style:--d={flame.d}>
          <path class="red" d={flame.outer} />
          <path class="yellow char-core" d={flame.inner} />
        </g>
      </g>
    {/each}
  </svg>
</span>

<style>
  .char {
    position: relative;
    display: block;
    clip-path: circle(50% at 50% 50%);
    pointer-events: none;
  }

  .char > * {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* Soot from the rim inwards: the middle of the sticker stays readable. */
  .char-soot {
    border-radius: 50%;
    background: radial-gradient(circle, transparent 40%, var(--line) 96%);
  }

  /* The ragged burnt edge and the blotches are solid soot, not a colour shift. */
  .char-rim,
  .char-smudge {
    stroke: none;
  }

  .char-smudge {
    opacity: 0.7;
  }

  .char-ember {
    stroke: none;
  }

  /* Dark smoke with a light rim, so it reads on the light sticker and on the black soot alike. */
  .char-wisp-under {
    stroke: var(--white);
    stroke-width: 7;
  }

  .char-wisp {
    stroke: var(--line);
    stroke-width: 3.5;
  }

  .char-smoke,
  .char-flame {
    transform-box: fill-box;
    transform-origin: 50% 100%;
  }

  .char-core {
    stroke-width: 2.5;
  }

  .char-fire {
    stroke-width: 3;
  }
</style>
