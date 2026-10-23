<script lang="ts">
  import type { TournamentFormat } from '@rps/shared';
  import { t } from '../lib/i18n';

  interface Props {
    value: TournamentFormat;
  }

  const FORMATS: readonly TournamentFormat[] = ['knockout', 'roundrobin'];

  let { value = $bindable() }: Props = $props();
</script>

<fieldset class="group">
  <legend>{t('tournament.format')}</legend>
  <div class="row">
    {#each FORMATS as format (format)}
      <label class="chip">
        <input type="radio" name="tournament-format" value={format} bind:group={value} aria-describedby="tournament-format-desc" />
        <span>{t(`tournament.format.${format}`)}</span>
      </label>
    {/each}
  </div>
  <p class="desc" id="tournament-format-desc">{t(`tournament.format.${value}.desc`)}</p>
</fieldset>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .desc {
    margin: var(--space-2) 0 0;
    overflow-wrap: anywhere;
    font-size: var(--text-sm);
    font-weight: 700;
  }
</style>
