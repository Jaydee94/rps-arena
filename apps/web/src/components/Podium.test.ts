import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { PublicTournament } from '@rps/shared';
import Podium from './Podium.svelte';
import TournamentResult from './TournamentResult.svelte';
import { setLocale } from '../lib/i18n';
import { actions, resetConnectionMock, roomStore } from '../test/connection-mock';
import { makeSpectatorRoom, makeTournament } from '../test/fixtures';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

/** Knockout finished with a double-forfeited semifinal: p0 champion, p1 second, p2, p3 and p4 share 3rd place. */
const PODIUM: PublicTournament['podium'] = [
  { rank: 1, ids: ['p0'] },
  { rank: 2, ids: ['p1'] },
  { rank: 3, ids: ['p2', 'p3', 'p4'] },
];

const finished = (youId: string | null = 'p0') => makeTournament({ n: 8, phase: 'finished', youId, podium: PODIUM });

function result({ host, youId }: { host: boolean; youId: string | null }) {
  roomStore.set(
    makeSpectatorRoom({ isHost: host, me: youId ? { id: youId } : null, tournament: finished(youId) }),
  );
  return render(TournamentResult);
}

describe('Podium', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  it('lists places 1 to 3 in order, as a labelled list', () => {
    render(Podium, { tournament: finished() });
    const list = screen.getByRole('list', { name: 'Podium' });
    const places = within(list).getAllByRole('listitem').filter((li) => li.dataset.rank);
    expect(places.map((li) => li.dataset.rank)).toEqual(['1', '2', '3']);
    expect(within(places[0] as HTMLElement).getByText('Place 1')).toBeInTheDocument();
  });

  it('puts a shared place side by side and says it is shared', () => {
    render(Podium, { tournament: finished() });
    const third = screen.getByText('Place 3').closest('[data-rank]') as HTMLElement;
    for (const id of ['p2', 'p3', 'p4']) expect(within(third).getByText(`Spieler-${id}`)).toBeInTheDocument();
    expect(within(third).getByText('shared')).toBeInTheDocument();
    const second = screen.getByText('Place 2').closest('[data-rank]') as HTMLElement;
    expect(within(second).queryByText('shared')).not.toBeInTheDocument();
  });

  it('marks you on the podium', () => {
    render(Podium, { tournament: finished('p3') });
    const third = screen.getByText('Place 3').closest('[data-rank]') as HTMLElement;
    expect(within(third).getByText('You')).toBeInTheDocument();
  });
});

describe('TournamentResult', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  it('names the champion under one heading in one main', () => {
    const { container } = result({ host: true, youId: 'p0' });
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelectorAll('h2')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Podium' })).toBeInTheDocument();
    expect(screen.getByText('Spieler-p0 is the champion!')).toBeInTheDocument();
  });

  it('gives the host Play again and everyone Back to start', async () => {
    result({ host: true, youId: 'p1' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Play again' }));
    expect(actions.rematch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Back to start' })).toBeInTheDocument();
  });

  it('gives a non-host no Play again', () => {
    result({ host: false, youId: 'p2' });
    expect(screen.queryByRole('button', { name: 'Play again' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to start' })).toBeInTheDocument();
  });

  it('throws confetti only for the champion', () => {
    const champion = result({ host: false, youId: 'p0' });
    expect(champion.container.querySelector('.confetti')).not.toBeNull();
    champion.unmount();

    const third = result({ host: false, youId: 'p2' });
    expect(third.container.querySelector('.confetti')).toBeNull();
    third.unmount();

    const watcher = result({ host: false, youId: null });
    expect(watcher.container.querySelector('.confetti')).toBeNull();
  });

  it('keeps the final bracket in a closed details element', () => {
    const { container } = result({ host: false, youId: 'p1' });
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(within(details as HTMLElement).getByText('Final bracket')).toBeInTheDocument();
  });
});
