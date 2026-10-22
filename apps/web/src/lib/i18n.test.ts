import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  allRelations,
  CODE_ALPHABET,
  CODE_LENGTH,
  ERROR_CODES,
  getGestureSet,
  type GestureSetId,
} from '@rps/shared';
import de from './locales/de.json';
import en from './locales/en.json';

const MODES = ['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15', 'bluff', 'team2v2'];
const SETS: GestureSetId[] = ['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15'];

async function load() {
  vi.resetModules();
  return import('./i18n');
}

function setNavigatorLanguage(language: string) {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(language);
}

describe('i18n', () => {
  beforeEach(() => {
    localStorage.clear();
    setNavigatorLanguage('en-US');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('t() returns different texts per locale', async () => {
    const { t, setLocale } = await load();
    setLocale('de');
    const german = t('home.title');
    setLocale('en');
    const english = t('home.title');
    expect(german).not.toBe('home.title');
    expect(english).not.toBe('home.title');
    expect(german).not.toBe(english);
  });

  it('interpolates variables', async () => {
    const { t, setLocale } = await load();
    setLocale('en');
    expect(t('board.round', { round: 3 })).toContain('3');
    expect(t('board.round', { round: 3 })).not.toContain('{');
  });

  it('returns the key for a missing key and warns in dev mode', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { t } = await load();
    expect(t('does.not.exist')).toBe('does.not.exist');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn for a missing key outside dev mode', async () => {
    vi.stubEnv('DEV', false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { t } = await load();
    expect(t('does.not.exist')).toBe('does.not.exist');
    expect(warn).not.toHaveBeenCalled();
  });

  it('de.json and en.json have exactly the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
  });

  it('has no empty translations', () => {
    for (const dict of [de, en]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), key).not.toBe('');
      }
    }
  });

  it('detects de for German browser languages, en otherwise', async () => {
    const { detectLocale } = await load();
    setNavigatorLanguage('de-AT');
    expect(detectLocale()).toBe('de');
    setNavigatorLanguage('de');
    expect(detectLocale()).toBe('de');
    setNavigatorLanguage('fr-FR');
    expect(detectLocale()).toBe('en');
  });

  it('starts with the locale derived from navigator.language', async () => {
    setNavigatorLanguage('de-AT');
    const { locale } = await load();
    let current: string | undefined;
    locale.subscribe((l) => (current = l))();
    expect(current).toBe('de');
  });

  it('persists the locale and prefers the stored one', async () => {
    const first = await load();
    first.setLocale('de');
    expect(localStorage.getItem('rps.locale')).toBe('de');
    setNavigatorLanguage('en-US');
    const second = await load();
    expect(second.detectLocale()).toBe('de');
  });

  it('works when localStorage throws', async () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    vi.stubGlobal('localStorage', broken);
    setNavigatorLanguage('de-AT');
    const { detectLocale, setLocale, t } = await load();
    expect(detectLocale()).toBe('de');
    expect(() => setLocale('en')).not.toThrow();
    expect(t('home.title')).toBe(en['home.title']);
  });

  it('has an errors.* key for every ErrorCode in both locales', () => {
    for (const code of ERROR_CODES) {
      expect(de, code).toHaveProperty([`errors.${code}`]);
      expect(en, code).toHaveProperty([`errors.${code}`]);
    }
  });

  it('has mode names and descriptions for every mode', () => {
    for (const mode of MODES) {
      for (const suffix of ['name', 'desc']) {
        expect(de, mode).toHaveProperty([`mode.${mode}.${suffix}`]);
        expect(en, mode).toHaveProperty([`mode.${mode}.${suffix}`]);
      }
    }
  });

  it('has a gesture.* key for every gesture of every set', () => {
    const ids = new Set(SETS.flatMap((s) => getGestureSet(s).gestures));
    expect(ids.size).toBeGreaterThanOrEqual(15);
    for (const id of ids) {
      expect(de, id).toHaveProperty([`gesture.${id}`]);
      expect(en, id).toHaveProperty([`gesture.${id}`]);
    }
  });

  it('has the camera.* keys', () => {
    for (const key of ['title', 'experimental', 'privacy', 'denied', 'no_device', 'load_failed']) {
      expect(de).toHaveProperty([`camera.${key}`]);
      expect(en).toHaveProperty([`camera.${key}`]);
    }
  });

  it('has the comic panel and countdown texts in both locales', () => {
    const expected: Record<string, [string, string]> = {
      'home.caption': ['Ohne Account. Link teilen, losspielen.', 'No account. Share a link, start playing.'],
      'home.who_heading': ['Wer bist du?', 'Who are you?'],
      'home.join_short': ['Rein!', 'Go!'],
      'home.create': ['Raum erstellen!', 'Create room!'],
      'countdown.1': ['SCHNICK!', 'ROCK!'],
      'countdown.2': ['SCHNACK!', 'PAPER!'],
      'countdown.3': ['SCHNUCK!', 'SCISSORS!'],
      'board.rule': ['{winner} schlägt {loser}', '{winner} beats {loser}'],
      'burst.zack': ['ZACK!', 'ZAP!'],
    };
    for (const [key, [deText, enText]] of Object.entries(expected)) {
      expect(de, key).toHaveProperty([key], deText);
      expect(en, key).toHaveProperty([key], enText);
    }
  });

  it('uses a code placeholder with CODE_LENGTH characters from CODE_ALPHABET', () => {
    for (const [dict, prefix] of [
      [de, 'z. B. '],
      [en, 'e.g. '],
    ] as const) {
      const placeholder = dict['home.code_placeholder'];
      expect(placeholder.startsWith(prefix)).toBe(true);
      const code = placeholder.slice(prefix.length);
      expect(code).toHaveLength(CODE_LENGTH);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  it('interpolates board.rule with winner and loser', async () => {
    const { t, setLocale } = await load();
    setLocale('de');
    expect(t('board.rule', { winner: 'Stein', loser: 'Schere' })).toBe('Stein schlägt Schere');
    setLocale('en');
    expect(t('board.rule', { winner: 'Rock', loser: 'Scissors' })).toBe('Rock beats Scissors');
  });

  describe('matchup verb sentences', () => {
    const dicts = { de, en } as Record<string, Record<string, string>>;
    const relations = allRelations();

    it('has rule.<winner>.<loser> for every relation in both locales', () => {
      expect(relations).toHaveLength(112);
      for (const [locale, dict] of Object.entries(dicts)) {
        for (const { winner, loser } of relations) {
          const key = `rule.${winner}.${loser}`;
          const text = dict[key];
          expect(typeof text, `${locale} ${key}`).toBe('string');
          expect((text ?? '').trim(), `${locale} ${key}`).not.toBe('');
        }
      }
    });

    it('uses exactly the placeholders {winner} and {loser} once each and no other braces', () => {
      for (const [locale, dict] of Object.entries(dicts)) {
        for (const [key, text] of Object.entries(dict)) {
          if (!key.startsWith('rule.')) continue;
          const label = `${locale} ${key}`;
          expect(text.split('{winner}').length - 1, label).toBe(1);
          expect(text.split('{loser}').length - 1, label).toBe(1);
          expect(text.replace('{winner}', '').replace('{loser}', ''), label).not.toMatch(/[{}]/);
        }
      }
    });

    it('has rule.generic in both locales', () => {
      expect(de['rule.generic']).toBe('{winner} schlägt {loser}');
      expect(en['rule.generic']).toBe('{winner} beats {loser}');
    });

    it('has no rule.* key beyond allRelations() and rule.generic', () => {
      const expected = [
        'rule.generic',
        ...relations.map(({ winner, loser }) => `rule.${winner}.${loser}`),
      ].sort();
      for (const dict of [de, en]) {
        const actual = Object.keys(dict)
          .filter((key) => key.startsWith('rule.'))
          .sort();
        expect(actual).toEqual(expected);
      }
    });

    it('keeps the rule.* keys in the order of allRelations() in both locales', () => {
      const expected = [
        'rule.generic',
        ...relations.map(({ winner, loser }) => `rule.${winner}.${loser}`),
      ];
      for (const dict of [de, en]) {
        expect(Object.keys(dict).filter((key) => key.startsWith('rule.'))).toEqual(expected);
      }
    });

    it('pins the ten classic and Lizard & Spock sentences', () => {
      const pinned: Record<string, [string, string]> = {
        'rock.scissors': ['{winner} zerquetscht {loser}', '{winner} crushes {loser}'],
        'scissors.paper': ['{winner} zerschneidet {loser}', '{winner} cut {loser}'],
        'paper.rock': ['{winner} bedeckt {loser}', '{winner} covers {loser}'],
        'rock.lizard': ['{winner} zerquetscht {loser}', '{winner} crushes {loser}'],
        'lizard.spock': ['{winner} vergiftet {loser}', '{winner} poisons {loser}'],
        'spock.scissors': ['{winner} zertrümmert {loser}', '{winner} smashes {loser}'],
        'scissors.lizard': ['{winner} köpft {loser}', '{winner} decapitate {loser}'],
        'lizard.paper': ['{winner} frisst {loser}', '{winner} eats {loser}'],
        'paper.spock': ['{winner} widerlegt {loser}', '{winner} disproves {loser}'],
        'spock.rock': ['{winner} verdampft {loser}', '{winner} vaporizes {loser}'],
      };
      for (const [pair, [deText, enText]] of Object.entries(pinned)) {
        expect(de, pair).toHaveProperty([`rule.${pair}`], deText);
        expect(en, pair).toHaveProperty([`rule.${pair}`], enText);
      }
    });

    it('does not repeat a verb or verb phrase more than twice among the sentences of one winner', () => {
      // The words between the placeholders, without a leading reflexive/particle word.
      const phraseOf = (text: string) =>
        text
          .slice(text.indexOf('{winner}') + '{winner}'.length, text.indexOf('{loser}'))
          .trim()
          .toLowerCase()
          .replace(/^sich\s+/, '');
      for (const [locale, dict] of Object.entries(dicts)) {
        const phrases = new Map<string, Map<string, number>>();
        const verbs = new Map<string, Map<string, number>>();
        const bump = (map: Map<string, Map<string, number>>, winner: string, word: string) => {
          const counts = map.get(winner) ?? new Map<string, number>();
          counts.set(word, (counts.get(word) ?? 0) + 1);
          map.set(winner, counts);
        };
        for (const { winner, loser } of relations) {
          const phrase = phraseOf(dict[`rule.${winner}.${loser}`] ?? '');
          expect(phrase, `${locale} ${winner}>${loser}`).not.toBe('');
          bump(phrases, winner, phrase);
          bump(verbs, winner, phrase.split(/\s+/)[0] ?? '');
        }
        for (const [kind, map] of [
          ['phrase', phrases],
          ['verb', verbs],
        ] as const) {
          for (const [winner, counts] of map) {
            for (const [word, count] of counts) {
              expect(count, `${locale} ${winner} reuses ${kind} "${word}"`).toBeLessThanOrEqual(2);
            }
          }
        }
      }
    });

    it('keeps each sentence short (at most 38 characters without the placeholders)', () => {
      for (const [locale, dict] of Object.entries(dicts)) {
        for (const [key, text] of Object.entries(dict)) {
          if (!key.startsWith('rule.')) continue;
          const bare = text.replace('{winner}', '').replace('{loser}', '');
          expect(bare.length, `${locale} ${key}`).toBeLessThanOrEqual(38);
        }
      }
    });
  });
});
