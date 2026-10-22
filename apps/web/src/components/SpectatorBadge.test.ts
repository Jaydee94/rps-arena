import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { PublicSpectator } from '@rps/shared';
import Board from './Board.svelte';
import Lobby from './Lobby.svelte';
import SpectatorBadge from './SpectatorBadge.svelte';
import { setLocale } from '../lib/i18n';
import { resetConnectionMock, roomStore } from '../test/connection-mock';
import { makeRoom } from '../test/fixtures';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

const spectator = (id: string, nickname: string): PublicSpectator => ({ id, nickname, avatar: 'cat', connected: true });
const ZOE = spectator('s1', 'Zoe');
const WIM = spectator('s2', 'Wim');

describe('SpectatorBadge', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  it('shows the count with the names as a tooltip', () => {
    render(SpectatorBadge, { spectators: [ZOE, WIM] });
    const badge = screen.getByText('2 spectators');
    expect(badge).toBeInTheDocument();
    expect(badge.closest('[title]')).toHaveAttribute('title', 'Zoe, Wim');
  });

  it('uses the singular for one spectator', () => {
    render(SpectatorBadge, { spectators: [ZOE] });
    expect(screen.getByText('1 spectator')).toBeInTheDocument();
  });

  it('speaks German too', () => {
    setLocale('de');
    render(SpectatorBadge, { spectators: [ZOE] });
    expect(screen.getByText('1 Zuschauer')).toBeInTheDocument();
  });

  it('renders nothing without spectators', () => {
    const { container } = render(SpectatorBadge, { spectators: [] });
    expect(container.textContent).toBe('');
    expect(container.querySelector('.spectator-badge')).toBeNull();
  });

  it('is read-only: not a button', () => {
    render(SpectatorBadge, { spectators: [ZOE] });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  describe('in the lobby and on the board', () => {
    it('shows in the lobby only with spectators', () => {
      roomStore.set(makeRoom({ match: null }));
      const { unmount } = render(Lobby);
      expect(screen.queryByText(/spectator/)).not.toBeInTheDocument();
      unmount();

      roomStore.set(makeRoom({ match: null, spectators: [ZOE, WIM] }));
      render(Lobby);
      expect(screen.getByText('2 spectators')).toBeInTheDocument();
    });

    it('shows on the board only with spectators', () => {
      roomStore.set(makeRoom());
      const { unmount } = render(Board);
      expect(screen.queryByText(/spectator/)).not.toBeInTheDocument();
      unmount();

      roomStore.set(makeRoom({ spectators: [ZOE] }));
      render(Board);
      expect(screen.getByText('1 spectator')).toBeInTheDocument();
    });
  });
});
