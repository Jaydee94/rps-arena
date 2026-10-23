import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import StandingsTable from './StandingsTable.svelte';
import { setLocale } from '../lib/i18n';
import { roundRobin6 } from '../test/tournament-scenarios';

/** The standings row of a player (tie-break rows further down may name the same player). */
const standingRow = (name: string) => {
  const row = screen.getAllByRole('row').find((r) => within(r).queryByRole('rowheader')?.textContent?.includes(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
};

describe('StandingsTable', () => {
  beforeEach(() => setLocale('en'));

  it('is a real table with a caption and column headers', () => {
    render(StandingsTable, { tournament: roundRobin6() });
    const table = screen.getByRole('table', { name: 'Ranked by matches won, then head-to-head' });
    expect(table.querySelector('caption')).not.toBeNull();
    for (const name of ['Rank', 'Player', 'Wins', 'Losses', 'Rounds']) {
      expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument();
    }
  });

  it('lists every participant with wins, losses and rounds won:lost', () => {
    render(StandingsTable, { tournament: roundRobin6() });
    const row = screen.getByRole('row', { name: /Spieler-p3/ });
    const cells = within(row).getAllByRole('cell');
    expect(cells.map((c) => c.textContent?.trim())).toEqual(['4.', '2', '3', '5:6']);
    expect(within(row).getByRole('rowheader')).toHaveTextContent('Spieler-p3');
  });

  it('makes shared ranks visible', () => {
    render(StandingsTable, { tournament: roundRobin6() });
    // The standings rows come first; tie-break rows below name some of the same players.
    const shared = (name: string) => within(standingRow(name)).queryByText('shared');
    for (const id of ['p0', 'p1', 'p2', 'p4', 'p5']) expect(shared(`Spieler-${id}`)).toBeInTheDocument();
    expect(shared('Spieler-p3')).not.toBeInTheDocument();
  });

  it('shows tie-break matches as their own rows', () => {
    render(StandingsTable, { tournament: roundRobin6() });
    const rows = screen.getAllByRole('row').filter((r) => within(r).queryByRole('rowheader', { name: 'Tie-break' }));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Spieler-p0');
    expect(rows[0]).toHaveTextContent('1 : 0');
    expect(rows[0]).toHaveTextContent('✓');
    expect(rows[1]).toHaveTextContent('Spieler-p1');
    expect(rows[1]).toHaveTextContent('Spieler-p2');
    expect(rows[1]).not.toHaveTextContent('✓');
  });

  it('has no tie-break rows without tie-breaks', () => {
    const tournament = roundRobin6();
    tournament.pairings = tournament.pairings.filter((p) => !p.tiebreak);
    render(StandingsTable, { tournament });
    expect(screen.queryByRole('rowheader', { name: 'Tie-break' })).not.toBeInTheDocument();
  });

  it('highlights your own row', () => {
    render(StandingsTable, { tournament: roundRobin6() });
    const mine = standingRow('Spieler-p2');
    expect(mine).toHaveClass('you');
    expect(within(mine).getByText('You')).toBeInTheDocument();
    expect(standingRow('Spieler-p0')).not.toHaveClass('you');
  });
});
