import { allRelations, PAIR_OVERRIDES } from '@rps/shared';
import { describe, expect, it } from 'vitest';
import { ATTACKS, DRAW_GESTURE, fxHref, galleryEntry, galleryGroups, neighbours, parseFxPair } from './fx-gallery';

const params = (query: string) => new URLSearchParams(query);

describe('ATTACKS', () => {
  it('lists the 14 attack archetypes once each', () => {
    expect(ATTACKS).toHaveLength(14);
    expect(new Set(ATTACKS).size).toBe(14);
    expect(ATTACKS[0]).toBe('smash');
  });
});

describe('galleryEntry', () => {
  it('carries the generic attack and reaction of a pair', () => {
    expect(galleryEntry('rock', 'scissors')).toEqual({
      winner: 'rock',
      loser: 'scissors',
      key: 'rock>scissors',
      attack: 'smash',
      reaction: 'crumble',
      override: false,
    });
  });

  it('marks pairs with an override', () => {
    expect(galleryEntry('water', 'fire')).toMatchObject({ attack: 'splash', reaction: 'extinguish', override: true });
  });
});

describe('galleryGroups', () => {
  const groups = galleryGroups();
  const entries = groups.flatMap((g) => g.entries);

  it('holds every relation exactly once (112 pairs)', () => {
    expect(entries).toHaveLength(112);
    expect(new Set(entries.map((e) => e.key))).toEqual(new Set(allRelations().map((r) => `${r.winner}>${r.loser}`)));
  });

  it('has one group per attack, in model order', () => {
    expect(groups.map((g) => g.attack)).toEqual(ATTACKS);
    for (const g of groups) for (const e of g.entries) expect(e.attack).toBe(g.attack);
  });

  it('flags exactly the override pairs', () => {
    expect(entries.filter((e) => e.override).map((e) => e.key).sort()).toEqual(Object.keys(PAIR_OVERRIDES).sort());
  });

  it('sorts a group by winner, then loser, in first-appearance order', () => {
    const smash = groups.find((g) => g.attack === 'smash')?.entries.map((e) => e.key) ?? [];
    expect(smash[0]).toBe('rock>scissors');
    const relations = [
      { winner: 'paper', loser: 'rock' },
      { winner: 'rock', loser: 'scissors' },
      { winner: 'rock', loser: 'lizard' },
      { winner: 'rock', loser: 'fire' },
    ];
    // Order of appearance: paper, rock, scissors, lizard, fire.
    expect(galleryGroups(relations).find((g) => g.attack === 'smash')?.entries.map((e) => e.loser)).toEqual([
      'scissors',
      'lizard',
      'fire',
    ]);
  });

  it('leaves out attacks without pairs', () => {
    expect(galleryGroups([{ winner: 'rock', loser: 'scissors' }]).map((g) => g.attack)).toEqual(['smash']);
  });
});

describe('parseFxPair', () => {
  it('reads winner=/loser= and a=/b=', () => {
    expect(parseFxPair(params('winner=rock&loser=scissors'))).toEqual({ kind: 'decided', winner: 'rock', loser: 'scissors' });
    expect(parseFxPair(params('a=paper&b=rock'))).toEqual({ kind: 'decided', winner: 'paper', loser: 'rock' });
  });

  it('turns a pair given the wrong way round', () => {
    expect(parseFxPair(params('winner=scissors&loser=rock'))).toEqual({ kind: 'decided', winner: 'rock', loser: 'scissors' });
  });

  it('reads equal gestures as a draw', () => {
    expect(parseFxPair(params('winner=fire&loser=fire'))).toEqual({ kind: 'draw', gesture: 'fire' });
  });

  it('rejects missing or unknown gestures and pairs that never meet', () => {
    expect(parseFxPair(params('winner=rock'))).toBeNull();
    expect(parseFxPair(params('winner=rock&loser=banana'))).toBeNull();
    expect(parseFxPair(params('winner=constructor&loser=rock'))).toBeNull();
    expect(parseFxPair(params('winner=rock&loser=scissors'), [])).toBeNull();
  });
});

describe('fxHref and neighbours', () => {
  it('links the looping scene of a pair', () => {
    expect(fxHref('rock', 'scissors')).toBe('?demo=fx&winner=rock&loser=scissors');
  });

  it('walks the flat gallery order and wraps around through the draw', () => {
    const groups = galleryGroups();
    const flat = groups.flatMap((g) => g.entries);
    const first = flat[0]!;
    const last = flat[flat.length - 1]!;
    expect(neighbours(groups, first.key)).toEqual({
      prev: fxHref(DRAW_GESTURE, DRAW_GESTURE),
      next: fxHref(flat[1]!.winner, flat[1]!.loser),
    });
    expect(neighbours(groups, 'draw')).toEqual({ prev: fxHref(last.winner, last.loser), next: fxHref(first.winner, first.loser) });
    expect(neighbours(groups, 'nope>nothing')).toBeNull();
  });
});
