/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read from disk: vitest replaces imported CSS with an empty string.
const ui = readFileSync(join(import.meta.dirname, 'ui.css'), 'utf8');

/** Returns the declaration blocks of every rule whose selector list contains exactly `selector`. */
function blocks(selector: string): string[] {
  const out: string[] = [];
  const code = ui.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of code.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] ?? '').split(',').map((s) => s.trim());
    if (selectors.includes(selector)) out.push(match[2] ?? '');
  }
  return out;
}

const rule = (selector: string) => blocks(selector).join('\n');

describe('ui.css building blocks', () => {
  it('styles .panel with the panel radius and shadow tokens', () => {
    const panel = rule('.panel');
    expect(panel).toContain('var(--radius-panel)');
    expect(panel).toContain('var(--shadow-panel)');
    expect(panel).toContain('position: relative');
  });

  it('hangs .ribbon on the panel corner', () => {
    const ribbon = rule('.ribbon');
    expect(ribbon).toContain('position: absolute');
    expect(ribbon).toContain('left: -8px');
    expect(ribbon).toContain('top: -18px');
    expect(ribbon).toContain('rotate: -1.5deg');
  });

  it('gives a panel with a ribbon extra top padding and offers a sky ribbon', () => {
    expect(rule('.panel:has(> .ribbon)')).toContain('padding-top: var(--space-6)');
    expect(rule('.ribbon--sky')).toContain('var(--sky)');
  });

  it('builds the segmented control from 56x44 radio segments', () => {
    const segment = rule('.segmented .segment');
    expect(segment).toContain('min-width: 56px');
    expect(segment).toContain('min-height: 44px');
    expect(rule('.segmented .segment:has(input:checked)')).toContain('var(--red)');
    expect(rule('.segmented .segment:has(input:checked)::after')).toContain('✓');
  });

  it('builds the switch as a 58x34 checkbox that stays in the DOM', () => {
    const sw = rule('.switch');
    expect(sw).toContain('width: 58px');
    expect(sw).toContain('height: 34px');
    expect(rule('.switch:has(input:checked)')).toContain('var(--teal)');
  });

  it('has a dashed box', () => {
    expect(rule('.dashed-box')).toContain('dashed');
  });

  it('uses no hex colors', () => {
    expect(ui).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
