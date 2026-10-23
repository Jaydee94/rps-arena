/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import type { Attack } from '@rps/shared';
import ClashFx from '../ClashFx.svelte';
import { reactionArt } from './index';

/** The physical scenes (Task 4a): attack, reaction, and whether the reaction draws overlay art. */
const SCENES: { attack: Attack; reaction: string; overlay: boolean }[] = [
  { attack: 'slash', reaction: 'split', overlay: true },
  { attack: 'wrap', reaction: 'fold', overlay: true },
  { attack: 'shoot', reaction: 'perforate', overlay: true },
  { attack: 'bite', reaction: 'chomp', overlay: true },
  { attack: 'punch', reaction: 'knockback', overlay: false },
];

// Read from disk: vitest replaces imported CSS with an empty string.
const css = readFileSync(join(import.meta.dirname, '../../styles/animations.css'), 'utf8');
const motionStart = css.indexOf('@media (prefers-reduced-motion: no-preference)');
const staticStart = css.indexOf('==== FX static end poses ====');
const motion = css.slice(motionStart, staticStart);
const statics = css.slice(staticStart);
const section = (text: string, marker: string) => {
  const start = text.indexOf(marker);
  const next = text.indexOf('/* ---- fx', start + marker.length);
  return text.slice(start, next < 0 ? undefined : next);
};

describe('physical matchup scenes', () => {
  for (const { attack, reaction, overlay } of SCENES) {
    it(`renders the ${attack} graphic`, () => {
      const { container } = render(ClashFx, { attack, side: 'theirs' });
      const fx = container.querySelector('.fx');
      expect(fx).toHaveClass(`fx--${attack}`, 'fx--at-theirs');
      expect(fx?.querySelector(`svg.art [class*="${attack}-"]`)).not.toBeNull();
    });

    it(`draws the ${reaction} overlay from decorative copies of the sticker`, () => {
      const Art = reactionArt(reaction);
      expect(Art !== null).toBe(overlay);
      if (!Art) return;
      const { container } = render(Art, { gesture: 'paper', size: 138 });
      const root = container.querySelector(`.${reaction}`);
      expect(root).toHaveAttribute('aria-hidden', 'true');
      // Copies never count as a pick.
      expect(container.querySelector('[data-gesture]')).toBeNull();
    });

    it(`moves ${attack} / ${reaction} only with motion allowed, and rests in a static end pose`, () => {
      const scene = section(motion, `/* ---- fx: ${attack} / ${reaction} ---- */`);
      expect(scene).toMatch(new RegExp(`\\.player \\.reveal-art\\.attack-${attack}\\s*\\{[^}]*animation:`));
      expect(scene).toMatch(new RegExp(`\\.fx--${attack} \\.${attack}-`));
      expect(scene).toMatch(new RegExp(`\\.player\\.loser \\.reveal-art\\.react-${reaction}\\s*\\{[^}]*animation:`));
      expect(scene).toMatch(new RegExp(`@keyframes fx-${attack}-`));
      expect(scene).toMatch(new RegExp(`@keyframes fx-${reaction}-`));

      const pose = section(statics, `/* ---- fx static: ${attack} / ${reaction} ---- */`);
      expect(pose).toMatch(new RegExp(`\\.player\\.loser \\.reveal-art\\.react-${reaction}\\s*\\{[^}]*rotate:`));
      expect(pose.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/animation|transition/);
    });
  }
});

// The cover reaction (paper's wins): drawn in the wrap / fold sub-sections, with motion and a static pose.
describe('cover reaction', () => {
  it('lays a decorative sheet over the sticker', () => {
    const Art = reactionArt('cover');
    if (!Art) throw new Error('react-cover missing');
    const { container } = render(Art, { gesture: 'rock', size: 138 });
    expect(container.querySelector('.cover')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.cover .cover-sheet')).not.toBeNull();
    expect(container.querySelectorAll('.cover .cover-curl')).toHaveLength(2);
    expect(container.querySelector('[data-gesture]')).toBeNull();
  });

  it('moves only with motion allowed, and rests covered in a static end pose', () => {
    const scene = section(motion, '/* ---- fx: wrap / fold ---- */');
    expect(scene).toMatch(/\.player\.loser \.reveal-art\.react-cover\s*\{[^}]*animation:/);
    expect(scene).toMatch(/\.react-cover \.cover-sheet\s*\{[^}]*animation:/);
    expect(scene).toMatch(/@keyframes fx-cover-sheet/);
    const pose = section(statics, '/* ---- fx static: wrap / fold ---- */');
    expect(pose).toMatch(/\.player\.loser \.reveal-art\.react-cover\s*\{[^}]*rotate:/);
    expect(pose).toMatch(/\.react-cover \.cover-sheet/);
  });
});

/** The numbers of an SVG `transform` function, e.g. `translate(-47 17)` -> [-47, 17]. */
const fn = (el: Element | null, name: string): number[] => {
  const m = new RegExp(`${name}\\(([^)]*)\\)`).exec(el?.getAttribute('transform') ?? '');
  return m ? (m[1] ?? '').split(/[\s,]+/).map(Number) : [];
};
const turn = ([x = 0, y = 0]: number[], deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};
const source = (file: string) => readFileSync(join(import.meta.dirname, file), 'utf8');

describe('physical scenes: where the art lands on screen', () => {
  // The opponent's sticker is mirrored and tilted 14deg, the own one tilted -10deg: on screen the cut must rise
  // to the right on both cards, across the line to the attacker (top left / bottom right, or left / right in
  // 2v2), so the swoosh along it is not hidden behind the sticker and the burst.
  it('cuts the split along a line that rises to the right on screen on both cards', () => {
    const Art = reactionArt('split');
    if (!Art) throw new Error('react-split missing');
    const { container } = render(Art, { gesture: 'paper', size: 138 });
    const slope = (side: string) => {
      const line = container.querySelector(`.split-edge .split-cut--${side}`);
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => Number(line?.getAttribute(a)));
      return Math.atan2((y2 ?? 0) - (y1 ?? 0), (x2 ?? 0) - (x1 ?? 0)) * (180 / Math.PI);
    };
    // Sticker space -> screen: own card rotate(-10deg); opponent's card mirror x, then rotate(14deg).
    const mine = slope('mine') - 10;
    const theirs = 180 - slope('theirs') + 14;
    for (const deg of [mine, theirs]) expect(((deg % 180) + 180) % 180, `screen angle ${deg}`).toBeGreaterThan(120);
    for (const deg of [mine, theirs]) expect(((deg % 180) + 180) % 180).toBeLessThan(150);
    // The upper half slides down the cut: down left on screen, i.e. right in the opponent's mirrored space.
    const high = container.querySelector<HTMLElement>('.split-half--high');
    expect(parseFloat(high?.style.getPropertyValue('--sx-mine') ?? '')).toBeLessThan(0);
    expect(parseFloat(high?.style.getPropertyValue('--sx-theirs') ?? '')).toBeGreaterThan(0);
    expect(source('react-split.svelte')).toMatch(/:global\(\.theirs\) \.split-half--high\s*\{[^}]*clip-path/);
  });

  it('runs the slash swoosh along that on-screen cut, one per card, unmirrored', () => {
    for (const side of ['mine', 'theirs'] as const) {
      const { container, unmount } = render(ClashFx, { attack: 'slash', side });
      expect(container.querySelectorAll('.slash-cut')).toHaveLength(2);
      const [deg = 0] = fn(container.querySelector(`.slash-cut--${side}`), 'rotate');
      expect(deg).toBeGreaterThanOrEqual(-60);
      expect(deg).toBeLessThanOrEqual(-30);
      unmount();
    }
    const css = source('slash.svelte');
    expect(css).not.toMatch(/scale:\s*-1/);
    expect(css).toMatch(/:global\(\.fx--at-mine\) \.slash-cut--theirs/);
    expect(css).toMatch(/:global\(\.fx--at-theirs\) \.slash-cut--mine/);
  });

  // In the art's own frame the opponent's name tag lies below (y > 50) and the panel edge to the right
  // (x > 50); for the own card (art turned round, or its own swoosh) they lie above and to the left.
  const clear = (side: 'mine' | 'theirs', [x, y]: [number, number]) =>
    side === 'theirs' ? x <= 50 && y <= 50 : x >= -50 && y >= -50;

  it('keeps the slash sparks clear of the name tag and the panel edge on both cards', () => {
    for (const side of ['mine', 'theirs'] as const) {
      const { container, unmount } = render(ClashFx, { attack: 'slash', side });
      const cut = container.querySelector(`.slash-cut--${side}`);
      const [deg = 0] = fn(cut, 'rotate');
      const spots = [...(cut?.querySelectorAll('.slash-spot') ?? [])];
      expect(spots.length).toBeGreaterThan(0);
      for (const spot of spots) {
        const at = turn(fn(spot, 'translate'), deg);
        expect(clear(side, at), `${side} spark at ${at.map(Math.round).join(',')}`).toBe(true);
      }
      unmount();
    }
  });

  it('keeps the shoot splinters and the punch stars clear of the name tag and the panel edge on both cards', () => {
    const { container } = render(ClashFx, { attack: 'shoot', side: 'theirs' });
    const bits = [...container.querySelectorAll('.shoot-spot')];
    expect(bits.length).toBeGreaterThan(0);
    for (const spot of bits) {
      const [x = 0, y = 0] = fn(spot, 'translate');
      const bit = spot.querySelector<SVGElement>('.shoot-bit');
      const end: [number, number] = [x + parseFloat(bit?.style.getPropertyValue('--dx') ?? ''), y + parseFloat(bit?.style.getPropertyValue('--dy') ?? '')];
      // The art is turned round (scale -1 -1) for the own card.
      expect(clear('theirs', end) && clear('mine', [-end[0], -end[1]]), `splinter ends at ${end.join(',')}`).toBe(true);
    }
    const punch = render(ClashFx, { attack: 'punch', side: 'theirs' }).container;
    const stars = [...punch.querySelectorAll('.punch-spot')];
    expect(stars.length).toBeGreaterThan(0);
    for (const spot of stars) {
      const [x = 0, y = 0] = fn(spot, 'translate');
      expect(clear('theirs', [x, y]) && clear('mine', [-x, -y]), `star at ${x},${y}`).toBe(true);
    }
  });

  // The attacker sits top left (1v1) or left (2v2) of the opponent's sticker: a fist landing below the centre
  // comes in from the lower left, off both axes, so the burst between the stickers does not hide it.
  it('lands the punch below the line to the attacker in both layouts', () => {
    const { container } = render(ClashFx, { attack: 'punch', side: 'theirs' });
    const [x = 0, y = 0] = fn(container.querySelector('.punch-impact'), 'translate');
    expect(x).toBeLessThan(0);
    expect(y).toBeGreaterThan(0);
  });
});
