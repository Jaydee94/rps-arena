/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REACTION_FOR_ATTACK } from '@rps/shared';

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

  /** The fx sub-sections of the motion block (from the first scene marker to the RESULT section). */
  const fxMotion = inside.slice(inside.indexOf('/* ---- fx: smash / crumble ---- */'), inside.indexOf('/* ==== RESULT'));
  const code = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
  const keyframes = [...code(fxMotion).matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)].map((m) => ({
    name: m[1] ?? '',
    body: m[2] ?? '',
  }));
  /** Rules outside @keyframes: selector and body. */
  const plainRules = [...code(fxMotion).replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    (m) => ({ selector: (m[1] ?? '').trim(), body: m[2] ?? '' }),
  );
  const REACTIONS = [...new Set([...Object.values(REACTION_FOR_ATTACK), 'extinguish', 'cover'])];

  it('finds the scene keyframes and rules it checks', () => {
    expect(keyframes.map((k) => k.name)).toContain('fx-smash-slam');
    expect(keyframes.map((k) => k.name)).toContain('fx-crumble-sticker');
    expect(plainRules.some((r) => r.selector.includes('.react-crumble'))).toBe(true);
  });

  it('moves the effects with transform-type properties and opacity only (plus the timing of a keyframe)', () => {
    const allowed = new Set(['translate', 'rotate', 'scale', 'opacity', 'filter', 'animation-timing-function']);
    for (const { name, body } of keyframes) {
      const props = [...body.matchAll(/[{;]\s*([a-z-]+)\s*:/g)].map((m) => m[1] ?? '');
      expect(props.filter((p) => !allowed.has(p)), name).toEqual([]);
    }
    for (const { selector, body } of plainRules) {
      const props = [...`;${body}`.matchAll(/[{;]\s*([a-z-]+)\s*:/g)].map((m) => m[1] ?? '');
      expect(props.filter((p) => !['animation', 'animation-delay', 'animation-duration'].includes(p)), selector).toEqual([]);
    }
  });

  it('allows filter only as saturate() in the reactions (the loser greys out), never in attacks or graphics', () => {
    for (const { name, body } of keyframes) {
      const filters = [...body.matchAll(/filter:\s*([^;]+);/g)].map((m) => (m[1] ?? '').trim());
      if (filters.length === 0) continue;
      expect(REACTIONS.some((r) => name.startsWith(`fx-${r}-`)), `${name} is not a reaction keyframe`).toBe(true);
      for (const value of filters) expect(value, name).toMatch(/^(none|saturate\([\d.]+\))$/);
    }
    const staticFilters = [...code(outside).matchAll(/([^{}]+)\{([^{}]*filter:[^{}]*)\}/g)].filter((m) =>
      (m[1] ?? '').includes('.reveal-art'),
    );
    for (const m of staticFilters) {
      expect(m[1] ?? '').toMatch(/\.player\.loser \.reveal-art/);
      expect(m[2] ?? '').toMatch(/filter:\s*saturate\([\d.]+\)/);
    }
  });

  it('gives every losing sticker a generic static pose (the end of loser-droop)', () => {
    const generic = rulesWith(outside, '.player.loser .reveal-art').filter((b) => /translate/.test(b));
    const body = generic.join('\n');
    expect(body).toMatch(/translate:\s*0 12px/);
    expect(body).toMatch(/rotate:\s*16deg/);
    expect(body).toMatch(/filter:\s*saturate\(0\.25\)/);
    // loser-droop states its start, or the static pose would leave it nothing to move.
    expect(inside).toMatch(/@keyframes loser-droop\s*\{\s*from\s*\{[^}]*rotate:\s*0deg/);
  });

  // Template for Tasks 4a-4c: a reaction that moves must also ship its own static end pose.
  it('ships a static end pose for every reaction that has motion rules', () => {
    const moving = new Set([...code(fxMotion).matchAll(/\.react-([a-z]+)/g)].map((m) => m[1] ?? ''));
    expect(moving.size).toBeGreaterThan(0);
    for (const reaction of moving) {
      expect(REACTIONS, reaction).toContain(reaction);
      const poses = rulesWith(outside, `.player.loser .reveal-art.react-${reaction}`);
      expect(poses.length, `static pose for react-${reaction}`).toBeGreaterThan(0);
    }
  });
});
