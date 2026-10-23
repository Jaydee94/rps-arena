import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Board from './Board.svelte';
import Spectate from './Spectate.svelte';
import TournamentHeader from './TournamentHeader.svelte';
import { setLocale } from '../lib/i18n';
import { resetConnectionMock, roomStore } from '../test/connection-mock';
import { makePairing, makeRoom, makeSpectatorRoom, makeTournament } from '../test/fixtures';
import { knockout8 } from '../test/tournament-scenarios';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

/** A round robin of 4 (6 pairings) with the third one running. */
function roundRobin4() {
  const ids = [
    ['p0', 'p1'],
    ['p2', 'p3'],
    ['p0', 'p2'],
    ['p1', 'p3'],
    ['p0', 'p3'],
    ['p1', 'p2'],
  ] as const;
  return makeTournament({
    n: 4,
    format: 'roundrobin',
    phase: 'match',
    pairings: ids.map(([a, b], i) => makePairing({ id: `r${Math.floor(i / 2) + 1}-${(i % 2) + 1}`, round: Math.floor(i / 2) + 1, a, b })),
    currentPairingId: 'r2-1',
  });
}

const header = () => screen.getByRole('complementary', { name: 'Tournament' });
/** The bar line of the header (the folded bracket below names the rounds too). */
const bar = () => header().querySelector('.bar') as HTMLElement;

describe('TournamentHeader', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  it('shows the format, the knockout round and the two names of the running pairing', () => {
    render(TournamentHeader, { tournament: knockout8() });
    expect(within(bar()).getByText('Knockout')).toBeInTheDocument();
    expect(within(bar()).getByText('Semifinal')).toBeInTheDocument();
    expect(within(bar()).getByText('Spieler-p0 vs Spieler-p3')).toBeInTheDocument();
  });

  it('says Round n for an early knockout round', () => {
    render(TournamentHeader, { tournament: knockout8({ currentPairingId: 'r1-1' }) });
    expect(within(bar()).getByText('Round 1')).toBeInTheDocument();
  });

  it('counts the matches of a round robin', () => {
    render(TournamentHeader, { tournament: roundRobin4() });
    expect(within(bar()).getByText('Round robin')).toBeInTheDocument();
    expect(within(bar()).getByText('Match 3 of 6')).toBeInTheDocument();
    expect(within(bar()).getByText('Spieler-p0 vs Spieler-p2')).toBeInTheDocument();
  });

  it('keeps the bracket in a details element that is closed by default', async () => {
    const { container } = render(TournamentHeader, { tournament: knockout8() });
    const details = container.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText('Bracket', { selector: 'summary' })).toBeInTheDocument();
    await userEvent.setup().click(within(details).getByText('Bracket', { selector: 'summary' }));
    expect(details.open).toBe(true);
    expect(within(details).getByRole('region', { name: 'Bracket' })).toBeInTheDocument();
  });

  it('keeps the table in the details element of a round robin', () => {
    const { container } = render(TournamentHeader, { tournament: roundRobin4() });
    const details = container.querySelector('details') as HTMLDetailsElement;
    expect(within(details).getByText('Standings', { selector: 'summary' })).toBeInTheDocument();
    expect(within(details).getByRole('table', { hidden: true })).toBeInTheDocument();
  });
});

describe('the tournament header on Board and Spectate', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  it('sits above the board in a tournament room, outside the one main', () => {
    roomStore.set(makeRoom({ match: { phase: 'pick' }, tournament: knockout8() }));
    const { container } = render(Board);
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(header().closest('main')).toBeNull();
    expect(header().compareDocumentPosition(container.querySelector('main') as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is absent from a duel board', () => {
    roomStore.set(makeRoom({ match: { phase: 'pick' } }));
    render(Board);
    expect(screen.queryByRole('complementary', { name: 'Tournament' })).not.toBeInTheDocument();
  });

  it('sits above the spectate screen in a tournament room', () => {
    roomStore.set(makeSpectatorRoom({ me: { id: 'p5' }, match: { phase: 'pick' }, tournament: knockout8({ youId: 'p5' }) }));
    const { container } = render(Spectate);
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(within(bar()).getByText('Semifinal')).toBeInTheDocument();
  });

  it('is absent from duel spectating', () => {
    roomStore.set(makeSpectatorRoom({ match: { phase: 'pick' } }));
    render(Spectate);
    expect(screen.queryByRole('complementary', { name: 'Tournament' })).not.toBeInTheDocument();
  });
});
