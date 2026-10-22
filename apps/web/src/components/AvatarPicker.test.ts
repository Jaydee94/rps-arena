/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('scrolls the chosen tile into view when the value changes, without animation', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(AvatarPicker, { value: 'fox' });
    scrollIntoView.mockClear();
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Banana' }));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });
    const target = scrollIntoView.mock.contexts.at(-1) as HTMLElement;
    expect(target.querySelector('input')).toHaveAttribute('value', 'banana');
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
