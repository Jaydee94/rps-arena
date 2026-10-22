import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ComicBurst from './ComicBurst.svelte';

function mockMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion: reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('ComicBurst', () => {
  it('renders the text with the variant class and the pop-in animation class', () => {
    mockMotion(false);
    render(ComicBurst, { text: 'POW!', variant: 'pow' });
    const burst = screen.getByText('POW!').closest('.burst');
    expect(burst).toHaveClass('burst--pow');
    expect(burst).toHaveClass('burst--animated');
  });

  it('renders without the animation class under prefers-reduced-motion: reduce', () => {
    mockMotion(true);
    render(ComicBurst, { text: 'BAM!', variant: 'bam' });
    const burst = screen.getByText('BAM!').closest('.burst');
    expect(burst).toHaveClass('burst--bam');
    expect(burst).not.toHaveClass('burst--animated');
  });

  it('works where matchMedia does not exist', () => {
    render(ComicBurst, { text: 'ZAP!', variant: 'zap' });
    expect(screen.getByText('ZAP!')).toBeInTheDocument();
  });

  it('draws a jagged star behind the text', () => {
    mockMotion(false);
    const { container } = render(ComicBurst, { text: 'WIN!', variant: 'win' });
    const points = container.querySelector('polygon')?.getAttribute('points')?.trim().split(/\s+/) ?? [];
    expect(points.length).toBeGreaterThanOrEqual(20);
  });
});
