/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import { matchupFor, type Attack, type Reaction, type RoomView, type RoundResult, type SeatId } from '@rps/shared';
import Board from '../Board.svelte';
import ClashFx from '../ClashFx.svelte';
import PlayerCard from '../PlayerCard.svelte';
import { reactionArt } from './index';
import { setLocale } from '../../lib/i18n';
import { resetConnectionMock, roomStore } from '../../test/connection-mock';
import { makeRoom } from '../../test/fixtures';

vi.mock('../../lib/connection', async () => (await import('../../test/connection-mock')).connectionMock);

/** The "other" group (Task 4c): attack, its reaction, a part of the graphic, a part of the overlay, a real pair. */
const SCENES: { attack: Attack; reaction: Reaction; part: string; overlay: string; winner: string; loser: string }[] = [
  { attack: 'curse', reaction: 'hexed', part: '.curse-ring', overlay: '.hexed-veil', winner: 'devil', loser: 'human' },
  { attack: 'poison', reaction: 'wobble', part: '.poison-splat', overlay: '.wobble-slime', winner: 'lizard', loser: 'spock' },
  { attack: 'entangle', reaction: 'bind', part: '.entangle-vine', overlay: '.bind-band', winner: 'tree', loser: 'water' },
];

function reveal(lastRound: RoundResult, you: SeatId = 'a0', team = false): RoomView {
  return makeRoom({
    you,
    ...(team ? { config: { mode: 'team2v2', bestOf: 3 } } : {}),
    match: { phase: 'reveal', score: { a: 1, b: 0 }, lastRound },
  });
}

const sticker = (region: HTMLElement) => region.querySelector('.reveal-art') as HTMLElement;

describe('other matchup scenes (curse, poison, entangle, clash)', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  it('uses the pairs it checks', () => {
    for (const s of SCENES) expect(matchupFor(s.winner, s.loser)).toMatchObject({ attack: s.attack, reaction: s.reaction });
  });

  for (const s of SCENES) {
    it(`renders the ${s.attack} graphic`, () => {
      const { container } = render(ClashFx, { attack: s.attack, side: 'theirs' });
      const fx = container.querySelector(`.fx.fx--${s.attack}`);
      expect(fx).not.toBeNull();
      expect(fx?.querySelector(`svg.art ${s.part}`)).not.toBeNull();
    });

    it(`gives the ${s.reaction} reaction an overlay that stays decorative and copies no sticker`, () => {
      expect(reactionArt(s.reaction)).not.toBeNull();
      const fx = { role: 'loser' as const, className: `react-${s.reaction}`, reaction: s.reaction, attack: s.attack };
      const { container } = render(PlayerCard, { label: 'Gegner', gesture: s.loser, side: 'theirs', loser: true, fx });
      const art = container.querySelector('.reveal-art') as HTMLElement;
      const overlay = art.querySelector(`:scope > .${s.reaction}`);
      expect(overlay).toHaveAttribute('aria-hidden', 'true');
      expect(overlay?.querySelector(s.overlay)).not.toBeNull();
      // Only the real sticker carries data-gesture (counted by other tests and the e2e suite).
      expect(container.querySelectorAll('[data-gesture]')).toHaveLength(1);
      expect(container.querySelector('.stage > .fx')).toHaveClass(`fx--${s.attack}`);
    });

    it(`puts the ${s.attack} hooks on a real ${s.winner} vs ${s.loser} reveal`, () => {
      roomStore.set(
        reveal({ picks: { a0: s.loser, b0: s.winner }, duels: [{ seats: ['a0', 'b0'], result: 'b' }], winner: 'b' }),
      );
      render(Board);
      const mine = screen.getByRole('region', { name: 'You' });
      expect(sticker(screen.getByRole('region', { name: 'Opponent' }))).toHaveClass(`attack-${s.attack}`);
      expect(sticker(mine)).toHaveClass(`react-${s.reaction}`);
      expect(mine.querySelector(`.stage > .fx.fx--${s.attack}.fx--at-mine`)).not.toBeNull();
      expect(sticker(mine).querySelector(`.${s.reaction}`)).not.toBeNull();
    });
  }

  it('renders the clash scene only in the drawn duel of a 2v2 round', () => {
    roomStore.set(
      reveal(
        {
          picks: { a0: 'rock', b0: 'rock', a1: 'paper', b1: 'scissors' },
          duels: [
            { seats: ['a0', 'b0'], result: 'draw' },
            { seats: ['a1', 'b1'], result: 'b' },
          ],
          winner: 'b',
        },
        'a0',
        true,
      ),
    );
    render(Board);
    const [first, second] = screen.getAllByTestId('duel') as [HTMLElement, HTMLElement];
    expect(first.querySelectorAll('.fx')).toHaveLength(1);
    expect(first.querySelector(':scope > .fx-centre > .fx')).toHaveClass('fx--clash', 'fx--at-centre');
    for (const art of first.querySelectorAll('.reveal-art')) expect(art).toHaveClass('fx-clash');
    expect(second.querySelector('.fx-centre')).toBeNull();
    expect(second.querySelector('.fx--clash')).toBeNull();
    expect(within(second).getAllByRole('region')).toHaveLength(2);
  });
});

describe('other matchup styles', () => {
  const css = readFileSync(join(import.meta.dirname, '..', '..', 'styles', 'animations.css'), 'utf8');
  const start = css.indexOf('@media (prefers-reduced-motion: no-preference)');
  const end = css.indexOf('\n}\n', start);
  const inside = css.slice(start, end);
  const outside = css.slice(0, start) + css.slice(end);
  const section = (text: string, marker: string) => {
    const from = text.indexOf(marker);
    const next = text.indexOf('/* ---- fx', from + marker.length);
    return text.slice(from, next < 0 ? undefined : next);
  };

  for (const s of SCENES) {
    it(`keeps the ${s.attack} / ${s.reaction} motion in its own section of the no-preference block`, () => {
      const motion = section(inside, `/* ---- fx: ${s.attack} / ${s.reaction} ---- */`);
      expect(motion).toContain(`.fx--${s.attack} `);
      expect(motion).toContain(`.attack-${s.attack}`);
      expect(motion).toContain(`.react-${s.reaction}`);
      expect(motion).toMatch(new RegExp(`@keyframes fx-${s.attack}-`));
      expect(motion).toMatch(new RegExp(`@keyframes fx-${s.reaction}-`));
    });

    it(`gives ${s.reaction} a still end pose of its own`, () => {
      const pose = section(outside, `/* ---- fx static: ${s.attack} / ${s.reaction} ---- */`);
      expect(pose).toContain(`.player.loser .reveal-art.react-${s.reaction} {`);
      expect(pose).toMatch(/rotate:/);
      expect(pose).toMatch(/filter:\s*saturate\(/);
      expect(pose).not.toMatch(/animation|transition|@keyframes/);
    });
  }

  it('bounces both draw stickers apart and draws the clash only while motion is allowed', () => {
    const motion = section(inside, '/* ---- fx: clash ---- */');
    expect(motion).toMatch(/\.reveal-art\.fx-clash\s*\{\s*animation:/);
    expect(motion).toContain('.fx--clash ');
    expect(motion).toMatch(/@keyframes fx-clash-bounce/);
    expect(outside).not.toMatch(/fx-clash|fx--clash/);
  });
});
