/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { Reaction, RoomView, RoundResult } from '@rps/shared';
import Board from '../Board.svelte';
import ClashFx from '../ClashFx.svelte';
import PlayerCard from '../PlayerCard.svelte';
import { setLocale } from '../../lib/i18n';
import { resetConnectionMock, roomStore } from '../../test/connection-mock';
import { makeRoom } from '../../test/fixtures';

vi.mock('../../lib/connection', async () => (await import('../../test/connection-mock')).connectionMock);

/*
 * Tuning round B: the parts that make absorb, burn, gust, slash and the char / squeeze / hexed end poses read,
 * and the 2v2 aim hook of the aimed scenes.
 */

const css = readFileSync(join(import.meta.dirname, '..', '..', 'styles', 'animations.css'), 'utf8');
const start = css.indexOf('@media (prefers-reduced-motion: no-preference)');
const end = css.indexOf('\n}\n', start);
const inside = css.slice(start, end);
const outside = (css.slice(0, start) + css.slice(end)).replace(/\/\*[\s\S]*?\*\//g, '');
/** The body of the one static rule with exactly this selector. */
const staticRule = (selector: string): string => {
  const rule = [...outside.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => (m[1] ?? '').trim() === selector);
  return rule?.[2] ?? '';
};
const source = (file: string): string => readFileSync(join(import.meta.dirname, file), 'utf8');

function overlay(reaction: Reaction, gesture = 'paper'): Element {
  const { container } = render(PlayerCard, {
    label: 'Gegner',
    gesture,
    side: 'theirs',
    loser: true,
    fx: {
      role: 'loser',
      className: `react-${reaction}`,
      reaction,
      attack: 'burn',
    },
  });
  const art = container.querySelector(`.reveal-art > .${reaction}`);
  expect(art).not.toBeNull();
  return art as Element;
}

describe('absorb: juice streams round the burst', () => {
  it('draws two juice streams and drops that carry the stops of their arc', () => {
    const { container } = render(ClashFx, { attack: 'absorb', side: 'theirs' });
    expect(container.querySelectorAll('.absorb-set--narrow .absorb-stream')).toHaveLength(2);
    const drops = [...container.querySelectorAll<SVGElement>('.absorb-aim .absorb-drop')];
    expect(drops.length).toBeGreaterThanOrEqual(6);
    for (const drop of drops) {
      for (const v of ['--x4', '--y4', '--r0', '--r4', '--s', '--d'])
        expect(drop.style.getPropertyValue(v), v).not.toBe('');
    }
  });

  it('passes the stops of a drop as style directives, not a composed style string', () => {
    const { container } = render(ClashFx, { attack: 'absorb', side: 'theirs' });
    const drop = container.querySelector<SVGElement>('.absorb-set--narrow .absorb-drop');
    const values = ['--s', '--d', '--x1', '--y1', '--x4', '--y4', '--r0', '--r2', '--r4'].map((v) =>
      drop?.style.getPropertyValue(v),
    );
    expect(values).toEqual(['1.8', '0ms', '39.1px', '39.8px', '158.0px', '0.0px', '53.7deg', '0.0deg', '-53.0deg']);
    expect(source('absorb.svelte')).not.toMatch(/\bstyle\s*=/);
  });

  it('runs the drops along those stops in the motion block', () => {
    expect(inside).toMatch(/\.fx--absorb \.absorb-stream \{\s*animation: fx-absorb-stream/);
    expect(inside).toMatch(/@keyframes fx-absorb-drop \{[\s\S]*?translate: var\(--x2\) var\(--y2\)/);
  });
});

describe('char: fire in front of the sticker, a charred end pose', () => {
  it('stacks flames, a ragged burnt rim, embers and smoke on the struck sticker', () => {
    const char = overlay('char');
    expect(char.querySelectorAll('.char-fire .char-flame').length).toBeGreaterThanOrEqual(3);
    expect(char.querySelector('.char-rim')).not.toBeNull();
    expect(char.querySelectorAll('.char-ember').length).toBeGreaterThan(0);
    expect(char.querySelectorAll('.char-wisp')).toHaveLength(2);
  });

  it('lets the flames flicker only while motion is allowed and puts them out in the end pose', () => {
    expect(inside).toMatch(/\.react-char \.char-flame \{\s*animation: fx-char-flame/);
    expect(staticRule('.react-char .char-flame')).toMatch(/opacity:\s*0;/);
  });

  it('draws the burn smoke dark, so it shows on the light panel half', () => {
    expect(source('burn.svelte')).toMatch(/class="line burn-smoke"/);
  });
});

describe('squeeze: wrung narrow, pinched and crumpled', () => {
  it('stacks pinch marks and crumpled rim creases on the struck sticker', () => {
    const squeeze = overlay('squeeze');
    expect(squeeze.querySelectorAll('.squeeze-twist')).toHaveLength(4);
    expect(squeeze.querySelectorAll('.squeeze-crease').length).toBeGreaterThan(0);
  });

  it('ends squashed narrower than it is tall', () => {
    const scale = staticRule('.player.loser .reveal-art.react-squeeze').match(/scale:\s*([\d.]+)\s+([\d.]+)/);
    expect(scale).not.toBeNull();
    expect(Number(scale?.[1])).toBeLessThan(Number(scale?.[2]) - 0.08);
  });
});

describe('hexed: a sealed end pose with rune marks', () => {
  it('brands rune marks and a seal into the circling star layer (so the motion is unchanged)', () => {
    const hexed = overlay('hexed', 'rock');
    const orbit = hexed.querySelector('.hexed-orbit');
    expect(orbit?.querySelector('.hexed-seal')).not.toBeNull();
    expect(orbit?.querySelectorAll('.hexed-rune')).toHaveLength(5);
  });
});

describe('blow: a visible trace', () => {
  it('leaves bold swoosh marks and a wind curl on the blown sticker', () => {
    expect(overlay('blow', 'rock').querySelectorAll('.blow-line')).toHaveLength(4);
  });
});

describe('2v2 aim of the aimed scenes', () => {
  beforeEach(() => {
    setLocale('en');
    resetConnectionMock();
  });

  for (const [file, part] of [
    ['gust.svelte', 'gust-aim'],
    ['absorb.svelte', 'absorb-aim'],
  ] as const) {
    it(`${file} turns .${part} for the side-by-side 2v2 panel`, () => {
      const text = source(file);
      expect(text).toMatch(new RegExp(`:global\\(\\.compact \\.fx--at-mine\\) \\.${part} \\{\\s*rotate: \\d+deg`));
      expect(text).toMatch(new RegExp(`:global\\(\\.compact \\.fx--at-theirs\\) \\.${part} \\{\\s*rotate: \\d+deg`));
    });
  }

  it('renders the effect frame of a 2v2 duel inside a compact player card (the hook the aim reads)', () => {
    const lastRound: RoundResult = {
      picks: { a0: 'air', b0: 'rock', a1: 'paper', b1: 'paper' },
      duels: [
        { seats: ['a0', 'b0'], result: 'a' },
        { seats: ['a1', 'b1'], result: 'draw' },
      ],
      winner: 'a',
    };
    const room: RoomView = makeRoom({
      config: { mode: 'team2v2', bestOf: 3 },
      match: { phase: 'reveal', score: { a: 1, b: 0 }, lastRound },
    });
    roomStore.set(room);
    render(Board);
    const [first] = screen.getAllByTestId('duel');
    const fx = first?.querySelector('.fx.fx--gust.fx--at-theirs');
    expect(fx).not.toBeNull();
    expect(fx?.closest('.player')).toHaveClass('compact');
  });
});

describe('aim by layout (the panel widens to landscape up to 46rem)', () => {
  /** The rotate of `.part` per at-side inside each width band of the component's style (0 = outside any band). */
  const turns = (file: string, part: string, compact: boolean) => {
    const css = source(file).replace(/\/\*[\s\S]*?\*\//g, '');
    const bands = new Map<number, Record<'mine' | 'theirs', number>>();
    const scan = (text: string, band: number) => {
      for (const side of ['mine', 'theirs'] as const) {
        const prefix = compact ? '\\.compact ' : '';
        const rule = new RegExp(`:global\\(${prefix}\\.fx--at-${side}\\) \\.${part} \\{\\s*rotate: (\\d+)deg`);
        const hit = text.match(rule);
        if (hit) bands.set(band, { ...(bands.get(band) ?? { mine: NaN, theirs: NaN }), [side]: Number(hit[1]) });
      }
    };
    const media = [...css.matchAll(/@media \(min-width: (\d+)rem\) \{([\s\S]*?\n {2}\})/g)];
    const base = media.reduce((text, m) => text.replace(m[0], ''), css);
    scan(base, 0);
    // Outside any band, the attacker-at-mine turn is the part's own rule.
    const own = new RegExp(`\\n {2}\\.${part} \\{[^}]*rotate: (\\d+)deg`).exec(base);
    if (!compact && own) bands.set(0, { ...(bands.get(0) ?? { mine: NaN, theirs: NaN }), mine: Number(own[1]) });
    for (const m of media) scan(m[2] ?? '', Number(m[1]));
    return bands;
  };

  for (const [file, part] of [
    ['gust.svelte', 'gust-aim'],
    ['absorb.svelte', 'absorb-aim'],
  ] as const) {
    it(`${file} flattens .${part} step by step as the 1v1 panel widens, opposite on the two sides`, () => {
      const bands = turns(file, part, false);
      expect([...bands.keys()]).toEqual([0, 30, 38, 46]);
      const mine = [...bands.values()].map((b) => b.mine);
      for (let i = 1; i < mine.length; i++) expect(mine[i]).toBeLessThan(mine[i - 1] ?? 0);
      for (const b of bands.values()) expect(b.theirs - b.mine).toBe(180);
      // Narrow phones keep the measured diagonal, the full-width panel ~24 degrees.
      expect(bands.get(0)?.mine).toBe(55);
      expect(bands.get(46)?.mine).toBeLessThanOrEqual(26);
    });

    it(`${file} turns .${part} almost level in the 2v2 panel, flatter once it widens`, () => {
      const bands = turns(file, part, true);
      expect(bands.get(0)?.mine).toBeLessThan(20);
      expect(bands.get(30)?.mine).toBeLessThan(bands.get(0)?.mine ?? 0);
      for (const b of bands.values()) expect(b.theirs - b.mine).toBe(180);
    });
  }

  it('draws one set of juice streams and drops per layout, two streams each', () => {
    const { container } = render(ClashFx, { attack: 'absorb', side: 'theirs' });
    for (const name of ['narrow', 'mid', 'wide', 'team']) {
      const set = container.querySelector(`.absorb-aim > .absorb-set--${name}`);
      expect(set, name).not.toBeNull();
      expect(set?.querySelectorAll('.absorb-stream'), name).toHaveLength(2);
      expect(set?.querySelectorAll('.absorb-drop'), name).toHaveLength(6);
    }
    const text = source('absorb.svelte');
    expect(text).toMatch(/:global\(\.compact\) \.absorb-set--team \{\s*display: inline;/);
    expect(text).toMatch(/@media \(min-width: 46rem\) \{\s*:global\(\.player:not\(\.compact\)\) \.absorb-set--mid/);
  });

  it('keeps the 2v2 juice arc on the name tag side low (it may dip behind the burst instead)', () => {
    const { container } = render(ClashFx, { attack: 'absorb', side: 'theirs' });
    const [low, high] = [...container.querySelectorAll('.absorb-set--team .absorb-stream .absorb-top')].map((p) =>
      Math.abs(Number(/Q[\d.-]+,([\d.-]+)/.exec(p.getAttribute('d') ?? '')?.[1])),
    );
    expect(low).toBeLessThan((high ?? 0) * 0.7);
  });

  it('shifts the gust streaks towards the attacker in the landscape panel, so their tails stay inside it', () => {
    expect(source('gust.svelte')).toMatch(/@media \(min-width: 30rem\) \{\s*\.gust-lee \{\s*translate: \d+px 0;/);
    const { container } = render(ClashFx, { attack: 'gust', side: 'theirs' });
    expect(container.querySelectorAll('.gust-aim > .gust-lee > .gust-streak').length).toBeGreaterThan(0);
  });
});

describe('slash: the winner never lunges into its own name tag', () => {
  const swipe = /@keyframes fx-slash-swipe \{([\s\S]*?)\n {2}\}/.exec(inside)?.[1] ?? '';

  it('finds the swipe keyframes', () => {
    expect(swipe).toMatch(/12% \{/);
  });

  it('never moves the sticker back along its own tag side (against --fx-toward) or grows it while drawing back', () => {
    expect(swipe).not.toMatch(/calc\(-[\d.]+% \* var\(--fx-toward\)\)/);
    const windUp = /12% \{([^}]*)\}/.exec(swipe)?.[1] ?? '';
    expect(windUp).toMatch(/scale: 1;/);
    expect(Math.abs(Number(/rotate: (-?\d+)deg/.exec(windUp)?.[1]))).toBeLessThanOrEqual(15);
  });
});
