/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom has no layout, so the layout fixes of the QA run are pinned at the stylesheet level: they read the
// CSS text from disk (vitest replaces imported CSS). The real-browser measurements are in the QA report.
const src = join(import.meta.dirname, '..');
const ui = readFileSync(join(src, 'styles', 'ui.css'), 'utf8');
/** Style text of a component; `App.svelte` lives in src, everything else in src/components. */
const component = (name: string): string => {
  const text = readFileSync(join(src, name === 'App.svelte' ? name : `components/${name}`), 'utf8');
  return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? '').join('\n');
};

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Declaration blocks of every rule whose selector list contains exactly `selector` (also inside at-rules). */
function rule(css: string, selector: string): string {
  const out: string[] = [];
  for (const match of strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] ?? '').split(',').map((s) => s.trim());
    if (selectors.includes(selector)) out.push(match[2] ?? '');
  }
  return out.join('\n');
}

/** The CSS without its at-rule blocks (@container, @media), so only the unconditional rules are left. */
function withoutAtRules(css: string): string {
  let out = '';
  let depth = 0;
  let atDepth = -1;
  const code = strip(css);
  for (let i = 0; i < code.length; i++) {
    const ch = code[i] ?? '';
    if (ch === '{') {
      depth++;
      if (atDepth < 0 && /@[\w-]+[^{}]*$/.test(out)) {
        out = out.replace(/@[\w-]+[^{}]*$/, '');
        atDepth = depth;
        continue;
      }
    } else if (ch === '}') {
      if (depth === atDepth) {
        atDepth = -1;
        depth--;
        continue;
      }
      depth--;
    }
    if (atDepth < 0) out += ch;
  }
  return out;
}

const SHRINKABLE = /grid-template-columns:\s*minmax\(0,\s*1fr\)/;

describe('test helpers', () => {
  it('withoutAtRules drops conditional rules and keeps the others', () => {
    const css = 'a { x: 1; } @container q (width >= 1rem) { a { y: 2; } b { z: 3; } } c { w: 4; }';
    const flat = withoutAtRules(css);
    expect(flat).toContain('x: 1');
    expect(flat).toContain('w: 4');
    expect(flat).not.toMatch(/y: 2|z: 3|@container/);
  });
});

describe('I1: no content can widen a column', () => {
  it('the app grid, the lobby and its panels use a single shrinkable track', () => {
    expect(rule(component('App.svelte'), '.app')).toMatch(SHRINKABLE);
    expect(rule(component('Lobby.svelte'), '.lobby')).toMatch(SHRINKABLE);
    expect(rule(component('Lobby.svelte'), '.share')).toMatch(SHRINKABLE);
    expect(rule(component('Lobby.svelte'), '.team')).toMatch(SHRINKABLE);
    expect(rule(component('CopyRow.svelte'), '.copy')).toMatch(SHRINKABLE);
    expect(rule(component('Home.svelte'), '.home')).toMatch(SHRINKABLE);
  });

  it('the grid items may shrink below their content', () => {
    expect(rule(component('App.svelte'), '.app > :global(*)')).toContain('min-width: 0');
    expect(rule(component('Lobby.svelte'), '.lobby > :global(*)')).toContain('min-width: 0');
  });

  it('the room code input has no intrinsic width of its own', () => {
    const input = rule(component('CopyRow.svelte'), 'input');
    expect(input).toContain('width: 100%');
    expect(input).toContain('min-width: 0');
  });

  it('the page clips overshooting pop-ins sideways without making a scroll container', () => {
    expect(rule(component('App.svelte'), '.app')).toContain('overflow-x: clip');
  });
});

describe('I2: the hero keeps all three stickers visible', () => {
  const home = component('Home.svelte');

  it('stacks the bubble above the stickers by default', () => {
    expect(rule(home, '.hero-bubble')).toContain('grid-row: 1');
    expect(rule(home, '.stickers')).toContain('grid-row: 2');
  });

  it('only overlays them in one grid cell when the panel is wide enough for both', () => {
    expect(rule(home, '.hero')).toMatch(/container:\s*hero\s*\/\s*inline-size/);
    const wide = strip(home).match(/@container hero \(width >= ([\d.]+)rem\)\s*\{([\s\S]*?\})\s*\}/);
    expect(wide).not.toBeNull();
    // 3 stickers of 86px with the overlap (238px) plus the 170px bubble need at least 408px = 25.5rem.
    expect(Number(wide?.[1])).toBeGreaterThanOrEqual(25.5);
    expect(wide?.[2]).toContain('grid-area: 1 / 1');
    // The overlay must not be the default: that is what hid the third sticker.
    expect(rule(withoutAtRules(home), '.hero > :not(.hero-caption)')).not.toContain('grid-area');
  });
});

describe('I3: the own name tag stays clear of the duel result chip', () => {
  it('reserves the chip width next to the own compact tag', () => {
    const own = rule(component('PlayerCard.svelte'), '.mine.compact');
    expect(own).toContain('var(--chip-w');
    expect(own).toContain('max-width');
  });

  it('the duel panel sets the chip width and the chip uses it', () => {
    const board = component('BoardView.svelte');
    expect(rule(board, '.duel.team')).toMatch(/--chip-w:\s*[\d.]+rem/);
    expect(rule(board, '.duel-result')).toContain('max-width: var(--chip-w)');
  });

  it('leaves the 1v1 tags alone', () => {
    const card = component('PlayerCard.svelte');
    expect(rule(card, '.mine')).not.toContain('--chip-w');
    expect(rule(card, '.player')).not.toContain('--chip-w');
  });
});

describe('I4: the best-of switch is as wide as its segments', () => {
  it('does not stretch as a grid item', () => {
    const group = rule(ui, '.segmented');
    expect(group).toContain('width: max-content');
    expect(group).toContain('justify-self: start');
  });

  it('keeps 56x44 segments that never grow', () => {
    const segment = rule(ui, '.segmented .segment');
    expect(segment).toContain('min-width: 56px');
    expect(segment).toContain('min-height: 44px');
    expect(segment).not.toMatch(/flex(-grow)?:\s*[1-9]/);
  });
});

describe('M1: the join code example fits', () => {
  const home = component('Home.svelte');

  it('tracks the example less widely than the typed code', () => {
    expect(rule(home, '.field input.code')).toContain('letter-spacing: 0.3em');
    expect(rule(home, '.field input.code::placeholder')).toMatch(/letter-spacing:\s*0?\.0[0-5]\d*em/);
  });

  it('moves the button below the field when the panel is narrow', () => {
    expect(rule(home, '.join')).toMatch(/container:\s*join\s*\/\s*inline-size/);
    expect(rule(home, '.join-row')).toMatch(SHRINKABLE);
    expect(strip(home)).toMatch(/@container join \(width >= [\d.]+rem\)\s*\{[^}]*\.join-row\s*\{[^}]*minmax\(0, 1fr\) auto/);
  });
});

describe('M2: the stamped tile never widens the page', () => {
  const pad = rule(component('GesturePad.svelte'), '.pad');

  it('clips the pad sideways only, so the rule hints can still rise above it', () => {
    expect(pad).toContain('overflow-x: clip');
    expect(pad).not.toMatch(/overflow(-y)?:\s*(hidden|clip|auto|scroll)/);
  });

  it('leaves room at the sides for the tile shadows and hint bubbles', () => {
    expect(pad).toContain('margin-inline: calc(-1 * var(--space-2))');
    expect(pad).toContain('padding-inline: var(--space-2)');
  });
});
