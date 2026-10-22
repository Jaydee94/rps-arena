<script lang="ts">
  import { audio, audioSettings } from '../lib/audio';
  import { t } from '../lib/i18n';

  const toggles = $derived([
    {
      kind: 'sfx',
      label: t('audio.effects'),
      on: $audioSettings.sfx,
      toggle: () => audio.setSfx(!$audioSettings.sfx),
    },
    {
      kind: 'music',
      label: t('audio.music'),
      on: $audioSettings.music,
      toggle: () => audio.setMusic(!$audioSettings.music),
    },
  ] as const);
</script>

<div class="audio" role="group" aria-label={t('audio.title')}>
  {#each toggles as item (item.kind)}
    <button
      type="button"
      class="btn btn-small"
      data-kind={item.kind}
      aria-pressed={item.on}
      title={`${item.label}: ${item.on ? t('audio.on') : t('audio.off')}`}
      onclick={item.toggle}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        {#if item.kind === 'sfx'}
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
          {#if item.on}
            <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
          {:else}
            <path d="M16 9l5 6M21 9l-5 6" />
          {/if}
        {:else}
          <path d="M9 18V5l11-2v13" />
          <circle cx="6.5" cy="18" r="2.5" fill="currentColor" />
          <circle cx="17.5" cy="16" r="2.5" fill="currentColor" />
          {#if !item.on}
            <path d="M3 3l18 18" />
          {/if}
        {/if}
      </svg>
      {item.label}
    </button>
  {/each}
</div>

<style>
  .audio {
    display: flex;
    gap: var(--space-2);
  }

  .audio .btn[aria-pressed='true'] {
    background: var(--blue);
    color: var(--on-blue);
  }
</style>
