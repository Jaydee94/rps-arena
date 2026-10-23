<script lang="ts">
  /*
   * Punch (human): a big comic fist with speed lines hooks in from the attacker's side and lands on the
   * struck sticker's rim with a white impact burst; dizzy stars twinkle on the far side afterwards. Drawn
   * for an attacker at the top left (the struck sticker is the opponent's), the fist coming in from the left
   * past the burst between the stickers, and turned round for one at the bottom right. Frame: the sticker
   * is the circle r = 50 around 0,0.
   * Markup only; motion: animations.css, "fx: punch / knockback".
   */

  // The impact burst: a 12-spike star around 0,0 with a fixed wobble.
  const WOBBLE = [4, -3, 6, -2, 3, -5, 5, -1, 2, -4, 6, -2];
  const burst = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2;
    const radius = i % 2 === 0 ? 34 + (WOBBLE[i / 2] ?? 0) : 18;
    return `${(radius * Math.cos(angle)).toFixed(1)},${(radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');

  // A 5-point star around 0,0.
  const star = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? 14 : 6;
    return `${(radius * Math.cos(angle)).toFixed(1)},${(radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');

  /** Dizzy stars round the far rim (clear of the name tag on either card): position and delay. */
  const STARS = [
    { x: 30, y: -60, d: '0ms' },
    { x: 60, y: -36, d: '90ms' },
    { x: 68, y: 2, d: '180ms' },
  ];
</script>

<svg class="art" viewBox="-100 -100 200 200" focusable="false">
  <g class="punch-aim">
    <!-- A box far round the frame, centred on the sticker: the aim group turns round the sticker centre. -->
    <rect class="n nostroke" x="-300" y="-300" width="600" height="600" />
    <g transform="translate(-47 -17)"><polygon class="white punch-burst" points={burst} /></g>
    <!-- The fist points along +x, heading for the centre; its knuckles touch the rim at -47,-17. -->
    <g transform="translate(-65 -24) rotate(20) scale(1.25)">
      <g class="punch-fist">
        <line class="punch-speed" x1="-96" y1="-12" x2="-54" y2="-12" />
        <line class="punch-speed" x1="-104" y1="0" x2="-50" y2="0" />
        <line class="punch-speed" x1="-96" y1="12" x2="-54" y2="12" />
        <rect class="red" x="-46" y="-14" width="20" height="28" rx="4" />
        <rect class="skin" x="-30" y="-19" width="44" height="38" rx="12" />
        <line x1="2" y1="-9" x2="13" y2="-9" />
        <line x1="2" y1="0" x2="13" y2="0" />
        <line x1="2" y1="9" x2="13" y2="9" />
        <rect class="skin" x="-16" y="7" width="22" height="11" rx="5.5" />
      </g>
    </g>
    {#each STARS as s, i (i)}
      <g transform="translate({s.x} {s.y})"><polygon class="yellow punch-star" points={star} style:--d={s.d} /></g>
    {/each}
  </g>
</svg>

<style>
  .punch-aim,
  .punch-burst,
  .punch-fist,
  .punch-star {
    transform-box: fill-box;
    transform-origin: center;
  }

  /* Turned round when the attacker sits at the bottom right (the struck sticker is the own one). */
  :global(.fx--at-mine) .punch-aim {
    scale: -1 -1;
  }

  .punch-burst {
    stroke-width: 4;
  }

  .punch-fist {
    stroke-width: 3.5;
  }

  .punch-speed {
    stroke-width: 4;
  }

  .punch-star {
    stroke-width: 2.5;
  }
</style>
