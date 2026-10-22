import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from './App.svelte';
import { setLocale } from './lib/i18n';
import de from './lib/locales/de.json';
import en from './lib/locales/en.json';

describe('App language switch', () => {
  let target: HTMLElement;
  let app: ReturnType<typeof mount>;

  beforeEach(() => {
    localStorage.clear();
    setLocale('de');
    target = document.createElement('div');
    document.body.append(target);
    app = mount(App, { target });
    flushSync();
  });

  afterEach(() => {
    void unmount(app);
    target.remove();
  });

  it('updates the text in place without remounting (focus and node identity survive)', () => {
    const heading = target.querySelector('h1');
    const buttons = [...target.querySelectorAll('button')];
    const enButton = buttons.find((b) => b.textContent?.trim() === 'EN');
    expect(heading?.textContent).toBe(de['app.title']);
    expect(enButton).toBeDefined();

    enButton?.focus();
    expect(document.activeElement).toBe(enButton);
    enButton?.click();
    flushSync();

    expect(target.querySelector('p')?.textContent).toContain(en['app.status.connecting']);
    expect(target.querySelector('button[aria-pressed="true"]')).toBe(enButton);
    expect(target.querySelector('h1')).toBe(heading);
    expect(document.activeElement).toBe(enButton);
    expect(enButton?.isConnected).toBe(true);
  });
});
