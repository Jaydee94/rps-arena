<script lang="ts">
  import type { ModeId } from '@rps/shared';
  import { t } from '../lib/i18n';

  interface Props {
    value: ModeId;
  }

  const MODES: readonly ModeId[] = ['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15', 'bluff', 'team2v2'];

  let { value = $bindable() }: Props = $props();
</script>

<fieldset class="group">
  <legend>{t('home.mode')}</legend>
  <div class="modes">
    {#each MODES as mode (mode)}
      <label class="mode" class:checked={value === mode}>
        <input
          type="radio"
          name="mode"
          value={mode}
          bind:group={value}
          aria-labelledby="mode-{mode}-name"
          aria-describedby="mode-{mode}-desc"
        />
        <span class="name" id="mode-{mode}-name">{t(`mode.${mode}.name`)}</span>
        <span class="desc" id="mode-{mode}-desc">{t(`mode.${mode}.desc`)}</span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .modes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    gap: var(--space-3);
  }

  .mode {
    position: relative;
    display: grid;
    align-content: start;
    gap: var(--space-1);
    padding: var(--space-3);
    border: var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    cursor: pointer;
  }

  .mode input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
    cursor: pointer;
  }

  .mode.checked {
    background: var(--yellow);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
  }

  /* Not only color: the chosen mode also gets a check mark. */
  .mode.checked .name::after {
    content: ' ✓';
  }

  .mode:has(input:focus-visible) {
    outline: var(--outline) solid var(--focus);
    outline-offset: 3px;
  }

  .name {
    font-family: var(--font-display);
    font-size: var(--text-lg);
  }

  .desc {
    font-size: var(--text-sm);
  }
</style>
