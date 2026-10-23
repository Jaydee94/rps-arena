<script lang="ts">
  import { onMount } from 'svelte';
  import AudioToggle from './components/AudioToggle.svelte';
  import Board from './components/Board.svelte';
  import ErrorBanner from './components/ErrorBanner.svelte';
  import Home from './components/Home.svelte';
  import Lobby from './components/Lobby.svelte';
  import Result from './components/Result.svelte';
  import Wordmark from './components/Wordmark.svelte';
  import { room, status } from './lib/connection';
  import { locale, setLocale, t, type Locale } from './lib/i18n';
  import { startSfxBridge } from './lib/sfx-bridge';

  const LOCALES: Locale[] = ['de', 'en'];

  const screen = $derived.by(() => {
    if (!$room) return 'home';
    if (!$room.match) return 'lobby';
    return $room.match.phase === 'finished' ? 'result' : 'board';
  });

  onMount(() => startSfxBridge());

  $effect(() => {
    document.documentElement.lang = $locale;
  });
</script>

<div class="app" data-screen={screen}>
  <header>
    <Wordmark large={screen === 'home'} />
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
    <AudioToggle />
  </header>

  <ErrorBanner />

  {#key screen}
    <div class="screen">
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
  {/key}
</div>

<style>
  .app {
    display: grid;
    /* A fixed single track that may shrink: nothing inside (an input's intrinsic width, a long name) can widen it. */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    max-width: 48rem;
    margin: 0 auto;
    padding: var(--space-5) var(--space-4) var(--space-7);
    /*
     * Last line of defence: a pop-in that overshoots (the ZAP star, a stamped tile) is cut at the page
     * gutter instead of widening the page for a few frames. The padding keeps shadows and focus rings
     * inside the clip. overflow-x: clip makes no scroll container and leaves the vertical axis alone.
     */
    overflow-x: clip;
  }

  /*
   * The wordmark flies in from far off to the side on load; that must never widen the page. The header
   * reaches into the page gutter (negative margin, same padding back) and clips sideways only there, so
   * shadows and focus rings of its buttons keep their room. overflow-x: clip makes no scroll container.
   */
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3) var(--space-4);
    margin-inline: calc(-1 * var(--space-4));
    padding: 0 var(--space-4) var(--space-3);
    overflow-x: clip;
  }

  .app > :global(*) {
    min-width: 0;
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
    white-space: nowrap;
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

  /* Both parts of the heading (wordmark and status/language) wrap instead of overflowing. */
  header :global(.wordmark) {
    max-width: 100%;
  }
</style>
