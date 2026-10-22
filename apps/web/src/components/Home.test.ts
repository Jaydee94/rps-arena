import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Home from './Home.svelte';
import { setLocale } from '../lib/i18n';
import { actions, resetConnectionMock } from '../test/connection-mock';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

const nameField = () => screen.getByLabelText('Dein Name');

describe('Home', () => {
  beforeEach(() => {
    setLocale('de');
    resetConnectionMock();
    history.replaceState(null, '', '/');
  });

  it('disables create and join until a nickname is entered', async () => {
    render(Home);
    expect(screen.getByRole('button', { name: 'Raum erstellen' })).toBeDisabled();
    await userEvent.setup().type(nameField(), 'Bernd');
    expect(screen.getByRole('button', { name: 'Raum erstellen' })).toBeEnabled();
    expect(nameField()).toHaveAttribute('maxlength', '16');
  });

  it('creates a plain classic room with the first avatar by default', async () => {
    render(Home);
    const user = userEvent.setup();
    await user.type(nameField(), '  Bernd ');
    await user.click(screen.getByRole('button', { name: 'Raum erstellen' }));
    expect(actions.createRoom).toHaveBeenCalledTimes(1);
    expect(actions.createRoom.mock.calls[0]?.[0]).toStrictEqual({
      config: { mode: 'classic', bestOf: 3 },
      nickname: 'Bernd',
      avatar: 'fox',
    });
  });

  it('builds the payload from mode, best-of, avatar and bot level', async () => {
    render(Home);
    const user = userEvent.setup();
    await user.type(nameField(), 'Bernd');
    await user.click(screen.getByRole('radio', { name: 'Katze' }));
    await user.click(screen.getByRole('radio', { name: 'Bluff' }));
    await user.click(screen.getByRole('radio', { name: 'Best of 5' }));
    await user.click(screen.getByRole('checkbox', { name: 'Gegen Bot spielen' }));
    await user.click(screen.getByRole('radio', { name: 'Schwer' }));
    await user.click(screen.getByRole('button', { name: 'Raum erstellen' }));
    expect(actions.createRoom.mock.calls[0]?.[0]).toStrictEqual({
      config: { mode: 'bluff', bestOf: 5 },
      nickname: 'Bernd',
      avatar: 'cat',
      vsBot: 'hard',
    });
  });

  it('offers all 7 modes', () => {
    render(Home);
    expect(screen.getAllByRole('radio', { name: /Klassisch|Echse|Rad der|Bluff|Team 2/ })).toHaveLength(7);
  });

  it('hides the bot option for team2v2 and never sends vsBot for it', async () => {
    render(Home);
    const user = userEvent.setup();
    await user.type(nameField(), 'Bernd');
    await user.click(screen.getByRole('checkbox', { name: 'Gegen Bot spielen' }));
    await user.click(screen.getByRole('radio', { name: 'Team 2 gegen 2' }));
    expect(screen.queryByRole('checkbox', { name: 'Gegen Bot spielen' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Raum erstellen' }));
    expect(actions.createRoom.mock.calls[0]?.[0]).toStrictEqual({
      config: { mode: 'team2v2', bestOf: 3 },
      nickname: 'Bernd',
      avatar: 'fox',
    });
  });

  it('joins with a normalized code', async () => {
    render(Home);
    const user = userEvent.setup();
    await user.type(nameField(), 'Bernd');
    await user.type(screen.getByLabelText('Raum-Code'), '  ab3de ');
    await user.click(screen.getByRole('button', { name: 'Raum beitreten' }));
    expect(actions.joinRoom).toHaveBeenCalledTimes(1);
    expect(actions.joinRoom).toHaveBeenCalledWith({ code: 'AB3DE', nickname: 'Bernd', avatar: 'fox' });
  });

  it('prefills and focuses the code field from ?room=CODE', () => {
    history.replaceState(null, '', '/?room=ab3de');
    render(Home);
    const code = screen.getByLabelText('Raum-Code');
    expect(code).toHaveValue('AB3DE');
    expect(code).toHaveFocus();
  });
});
