import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import type { Attack } from '@rps/shared';
import ClashFx from './ClashFx.svelte';

describe('ClashFx', () => {
  it('renders the smash graphic for attack="smash"', () => {
    const { container } = render(ClashFx, { attack: 'smash', side: 'theirs' });
    const fx = container.querySelector('.fx');
    expect(fx).not.toBeNull();
    expect(fx).toHaveClass('fx--smash');
    expect(fx?.querySelector('svg')).not.toBeNull();
  });

  it('is hidden from assistive technology', () => {
    const { container } = render(ClashFx, { attack: 'smash', side: 'mine' });
    expect(container.querySelector('.fx')).toHaveAttribute('aria-hidden', 'true');
  });

  it('lands the effect on the given side', () => {
    const { container } = render(ClashFx, { attack: 'smash', side: 'mine' });
    expect(container.querySelector('.fx')).toHaveClass('fx--at-mine');
  });

  it('renders nothing for an attack without a scene file', () => {
    const { container } = render(ClashFx, { attack: 'zzz-unknown' as Attack, side: 'theirs' });
    expect(container.querySelector('.fx')).toBeNull();
    expect(container.innerHTML.replace(/<!--.*?-->/g, '').trim()).toBe('');
  });

  // Task 4c adds fx/clash.svelte and turns this into a positive test.
  it('renders nothing for a clash (draw) until its scene exists', () => {
    const { container } = render(ClashFx, { attack: 'clash', side: 'theirs' });
    expect(container.querySelector('.fx')).toBeNull();
  });
});
