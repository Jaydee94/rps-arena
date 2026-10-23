import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import TournamentDraw from './TournamentDraw.svelte';
import { setLocale } from '../lib/i18n';
import { actions, resetConnectionMock, roomStore } from '../test/connection-mock';
import { makePairing, makeSpectatorRoom, makeTournament } from '../test/fixtures';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

/** A 5-player knockout draw: p0 vs p1, p2 vs p3, p4 with a bye. */
function draw({ host = true, format = 'knockout' as 'knockout' | 'roundrobin' } = {}) {
  const pairings =
    format === 'knockout'
      ? [
          makePairing({ id: 'r1-1', a: 'p4', b: null, winner: 'p4', decidedBy: 'bye' }),
          makePairing({ id: 'r1-2', a: 'p0', b: 'p1' }),
          makePairing({ id: 'r1-3', a: 'p2', b: 'p3' }),
        ]
      : [makePairing({ id: 'r1-1', a: 'p0', b: 'p1' }), makePairing({ id: 'r1-2', a: 'p2', b: 'p3' })];
  roomStore.set(
    makeSpectatorRoom({
      isHost: host,
      me: { id: host ? 'p0' : 'p2' },
      tournament: makeTournament({ n: 5, format, phase: 'draw', youId: host ? 'p0' : 'p2', pairings, untilMs: Date.now() + 3000 }),
    }),
  );
  return render(TournamentDraw);
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('TournamentDraw', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('has one main and one h2, and shows the format', () => {
    const { container } = draw();
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelectorAll('h2')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'The draw' })).toBeInTheDocument();
    expect(screen.getByText(/Knockout/)).toBeInTheDocument();
  });

  it('shows every name once, landed in its first-round slot, with the bye', () => {
    const { container } = draw();
    for (let i = 0; i < 5; i++) expect(screen.getByText(`Spieler-p${i}`)).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'First round' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('Bye')).toBeInTheDocument();
    expect(container.querySelector('[data-pairing="r1-2"]')).toHaveTextContent(/Spieler-p0.*Spieler-p1/);
  });

  it('lists a round-robin player who sits the first round out', () => {
    draw({ format: 'roundrobin' });
    const list = screen.getByRole('list', { name: 'First round' });
    expect(within(list).getByText('Spieler-p4')).toBeInTheDocument();
    expect(within(list).getByText('Sits out')).toBeInTheDocument();
  });

  it('gives only the host a Skip button', async () => {
    draw({ host: true });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Skip' }));
    expect(actions.skipWait).toHaveBeenCalledTimes(1);
  });

  it('gives others no Skip button', () => {
    draw({ host: false });
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
  });

  it('lets the names whirl in with motion', () => {
    stubReducedMotion(false);
    const { container } = draw();
    expect(container.querySelectorAll('.draw-whirl').length).toBeGreaterThan(0);
  });

  it('shows the result at once under reduced motion: no animation class', () => {
    stubReducedMotion(true);
    const { container } = draw();
    expect(container.querySelectorAll('.draw-whirl')).toHaveLength(0);
    expect(screen.getByText('Spieler-p3')).toBeInTheDocument();
  });

  it('falls back to the participant list before the pairings exist', () => {
    roomStore.set(makeSpectatorRoom({ isHost: false, me: { id: 'p1' }, tournament: makeTournament({ n: 5, phase: 'draw' }) }));
    render(TournamentDraw);
    expect(screen.getByText('Spieler-p4')).toBeInTheDocument();
  });

  it('lets everyone leave while waiting', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    draw({ host: false });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Leave room' }));
    expect(actions.leaveRoom).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/');
  });
});
