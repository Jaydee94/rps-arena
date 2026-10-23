/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read from disk: vitest replaces imported CSS with an empty string.
const read = (name: string) => readFileSync(join(import.meta.dirname, name), 'utf8');
const animations = read('animations.css');
const tokens = read('tokens.css');

/** Splits animations.css into the no-preference block and everything outside it (brace-matched). */
function split(css: string): { inside: string; outside: string } {
  const start = css.indexOf('@media (prefers-reduced-motion: no-preference)');
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) {
      return { inside: css.slice(start, i + 1), outside: css.slice(0, start) + css.slice(i + 1) };
    }
  }
  throw new Error('unbalanced motion block');
}

const { inside, outside } = split(animations);

/** Every rule body whose selector contains `needle`. */
const rulesWith = (css: string, needle: string): string[] =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => (m[1] ?? '').includes(needle))
    .map((m) => m[2] ?? '');

/** The scenes in the plan's group order: reference (Task 3), 4a physical, 4b elemental, 4c other. */
const SCENES = [
  'smash / crumble',
  'slash / split',
  'wrap / fold',
  'shoot / perforate',
  'bite / chomp',
  'punch / knockback',
  'burn / char, extinguish',
  'splash / drench',
  'gust / blow',
  'zap / shock',
  'absorb / squeeze',
  'curse / hexed',
  'poison / wobble',
  'entangle / bind',
  'clash',
];

describe('matchup effect styles', () => {
  it('defines the shared timing tokens', () => {
    expect(tokens).toMatch(/--fx-dur:\s*1400ms/);
    expect(tokens).toMatch(/--fx-delay:\s*var\(--impact-at\)/);
    expect(tokens).toMatch(/--fx-hit:\s*\d+ms/);
  });

  it('keeps the smash scene and its keyframes inside the no-preference block', () => {
    expect(rulesWith(inside, '.fx--smash').join('')).toMatch(/animation:/);
    expect(rulesWith(inside, '.attack-smash').join('')).toMatch(/animation:/);
    expect(rulesWith(inside, '.react-crumble').join('')).toMatch(/animation:/);
    expect(inside).toMatch(/@keyframes fx-smash-/);
    expect(inside).toMatch(/@keyframes fx-crumble-/);
    expect(outside).not.toMatch(/fx--smash|attack-smash/);
  });

  it('gives the crumble reaction a static end pose outside the motion block, without motion', () => {
    const rules = rulesWith(outside, '.react-crumble');
    expect(rules.length).toBeGreaterThan(0);
    const body = rules.join('\n');
    expect(body).toMatch(/rotate:/);
    expect(body).toMatch(/filter:/);
    expect(body).not.toMatch(/animation|transition/);
  });

  it('pre-seeds one marked sub-section per scene in the motion block, in group order', () => {
    const positions = SCENES.map((scene) => inside.indexOf(`/* ---- fx: ${scene} ---- */`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('pre-seeds one marked static end pose sub-section per scene outside the motion block, in group order', () => {
    const positions = SCENES.map((scene) => outside.indexOf(`/* ---- fx static: ${scene} ---- */`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('moves the effects with transform-type properties, opacity and the loser desaturation only', () => {
    const fxRules = inside.slice(inside.indexOf('/* ---- fx: smash / crumble ---- */'));
    const props = [...fxRules.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/[{;]\s*([a-z-]+)\s*:/g)].map((m) => m[1]);
    const allowed = new Set(['translate', 'rotate', 'scale', 'opacity', 'filter', 'animation', 'animation-delay', 'animation-duration', 'animation-timing-function', 'transform-origin']);
    expect(props.filter((p) => p && !allowed.has(p))).toEqual([]);
  });
});
