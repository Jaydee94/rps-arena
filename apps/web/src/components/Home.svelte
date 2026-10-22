<script lang="ts">
  import { AVATARS, CODE_LENGTH, NICKNAME_MAX_LENGTH, normalizeCode } from '@rps/shared';
  import { joinRoom } from '../lib/connection';
  import { t } from '../lib/i18n';
  import AvatarPicker from './AvatarPicker.svelte';
  import CreatePanel from './CreatePanel.svelte';
  import GestureIcon from './GestureIcon.svelte';

  // The three classic gestures as stickers; the tilt sits on a wrapper so `bob` can run on the inner element.
  const STICKERS = [
    { id: 'rock', tilt: '-9deg' },
    { id: 'paper', tilt: '3deg' },
    { id: 'scissors', tilt: '11deg' },
  ] as const;

  // /?room=CODE prefills the code and focuses the join form. Read once; tokens never go into URLs.
  const invited = new URLSearchParams(location.search).get('room');

  let nickname = $state('');
  let avatar = $state(AVATARS[0] ?? 'fox');
  let code = $state(invited ? normalizeCode(invited) : '');
  let codeInput = $state<HTMLInputElement>();

  $effect(() => {
    if (invited) codeInput?.focus();
  });

  const hasName = $derived(nickname.trim() !== '');

  // Room codes have no spaces: drop them (and uppercase) while typing so they never eat the length limit.
  function onCodeInput(event: Event & { currentTarget: HTMLInputElement }) {
    const clean = event.currentTarget.value.replace(/\s+/g, '').toUpperCase();
    event.currentTarget.value = clean;
    code = clean;
  }

  function join() {
    joinRoom({ code: normalizeCode(code), nickname: nickname.trim(), avatar });
  }
</script>

<div class="home">
  <section class="panel hero" style:--i="0">
    <p class="hero-caption">{t('home.caption')}</p>
    <div class="stickers" aria-hidden="true">
      {#each STICKERS as sticker, i (sticker.id)}
        <span class="sticker-tilt" style:--tilt={sticker.tilt}>
          <span class="hero-sticker" style:--i={i}><GestureIcon id={sticker.id} size={86} /></span>
        </span>
      {/each}
    </div>
    <div class="hero-bubble">
      <h2>{t('home.title')}</h2>
      <p>{t('home.tagline')}</p>
    </div>
  </section>

  <section class="panel identity" aria-labelledby="who-heading" style:--i="1">
    <h2 id="who-heading" class="ribbon">{t('home.who_heading')}</h2>
    <label class="field">
      <span>{t('home.nickname')}</span>
      <input
        type="text"
        bind:value={nickname}
        maxlength={NICKNAME_MAX_LENGTH}
        placeholder={t('home.nickname_placeholder')}
        autocomplete="nickname"
      />
    </label>
    <AvatarPicker bind:value={avatar} />
    {#if !hasName}<p class="hint">{t('home.need_nickname')}</p>{/if}
  </section>

  <CreatePanel {nickname} {avatar} index={2} />

  <form class="panel join" style:--i="3" onsubmit={(event) => { event.preventDefault(); join(); }}>
    <h2 class="ribbon ribbon--sky">{t('home.join_heading')}</h2>
    <div class="join-row">
      <label class="field">
        <span>{t('home.code')}</span>
        <input
          type="text"
          class="code"
          value={code}
          oninput={onCodeInput}
          bind:this={codeInput}
          maxlength={CODE_LENGTH}
          placeholder={t('home.code_placeholder')}
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
        />
      </label>
      <button
        type="submit"
        class="btn btn-blue"
        aria-label={t('home.join')}
        disabled={!hasName || normalizeCode(code) === ''}
      >
        {t('home.join_short')}
      </button>
    </div>
  </form>
</div>

<style>
  .home {
    display: grid;
    gap: var(--gutter);
    max-width: 48rem;
    margin: 0 auto;
    width: 100%;
  }

  .home > :global(*) {
    min-width: 0;
  }

  /* ---- Hero panel: blue ground with big pink halftone dots ---- */
  .hero {
    display: grid;
    align-items: end;
    min-height: 15.75rem;
    /* Room at the top for the caption box. */
    padding: 5rem var(--space-4) var(--space-4);
    background-color: var(--blue);
    background-image: radial-gradient(circle at center, var(--dot-panel) 30%, transparent 33%);
    background-size: var(--dot-panel-size) var(--dot-panel-size);
  }

  .hero > * {
    grid-area: 1 / 1;
    min-width: 0;
  }

  /* Yellow caption box that sticks out over the panel edge. */
  .hero-caption {
    position: absolute;
    top: var(--space-4);
    left: -6px;
    max-width: calc(100% - 3rem);
    margin: 0;
    padding: var(--space-1) var(--space-3);
    border: var(--border);
    border-radius: var(--radius-sm);
    background: var(--yellow);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    font-family: var(--font-display);
    font-size: var(--text-md);
    letter-spacing: 0.04em;
    line-height: 1.2;
    overflow-wrap: anywhere;
    rotate: -2deg;
  }

  .stickers {
    display: flex;
    align-self: end;
    justify-self: start;
    padding-top: var(--space-3);
  }

  .sticker-tilt {
    display: block;
    rotate: var(--tilt);
  }

  .sticker-tilt + .sticker-tilt {
    margin-left: -10px;
  }

  .hero-sticker {
    display: block;
  }

  /* Speech bubble with a tail pointing down at the stickers. */
  .hero-bubble {
    position: relative;
    z-index: 1;
    align-self: start;
    justify-self: end;
    display: grid;
    gap: var(--space-1);
    width: min(170px, 100%);
    padding: var(--space-3);
    border: var(--border);
    border-radius: var(--radius-lg);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow-sm);
    overflow-wrap: anywhere;
    rotate: 2deg;
    transform-origin: 12% 100%;
  }

  .hero-bubble::after {
    content: '';
    position: absolute;
    bottom: -0.8rem;
    left: 12%;
    width: 1.4rem;
    height: 1.4rem;
    border-right: var(--border);
    border-bottom: var(--border);
    background: var(--sticker);
    rotate: 45deg;
  }

  .hero-bubble h2 {
    font-size: 27px;
    text-shadow: 2px 2px 0 var(--yellow);
  }

  .hero-bubble p {
    font-size: var(--text-sm);
    font-weight: 700;
    line-height: 1.3;
  }

  /* ---- Identity and join panels ---- */
  .identity,
  .join {
    display: grid;
    gap: var(--space-4);
  }

  .hint {
    font-weight: 700;
  }

  .join-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: var(--space-3);
  }

  .join-row .field {
    min-width: 0;
  }

  .field input.code {
    width: 100%;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: 0.3em;
  }

  .join-row .btn {
    min-height: 3rem;
  }
</style>
