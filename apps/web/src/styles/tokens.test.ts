/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read from disk: vitest replaces imported CSS with an empty string.
const tokens = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');

/** Returns the brace-matched body of the first block that starts at `selector`. */
function blockBody(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) return '';
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  return '';
}

const root = blockBody(tokens, ':root');
const dark = blockBody(tokens, '@media (prefers-color-scheme: dark)');

/** Declared value of a custom property inside a block body. */
function declared(body: string, name: string): string | undefined {
  const match = body.match(new RegExp(`${name}:\\s*([^;]+);`));
  return match?.[1].trim();
}

describe('comic panel tokens', () => {
  const expected: Record<string, string> = {
    '--radius-panel': '6px',
    '--shadow-panel': '6px 6px 0 var(--cast)',
    '--gutter': 'var(--space-5)',
    '--dot-panel': 'rgb(255 79 163 / 55%)',
    '--dot-panel-size': '16px',
    '--dot-on-tile': 'rgb(255 255 255 / 38%)',
    '--dur-beat': '420ms',
    '--dur-slam': '520ms',
    '--impact-at': '440ms',
  };

  for (const [name, value] of Object.entries(expected)) {
    it(`declares ${name}: ${value} in the first :root block`, () => {
      expect(declared(root, name)).toBe(value);
    });
  }

  it('overrides --dot-panel in the dark block', () => {
    expect(declared(dark, '--dot-panel')).toBe('rgb(255 111 181 / 40%)');
  });
});
