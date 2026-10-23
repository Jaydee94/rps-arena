import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import Bracket from './Bracket.svelte';
import { setLocale } from '../lib/i18n';
import { knockout8 } from '../test/tournament-scenarios';

const card = (container: HTMLElement, id: string) => {
  const el = container.querySelector<HTMLElement>(`[data-pairing="${id}"]`);
  if (!el) throw new Error(`no card ${id}`);
  return el;
};

describe('Bracket', () => {
  beforeEach(() => setLocale('en'));

  it('shows one labelled column per knockout round, including the rounds not paired yet', () => {
    const { container } = render(Bracket, { tournament: knockout8() });
    const columns = container.querySelectorAll('[data-round]');
    expect(columns).toHaveLength(3);
    expect(screen.getByRole('list', { name: 'Round 1' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Semifinal' })).toBeInTheDocument();
    const final = screen.getByRole('list', { name: 'Final' });
    expect(within(final).getAllByText('Open')).toHaveLength(2);
    expect(within(screen.getByRole('list', { name: 'Round 1' })).getAllByRole('listitem')).toHaveLength(4);
  });

  it('is a labelled list of rounds inside its own scroll wrapper', () => {
    const { container } = render(Bracket, { tournament: knockout8() });
    const region = screen.getByRole('region', { name: 'Bracket' });
    expect(region).toHaveClass('bracket-scroll');
    expect(region.querySelector(':scope > ol')).not.toBeNull();
    expect(container.querySelectorAll('svg line, svg path[data-connector]')).toHaveLength(0);
  });

  it('labels the empty slot of a bye card', () => {
    const { container } = render(Bracket, { tournament: knockout8() });
    const bye = card(container, 'r2-2');
    expect(within(bye).getByText('Bye')).toBeInTheDocument();
    expect(within(bye).getByText('Spieler-p4')).toBeInTheDocument();
  });

  it('marks the winner with a check mark and a class, not by colour only', () => {
    const { container } = render(Bracket, { tournament: knockout8() });
    const first = card(container, 'r1-1');
    const winner = within(first).getByText('Spieler-p0').closest('.slot');
    const loser = within(first).getByText('Spieler-p1').closest('.slot');
    expect(winner).toHaveClass('winner');
    expect(winner).toHaveTextContent('✓');
    expect(within(winner as HTMLElement).getByText('Winner')).toHaveClass('sr-only');
    expect(loser).not.toHaveClass('winner');
    expect(loser).not.toHaveTextContent('✓');
    expect(first).toHaveTextContent('2');
  });

  it('highlights only the pairing in play with aria-current', () => {
    const { container } = render(Bracket, { tournament: knockout8() });
    const current = container.querySelectorAll('[aria-current="true"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(card(container, 'r2-1'));
    expect(within(card(container, 'r2-1')).getByText('Live')).toBeInTheDocument();
  });

  it('points at the next pairing during the intermission', () => {
    const { container } = render(Bracket, {
      tournament: knockout8({ phase: 'intermission', currentPairingId: 'r1-4' }),
    });
    expect(card(container, 'r2-1')).toHaveAttribute('aria-current', 'true');
    expect(within(card(container, 'r2-1')).getByText('Up next')).toBeInTheDocument();
  });

  it('shows the coin flip hint and forfeits', () => {
    const { container } = render(Bracket, { tournament: knockout8() });
    expect(within(card(container, 'r1-2')).getByText('Decided by coin flip')).toBeInTheDocument();
    expect(within(card(container, 'r1-3')).getByText('Won by forfeit')).toBeInTheDocument();
    expect(within(card(container, 'r1-4')).getByText('Both forfeited')).toBeInTheDocument();
    expect(within(card(container, 'r1-3')).getByText('Forfeited')).toBeInTheDocument();
    expect(within(card(container, 'r1-1')).queryByText('Decided by coin flip')).not.toBeInTheDocument();
  });

  it('marks the viewer', () => {
    const { container } = render(Bracket, { tournament: knockout8() });
    const you = within(card(container, 'r1-1')).getByText('Spieler-p0').closest('.slot');
    expect(you).toHaveClass('you');
    expect(within(you as HTMLElement).getByText('You')).toBeInTheDocument();
  });

  it('renders nothing but the wrapper when no pairing exists yet', () => {
    render(Bracket, { tournament: knockout8({ pairings: [], currentPairingId: null }) });
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
