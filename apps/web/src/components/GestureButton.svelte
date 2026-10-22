<script lang="ts">
  import { gestureEmoji, gestureKey } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';

  interface Props {
    gesture: string;
    selected: boolean;
    disabled: boolean;
    tabindex: 0 | -1;
    onpick: (gesture: string) => void;
    onkeydown: (event: KeyboardEvent) => void;
    onfocus: () => void;
  }

  let { gesture, selected, disabled, tabindex, onpick, onkeydown, onfocus }: Props = $props();
</script>

<button
  type="button"
  role="radio"
  class="gesture"
  class:selected
  aria-checked={selected}
  {disabled}
  {tabindex}
  {onkeydown}
  {onfocus}
  onclick={() => onpick(gesture)}
>
  <span class="icon" aria-hidden="true">{gestureEmoji(gesture)}</span>
  <span class="label">{t(gestureKey(gesture))}</span>
</button>

<style>
  .gesture {
    display: grid;
    justify-items: center;
    gap: var(--space-1);
    min-width: 5.5rem;
    min-height: 5.5rem;
    padding: var(--space-2) var(--space-3);
    border: var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-sm);
  }

  .icon {
    font-size: var(--text-2xl);
    line-height: 1;
  }

  .label {
    font-weight: 700;
    font-size: var(--text-sm);
  }

  .gesture:active:not(:disabled) {
    translate: 3px 3px;
    box-shadow: none;
  }

  .gesture:disabled {
    cursor: not-allowed;
    box-shadow: none;
  }

  .gesture:disabled:not(.selected) {
    opacity: 0.55;
  }

  /* Selected is shown by fill, thicker offset and a check mark, never by color alone. */
  .selected {
    background: var(--yellow);
    color: var(--on-bright);
    box-shadow: var(--shadow);
  }

  .selected .label::after {
    content: ' ✓';
  }
</style>
