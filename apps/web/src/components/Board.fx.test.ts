import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import type { RoomView, RoundResult, SeatId } from '@rps/shared';
import Board from './Board.svelte';
import { setLocale } from '../lib/i18n';
import { resetConnectionMock, roomStore } from '../test/connection-mock';
import { makeRoom } from '../test/fixtures';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

const feed = (room: RoomView) => roomStore.set(room);

function reveal(lastRound: RoundResult, you: SeatId = 'a0', team = false): RoomView {
  return makeRoom({
    you,
    ...(team ? { config: { mode: 'team2v2', bestOf: 3 } } : {}),
    match: { phase: 'reveal', score: { a: 1, b: 0 }, lastRound },
  });
}

const rockBeatsScissors: RoundResult = {
  picks: { a0: 'rock', b0: 'scissors' },
  duels: [{ seats: ['a0', 'b0'], result: 'a' }],
  winner: 'a',
};

/** The gesture sticker of a reveal side (the element that carries the effect hooks). */
const sticker = (region: HTMLElement) => region.querySelector('.reveal-art') as HTMLElement;

describe('Board matchup effects', () => {
  beforeEach(() => {
    setLocale('de');
    resetConnectionMock();
  });

  it('marks the winning sticker with the attack and the losing one with the reaction', () => {
    feed(reveal(rockBeatsScissors));
    render(Board);
    const mine = sticker(screen.getByRole('region', { name: 'Du' }));
    const theirs = sticker(screen.getByRole('region', { name: 'Gegner' }));
    expect(mine).toHaveAttribute('data-fx', 'winner');
    expect(mine).toHaveClass('attack-smash');
    expect(theirs).toHaveAttribute('data-fx', 'loser');
    expect(theirs).toHaveClass('react-crumble');
    expect(mine.className).not.toMatch(/react-/);
    expect(theirs.className).not.toMatch(/attack-/);
  });

  it('keeps the classes on the right stickers when the own side loses', () => {
    feed(reveal(rockBeatsScissors, 'b0'));
    render(Board);
    expect(sticker(screen.getByRole('region', { name: 'Du' }))).toHaveClass('react-crumble');
    expect(sticker(screen.getByRole('region', { name: 'Gegner' }))).toHaveClass('attack-smash');
  });

  it('renders the smash scene inside the struck card, centred on its sticker stage', () => {
    feed(reveal(rockBeatsScissors));
    render(Board);
    const struck = screen.getByRole('region', { name: 'Gegner' });
    const fx = struck.querySelector('.stage > .fx');
    expect(fx).toHaveClass('fx--smash');
    expect(fx).toHaveClass('fx--at-theirs');
    expect(fx).toHaveAttribute('aria-hidden', 'true');
    expect(struck).toHaveClass('struck');
    expect(screen.getByRole('region', { name: 'Du' }).querySelector('.fx')).toBeNull();
    expect(screen.getByTestId('duel').querySelectorAll('.fx')).toHaveLength(1);
  });

  it('shows the verb sentence as the rule line in German', () => {
    feed(reveal(rockBeatsScissors));
    render(Board);
    expect(screen.getByText('Stein zerquetscht Schere')).toHaveClass('rule');
  });

  it('shows the verb sentence as the rule line in English', () => {
    setLocale('en');
    feed(reveal(rockBeatsScissors));
    render(Board);
    expect(screen.getByText('Rock crushes Scissors')).toHaveClass('rule');
  });

  it('gives a draw only the clash hooks and the clash scene, no attack, reaction or sentence', () => {
    feed(
      reveal({ picks: { a0: 'rock', b0: 'rock' }, duels: [{ seats: ['a0', 'b0'], result: 'draw' }], winner: 'draw' }),
    );
    const { container } = render(Board);
    for (const name of ['Du', 'Gegner']) {
      const art = sticker(screen.getByRole('region', { name }));
      expect(art).toHaveAttribute('data-fx', 'draw');
      expect(art).toHaveClass('fx-clash');
      expect(art.className).not.toMatch(/attack-|react-/);
    }
    expect(container.querySelectorAll('.fx')).toHaveLength(1);
    expect(container.querySelector('.fx-centre > .fx')).toHaveClass('fx--clash', 'fx--at-centre');
    expect(container.querySelector('.rule')).toBeNull();
  });

  it('gives a draw the clash slot at the centre of the panel, and a decided duel none', () => {
    feed(
      reveal({ picks: { a0: 'rock', b0: 'rock' }, duels: [{ seats: ['a0', 'b0'], result: 'draw' }], winner: 'draw' }),
    );
    const { unmount } = render(Board);
    const slot = screen.getByTestId('duel').querySelector(':scope > .fx-centre');
    expect(slot).not.toBeNull();
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    expect(slot?.querySelector(':scope > .fx.fx--clash.fx--at-centre')).not.toBeNull();
    unmount();

    feed(reveal(rockBeatsScissors));
    render(Board);
    expect(screen.getByTestId('duel').querySelector('.fx-centre')).toBeNull();
  });

  it('shows no scene, hooks or sentence when a pick is missing', () => {
    feed(reveal({ picks: { a0: 'rock' }, duels: [{ seats: ['a0', 'b0'], result: 'a' }], winner: 'a' }));
    const { container } = render(Board);
    expect(container.querySelector('.fx')).toBeNull();
    expect(container.querySelector('[data-fx]')).toBeNull();
    expect(container.querySelector('.rule')).toBeNull();
    expect(container.textContent).not.toContain('undefined');
  });

  it('renders one scene per duel in 2v2 with the classes of that duel', () => {
    feed(
      reveal(
        {
          picks: { a0: 'rock', b0: 'scissors', a1: 'paper', b1: 'scissors' },
          duels: [
            { seats: ['a0', 'b0'], result: 'a' },
            { seats: ['a1', 'b1'], result: 'b' },
          ],
          winner: 'draw',
        },
        'a0',
        true,
      ),
    );
    render(Board);
    const [first, second] = screen.getAllByTestId('duel') as [HTMLElement, HTMLElement];
    expect(first.querySelectorAll('.fx')).toHaveLength(1);
    expect(first.querySelector('.fx')).toHaveClass('fx--smash');
    expect(sticker(within(first).getByRole('region', { name: 'Spieler-a0' }))).toHaveClass('attack-smash');
    expect(sticker(within(first).getByRole('region', { name: 'Spieler-b0' }))).toHaveClass('react-crumble');
    // Scissors cut paper: the slash scene does not exist yet, the hooks do.
    expect(sticker(within(second).getByRole('region', { name: 'Spieler-b1' }))).toHaveClass('attack-slash');
    expect(sticker(within(second).getByRole('region', { name: 'Spieler-a1' }))).toHaveClass('react-split');
    expect(screen.getByText('Stein zerquetscht Schere')).toBeInTheDocument();
    expect(screen.getByText('Schere zerschneidet Papier')).toBeInTheDocument();
  });

  // jsdom applies no CSS: this pins the hooks the static end pose rules (animations.css, FX static) select.
  it('renders the hooks and shards the static end pose is drawn from', () => {
    feed(reveal(rockBeatsScissors));
    render(Board);
    const theirs = sticker(screen.getByRole('region', { name: 'Gegner' }));
    expect(theirs).toHaveClass('react-crumble');
    expect(theirs.querySelector('.crumble')).not.toBeNull();
    expect(sticker(screen.getByRole('region', { name: 'Du' }))).toHaveClass('attack-smash');
  });

  it('keeps exactly one data-gesture per side (the shards are decorative copies)', () => {
    feed(reveal(rockBeatsScissors));
    render(Board);
    expect(screen.getByRole('region', { name: 'Gegner' }).querySelectorAll('[data-gesture]')).toHaveLength(1);
  });

  it('falls back to the generic sentence for a pair without a verb', () => {
    // A made-up pairing that has no rule.<winner>.<loser> key (the server never sends it).
    feed(reveal({ picks: { a0: 'scissors', b0: 'rock' }, duels: [{ seats: ['a0', 'b0'], result: 'a' }], winner: 'a' }));
    render(Board);
    expect(screen.getByText('Schere schlägt Stein')).toHaveClass('rule');
  });
});
