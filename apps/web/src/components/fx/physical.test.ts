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
