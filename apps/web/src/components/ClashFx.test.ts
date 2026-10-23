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

  it('names the side it lands on (a card side, or the panel centre for a clash)', () => {
    for (const side of ['mine', 'theirs', 'centre'] as const) {
      const { container, unmount } = render(ClashFx, { attack: 'smash', side });
      expect(container.querySelector('.fx')).toHaveClass(`fx--at-${side}`);
      unmount();
    }
  });

  it('renders nothing for an attack without a scene file', () => {
    const { container } = render(ClashFx, { attack: 'zzz-unknown' as Attack, side: 'theirs' });
    expect(container.querySelector('.fx')).toBeNull();
    expect(container.innerHTML.replace(/<!--.*?-->/g, '').trim()).toBe('');
  });

  it('renders the clash graphic of a draw at the centre', () => {
    const { container } = render(ClashFx, { attack: 'clash', side: 'centre' });
    const fx = container.querySelector('.fx.fx--clash.fx--at-centre');
    expect(fx).not.toBeNull();
    expect(fx?.querySelector('svg')).not.toBeNull();
  });
});
