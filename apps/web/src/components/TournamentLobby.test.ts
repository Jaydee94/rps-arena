import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import TournamentLobby from './TournamentLobby.svelte';
import { setLocale } from '../lib/i18n';
import { actions, resetConnectionMock, roomStore } from '../test/connection-mock';
import { makeSpectatorRoom, makeTournament } from '../test/fixtures';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

/** The lobby as the host (p0) or another participant (p1) sees it: a spectator view with `me`. */
function lobby(n: number, opts: { host?: boolean; spectator?: boolean; format?: 'knockout' | 'roundrobin'; mode?: 'classic' | 'wheel9' } = {}) {
  const { host = true, spectator = false, format = 'knockout', mode = 'classic' } = opts;
  const youId = spectator ? null : host ? 'p0' : 'p1';
  return makeSpectatorRoom({
    config: { mode, bestOf: 3 },
    isHost: !spectator && host,
    me: youId ? { id: youId } : null,
    tournament: makeTournament({ n, format, youId }),
  });
}

const startButton = () => screen.queryByRole('button', { name: 'Start tournament' });

describe('TournamentLobby', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  it('renders one main landmark with the ribbon title', () => {
    roomStore.set(lobby(5));
    const { container } = render(TournamentLobby);
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Tournament' })).toHaveClass('ribbon');
  });

  it('lists every participant with the counter', () => {
    roomStore.set(lobby(5));
    render(TournamentLobby);
    const list = screen.getByRole('list', { name: /Players/ });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(within(list).getByText('Spieler-p3')).toBeInTheDocument();
    expect(screen.getByText('5 / 8 players')).toBeInTheDocument();
  });

  it('marks yourself and, for the host, the host', () => {
    roomStore.set(lobby(4));
    render(TournamentLobby);
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]!).getByText('You')).toBeInTheDocument();
    expect(within(items[0]!).getByText('Host')).toBeInTheDocument();
    expect(within(items[1]!).queryByText('You')).not.toBeInTheDocument();
    expect(within(items[1]!).queryByText('Host')).not.toBeInTheDocument();
  });

  it('marks a participant who is not the host only with You', () => {
    roomStore.set(lobby(4, { host: false }));
    render(TournamentLobby);
    const items = screen.getAllByRole('listitem');
    expect(within(items[1]!).getByText('You')).toBeInTheDocument();
    expect(screen.queryByText('Host')).not.toBeInTheDocument();
  });

  it('shows a connection-lost marker for disconnected participants', () => {
    const view = lobby(5);
    view.tournament!.participants[3]!.connected = false;
    roomStore.set(view);
    render(TournamentLobby);
    const items = screen.getAllByRole('listitem');
    expect(within(items[3]!).getByText('Connection lost')).toBeInTheDocument();
    expect(within(items[2]!).queryByText('Connection lost')).not.toBeInTheDocument();
  });

  it('shows the format and the mode', () => {
    roomStore.set(lobby(4, { format: 'roundrobin', mode: 'wheel9' }));
    render(TournamentLobby);
    expect(screen.getByText(/Round robin/)).toBeInTheDocument();
    expect(screen.getByText(/Wheel of 9/)).toBeInTheDocument();
  });

  it('shows the room code and the invite link', () => {
    roomStore.set(lobby(4));
    render(TournamentLobby);
    expect(screen.getByLabelText('Room code')).toHaveValue('ABCDE');
    expect(screen.getByLabelText('Invite link')).toHaveValue(`${location.origin}/?room=ABCDE`);
  });

  it('shows the rules of the mode', () => {
    roomStore.set(lobby(4));
    render(TournamentLobby);
    expect(document.querySelector('details.rules')).not.toBeNull();
  });

  it('disables Start for the host below 4 connected participants and shows the hint', () => {
    roomStore.set(lobby(3));
    render(TournamentLobby);
    expect(startButton()).toBeDisabled();
    expect(screen.getByText('At least 4 players are needed to start.')).toBeInTheDocument();
  });

  it('does not count a disconnected participant towards the minimum', () => {
    const view = lobby(4);
    view.tournament!.participants[2]!.connected = false;
    roomStore.set(view);
    render(TournamentLobby);
    expect(startButton()).toBeDisabled();
    expect(screen.getByText('At least 4 players are needed to start.')).toBeInTheDocument();
  });

  it('lets the host start from 4 connected participants', async () => {
    roomStore.set(lobby(4));
    render(TournamentLobby);
    expect(startButton()).toBeEnabled();
    expect(screen.queryByText('At least 4 players are needed to start.')).not.toBeInTheDocument();
    await userEvent.setup().click(startButton()!);
    expect(actions.startMatch).toHaveBeenCalledTimes(1);
  });

  it('shows a non-host participant no start button but a waiting text', () => {
    roomStore.set(lobby(6, { host: false }));
    render(TournamentLobby);
    expect(startButton()).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for the host to start the tournament…')).toBeInTheDocument();
  });

  it('shows a lobby spectator the list, a read-only notice and no start button', () => {
    roomStore.set(lobby(8, { spectator: true }));
    render(TournamentLobby);
    expect(within(screen.getByRole('list', { name: 'Players' })).getAllByRole('listitem')).toHaveLength(8);
    expect(startButton()).not.toBeInTheDocument();
    expect(screen.getByText(/You're watching along/)).toBeInTheDocument();
    expect(screen.queryByText('You')).not.toBeInTheDocument();
    expect(screen.queryByText('Waiting for the host to start the tournament…')).not.toBeInTheDocument();
  });

  it('shows the spectator badge when people are watching', () => {
    const view = lobby(8, { host: false });
    view.spectators = [{ id: 's1', nickname: 'Zoe', avatar: 'cat', connected: true }];
    roomStore.set(view);
    render(TournamentLobby);
    expect(screen.getByText('1 spectator')).toBeInTheDocument();
  });

  it('renders nothing without a tournament view', () => {
    roomStore.set(makeSpectatorRoom({ tournament: null }));
    const { container } = render(TournamentLobby);
    expect(container.querySelector('main')).toBeNull();
  });
});
