/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { AVATARS } from '@rps/shared';
import AvatarPicker from './AvatarPicker.svelte';
import { avatarIcon } from '../lib/gestures-ui';
import { setLocale } from '../lib/i18n';
import de from '../lib/locales/de.json';
import en from '../lib/locales/en.json';

// Read from disk: jsdom has no layout, so the scrolling is checked in the stylesheet text.
const source = readFileSync(join(import.meta.dirname, 'AvatarPicker.svelte'), 'utf8');
const css = source.slice(source.indexOf('<style>') + '<style>'.length).replace(/\/\*[\s\S]*?\*\//g, '');

function declarations(selector: string): string {
  const out: string[] = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((match[1] ?? '').split(',').some((s) => s.trim() === selector)) out.push(match[2] ?? '');
  }
  return out.join('\n');
}

describe('avatars', () => {
  it('offers 32 avatars', () => {
    expect(AVATARS).toHaveLength(32);
  });

  it.each(AVATARS)('has an inline svg and a de and en label for %s', (id) => {
    expect(avatarIcon(id)).toMatch(/^<svg/);
    expect(de).toHaveProperty([`avatar.${id}`]);
    expect(en).toHaveProperty([`avatar.${id}`]);
  });
});

describe('AvatarPicker', () => {
  beforeEach(() => setLocale('en'));

  it('renders one radio per avatar, named from the translations', () => {
    render(AvatarPicker, { value: 'fox' });
    const group = screen.getByRole('group', { name: 'Your avatar' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(AVATARS.length);
    for (const id of AVATARS) {
      const name = (en as Record<string, string>)[`avatar.${id}`] ?? '';
      expect(within(group).getByRole('radio', { name })).toHaveAttribute('value', id);
    }
  });

  it('names the radios in German too', () => {
    setLocale('de');
    render(AvatarPicker, { value: 'fox' });
    expect(screen.getByRole('radio', { name: 'Meerjungfrau' })).toHaveAttribute('value', 'mermaid');
    expect(screen.getByRole('radio', { name: 'Banane' })).toHaveAttribute('value', 'banana');
  });

  it('checks the bound value and sets it on click', async () => {
    render(AvatarPicker, { value: 'fox' });
    expect(screen.getByRole('radio', { name: 'Fox' })).toBeChecked();
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Banana' }));
    expect(screen.getByRole('radio', { name: 'Banana' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Fox' })).not.toBeChecked();
  });

  describe('scrolling', () => {
    // jsdom has no layout: fake a grid 200px high with 72px tiles in rows of 72px, 16px scroll-padding.
    const TILE = 72;
    const GRID = 200;
    const PAD = 16;
    let proto: Record<string, PropertyDescriptor | undefined>;

    function fakeLayout(root: HTMLElement) {
      const grid = root.querySelector('.avatars') as HTMLElement;
      Object.defineProperty(grid, 'clientHeight', { configurable: true, value: GRID });
      grid.getBoundingClientRect = () => ({ top: 100, bottom: 100 + GRID, height: GRID }) as DOMRect;
      const labels = [...grid.querySelectorAll('label')];
      labels.forEach((label, i) => {
        label.getBoundingClientRect = () => {
          const top = 100 + i * TILE - grid.scrollTop;
          return { top, bottom: top + TILE, height: TILE } as DOMRect;
        };
      });
      // jsdom does not know scroll-padding: answer for the grid only, everything else stays real.
      const real = window.getComputedStyle.bind(window);
      vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) =>
        el === grid
          ? ({ scrollPaddingTop: `${PAD}px`, scrollPaddingBottom: `${PAD}px` } as unknown as CSSStyleDeclaration)
          : real(el, pseudo),
      );
      return grid;
    }

    beforeEach(() => {
      // Guard: the component must not touch the page-wide scrollIntoView at all.
      proto = { scrollIntoView: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView') };
    });

    afterEach(() => {
      vi.restoreAllMocks();
      if (proto.scrollIntoView) Object.defineProperty(Element.prototype, 'scrollIntoView', proto.scrollIntoView);
      else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    });

    it('scrolls only the grid to the chosen tile when the value changes, without animation', async () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      const { container } = render(AvatarPicker, { value: 'fox' });
      const grid = fakeLayout(container);
      expect(grid.scrollTop).toBe(0);
      const banana = AVATARS.indexOf('banana');
      await userEvent.setup().click(screen.getByRole('radio', { name: 'Banana' }));
      // Tile bottom (in content coordinates) sits at the bottom edge less the scroll-padding.
      expect(grid.scrollTop).toBe(Math.max(0, (banana + 1) * TILE - GRID + PAD));
      expect(grid.scrollTop).toBeGreaterThan(0);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('does not scroll when the chosen tile is already fully visible', async () => {
      const { container } = render(AvatarPicker, { value: 'fox' });
      const grid = fakeLayout(container);
      await userEvent.setup().click(screen.getByRole('radio', { name: (en as Record<string, string>)[`avatar.${AVATARS[1]}`] ?? '' }));
      expect(grid.scrollTop).toBe(0);
    });

    it('scrolls back up to a tile above the viewport', async () => {
      const { container } = render(AvatarPicker, { value: 'fox' });
      const grid = fakeLayout(container);
      const user = userEvent.setup();
      await user.click(screen.getByRole('radio', { name: 'Banana' }));
      const scrolled = grid.scrollTop;
      expect(scrolled).toBeGreaterThan(0);
      await user.click(screen.getByRole('radio', { name: 'Fox' }));
      expect(grid.scrollTop).toBe(Math.max(0, AVATARS.indexOf('fox') * TILE - PAD));
      expect(grid.scrollTop).toBeLessThan(scrolled);
    });
  });

  it('is a scroll container with room for the check badge and focus ring', () => {
    render(AvatarPicker, { value: 'fox' });
    const scroller = document.querySelector('fieldset.group .avatars');
    expect(scroller).not.toBeNull();
    const rule = declarations('.avatars');
    expect(rule).toMatch(/overflow-y:\s*auto/);
    expect(rule).toMatch(/overscroll-behavior:\s*contain/);
    expect(rule).toMatch(/max-height:/);
    expect(rule).toMatch(/padding:\s*var\(--pad\)/);
    expect(rule).not.toMatch(/scroll-behavior:\s*smooth/);
    expect(css).not.toMatch(/transition|animation|@keyframes|(?<!over)scroll-behavior/);
  });

  it('does not add a tab stop of its own to the scroll container', () => {
    render(AvatarPicker, { value: 'fox' });
    expect(document.querySelector('.avatars')).not.toHaveAttribute('tabindex');
  });
});
