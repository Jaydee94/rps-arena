/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { matchupFor, type Attack, type Reaction, type RoomView, type RoundResult } from '@rps/shared';
import Board from './Board.svelte';
import ClashFx from './ClashFx.svelte';
import PlayerCard from './PlayerCard.svelte';
import { reactionArt } from './fx';
import { setLocale } from '../lib/i18n';
import { resetConnectionMock, roomStore } from '../test/connection-mock';
import { makeRoom } from '../test/fixtures';

vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);

/** The elemental scenes (Task 4b): attack, its reaction, and the parts each graphic draws. */
const SCENES: { attack: Attack; reaction: Reaction; parts: string[] }[] = [
  { attack: 'burn', reaction: 'char', parts: ['burn-flame', 'burn-ember', 'burn-smoke'] },
  { attack: 'splash', reaction: 'drench', parts: ['splash-splat', 'splash-drop', 'splash-spray'] },
  { attack: 'gust', reaction: 'blow', parts: ['gust-cloud', 'gust-streak', 'gust-leaf'] },
  { attack: 'zap', reaction: 'shock', parts: ['zap-bolt', 'zap-crackle', 'zap-spark'] },
  { attack: 'absorb', reaction: 'squeeze', parts: ['absorb-ring', 'absorb-drop'] },
];
const REACTIONS: Reaction[] = [...SCENES.map((s) => s.reaction), 'extinguish'];

describe('ClashFx: elemental attacks', () => {
  for (const { attack, parts } of SCENES) {
    it(`renders the ${attack} graphic with its parts`, () => {
      const { container } = render(ClashFx, { attack, side: 'theirs' });
      const fx = container.querySelector('.fx');
      expect(fx).toHaveClass(`fx--${attack}`, 'fx--at-theirs');
      expect(fx).toHaveAttribute('aria-hidden', 'true');
      const svg = fx?.querySelector('svg.art');
      expect(svg).toHaveAttribute('viewBox', '-100 -100 200 200');
      for (const part of parts) expect(svg?.querySelector(`.${part}`), part).not.toBeNull();
    });
  }

  it('matches the generic reactions of the model (and water>fire puts the fire out)', () => {
    for (const { attack, reaction } of SCENES) {
      const winner = { burn: 'fire', splash: 'water', gust: 'air', zap: 'lightning', absorb: 'sponge' }[attack as string];
      expect(matchupFor(winner ?? '', 'rock').reaction).toBe(reaction);
    }
    expect(matchupFor('water', 'fire')).toMatchObject({ attack: 'splash', reaction: 'extinguish' });
  });
});

describe('reaction overlays: elemental', () => {
  for (const reaction of REACTIONS) {
    it(`stacks the ${reaction} overlay on the losing sticker`, () => {
      expect(reactionArt(reaction)).not.toBeNull();
      const { container } = render(PlayerCard, {
        label: 'Gegner',
        gesture: 'rock',
        side: 'theirs',
        loser: true,
        fx: { role: 'loser', className: `react-${reaction}`, reaction, attack: 'splash' },
      });
      const art = container.querySelector('.reveal-art');
      expect(art).toHaveClass(`react-${reaction}`);
      const overlay = art?.querySelector(`:scope > .${reaction}`);
      expect(overlay).toHaveAttribute('aria-hidden', 'true');
      // Decorative: the only counted gesture is the real sticker.
      expect(container.querySelectorAll('[data-gesture]')).toHaveLength(1);
    });
  }
});

describe('Board: water puts out fire', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  const waterFire: RoundResult = { picks: { a0: 'water', b0: 'fire' }, duels: [{ seats: ['a0', 'b0'], result: 'a' }], winner: 'a' };
  const room = (): RoomView =>
    makeRoom({ config: { mode: 'wheel15', bestOf: 3 }, match: { phase: 'reveal', score: { a: 1, b: 0 }, lastRound: waterFire } });

  it('draws the splash at the fire and gives the fire the extinguish reaction and overlay', () => {
    roomStore.set(room());
    render(Board);
    const struck = screen.getByRole('region', { name: 'Opponent' });
    expect(struck.querySelector('.stage > .fx')).toHaveClass('fx--splash', 'fx--at-theirs');
    const art = struck.querySelector('.reveal-art');
    expect(art).toHaveClass('react-extinguish');
    expect(art).not.toHaveClass('react-drench');
    expect(art?.querySelector('.extinguish')).not.toBeNull();
    expect(screen.getByRole('region', { name: 'You' }).querySelector('.reveal-art')).toHaveClass('attack-splash');
  });
});

describe('elemental styles', () => {
  // Read from disk: vitest replaces imported CSS with an empty string.
  const css = readFileSync(join(import.meta.dirname, '..', 'styles', 'animations.css'), 'utf8');
  const start = css.indexOf('@media (prefers-reduced-motion: no-preference)');
  const end = css.indexOf('\n}\n', start);
  const inside = css.slice(start, end);
  const outside = css.slice(0, start) + css.slice(end);
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');
  /** The bodies of the rules outside the motion block whose selector contains `needle`. */
  const staticRules = (needle: string) =>
    [...code(outside).matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => (m[1] ?? '').includes(needle)).map((m) => m[2] ?? '');

  for (const { attack, reaction } of SCENES) {
    it(`moves ${attack} / ${reaction} only inside the no-preference block`, () => {
      expect(inside).toMatch(new RegExp(`\\.fx--${attack} \\.${attack}-[a-z]+ \\{\\s*animation:`));
      expect(inside).toMatch(new RegExp(`\\.player \\.reveal-art\\.attack-${attack} \\{\\s*animation:`));
      expect(inside).toMatch(new RegExp(`@keyframes fx-${attack}-`));
      expect(inside).toMatch(new RegExp(`@keyframes fx-${reaction}-`));
      expect(outside).not.toMatch(new RegExp(`fx--${attack}|attack-${attack}`));
    });
  }

  for (const reaction of REACTIONS) {
    it(`gives react-${reaction} a still end pose outside the motion block`, () => {
      expect(inside).toMatch(new RegExp(`\\.player\\.loser \\.reveal-art\\.react-${reaction} \\{\\s*animation:`));
      const pose = staticRules(`.player.loser .reveal-art.react-${reaction}`).join('\n');
      expect(pose).toMatch(/rotate:/);
      expect(pose).toMatch(/filter:\s*saturate\(/);
      expect(staticRules(`react-${reaction}`).join('\n')).not.toMatch(/animation|transition/);
    });
  }
});
