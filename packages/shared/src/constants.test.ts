import { describe, expect, it } from 'vitest';
import { IDLE_ROUNDS_LIMIT } from './constants';

describe('IDLE_ROUNDS_LIMIT', () => {
  it('ends a match after 3 rounds without any human action', () => {
    expect(IDLE_ROUNDS_LIMIT).toBe(3);
  });
});
