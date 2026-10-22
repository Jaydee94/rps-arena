<script lang="ts">
  import { gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';
  import GestureIcon from './GestureIcon.svelte';

  interface Props {
    gesture: string;
    selected: boolean;
    disabled: boolean;
    tabindex: 0 | -1;
    /** Few gestures (classic, lizard-spock): bigger buttons. */
    large?: boolean;
    onpick: (gesture: string) => void;
    onkeydown: (event: KeyboardEvent) => void;
    onfocus: () => void;
  }

  let { gesture, selected, disabled, tabindex, large = false, onpick, onkeydown, onfocus }: Props = $props();
</script>

<button
  type="button"
  role="radio"
  class="gesture"
  class:selected
  class:large
  aria-checked={selected}
  {disabled}
  {tabindex}
  {onkeydown}
  {onfocus}
  onclick={() => onpick(gesture)}
>
  <GestureIcon id={gesture} size={large ? 80 : 52} sticker={false} />
  <span class="label">{t(gestureKey(gesture))}</span>
</button>

<style>
  .gesture {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: var(--space-1);
    width: 5.2rem;
    min-height: 5.8rem;
    padding: var(--space-2) var(--space-1);
    border: var(--border);
    border-radius: var(--radius);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
  }

  .gesture.large {
    width: 6.6rem;
    min-height: 8.2rem;
  }

  .label {
    max-width: 100%;
    overflow-wrap: anywhere;
    font-family: var(--font-display);
    font-size: var(--text-md);
    letter-spacing: 0.05em;
    line-height: 1.1;
  }

  .large .label {
    font-size: var(--text-lg);
  }

  .gesture:disabled {
    cursor: not-allowed;
    box-shadow: none;
  }

  .gesture:disabled:not(.selected) {
    opacity: 0.55;
  }

  .gesture:hover:not(:disabled) {
    background: var(--paper-2);
  }

  /* Selected is shown by fill, thicker offset and a check mark, never by color alone. */
  .selected {
    background: var(--yellow);
    box-shadow: var(--shadow);
  }

  .selected .label::after {
    content: ' ✓';
  }
</style>
