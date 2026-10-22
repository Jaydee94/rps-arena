import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, CODE_LENGTH, generateCode, normalizeCode } from './codes';

describe('normalizeCode', () => {
  it('trims and upper-cases', () => {
    expect(normalizeCode('  ab3de ')).toBe('AB3DE');
  });
});

describe('generateCode', () => {
  it('uses the agreed alphabet without ambiguous characters', () => {
    expect(CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789');
    for (const ch of '0O1IL') expect(CODE_ALPHABET).not.toContain(ch);
  });

  it('returns 5 characters from the alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    }
  });

  it('is more than 99% unique over 1000 calls', () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateCode()));
    expect(codes.size).toBeGreaterThan(990);
  });

  it('is deterministic for an injected rng and survives rng() === 0 and values near 1', () => {
    expect(generateCode(() => 0)).toBe('AAAAA');
    expect(generateCode(() => 0.999999)).toBe('99999');
  });
});
