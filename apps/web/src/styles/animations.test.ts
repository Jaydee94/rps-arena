/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read from disk: vitest replaces imported CSS with an empty string.
const read = (name: string) => readFileSync(join(import.meta.dirname, name), 'utf8');
const animations = read('animations.css');
const base = read('base.css');
const ui = read('ui.css');

/** Removes the first `@media (prefers-reduced-motion: no-preference) { ... }` block, brace-matched. */
function withoutMotionBlock(css: string): string {
  const start = css.indexOf('@media (prefers-reduced-motion: no-preference)');
  if (start < 0) return css;
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(0, start) + css.slice(i + 1);
  }
  return css;
}

describe('motion', () => {
  it('keeps every animation and transition of animations.css inside prefers-reduced-motion: no-preference', () => {
    expect(animations).toContain('prefers-reduced-motion: no-preference');
    expect(withoutMotionBlock(animations)).not.toMatch(/animation|transition|@keyframes/);
  });

  it('declares no motion in the shared stylesheets either', () => {
    // base.css only switches motion off for reduced-motion users.
    expect(ui).not.toMatch(/animation|transition|@keyframes/);
    expect(base.replace(/@media \(prefers-reduced-motion: reduce\)[\s\S]*$/, '')).not.toMatch(
      /animation|transition|@keyframes/,
    );
  });
});
