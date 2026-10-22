<script lang="ts">
  import { AVATARS, NICKNAME_MAX_LENGTH, normalizeCode } from '@rps/shared';
  import { joinRoom } from '../lib/connection';
  import { t } from '../lib/i18n';
  import AvatarPicker from './AvatarPicker.svelte';
  import CreatePanel from './CreatePanel.svelte';

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
  <header>
    <h2>{t('home.title')}</h2>
    <p>{t('home.tagline')}</p>
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

  <form class="card join" onsubmit={(event) => { event.preventDefault(); join(); }}>
    <h2>{t('home.join_heading')}</h2>
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

  header {
    display: grid;
    gap: var(--space-2);
  }

  h2 {
    font-size: var(--text-xl);
  }

  header h2 {
    font-size: var(--text-2xl);
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
