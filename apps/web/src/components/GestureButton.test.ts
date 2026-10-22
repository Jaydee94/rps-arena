import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import GestureButton from './GestureButton.svelte';
import { setLocale } from '../lib/i18n';

const base = { selected: false, disabled: false, tabindex: 0 as const, tone: 0, onpick: () => {}, onkeydown: () => {}, onfocus: () => {} };

/** The text a screen reader announces as the description of the radio. */
function description(radio: HTMLElement): string {
  const id = radio.getAttribute('aria-describedby');
  expect(id).toBeTruthy();
  const node = document.getElementById(id as string);
  expect(node).not.toBeNull();
  return (node as HTMLElement).textContent?.trim() ?? '';
}

describe('GestureButton rule hint', () => {
  beforeEach(() => setLocale('de'));

  it('describes what the gesture beats via aria-describedby', () => {
    render(GestureButton, { ...base, gesture: 'rock', beats: ['scissors'] });
    expect(description(screen.getByRole('radio', { name: 'Stein' }))).toBe('schlägt: Schere');
  });

  it('lists several beaten gestures and follows the locale', () => {
    setLocale('en');
    render(GestureButton, { ...base, gesture: 'rock', beats: ['scissors', 'lizard'] });
    expect(description(screen.getByRole('radio', { name: 'Rock' }))).toBe('beats: Scissors, Lizard');
  });

  it('keeps the accessible name free of the hint', () => {
    render(GestureButton, { ...base, gesture: 'paper', beats: ['rock'] });
    expect(screen.getByRole('radio', { name: 'Papier' })).toBeInTheDocument();
  });

  it('uses a different description id for every tile', () => {
    render(GestureButton, { ...base, gesture: 'rock', beats: ['scissors'] });
    render(GestureButton, { ...base, gesture: 'paper', beats: ['rock'] });
    const ids = screen.getAllByRole('radio').map((r) => r.getAttribute('aria-describedby'));
    expect(new Set(ids).size).toBe(2);
  });

  it('still describes a disabled tile', () => {
    render(GestureButton, { ...base, disabled: true, gesture: 'rock', beats: ['scissors'] });
    expect(description(screen.getByRole('radio', { name: 'Stein' }))).toBe('schlägt: Schere');
  });
});
