<script lang="ts">
  import Board from './components/Board.svelte';
  import ErrorBanner from './components/ErrorBanner.svelte';
  import Home from './components/Home.svelte';
  import Lobby from './components/Lobby.svelte';
  import Result from './components/Result.svelte';
  import { room, status } from './lib/connection';
  import { locale, setLocale, t, type Locale } from './lib/i18n';

  const LOCALES: Locale[] = ['de', 'en'];

  const screen = $derived.by(() => {
    if (!$room) return 'home';
    if (!$room.match) return 'lobby';
    return $room.match.phase === 'finished' ? 'result' : 'board';
  });

  $effect(() => {
    document.documentElement.lang = $locale;
  });
</script>

<div class="app">
  <header>
    <h1>{t('app.title')}</h1>
    <p class="meta">
      <span class="badge" data-status={$status}>{t(`app.status.${$status}`)}</span>
    </p>
    <div class="lang" role="group" aria-label={t('app.language')}>
      {#each LOCALES as l (l)}
        <button type="button" class="btn btn-small" aria-pressed={$locale === l} onclick={() => setLocale(l)}>
          {l.toUpperCase()}
        </button>
      {/each}
    </div>
  </header>

  <ErrorBanner />

  {#if screen === 'home'}
    <Home />
  {:else if screen === 'lobby'}
    <Lobby />
  {:else if screen === 'board'}
    <Board />
  {:else}
    <Result />
  {/if}
</div>

<style>
  .app {
    display: grid;
    gap: var(--space-4);
    max-width: 56rem;
    margin: 0 auto;
    padding: var(--space-5) var(--space-4) var(--space-7);
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3) var(--space-4);
  }

  h1 {
    margin-right: auto;
    font-size: var(--text-hero);
    text-shadow: var(--shadow-sm);
  }

  .badge {
    display: inline-block;
    padding: var(--space-1) var(--space-3);
    border: var(--border);
    border-radius: var(--radius-pill);
    background: var(--yellow);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    font-size: var(--text-sm);
    font-weight: 700;
  }

  .badge[data-status='connected'] {
    background: var(--success);
  }

  .badge[data-status='disconnected'] {
    background: var(--danger);
  }

  .lang {
    display: flex;
    gap: var(--space-2);
  }

  .lang .btn[aria-pressed='true'] {
    background: var(--blue);
    color: var(--on-blue);
  }
</style>
