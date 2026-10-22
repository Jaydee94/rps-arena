<script lang="ts">
  import { AVATARS, NICKNAME_MAX_LENGTH, normalizeCode } from '@rps/shared';
  import { joinRoom } from '../lib/connection';
  import { t } from '../lib/i18n';
  import AvatarPicker from './AvatarPicker.svelte';
  import CreatePanel from './CreatePanel.svelte';
  import GestureIcon from './GestureIcon.svelte';

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

  function join() {
    joinRoom({ code: normalizeCode(code), nickname: nickname.trim(), avatar });
  }
</script>

<div class="home">
  <header class="hero">
    <div class="stickers" aria-hidden="true">
      <span class="s1"><GestureIcon id="rock" size={72} /></span>
      <span class="s2"><GestureIcon id="paper" size={72} /></span>
      <span class="s3"><GestureIcon id="scissors" size={72} /></span>
    </div>
    <div class="bubble">
      <h2>{t('home.title')}</h2>
      <p>{t('home.tagline')}</p>
    </div>
  </header>

  <section class="card identity">
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

  <CreatePanel {nickname} {avatar} />

  <form class="panel join" onsubmit={(event) => { event.preventDefault(); join(); }}>
    <h2 class="ribbon ribbon--sky">{t('home.join_heading')}</h2>
    <label class="field">
      <span>{t('home.code')}</span>
      <input type="text" bind:value={code} bind:this={codeInput} placeholder={t('home.code_placeholder')} autocomplete="off" autocapitalize="characters" />
    </label>
    <button type="submit" class="btn btn-blue" disabled={!hasName || normalizeCode(code) === ''}>
      {t('home.join')}
    </button>
  </form>
</div>

<style>
  .home {
    display: grid;
    gap: var(--space-5);
    max-width: 48rem;
    margin: 0 auto;
    width: 100%;
  }

  .hero {
    display: grid;
    gap: var(--space-5);
    justify-items: start;
  }

  /* The three classic gestures, fanned out like stickers on a comic cover. */
  .stickers {
    display: flex;
    padding-left: var(--space-2);
  }

  .stickers span {
    display: block;
  }

  .stickers .s1 { rotate: -9deg; translate: 0 0.4rem; }
  .stickers .s2 { rotate: 3deg; margin-left: -0.6rem; translate: 0 -0.5rem; z-index: 1; }
  .stickers .s3 { rotate: 11deg; margin-left: -0.6rem; translate: 0 0.5rem; }

  /* Speech bubble with a tail pointing at the stickers. */
  .bubble {
    position: relative;
    display: grid;
    gap: var(--space-1);
    padding: var(--space-4) var(--space-5);
    border: var(--border);
    border-radius: var(--radius-lg);
    background: var(--sticker);
    color: var(--on-bright);
    box-shadow: var(--shadow);
    rotate: var(--tilt-2);
  }

  .bubble::before {
    content: '';
    position: absolute;
    top: -0.85rem;
    left: 3.2rem;
    width: 1.5rem;
    height: 1.5rem;
    border-top: var(--border);
    border-left: var(--border);
    background: var(--sticker);
    rotate: 45deg;
  }

  h2 {
    font-size: var(--text-xl);
  }

  .bubble h2 {
    font-size: var(--text-2xl);
    text-shadow: 3px 3px 0 var(--yellow);
  }

  .bubble p {
    font-weight: 700;
  }

  .identity,
  .join {
    display: grid;
    gap: var(--space-4);
  }

  .hint {
    font-weight: 700;
  }

  .join .btn {
    justify-self: start;
  }
</style>
