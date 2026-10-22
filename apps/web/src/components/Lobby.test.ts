import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { RoomView, SeatId } from '@rps/shared';
import Lobby from './Lobby.svelte';
import { setLocale } from '../lib/i18n';
import { actions, resetConnectionMock, roomStore } from '../test/connection-mock';
import { makePlayer, makeRoom } from '../test/fixtures';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

function lobby(seats: SeatId[], overrides: Partial<RoomView> = {}): RoomView {
  const config = overrides.config ?? { mode: 'classic', bestOf: 3 };
  return makeRoom({
    ...overrides,
    config,
    match: null,
    players: Object.fromEntries(seats.map((s) => [s, makePlayer(s)])),
  });
}

describe('Lobby', () => {
  beforeEach(() => {
    setLocale('de');
    resetConnectionMock();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the room code and the invite link', () => {
    roomStore.set(lobby(['a0']));
    render(Lobby);
    expect(screen.getByLabelText('Raum-Code')).toHaveValue('ABCDE');
    expect(screen.getByLabelText('Einladungslink')).toHaveValue(`${location.origin}/?room=ABCDE`);
  });

  it('lets the host start only when all seats are filled', async () => {
    roomStore.set(lobby(['a0']));
    render(Lobby);
    expect(screen.getByRole('button', { name: "Los geht's!" })).toBeDisabled();
    expect(screen.getByText('Warte auf Mitspieler …')).toBeInTheDocument();

    roomStore.set(lobby(['a0', 'b0']));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: "Los geht's!" })).toBeEnabled());
    await userEvent.setup().click(screen.getByRole('button', { name: "Los geht's!" }));
    expect(actions.startMatch).toHaveBeenCalledTimes(1);
  });

  it('shows guests no start button but a waiting hint', () => {
    roomStore.set(lobby(['a0', 'b0'], { you: 'b0' }));
    render(Lobby);
    expect(screen.queryByRole('button', { name: "Los geht's!" })).not.toBeInTheDocument();
    expect(screen.getByText(/Warte, bis die Gastgeberin/)).toBeInTheDocument();
  });

  it('shows two seats for duels and four in two team columns for team2v2', () => {
    roomStore.set(lobby(['a0']));
    const { unmount } = render(Lobby);
    expect(screen.getAllByTestId(/^seat-/)).toHaveLength(2);
    expect(screen.getByTestId('seat-b0')).toHaveTextContent('Freier Platz');
    unmount();

    roomStore.set(lobby(['a0', 'a1', 'b0'], { config: { mode: 'team2v2', bestOf: 3 } }));
    render(Lobby);
    expect(screen.getAllByTestId(/^seat-/)).toHaveLength(4);
    expect(screen.getByRole('group', { name: 'Team Rot' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Team Blau' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Los geht's!" })).toBeDisabled();
  });

  it('lets the host move a player to a free team seat', async () => {
    roomStore.set(lobby(['a0', 'a1', 'b0'], { config: { mode: 'team2v2', bestOf: 3 } }));
    render(Lobby);
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Hierher setzen' })).not.toBeInTheDocument();
    await user.click(within(screen.getByTestId('seat-a1')).getByRole('button', { name: 'Umsetzen' }));
    await user.click(within(screen.getByTestId('seat-b1')).getByRole('button', { name: 'Hierher setzen' }));
    expect(actions.moveSeat).toHaveBeenCalledWith('a1', 'b1');
  });

  it('does not offer moving to guests', () => {
    roomStore.set(lobby(['a0', 'a1', 'b0'], { config: { mode: 'team2v2', bestOf: 3 }, you: 'b0' }));
    render(Lobby);
    expect(screen.queryByRole('button', { name: 'Umsetzen' })).not.toBeInTheDocument();
  });

  it('copies the link and confirms', async () => {
    roomStore.set(lobby(['a0']));
    render(Lobby);
    // user-event installs a working clipboard stub on navigator
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Link kopieren' }));
    expect(await navigator.clipboard.readText()).toBe(`${location.origin}/?room=ABCDE`);
    expect(await screen.findByText('Kopiert!')).toBeInTheDocument();
  });

  it('falls back to selecting the text when the clipboard is unavailable', async () => {
    roomStore.set(lobby(['a0']));
    render(Lobby);
    const user = userEvent.setup();
    vi.stubGlobal('navigator', { language: 'de' });
    await user.click(screen.getByRole('button', { name: 'Link kopieren' }));
    const field = screen.getByLabelText('Einladungslink') as HTMLInputElement;
    expect(await screen.findByText(/Kopieren nicht möglich/)).toBeInTheDocument();
    expect(field).toHaveFocus();
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
  });
});
