import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import type { RoundResult, SpectatorView } from '@rps/shared';
import Spectate from './Spectate.svelte';
import { setLocale } from '../lib/i18n';
import { resetConnectionMock, roomStore } from '../test/connection-mock';
import { makeSpectatorRoom } from '../test/fixtures';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

const feed = (room: SpectatorView) => roomStore.set(room);
const reveal = (lastRound: RoundResult, team = false) =>
  makeSpectatorRoom({
    ...(team ? { config: { mode: 'team2v2', bestOf: 3 } } : {}),
    match: { phase: 'reveal', score: { a: 1, b: 0 }, lastRound },
  });
const sticker = (region: HTMLElement) => region.querySelector('.reveal-art') as HTMLElement;

describe('Spectate matchup effects (shared RevealPanel)', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  it('plays the smash scene and shows the verb sentence', () => {
    feed(reveal({ picks: { a0: 'rock', b0: 'scissors' }, duels: [{ seats: ['a0', 'b0'], result: 'a' }], winner: 'a' }));
    render(Spectate);
    expect(sticker(screen.getByRole('region', { name: 'Spieler-a0' }))).toHaveClass('attack-smash');
    expect(sticker(screen.getByRole('region', { name: 'Spieler-b0' }))).toHaveClass('react-crumble');
    expect(screen.getByTestId('duel').querySelector('.fx--smash')).not.toBeNull();
    expect(screen.getByText('Rock crushes Scissors')).toHaveClass('rule');
  });

  it('shows the German sentence in German', () => {
    setLocale('de');
    feed(reveal({ picks: { a0: 'scissors', b0: 'rock' }, duels: [{ seats: ['a0', 'b0'], result: 'b' }], winner: 'b' }));
    render(Spectate);
    expect(sticker(screen.getByRole('region', { name: 'Spieler-b0' }))).toHaveClass('attack-smash');
    expect(screen.getByText('Stein zerquetscht Schere')).toBeInTheDocument();
  });

  it('shows no sentence or scene for a draw and for a missing pick', () => {
    feed(reveal({ picks: { a0: 'rock', b0: 'rock' }, duels: [{ seats: ['a0', 'b0'], result: 'draw' }], winner: 'draw' }));
    const { container, unmount } = render(Spectate);
    expect(container.querySelector('.rule')).toBeNull();
    expect(container.querySelector('.fx')).toBeNull();
    expect(container.querySelectorAll('[data-fx="draw"]')).toHaveLength(2);
    unmount();

    feed(reveal({ picks: { a0: 'rock' }, duels: [{ seats: ['a0', 'b0'], result: 'a' }], winner: 'a' }));
    const second = render(Spectate);
    expect(second.container.querySelector('.rule')).toBeNull();
    expect(second.container.querySelector('.fx')).toBeNull();
    expect(second.container.querySelector('[data-fx]')).toBeNull();
  });

  it('renders two scenes in 2v2', () => {
    feed(
      reveal(
        {
          picks: { a0: 'rock', b0: 'scissors', a1: 'scissors', b1: 'rock' },
          duels: [
            { seats: ['a0', 'b0'], result: 'a' },
            { seats: ['a1', 'b1'], result: 'b' },
          ],
          winner: 'draw',
        },
        true,
      ),
    );
    render(Spectate);
    const [first, second] = screen.getAllByTestId('duel') as [HTMLElement, HTMLElement];
    expect(first.querySelector('.fx--smash.fx--at-theirs')).not.toBeNull();
    expect(second.querySelector('.fx--smash.fx--at-mine')).not.toBeNull();
    expect(sticker(within(second).getByRole('region', { name: 'Spieler-a1' }))).toHaveClass('react-crumble');
    expect(screen.getAllByText('Rock crushes Scissors')).toHaveLength(2);
  });
});
