<script lang="ts">
  import { t } from '../lib/i18n';

  interface Props {
    /** Hero size for the start screen, small everywhere else. */
    large?: boolean;
  }

  let { large = false }: Props = $props();

  const title = $derived(t('app.title'));
  const first = $derived(title.split(' ')[0] ?? title);
  const rest = $derived(title.split(' ').slice(1).join(' '));
</script>

<!-- First word in a yellow outlined slab, the rest on a red tilted banner. The title stays real text. -->
<h1 class="wordmark" class:large>
  <span class="rps wm-rps">{first}</span>{' '}<span class="arena wm-arena">{rest}</span>
</h1>

<style>
  .wordmark {
    --wm-size: 2rem;
    display: inline-flex;
    align-items: center;
    margin-right: auto;
    font-size: var(--wm-size);
    font-weight: 400;
    line-height: 1;
    letter-spacing: 0.04em;
    rotate: -3deg;
    user-select: none;
  }

  .wordmark.large {
    --wm-size: clamp(3.5rem, 15vw, 6.5rem);
  }

  .rps,
  .arena {
    display: inline-block;
    padding: 0.04em 0.16em 0.02em;
    border: var(--border);
    box-shadow: var(--shadow-sm);
    text-transform: uppercase;
    -webkit-text-stroke: 0.06em var(--line);
    paint-order: stroke fill;
    text-shadow: 0.05em 0.05em 0 var(--line);
  }

  .rps {
    border-radius: var(--radius-sm);
    background: var(--yellow);
    color: var(--white);
    rotate: -2deg;
    z-index: 1;
  }

  .arena {
    margin-left: -0.12em;
    border-radius: var(--radius-sm);
    background: var(--red);
    color: var(--white);
    rotate: 2.5deg;
    translate: 0 0.12em;
  }

  .large .rps,
  .large .arena {
    box-shadow: var(--shadow);
  }
</style>
