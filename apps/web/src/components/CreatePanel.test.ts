import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import CreatePanel from './CreatePanel.svelte';
import { setLocale } from '../lib/i18n';
import { actions, resetConnectionMock } from '../test/connection-mock';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

const tournamentSwitch = () => screen.getByRole('checkbox', { name: 'Tournament (4 to 8 players)' });
const create = () => screen.getByRole('button', { name: 'Create room!' });

function setup() {
  render(CreatePanel, { nickname: 'Bernd', avatar: 'fox' });
  return userEvent.setup();
}

describe('CreatePanel tournament option', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  it('is off by default and the normal options are shown', () => {
    setup();
    expect(tournamentSwitch()).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Bluff' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Team 2 vs 2' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Best of 5' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Play against a bot' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Knockout' })).not.toBeInTheDocument();
  });

  it('is a native checkbox inside the switch style', () => {
    setup();
    expect(tournamentSwitch().closest('.switch')).not.toBeNull();
    expect(tournamentSwitch().closest('.dashed-box')).not.toBeNull();
  });

  it('hides bluff, 2v2, best-of and the bot option when on, and shows the format group', async () => {
    const user = setup();
    await user.click(tournamentSwitch());
    expect(screen.queryByRole('radio', { name: 'Bluff' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Team 2 vs 2' })).not.toBeInTheDocument();
    for (const name of ['Classic', 'Lizard & Spock', 'Wheel of 7', 'Wheel of 9', 'Wheel of 15']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('radio', { name: /^Best of/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Play against a bot' })).not.toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Format' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Knockout' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Round robin' })).not.toBeChecked();
  });

  it('sends tournament: { format: knockout } by default, with best of 3 and no bot', async () => {
    const user = setup();
    await user.click(tournamentSwitch());
    await user.click(create());
    expect(actions.createRoom).toHaveBeenCalledTimes(1);
    expect(actions.createRoom.mock.calls[0]?.[0]).toStrictEqual({
      config: { mode: 'classic', bestOf: 3 },
      nickname: 'Bernd',
      avatar: 'fox',
      tournament: { format: 'knockout' },
    });
  });

  it('lets the round robin format be chosen and sends it with the chosen mode', async () => {
    const user = setup();
    await user.click(tournamentSwitch());
    await user.click(screen.getByRole('radio', { name: 'Wheel of 9' }));
    await user.click(screen.getByRole('radio', { name: 'Round robin' }));
    await user.click(create());
    expect(actions.createRoom.mock.calls[0]?.[0]).toStrictEqual({
      config: { mode: 'wheel9', bestOf: 3 },
      nickname: 'Bernd',
      avatar: 'fox',
      tournament: { format: 'roundrobin' },
    });
  });

  it('never sends a bot or a chosen best-of with a tournament', async () => {
    const user = setup();
    await user.click(screen.getByRole('radio', { name: 'Best of 7' }));
    await user.click(screen.getByRole('checkbox', { name: 'Play against a bot' }));
    await user.click(tournamentSwitch());
    await user.click(create());
    const payload = actions.createRoom.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('vsBot');
    expect(payload.config).toStrictEqual({ mode: 'classic', bestOf: 3 });
  });

  it.each(['Bluff', 'Team 2 vs 2'])('switches the mode to classic when %s was chosen and the tournament goes on', async (name) => {
    const user = setup();
    await user.click(screen.getByRole('radio', { name }));
    await user.click(tournamentSwitch());
    expect(screen.getByRole('radio', { name: 'Classic' })).toBeChecked();
    await user.click(create());
    expect(actions.createRoom.mock.calls[0]?.[0]).toMatchObject({ config: { mode: 'classic', bestOf: 3 } });
  });

  it('keeps an allowed mode when the tournament goes on', async () => {
    const user = setup();
    await user.click(screen.getByRole('radio', { name: 'Wheel of 15' }));
    await user.click(tournamentSwitch());
    expect(screen.getByRole('radio', { name: 'Wheel of 15' })).toBeChecked();
  });

  it('restores the normal options and a payload without tournament when switched off again', async () => {
    const user = setup();
    await user.click(tournamentSwitch());
    await user.click(screen.getByRole('radio', { name: 'Round robin' }));
    await user.click(tournamentSwitch());
    expect(screen.getByRole('radio', { name: 'Bluff' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Team 2 vs 2' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Best of 3' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Play against a bot' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Format' })).not.toBeInTheDocument();
    await user.click(create());
    const payload = actions.createRoom.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toStrictEqual({ config: { mode: 'classic', bestOf: 3 }, nickname: 'Bernd', avatar: 'fox' });
    expect(payload).not.toHaveProperty('tournament');
  });
});
