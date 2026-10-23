<script lang="ts">
  import type { BotLevel, ClientEventPayloads, ModeId, TournamentFormat } from '@rps/shared';
  import { createRoom } from '../lib/connection';
  import { t } from '../lib/i18n';
  import { TOURNAMENT_MODES } from '../lib/tournament-ui';
  import ModePicker from './ModePicker.svelte';
  import TournamentFormatPicker from './TournamentFormatPicker.svelte';

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
  let tournament = $state(false);
  let format = $state<TournamentFormat>('knockout');

  // There is no bot in the 2v2 team mode, and none in a tournament.
  const botAllowed = $derived(mode !== 'team2v2' && !tournament);

  function setTournament(on: boolean) {
    tournament = on;
    // Bluff and 2v2 cannot be played as a tournament.
    if (on && !TOURNAMENT_MODES.includes(mode)) mode = 'classic';
  }

  function create() {
    // A tournament is always best of 3 (the server fixes it) and never against a bot.
    const payload: ClientEventPayloads['room:create'] = {
      config: { mode, bestOf: tournament ? 3 : bestOf },
      nickname: nickname.trim(),
      avatar,
    };
    if (tournament) payload.tournament = { format };
    else if (botAllowed && withBot) payload.vsBot = level;
    createRoom(payload);
  }
</script>

<section class="panel create" aria-labelledby="create-heading" style:--i={index}>
  <h2 id="create-heading" class="ribbon">{t('home.create_heading')}</h2>
  <div class="dashed-box">
    <label class="toggle">
      <span class="switch">
        <input type="checkbox" checked={tournament} onchange={(e) => setTournament(e.currentTarget.checked)} />
      </span>
      <span class="toggle-text">{t('tournament.switch')}</span>
    </label>
  </div>

  <ModePicker bind:value={mode} modes={tournament ? TOURNAMENT_MODES : undefined} />

  {#if tournament}
    <TournamentFormatPicker bind:value={format} />
  {:else}
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
  {/if}

  {#if botAllowed}
    <div class="dashed-box">
      <label class="toggle">
        <span class="switch"><input type="checkbox" bind:checked={withBot} /></span>
        <span class="toggle-text">{t('home.vs_bot')}</span>
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

  .toggle {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    font-weight: 700;
    cursor: pointer;
  }

  .toggle-text {
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
