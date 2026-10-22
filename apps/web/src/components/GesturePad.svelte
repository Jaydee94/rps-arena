<script lang="ts">
  import { t } from '../lib/i18n';
  import GestureButton from './GestureButton.svelte';

  interface Props {
    gestures: readonly string[];
    /** The chosen gesture; once set, nothing can be picked any more. */
    picked: string | null;
    onpick: (gesture: string) => void;
  }

  let { gestures, picked, onpick }: Props = $props();

  // Roving tabindex: only the active button is in the tab order, arrow keys move between them.
  let active = $state(0);

  function onkeydown(event: KeyboardEvent) {
    const group = (event.currentTarget as HTMLElement).parentElement;
    const buttons = [...(group?.querySelectorAll('button') ?? [])];
    const count = buttons.length;
    const index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
    const step: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let target: number;
    if (event.key in step) target = (index + (step[event.key] ?? 0) + count) % count;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = count - 1;
    else return;
    event.preventDefault();
    buttons[target]?.focus();
  }
</script>

<div class="pad" role="radiogroup" aria-label={t('board.gestures')}>
  {#each gestures as gesture, index (gesture)}
    <GestureButton
      {gesture}
      selected={picked === gesture}
      disabled={picked !== null}
      tabindex={index === active ? 0 : -1}
      {onpick}
      {onkeydown}
      onfocus={() => (active = index)}
    />
  {/each}
</div>

<style>
  .pad {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3);
  }
</style>
