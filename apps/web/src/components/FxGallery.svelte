<script lang="ts">
  /*
   * DEV-ONLY (lib/demo.ts): `?demo=fxgallery` shows every matchup pair (plus the draw) as a small card, grouped
   * by attack (attack=<attack>|draw|all filters, live=1 loops the visible cards); `?demo=fx&winner=&loser=`
   * loops the reveal of one pair at full size with a replay button. main.ts mounts this instead of App.
   */
  import { gestureKey } from '../lib/gestures-ui';
  import { locale, setLocale, t, type Locale } from '../lib/i18n';
  import { ruleFor } from '../lib/matchup-fx';
  import { DRAW_GESTURE, fxHref, galleryEntry, galleryGroups, neighbours, parseFxPair } from '../lib/fx-gallery';
  import FxPanel from './FxPanel.svelte';

  const LOCALES: Locale[] = ['de', 'en'];
  const params = new URLSearchParams(location.search);
  const single = params.get('demo') === 'fx';
  const groups = galleryGroups();
  const total = groups.reduce((n, g) => n + g.entries.length, 0) + 1;

  // Single scene: the pair from the URL, rock > scissors when it is missing or invalid.
  const pair = parseFxPair(params) ?? { kind: 'decided', winner: 'rock', loser: 'scissors' };
  const [winner, loser] = pair.kind === 'draw' ? [pair.gesture, pair.gesture] : [pair.winner, pair.loser];
  const pairKey = pair.kind === 'draw' ? 'draw' : `${winner}>${loser}`;
  const around = neighbours(groups, pairKey);

  const initialFilter = params.get('attack') ?? 'all';
  let filter = $state(initialFilter === 'all' || initialFilter === 'draw' || groups.some((g) => g.attack === initialFilter) ? initialFilter : 'all');
  let live = $state(single ? params.get('live') !== '0' : params.get('live') === '1');
  let replay = $state(0);

  const visible = $derived(filter === 'all' ? groups : groups.filter((g) => g.attack === filter));
  const showDraw = $derived(filter === 'all' || filter === 'draw');

  const name = (gesture: string) => t(gestureKey(gesture));
  const sentence = (w: string, l: string) => ruleFor({ mine: 'a0', theirs: 'b0', outcome: 'win' }, { a0: w, b0: l }) ?? '';

  // Keep filter and loop in the URL, so a reload (or a shared link) shows the same group.
  $effect(() => {
    if (single) return;
    const next = new URLSearchParams(location.search);
    next.set('attack', filter);
    if (live) next.set('live', '1');
    else next.delete('live');
    history.replaceState(null, '', `?${next.toString()}`);
  });

  $effect(() => {
    document.documentElement.lang = $locale;
  });
</script>

<main class="fx-gallery" class:single>
  <header class="bar">
    <h1>{single ? 'Matchup scene' : 'Matchup gallery'}</h1>
    <div class="controls">
      {#if single}
        <button type="button" class="btn btn-small btn-primary" onclick={() => replay++}>Replay</button>
      {/if}
      <button type="button" class="btn btn-small" aria-pressed={live} onclick={() => (live = !live)}>
        Live loop
      </button>
      <div class="lang" role="group" aria-label={t('app.language')}>
        {#each LOCALES as l (l)}
          <button type="button" class="btn btn-small" aria-pressed={$locale === l} onclick={() => setLocale(l)}>
            {l.toUpperCase()}
          </button>
        {/each}
      </div>
    </div>
  </header>

  {#if single}
    <nav class="pager" aria-label="Pairs">
      <a href={around?.prev ?? '?demo=fxgallery'}>&larr; Previous</a>
      <a href={`?demo=fxgallery&attack=${pair.kind === 'draw' ? 'draw' : galleryEntry(winner, loser).attack}`}>Gallery</a>
      <a href={around?.next ?? '?demo=fxgallery'}>Next &rarr;</a>
    </nav>
    <section class="scene" aria-label={pairKey}>
      <p class="sentence">{pair.kind === 'draw' ? t('board.duel_draw') : sentence(winner, loser)}</p>
      {#if pair.kind === 'decided'}
        {@const e = galleryEntry(winner, loser)}
        <p class="facts">
          <code>{e.key}</code> · {e.attack} → {e.reaction}
          {#if e.override}<span class="override">override</span>{/if}
        </p>
      {:else}
        <p class="facts"><code>{winner}={loser}</code> · clash</p>
      {/if}
      <FxPanel {winner} {loser} {live} {replay} />
    </section>
  {:else}
    <nav class="filters" aria-label="Attack">
      <button type="button" class="btn btn-small" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>all {total}</button>
      {#each groups as g (g.attack)}
        <button type="button" class="btn btn-small" aria-pressed={filter === g.attack} onclick={() => (filter = g.attack)}>
          {g.attack} {g.entries.length}
        </button>
      {/each}
      <button type="button" class="btn btn-small" aria-pressed={filter === 'draw'} onclick={() => (filter = 'draw')}>draw 1</button>
    </nav>

    {#each visible as g (g.attack)}
      <section class="group" aria-labelledby={`group-${g.attack}`}>
        <h2 id={`group-${g.attack}`}>{g.attack} <small>{g.entries.length}</small></h2>
        <ul class="grid">
          {#each g.entries as e (e.key)}
            <li class="card">
              <div class="thumb"><FxPanel winner={e.winner} loser={e.loser} {live} /></div>
              <p class="pair"><strong>{name(e.winner)}</strong> &gt; {name(e.loser)}</p>
              <p class="line">{sentence(e.winner, e.loser)}</p>
              <p class="facts">
                <code>{e.key}</code><br />{e.attack} → {e.reaction}
                {#if e.override}<span class="override">override</span>{/if}
              </p>
              <a href={fxHref(e.winner, e.loser)}>Loop</a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
    {#if showDraw}
      <section class="group" aria-labelledby="group-draw">
        <h2 id="group-draw">draw <small>1</small></h2>
        <ul class="grid">
          <li class="card">
            <div class="thumb"><FxPanel winner={DRAW_GESTURE} loser={DRAW_GESTURE} {live} /></div>
            <p class="pair"><strong>{name(DRAW_GESTURE)}</strong> = {name(DRAW_GESTURE)}</p>
            <p class="line">{t('board.duel_draw')}</p>
            <p class="facts"><code>{DRAW_GESTURE}={DRAW_GESTURE}</code><br />clash</p>
            <a href={fxHref(DRAW_GESTURE, DRAW_GESTURE)}>Loop</a>
          </li>
        </ul>
      </section>
    {/if}
  {/if}
</main>

<style>
  .fx-gallery {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    max-width: 90rem;
    margin: 0 auto;
    padding: var(--space-4);
    color: var(--text);
  }

  .fx-gallery.single {
    max-width: 26rem;
  }

  .bar,
  .controls,
  .filters,
  .pager,
  .lang {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .bar {
    justify-content: space-between;
  }

  /* Pressed toggles (live loop, language, the shown group) stand out like the language switch of App. */
  .fx-gallery .btn[aria-pressed='true'] {
    background: var(--blue);
    color: var(--on-blue);
  }

  .pager {
    justify-content: space-between;
  }

  h1,
  h2 {
    margin: 0;
    font-family: var(--font-display);
    letter-spacing: 0.02em;
  }

  h1 {
    font-size: var(--text-xl);
  }

  h2 {
    font-size: var(--text-lg);
    text-transform: capitalize;
  }

  h2 small {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: var(--ink-soft);
  }

  .group {
    display: grid;
    gap: var(--space-2);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: grid;
    align-content: start;
    gap: var(--space-1);
    min-width: 0;
    padding: var(--space-2);
    border: 2px solid var(--edge);
    border-radius: var(--radius-sm);
    background: var(--surface);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }

  /*
   * A thumbnail of the reveal as a 390 px phone shows it (panel 358 px wide), scaled down. The burst size is
   * pinned to its 390 px value, so it does not follow the width of the gallery window.
   */
  .thumb {
    justify-self: center;
    width: 358px;
    zoom: 0.4;
  }

  .thumb :global(.duel:not(.team)) {
    --burst-size: calc(390px * 0.52);
  }

  .card p {
    margin: 0;
  }

  .line {
    font-style: italic;
  }

  .facts {
    color: var(--ink-soft);
    font-size: 0.8125rem;
  }

  code {
    font-family: var(--font-mono);
  }

  .override {
    display: inline-block;
    margin-left: var(--space-1);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--pink);
    color: var(--on-bright);
    font-weight: 700;
  }

  .scene {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
  }

  .sentence {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    text-align: center;
  }

  .scene .facts {
    margin: 0;
    text-align: center;
  }
</style>
