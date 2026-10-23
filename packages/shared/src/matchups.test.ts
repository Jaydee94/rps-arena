import { describe, expect, it } from 'vitest';
import { gestureBeats, getGestureSet } from './gestures';
import type { GestureSetId } from './gestures';
import { GESTURE_ATTACK, PAIR_OVERRIDES, REACTION_FOR_ATTACK, allRelations, matchupFor } from './matchups';
import type { Attack } from './matchups';

const SET_IDS: GestureSetId[] = ['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15'];

const ATTACKS: Attack[] = [
  'smash',
  'slash',
  'wrap',
  'burn',
  'splash',
  'gust',
  'zap',
  'shoot',
  'bite',
  'punch',
  'entangle',
  'absorb',
  'curse',
  'poison',
];

const LIZARD_SPOCK_ADDITIONS = [
  'rock>lizard',
  'scissors>lizard',
  'lizard>paper',
  'lizard>spock',
  'paper>spock',
  'spock>rock',
  'spock>scissors',
];

function pairsOf(id: GestureSetId): string[] {
  const set = getGestureSet(id);
  return set.gestures.flatMap((winner) => gestureBeats(set, winner).map((loser) => `${winner}>${loser}`));
}

const keys = () => allRelations().map((r) => `${r.winner}>${r.loser}`);

describe('allRelations', () => {
  it('has exactly 112 unique pairs', () => {
    const list = keys();
    expect(list).toHaveLength(112);
    expect(new Set(list).size).toBe(112);
  });

  it('is 105 wheel15 pairs plus the 7 Lizard & Spock additions', () => {
    const wheel15 = new Set(pairsOf('wheel15'));
    expect(wheel15.size).toBe(105);
    const all = new Set(keys());
    const extra = [...all].filter((k) => !wheel15.has(k));
    expect(extra.sort()).toEqual([...LIZARD_SPOCK_ADDITIONS].sort());
  });

  it('contains the classic, wheel7 and wheel9 relations within the wheel15 pairs and additions', () => {
    const allowed = new Set([...pairsOf('wheel15'), ...LIZARD_SPOCK_ADDITIONS]);
    for (const id of ['classic', 'wheel7', 'wheel9'] as const) {
      for (const pair of pairsOf(id)) expect(allowed.has(pair), `${id}: ${pair}`).toBe(true);
    }
  });

  it('covers every beat relation of every gesture set', () => {
    const all = new Set(keys());
    for (const id of SET_IDS) {
      for (const pair of pairsOf(id)) expect(all.has(pair), `${id}: ${pair}`).toBe(true);
    }
  });

  it('includes known pairs and never has a pair in both directions', () => {
    const all = new Set(keys());
    for (const pair of ['rock>scissors', 'spock>rock', 'lizard>spock', 'water>fire']) {
      expect(all.has(pair)).toBe(true);
    }
    for (const k of all) {
      const [w, l] = k.split('>');
      expect(all.has(`${l}>${w}`), k).toBe(false);
    }
  });

  it('returns a fresh array each call', () => {
    expect(allRelations()).not.toBe(allRelations());
    expect(allRelations()).toEqual(allRelations());
  });
});

describe('GESTURE_ATTACK', () => {
  it('covers exactly the gestures of all five sets', () => {
    const expected = new Set(SET_IDS.flatMap((id) => getGestureSet(id).gestures));
    expect(expected.size).toBe(17);
    expect(Object.keys(GESTURE_ATTACK).sort()).toEqual([...expected].sort());
  });

  it('uses only the 14 attacks and every attack at least once', () => {
    const used = new Set(Object.values(GESTURE_ATTACK));
    for (const a of used) expect(ATTACKS).toContain(a);
    expect([...used].sort()).toEqual([...ATTACKS].sort());
  });

  it('assigns one attack per gesture (full mapping)', () => {
    expect(GESTURE_ATTACK).toEqual({
      rock: 'smash',
      scissors: 'slash',
      paper: 'wrap',
      fire: 'burn',
      water: 'splash',
      air: 'gust',
      lightning: 'zap',
      gun: 'shoot',
      snake: 'bite',
      wolf: 'bite',
      human: 'punch',
      tree: 'entangle',
      sponge: 'absorb',
      devil: 'curse',
      dragon: 'burn',
      lizard: 'poison',
      spock: 'zap',
    });
  });

  it('is not mutable', () => {
    expect(Object.isFrozen(GESTURE_ATTACK)).toBe(true);
    expect(Object.isFrozen(REACTION_FOR_ATTACK)).toBe(true);
    expect(Object.isFrozen(PAIR_OVERRIDES)).toBe(true);
  });
});

describe('REACTION_FOR_ATTACK', () => {
  it('has no gaps: every attack maps to a reaction', () => {
    expect(Object.keys(REACTION_FOR_ATTACK).sort()).toEqual([...ATTACKS].sort());
    for (const a of ATTACKS) expect(REACTION_FOR_ATTACK[a]).toBeTruthy();
  });

  it('maps each attack to its reaction (full mapping)', () => {
    expect(REACTION_FOR_ATTACK).toEqual({
      smash: 'crumble',
      slash: 'split',
      wrap: 'cover',
      burn: 'char',
      splash: 'drench',
      gust: 'blow',
      zap: 'shock',
      shoot: 'perforate',
      bite: 'chomp',
      punch: 'knockback',
      entangle: 'bind',
      absorb: 'squeeze',
      curse: 'hexed',
      poison: 'wobble',
    });
  });
});

describe('matchupFor', () => {
  it('resolves an attack and a reaction for every relation', () => {
    for (const { winner, loser } of allRelations()) {
      const m = matchupFor(winner, loser);
      expect(ATTACKS).toContain(m.attack);
      expect(m.reaction).toBeTruthy();
      expect(m.key).toBe(`${winner}>${loser}`);
    }
  });

  it('builds the generic matchup from the winner attack', () => {
    expect(matchupFor('rock', 'scissors')).toEqual({ attack: 'smash', reaction: 'crumble', key: 'rock>scissors' });
    expect(matchupFor('scissors', 'paper')).toEqual({ attack: 'slash', reaction: 'split', key: 'scissors>paper' });
    expect(matchupFor('spock', 'rock')).toEqual({ attack: 'zap', reaction: 'shock', key: 'spock>rock' });
  });

  it('applies the water>fire override', () => {
    expect(matchupFor('water', 'fire')).toEqual({ attack: 'splash', reaction: 'extinguish', key: 'water>fire' });
    expect(matchupFor('water', 'paper').reaction).toBe('drench');
  });

  it('makes Spock smash the scissors and the lizard bite the paper, as their sentences say', () => {
    expect(matchupFor('spock', 'scissors')).toEqual({ attack: 'smash', reaction: 'crumble', key: 'spock>scissors' });
    expect(matchupFor('lizard', 'paper')).toEqual({ attack: 'bite', reaction: 'chomp', key: 'lizard>paper' });
    // The other pairs of those winners keep their own attack.
    expect(matchupFor('spock', 'rock').attack).toBe('zap');
    expect(matchupFor('lizard', 'spock').attack).toBe('poison');
  });

  it('puts fire out whoever beats it, with the winner keeping its own attack', () => {
    const expected: Record<string, Attack> = {
      water: 'splash',
      rock: 'smash',
      air: 'gust',
      gun: 'shoot',
      lightning: 'zap',
      dragon: 'burn',
      devil: 'curse',
    };
    const winners = allRelations()
      .filter((r) => r.loser === 'fire')
      .map((r) => r.winner);
    expect(winners.sort()).toEqual(Object.keys(expected).sort());
    for (const winner of winners) {
      expect(matchupFor(winner, 'fire'), winner).toEqual({ attack: expected[winner], reaction: 'extinguish', key: `${winner}>fire` });
    }
  });

  it('never ties up, punches or bites air and water: they are taken in, blown away or splashed', () => {
    const expected: Record<string, [Attack, string]> = {
      'tree>water': ['absorb', 'squeeze'],
      'tree>air': ['absorb', 'squeeze'],
      'human>air': ['absorb', 'squeeze'],
      'human>water': ['absorb', 'squeeze'],
      'wolf>air': ['gust', 'blow'],
      'wolf>water': ['splash', 'drench'],
      'snake>air': ['absorb', 'squeeze'],
      'snake>water': ['splash', 'drench'],
    };
    for (const [key, [attack, reaction]] of Object.entries(expected)) {
      const [winner = '', loser = ''] = key.split('>');
      expect(matchupFor(winner, loser), key).toEqual({ attack, reaction, key });
    }
    // The rule for every relation, so a new gesture set cannot bring a bite on water back.
    for (const { winner, loser } of allRelations()) {
      if (loser !== 'air' && loser !== 'water') continue;
      const { attack, reaction } = matchupFor(winner, loser);
      expect(['bite', 'punch', 'entangle'], `${winner}>${loser}`).not.toContain(attack);
      expect(['bind', 'knockback', 'chomp'], `${winner}>${loser}`).not.toContain(reaction);
    }
  });

  it('covers every loser of paper with a sheet (the generic wrap reaction, no override needed)', () => {
    const losers = allRelations()
      .filter((r) => r.winner === 'paper')
      .map((r) => r.loser);
    expect(losers.sort()).toEqual(['air', 'devil', 'dragon', 'gun', 'lightning', 'rock', 'spock', 'water']);
    for (const loser of losers) {
      expect(matchupFor('paper', loser), loser).toEqual({ attack: 'wrap', reaction: 'cover', key: `paper>${loser}` });
      expect(Object.hasOwn(PAIR_OVERRIDES, `paper>${loser}`), loser).toBe(false);
    }
  });

  it('only overrides pairs that exist as relations', () => {
    const all = new Set(keys());
    for (const k of Object.keys(PAIR_OVERRIDES)) expect(all.has(k), k).toBe(true);
  });

  it('is deterministic and returns fresh objects', () => {
    const a = matchupFor('lightning', 'gun');
    const b = matchupFor('lightning', 'gun');
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    a.reaction = 'wobble';
    expect(matchupFor('lightning', 'gun').reaction).toBe('shock');
  });

  it('throws on an unknown gesture and names it', () => {
    expect(() => matchupFor('banana', 'rock')).toThrow(/banana/);
    expect(() => matchupFor('rock', 'kiwi')).toThrow(/kiwi/);
  });
});
