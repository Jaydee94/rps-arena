import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { AVATARS } from '@rps/shared';
import Avatar from './Avatar.svelte';
import GestureIcon from './GestureIcon.svelte';

describe('Avatar', () => {
  it.each(AVATARS)('renders the inline svg for %s, hidden from assistive tech', (id) => {
    const { container } = render(Avatar, { id, size: 40 });
    const el = container.querySelector('.avatar');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el?.querySelector('svg')).not.toBeNull();
    expect(el).toHaveStyle({ '--size': '40px' });
  });

  it('falls back to a neutral badge for an unknown id', () => {
    const { container } = render(Avatar, { id: 'nope' });
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.avatar')).toHaveTextContent('?');
  });
});

describe('GestureIcon', () => {
  it('renders the svg on a sticker by default and without it on request', () => {
    const { container, rerender } = render(GestureIcon, { id: 'rock' });
    expect(container.querySelector('.gesture-icon svg')).not.toBeNull();
    expect(container.querySelector('.gesture-icon')).toHaveClass('sticker');
    void rerender({ id: 'rock', sticker: false });
  });

  it('is decorative: the text label next to it carries the meaning', () => {
    const { container } = render(GestureIcon, { id: 'spock' });
    expect(container.querySelector('.gesture-icon')).toHaveAttribute('aria-hidden', 'true');
  });
});
