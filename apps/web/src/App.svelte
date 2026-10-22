<script lang="ts">
  import { lastError, room, status } from './lib/connection';
  import { locale, setLocale, t, type Locale } from './lib/i18n';

  const LOCALES: Locale[] = ['de', 'en'];

  $effect(() => {
    document.documentElement.lang = $locale;
  });
</script>

<!-- Placeholder: the real screens arrive in Task 10. -->
<main>
  <h1>{t('app.title')}</h1>
  <p>
    <span class="badge" data-status={$status}>{t(`app.status.${$status}`)}</span>
    <span>{t('app.language')}: {$locale}</span>
  </p>
  <p class="lang" role="group" aria-label={t('app.language')}>
    {#each LOCALES as l (l)}
      <button type="button" aria-pressed={$locale === l} onclick={() => setLocale(l)}>
        {l.toUpperCase()}
      </button>
    {/each}
  </p>
  {#if $lastError}
    <p class="error" role="alert">{t(`errors.${$lastError.code}`)}</p>
  {/if}
  {#if $room}
    <p>{t('lobby.code', { code: $room.code })}</p>
    <pre>{JSON.stringify($room, null, 2)}</pre>
  {/if}
</main>

<style>
  main {
    max-width: 40rem;
    margin: 0 auto;
    padding: var(--space-6) var(--space-4);
    display: grid;
    gap: var(--space-4);
  }

  h1 {
    font-size: var(--text-hero);
    text-shadow: var(--shadow-sm);
  }

  p {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }

  .badge {
    padding: var(--space-1) var(--space-3);
    border: var(--border);
    border-radius: var(--radius-pill);
    background: var(--yellow);
    color: #111;
    box-shadow: var(--shadow-sm);
    font-weight: 700;
  }

  .badge[data-status='connected'] {
    background: var(--success);
  }

  .badge[data-status='disconnected'] {
    background: var(--danger);
  }

  .lang button {
    padding: var(--space-1) var(--space-4);
    border: var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    font-weight: 700;
  }

  .lang button[aria-pressed='true'] {
    background: var(--blue);
    color: #fff;
  }

  .error {
    padding: var(--space-3) var(--space-4);
    border: var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  pre {
    padding: var(--space-4);
    overflow: auto;
    border: var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }
</style>
