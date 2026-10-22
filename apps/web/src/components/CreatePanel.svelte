<script lang="ts">
  import type { BotLevel, ClientEventPayloads, ModeId } from '@rps/shared';
  import { createRoom } from '../lib/connection';
  import { t } from '../lib/i18n';
  import ModePicker from './ModePicker.svelte';

  interface Props {
    nickname: string;
    avatar: string;
  }

  let { nickname, avatar }: Props = $props();

  const BEST_OF = [3, 5, 7] as const;
  const LEVELS: readonly BotLevel[] = ['easy', 'medium', 'hard'];

  let mode = $state<ModeId>('classic');
  let bestOf = $state<3 | 5 | 7>(3);
  let withBot = $state(false);
  let level = $state<BotLevel>('easy');

  // There is no bot in the 2v2 team mode.
  const botAllowed = $derived(mode !== 'team2v2');

  function create() {
    const payload: ClientEventPayloads['room:create'] = {
      config: { mode, bestOf },
      nickname: nickname.trim(),
      avatar,
    };
    if (botAllowed && withBot) payload.vsBot = level;
    createRoom(payload);
  }
</script>

<section class="card create" aria-labelledby="create-heading">
  <h2 id="create-heading">{t('home.create_heading')}</h2>
  <ModePicker bind:value={mode} />

  <fieldset class="group">
    <legend>{t('home.format')}</legend>
    <div class="row">
      {#each BEST_OF as n (n)}
        <label class="chip">
          <input type="radio" name="best-of" value={n} bind:group={bestOf} />
          <span>{t('home.best_of', { n })}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  {#if botAllowed}
    <label class="bot">
      <input type="checkbox" bind:checked={withBot} />
      <span>{t('home.vs_bot')}</span>
    </label>
    {#if withBot}
      <fieldset class="group">
        <legend>{t('home.bot_level')}</legend>
        <div class="row">
          {#each LEVELS as l (l)}
            <label class="chip">
              <input type="radio" name="bot-level" value={l} bind:group={level} />
              <span>{t(`home.bot_level.${l}`)}</span>
            </label>
          {/each}
        </div>
      </fieldset>
    {/if}
  {/if}

  <button type="button" class="btn btn-primary" disabled={nickname.trim() === ''} onclick={create}>
    {t('home.create')}
  </button>
</section>

<style>
  .create {
    display: grid;
    gap: var(--space-4);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .bot {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 700;
  }

  .bot input {
    width: 1.5rem;
    height: 1.5rem;
    accent-color: var(--blue);
  }
</style>
