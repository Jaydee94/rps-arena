/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(import.meta.dirname, '..', 'components');
const components = readdirSync(dir).filter((f) => f.endsWith('.svelte'));

describe('component styles', () => {
  it('finds the components', () => {
    expect(components.length).toBeGreaterThan(0);
  });

  for (const file of components) {
    it(`${file} declares no motion in its <style> blocks`, () => {
      const source = readFileSync(join(dir, file), 'utf8');
      const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
      for (const css of styles) expect(css).not.toMatch(/animation|transition|@keyframes/);
    });
  }
});
