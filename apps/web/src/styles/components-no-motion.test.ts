/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(import.meta.dirname, '..', 'components');
const components = readdirSync(dir).filter((f) => f.endsWith('.svelte'));

/** Contents of every `<style>` block of a component. */
const styleBlocks = (file: string): string[] =>
  [...readFileSync(join(dir, file), 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(
    (m) => m[1] ?? '',
  );

describe('component styles', () => {
  it('finds components with style blocks to check', () => {
    expect(components.length).toBeGreaterThan(0);
    const total = components.reduce((n, file) => n + styleBlocks(file).length, 0);
    expect(total).toBeGreaterThan(0);
  });

  for (const file of components) {
    it(`${file} declares no motion in its <style> blocks`, () => {
      for (const css of styleBlocks(file)) expect(css).not.toMatch(/animation|transition|@keyframes/);
    });
  }
});
