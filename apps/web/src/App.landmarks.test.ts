import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from './App.svelte';
import { setLocale } from './lib/i18n';

// Every screen has exactly one main landmark (Lobby, Board and Result bring their own; their tests cover them).
describe('App landmarks', () => {
  let target: HTMLElement;
  let app: ReturnType<typeof mount>;

  beforeEach(() => {
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

  it('the start screen has exactly one main landmark, and the header sits outside it', () => {
    const mains = target.querySelectorAll('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]?.querySelector('input')).not.toBeNull();
    expect(mains[0]?.querySelector('header')).toBeNull();
  });
});
