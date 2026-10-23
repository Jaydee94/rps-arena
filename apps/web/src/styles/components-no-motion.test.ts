/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(import.meta.dirname, '..', 'components');
const components = readdirSync(dir).filter((f) => f.endsWith('.svelte'));

const source = (file: string): string => readFileSync(join(dir, file), 'utf8');

/** Contents of every `<style>` block of a component. */
const styleBlocks = (file: string): string[] =>
  [...source(file).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? '');

/** The markup of a component: everything outside `<script>` and `<style>`, without HTML comments. */
const markupOf = (text: string): string =>
  text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');

const withoutCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Svelte motion directives on elements: transition:, animate:, in:, out:. */
const MOTION_DIRECTIVE = /(?:^|\s)(?:transition|animate|in|out):[A-Za-z_$]/m;
/** Motion set inline: style:animation…, style:transition…, or style="…animation…". */
const INLINE_MOTION = /\bstyle:(?:animation|transition)|\bstyle\s*=\s*["'{][^"'}]*(?:animation|transition)/;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

/** Hex colours the spec permits, per component. */
const HEX_ALLOWED: Record<string, string[]> = {
  // The opaque stop of the speed-lines mask (spec: Global Constraints).
  'SpeedLines.svelte': ['#000'],
};

describe('component styles', () => {
  it('finds components with style blocks to check', () => {
    expect(components.length).toBeGreaterThan(0);
    const total = components.reduce((n, file) => n + styleBlocks(file).length, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('the markup guards catch what they are meant to catch', () => {
    const sample = (attrs: string) => markupOf(`<script>const a = 'in:x';</script><div ${attrs}></div>`);
    for (const attrs of ['transition:fade', 'in:fly={{ y: 8 }}', 'out:scale', 'animate:flip', 'transition:fade|global']) {
      expect(sample(attrs)).toMatch(MOTION_DIRECTIVE);
    }
    for (const attrs of ['class="in"', 'style:--i={i}', 'aria-label="x"', 'bind:this={el}']) {
      expect(sample(attrs)).not.toMatch(MOTION_DIRECTIVE);
    }
    for (const attrs of ['style:animation="none"', 'style:transition-duration="1s"', 'style="animation: x 1s"']) {
      expect(sample(attrs)).toMatch(INLINE_MOTION);
    }
    expect(sample('style:--x="1"')).not.toMatch(INLINE_MOTION);
    expect('color: #fff; fill: #12ab34ff;'.match(HEX)).toEqual(['#fff', '#12ab34ff']);
    expect('{#each list as x}{#if y}{/if}{/each}'.match(HEX)).toBeNull();
  });

  for (const file of components) {
    it(`${file} declares no motion in its <style> blocks`, () => {
      for (const css of styleBlocks(file)) expect(css).not.toMatch(/animation|transition|@keyframes/);
    });

    it(`${file} has no motion directives or inline motion in its markup`, () => {
      const markup = markupOf(source(file));
      expect(markup).not.toMatch(MOTION_DIRECTIVE);
      expect(markup).not.toMatch(INLINE_MOTION);
    });

    it(`${file} uses no hex colours outside the spec's exceptions`, () => {
      const text = [markupOf(source(file)), ...styleBlocks(file).map(withoutCssComments)].join('\n');
      const found = [...text.matchAll(HEX)].map((m) => m[0]);
      expect(found.filter((hex) => !(HEX_ALLOWED[file] ?? []).includes(hex))).toEqual([]);
    });
  }

  it('the hex allow-list is still needed (no stale exceptions)', () => {
    for (const [file, allowed] of Object.entries(HEX_ALLOWED)) {
      const css = styleBlocks(file).map(withoutCssComments).join('\n');
      for (const hex of allowed) expect(css).toContain(hex);
    }
  });
});
