<script lang="ts">
  import { prefersReducedMotion } from '../lib/motion';

  type Variant = 'pow' | 'bam' | 'zap' | 'win' | 'lose' | 'zack';

  interface Props {
    text: string;
    variant?: Variant;
  }

  let { text, variant = 'pow' }: Props = $props();

  // Jagged starburst: alternating outer/inner radii with a fixed wobble so it stays stable between renders.
  const SPIKES = 14;
  const WOBBLE = [0, 5, -3, 7, -6, 2, 6, -4, 3, -7, 4, -2, 6, -5];
  const points = Array.from({ length: SPIKES * 2 }, (_, i) => {
    const angle = (i / (SPIKES * 2)) * Math.PI * 2 - Math.PI / 2;
    const base = i % 2 === 0 ? 48 : 31;
    const radius = base + (i % 2 === 0 ? (WOBBLE[i / 2] ?? 0) * 0.35 : 0);
    return `${(50 + radius * Math.cos(angle)).toFixed(1)},${(50 + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');

  // Decided once per mount: a burst that appears under reduced motion simply shows up, no pop.
  const animated = !prefersReducedMotion();
</script>

<span class="burst burst--{variant}" class:burst--animated={animated} aria-hidden="true">
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
    <polygon class="shadow" points={points} transform="translate(3 4)" />
    <polygon class="star" points={points} />
  </svg>
  <span class="text">{text}</span>
</span>

<style>
  .burst {
    --burst-fill: var(--yellow);
    --burst-text: var(--on-bright);
    --burst-tilt: -8deg;
    position: relative;
    display: inline-grid;
    place-items: center;
    width: var(--burst-size, 9rem);
    aspect-ratio: 1.25;
    rotate: var(--burst-tilt);
    pointer-events: none;
  }

  .burst--pow { --burst-fill: var(--yellow); --burst-tilt: -8deg; }
  .burst--bam { --burst-fill: var(--red); --burst-tilt: 7deg; }
  .burst--zap { --burst-fill: var(--blue); --burst-text: var(--on-blue); --burst-tilt: -4deg; }
  .burst--win { --burst-fill: var(--teal); --burst-tilt: -6deg; }
  .burst--lose { --burst-fill: var(--pink); --burst-tilt: 5deg; }
  .burst--zack { --burst-fill: var(--pink); --burst-text: var(--white); --burst-tilt: -6deg; }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .shadow {
    fill: var(--cast);
  }

  .star {
    fill: var(--burst-fill);
    stroke: var(--line);
    stroke-width: var(--outline);
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .text {
    position: relative;
    padding-inline: 0.5rem;
    color: var(--burst-text);
    font-family: var(--font-display);
    font-size: calc(var(--burst-size, 9rem) * 0.26);
    line-height: 1;
    letter-spacing: 0.03em;
    text-align: center;
    text-wrap: balance;
    overflow-wrap: anywhere;
  }

  /* ZACK: white lettering needs an outline to read on pink. */
  .burst--zack .text {
    -webkit-text-stroke: var(--outline) var(--line);
    paint-order: stroke fill;
  }
</style>
