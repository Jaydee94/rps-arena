import { beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { userEvent } from '@testing-library/user-event';
import AudioToggle from './AudioToggle.svelte';
import { audio } from '../lib/audio';
import { setLocale } from '../lib/i18n';

describe('AudioToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale('en');
    audio.setSfx(true);
    audio.setMusic(false);
  });

  it('renders two toggle buttons reflecting the settings and toggles them', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const app = mount(AudioToggle, { target });
    flushSync();

    const sfx = target.querySelector<HTMLButtonElement>('button[data-kind="sfx"]');
    const music = target.querySelector<HTMLButtonElement>('button[data-kind="music"]');
    expect(sfx).toHaveAttribute('aria-pressed', 'true');
    expect(music).toHaveAttribute('aria-pressed', 'false');
    expect(sfx).toHaveTextContent('Effects');
    expect(music).toHaveTextContent('Music');

    await userEvent.click(music as HTMLButtonElement);
    expect(music).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(sfx as HTMLButtonElement);
    expect(sfx).toHaveAttribute('aria-pressed', 'false');

    void unmount(app);
    target.remove();
  });
});
