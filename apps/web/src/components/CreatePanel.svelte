<script lang="ts">
  import type { BotLevel, ClientEventPayloads, ModeId } from '@rps/shared';
  import { createRoom } from '../lib/connection';
  import { t } from '../lib/i18n';
  import ModePicker from './ModePicker.svelte';

  interface Props {
    nickname: string;
    avatar: string;
    /** Position among the screen's panels; staggers the entrance. */
    index?: number;
  }

  let { nickname, avatar, index = 0 }: Props = $props();

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

<section class="panel create" aria-labelledby="create-heading" style:--i={index}>
  <h2 id="create-heading" class="ribbon">{t('home.create_heading')}</h2>
  <ModePicker bind:value={mode} />

  <fieldset class="group">
    <legend>{t('home.format')}</legend>
    <div class="segmented">
      {#each BEST_OF as n (n)}
        <label class="segment">
          <input type="radio" name="best-of" value={n} bind:group={bestOf} aria-label={t('home.best_of', { n })} />
          <span aria-hidden="true">{n}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  {#if botAllowed}
    <div class="dashed-box">
      <label class="bot">
        <span class="switch"><input type="checkbox" bind:checked={withBot} /></span>
        <span class="bot-text">{t('home.vs_bot')}</span>
      </label>
    </div>
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

  <button type="button" class="btn btn-primary cta" disabled={nickname.trim() === ''} onclick={create}>
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
    gap: var(--space-3);
    min-width: 0;
    font-weight: 700;
    cursor: pointer;
  }

  .bot-text {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .cta {
    width: 100%;
    min-height: 3.75rem;
    box-shadow: var(--shadow-panel);
  }

  .cta:disabled {
    box-shadow: none;
  }
</style>
