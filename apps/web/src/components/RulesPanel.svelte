<script lang="ts">
  import { gestureBeats, gestureSetFor, type ModeId } from '@rps/shared';
  import { gestureKey, gestureNames } from '../lib/gestures-ui';
  import { t } from '../lib/i18n';
  import GestureIcon from './GestureIcon.svelte';

  interface Props {
    mode: ModeId;
  }

  let { mode }: Props = $props();

  const set = $derived(gestureSetFor(mode));
</script>

<!-- The touch path to the rules: there is no hover on a phone, so the same information is a tap away. -->
<details class="rules">
  <summary>{t('rules.title')}</summary>
  <p class="desc">{t(`mode.${mode}.desc`)}</p>
  <ul class="lines">
    {#each set.gestures as gesture (gesture)}
      {@const beaten = gestureBeats(set, gesture)}
      <li class="line">
        <GestureIcon id={gesture} size={32} />
        <span class="sentence">{t('rules.beats', { gesture: t(gestureKey(gesture)), list: gestureNames(beaten) })}</span>
        <span class="beaten">
          {#each beaten as id (id)}<GestureIcon {id} size={24} sticker={false} />{/each}
        </span>
      </li>
    {/each}
  </ul>
</details>

<style>
  .rules {
    padding: var(--space-3) var(--space-4);
    border: var(--border);
    border-radius: var(--radius-panel);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-panel);
  }

  summary {
    cursor: pointer;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: 0.05em;
    line-height: 1.2;
  }

  .desc {
    margin-top: var(--space-2);
    font-weight: 700;
  }

  .lines {
    display: grid;
    gap: var(--space-2);
    margin: var(--space-3) 0 0;
    padding: 0;
    list-style: none;
  }

  .line {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: var(--space-2);
    row-gap: var(--space-1);
  }

  .sentence {
    overflow-wrap: anywhere;
    font-size: var(--text-sm);
    line-height: 1.3;
  }

  /* The beaten gestures sit under the sentence, lined up with its text. */
  .beaten {
    display: flex;
    flex-wrap: wrap;
    grid-column: 2;
    gap: var(--space-1);
  }
</style>
