<script lang="ts">
  import type { ModeId } from '@rps/shared';
  import { t } from '../lib/i18n';

  interface Props {
    value: ModeId;
    /** The modes on offer (default: all). */
    modes?: readonly ModeId[];
  }

  const ALL_MODES: readonly ModeId[] = ['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15', 'bluff', 'team2v2'];

  let { value = $bindable(), modes = ALL_MODES }: Props = $props();
</script>

<fieldset class="group">
  <legend>{t('home.mode')}</legend>
  <div class="modes">
    {#each modes as mode (mode)}
      {@const chosen = value === mode}
      <label class="mode" class:checked={chosen}>
        <input
          type="radio"
          name="mode"
          value={mode}
          bind:group={value}
          aria-labelledby="mode-{mode}-name"
          aria-describedby={chosen ? `mode-${mode}-desc` : undefined}
        />
        <span class="name" id="mode-{mode}-name">{t(`mode.${mode}.name`)}</span>
        <!-- Not only color: the chosen mode also gets a check mark. -->
        {#if chosen}<span class="tick" aria-hidden="true">✓</span>{/if}
        <!-- Only the chosen mode shows (and is described by) its explanation. -->
        {#if chosen}<span class="desc" id="mode-{mode}-desc">{t(`mode.${mode}.desc`)}</span>{/if}
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .modes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .mode {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-content: center;
    align-items: center;
    column-gap: var(--space-2);
    row-gap: var(--space-1);
    min-width: 0;
    min-height: 3rem;
    padding: var(--space-2) var(--space-3);
    border: var(--border);
    border-radius: var(--radius);
    background: var(--sticker);
    color: var(--on-bright);
    cursor: pointer;
  }

  .mode input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
    cursor: pointer;
  }

  /* The chosen mode spans the full width and moves up front, with its description. */
  .mode.checked {
    grid-column: 1 / -1;
    order: -1;
    padding: var(--space-3);
    background: var(--yellow);
    box-shadow: var(--shadow-sm);
    rotate: -0.8deg;
  }

  .mode:has(input:focus-visible) {
    outline: var(--outline) solid var(--focus);
    outline-offset: 3px;
  }

  .name {
    min-width: 0;
    overflow-wrap: anywhere;
    font-family: var(--font-display);
    font-size: var(--text-md);
    letter-spacing: 0.04em;
    line-height: 1.15;
  }

  .mode.checked .name {
    font-size: var(--text-lg);
  }

  .tick {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    line-height: 1;
  }

  .desc {
    grid-column: 1 / -1;
    overflow-wrap: anywhere;
    font-size: var(--text-sm);
    font-weight: 700;
  }
</style>
