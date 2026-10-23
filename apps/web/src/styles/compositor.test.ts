/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read from disk: vitest replaces imported CSS with an empty string.
const css = readFileSync(join(import.meta.dirname, 'animations.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Splits on commas outside parentheses. */
function topLevelSplit(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += ch;
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}

/** The properties every @keyframes block sets (without the per-keyframe timing function). */
const keyframeProps = new Map<string, Set<string>>(
  [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)].map((m) => [
    m[1] ?? '',
    new Set([...(m[2] ?? '').matchAll(/[{;]\s*([a-z-]+)\s*:/g)].map((p) => p[1] ?? '').filter((p) => p !== 'animation-timing-function')),
  ]),
);

/** Rules (outside @keyframes) whose `animation` shorthand lists more than one animation. */
const multiAnimationRules = [...css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ selector: (m[1] ?? '').trim(), animation: /(?:^|;)\s*animation\s*:\s*([^;]+)/.exec(m[2] ?? '')?.[1] ?? '' }))
  .map(({ selector, animation }) => ({ selector, names: topLevelSplit(animation).map((a) => a.split(/\s+/)[0] ?? '') }))
  .filter(({ names }) => names.length > 1);

// Start screen, left as it is: the hero bubble pops and breathes with `scale` (repainted on the main thread).
const KNOWN = new Set(['.hero-bubble']);

describe('compositor-friendly motion', () => {
  it('finds the rules with more than one animation', () => {
    expect(keyframeProps.get('speed-spin')).toEqual(new Set(['rotate']));
    expect(multiAnimationRules.map((r) => r.selector)).toContain('.speed-lines');
  });

  // Two animations of one property on one element cannot run on the compositor (Chrome repaints the element
  // on the main thread on every frame, for as long as an infinite one runs).
  it('never moves one property with two animations of the same element', () => {
    for (const { selector, names } of multiAnimationRules) {
      if (KNOWN.has(selector)) continue;
      const seen = new Map<string, string>();
      for (const name of names) {
        const props = keyframeProps.get(name);
        expect(props, `${selector}: @keyframes ${name}`).toBeDefined();
        for (const prop of props ?? []) {
          expect(seen.get(prop), `${selector}: ${prop} in ${name} and ${seen.get(prop)}`).toBeUndefined();
          seen.set(prop, name);
        }
      }
    }
  });

  it('throbs the reveal burst on its wrapper, apart from its pop', () => {
    expect(css).toMatch(/\.clash \.burst--animated\s*\{\s*animation:\s*burst-pop[^,;]*;\s*\}/);
    expect(css).toMatch(/\.clash \.impact\s*\{\s*animation:\s*throb\b/);
  });
});
