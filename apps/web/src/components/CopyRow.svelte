<script lang="ts">
  import { copyText } from '../lib/clipboard';
  import { t } from '../lib/i18n';

  interface Props {
    id: string;
    label: string;
    value: string;
    buttonLabel: string;
    large?: boolean;
  }

  let { id, label, value, buttonLabel, large = false }: Props = $props();

  let input = $state<HTMLInputElement>();
  let message = $state('');
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => () => clearTimeout(resetTimer));

  async function copy() {
    clearTimeout(resetTimer);
    if (await copyText(value)) {
      message = t('lobby.copied');
      resetTimer = setTimeout(() => (message = ''), 2000);
    } else {
      // No clipboard access: select the text so it can be copied by hand.
      message = t('lobby.copy_failed');
      input?.focus();
      input?.select();
    }
  }
</script>

<div class="copy">
  <label for={id}>{label}</label>
  <div class="line">
    <input {id} type="text" readonly {value} class:large bind:this={input} />
    <button type="button" class="btn btn-small" onclick={copy}>{buttonLabel}</button>
  </div>
  <p class="message" role="status">{message}</p>
</div>

<style>
  .copy {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-1);
  }

  label {
    font-weight: 700;
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  /* width: 100% (a percentage) keeps the field's intrinsic width out of the min-content size of its parents. */
  input {
    flex: 1 1 12rem;
    width: 100%;
    min-width: 0;
    min-height: 2.75rem;
    padding: var(--space-1) var(--space-3);
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-family: var(--font-mono);
  }

  input.large {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    letter-spacing: 0.2em;
  }

  .message {
    min-height: 1.5em;
    font-size: var(--text-sm);
    font-weight: 700;
  }
</style>
