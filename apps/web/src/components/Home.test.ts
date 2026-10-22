import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
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
    expect(screen.getByRole('button', { name: /Raum erstellen/ })).toBeDisabled();
    await userEvent.setup().type(nameField(), 'Bernd');
    expect(screen.getByRole('button', { name: /Raum erstellen/ })).toBeEnabled();
    expect(nameField()).toHaveAttribute('maxlength', '16');
  });

  it('creates a plain classic room with the first avatar by default', async () => {
    render(Home);
    const user = userEvent.setup();
    await user.type(nameField(), '  Bernd ');
    await user.click(screen.getByRole('button', { name: /Raum erstellen/ }));
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
    await user.click(screen.getByRole('button', { name: /Raum erstellen/ }));
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
    await user.click(screen.getByRole('button', { name: /Raum erstellen/ }));
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

  describe('comic panel layout', () => {
    it('shows the caption in the hero and keeps the title as the level 2 heading', () => {
      render(Home);
      expect(screen.getByText('Ohne Account. Link teilen, losspielen.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: /Schere, Stein, Papier/ })).toBeInTheDocument();
    });

    it('orders the panels: who are you, new game, join with code', () => {
      render(Home);
      const who = screen.getByText('Wer bist du?');
      const create = screen.getByText('Neues Spiel');
      const join = screen.getByText('Mit Code beitreten');
      expect(who.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(create.compareDocumentPosition(join) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shows the short join label but keeps the full accessible name', () => {
      render(Home);
      expect(screen.getByRole('button', { name: 'Raum beitreten' })).toHaveTextContent('Rein!');
    });

    it('limits the code field to 5 characters and gives an example', () => {
      render(Home);
      const code = screen.getByLabelText('Raum-Code');
      expect(code).toHaveAttribute('maxlength', '5');
      expect(code).toHaveAttribute('placeholder', 'z. B. K7QXM');
    });

    it('keeps best-of a radio group of three', () => {
      render(Home);
      const group = screen.getByRole('group', { name: 'Spielformat' });
      expect(within(group).getAllByRole('radio')).toHaveLength(3);
      expect(screen.getByRole('radio', { name: 'Best of 5' })).toBeInTheDocument();
    });

    it('describes only the chosen mode and moves the description with the choice', async () => {
      render(Home);
      const radios = screen.getAllByRole('radio', { name: /Klassisch|Echse|Rad der|Bluff|Team 2/ });
      expect(radios).toHaveLength(7);
      const described = radios.filter((r) => r.hasAttribute('aria-describedby'));
      expect(described).toHaveLength(1);
      expect(described[0]).toBeChecked();
      expect(described[0]).toHaveAccessibleDescription(/\S/);
      await userEvent.setup().click(screen.getByRole('radio', { name: 'Bluff' }));
      const after = screen.getAllByRole('radio', { name: /Klassisch|Echse|Rad der|Bluff|Team 2/ });
      expect(after.filter((r) => r.hasAttribute('aria-describedby'))).toStrictEqual([
        screen.getByRole('radio', { name: 'Bluff' }),
      ]);
    });

    it('offers 8 avatars', () => {
      render(Home);
      const group = screen.getByRole('group', { name: 'Dein Avatar' });
      expect(within(group).getAllByRole('radio')).toHaveLength(8);
    });

    it('keeps the bot option a checkbox', () => {
      render(Home);
      expect(screen.getByRole('checkbox', { name: 'Gegen Bot spielen' })).toBeInTheDocument();
    });

    describe('room code field', () => {
      const code = () => screen.getByLabelText('Raum-Code');

      it('uppercases typed lowercase letters', async () => {
        render(Home);
        await userEvent.setup().type(code(), 'ab3de');
        expect(code()).toHaveValue('AB3DE');
      });

      it('ignores typed spaces so they never use up the length limit', async () => {
        render(Home);
        await userEvent.setup().type(code(), ' a b 3 d e ');
        expect(code()).toHaveValue('AB3DE');
      });

      it('cleans pasted codes with leading and inner spaces', async () => {
        render(Home);
        const user = userEvent.setup();
        await user.click(code());
        await user.paste(' ab3 de');
        expect(code()).toHaveValue('AB3DE');
      });

      it('joins with a pasted code', async () => {
        render(Home);
        const user = userEvent.setup();
        await user.type(nameField(), 'Bernd');
        await user.click(code());
        await user.paste('AB3 DE');
        await user.click(screen.getByRole('button', { name: 'Raum beitreten' }));
        expect(actions.joinRoom).toHaveBeenCalledWith({ code: 'AB3DE', nickname: 'Bernd', avatar: 'fox' });
      });
    });
  });
});
