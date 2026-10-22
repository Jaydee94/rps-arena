import { describe, expect, expectTypeOf, it } from 'vitest';
import { BLUFF_EMOTES } from './constants';
import { AVATARS, ClientEvents, ERROR_CODES, ProtocolError, parseNickname } from './protocol';
import type { RoomJoined, ServerEvents } from './protocol';
import type { SeatId } from './match';

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProtocolError) return error.code;
    throw error;
  }
  return undefined;
}

describe('parseNickname', () => {
  it('rejects empty and whitespace-only names', () => {
    expect(errorCode(() => parseNickname(''))).toBe('invalid_input');
    expect(errorCode(() => parseNickname('   '))).toBe('invalid_input');
  });

  it('rejects names longer than 16 characters', () => {
    expect(errorCode(() => parseNickname('x'.repeat(17)))).toBe('invalid_input');
  });

  it('accepts 1 and 16 characters', () => {
    expect(parseNickname('x')).toBe('x');
    expect(parseNickname('x'.repeat(16))).toBe('x'.repeat(16));
  });

  it('trims surrounding whitespace', () => {
    expect(parseNickname('  Ann  ')).toBe('Ann');
  });

  it('keeps inner whitespace as is', () => {
    expect(parseNickname('Ann  Lee')).toBe('Ann  Lee');
  });

  it('rejects control characters', () => {
    expect(errorCode(() => parseNickname('A\nB'))).toBe('invalid_input');
    expect(errorCode(() => parseNickname('A\u0000B'))).toBe('invalid_input');
  });

  it('rejects non-string input', () => {
    expect(errorCode(() => parseNickname(undefined as unknown as string))).toBe('invalid_input');
  });
});

describe('AVATARS', () => {
  it('lists 8 lowercase kebab ids', () => {
    expect(AVATARS).toHaveLength(8);
    for (const a of AVATARS) expect(a).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});

describe('ClientEvents', () => {
  const create = { config: { mode: 'classic', bestOf: 3 }, nickname: 'Ann', avatar: 'fox' };

  it('accepts a valid room:create, with and without vsBot', () => {
    expect(ClientEvents['room:create'].safeParse(create).success).toBe(true);
    expect(ClientEvents['room:create'].safeParse({ ...create, vsBot: 'hard' }).success).toBe(true);
  });

  it('rejects room:create with bestOf 4', () => {
    expect(ClientEvents['room:create'].safeParse({ ...create, config: { mode: 'classic', bestOf: 4 } }).success).toBe(false);
  });

  it('rejects room:create with an unknown mode', () => {
    expect(ClientEvents['room:create'].safeParse({ ...create, config: { mode: 'chaos', bestOf: 3 } }).success).toBe(false);
  });

  it('accepts all 7 modes and bestOf 3|5|7', () => {
    for (const mode of ['classic', 'lizard-spock', 'wheel7', 'wheel9', 'wheel15', 'bluff', 'team2v2']) {
      for (const bestOf of [3, 5, 7]) {
        expect(ClientEvents['room:create'].safeParse({ ...create, config: { mode, bestOf } }).success).toBe(true);
      }
    }
  });

  it('does not reject team2v2 combined with vsBot at schema level', () => {
    const payload = { ...create, config: { mode: 'team2v2', bestOf: 3 }, vsBot: 'easy' };
    expect(ClientEvents['room:create'].safeParse(payload).success).toBe(true);
  });

  it('rejects an unknown vsBot level and an unknown avatar', () => {
    expect(ClientEvents['room:create'].safeParse({ ...create, vsBot: 'godlike' }).success).toBe(false);
    expect(ClientEvents['room:create'].safeParse({ ...create, avatar: 'unicorn' }).success).toBe(false);
  });

  it('applies nickname rules inside room:create and room:join', () => {
    expect(ClientEvents['room:create'].safeParse({ ...create, nickname: '   ' }).success).toBe(false);
    expect(ClientEvents['room:join'].safeParse({ code: 'AB3DE', nickname: 'x'.repeat(17), avatar: 'fox' }).success).toBe(false);
    const parsed = ClientEvents['room:join'].parse({ code: 'AB3DE', nickname: '  Ann  ', avatar: 'fox' });
    expect(parsed.nickname).toBe('Ann');
  });

  it('normalizes the room code in room:join and room:rejoin', () => {
    expect(ClientEvents['room:join'].parse({ code: ' ab3de ', nickname: 'Ann', avatar: 'fox' }).code).toBe('AB3DE');
    expect(ClientEvents['room:rejoin'].parse({ code: ' ab3de ', token: 'tok' }).code).toBe('AB3DE');
  });

  it('validates seat:move seats', () => {
    expect(ClientEvents['seat:move'].safeParse({ from: 'a0', to: 'b1' }).success).toBe(true);
    expect(ClientEvents['seat:move'].safeParse({ from: 'a0', to: 'c0' }).success).toBe(false);
  });

  it('validates game:announce and game:pick', () => {
    expect(ClientEvents['game:announce'].safeParse({ emote: null }).success).toBe(true);
    expect(ClientEvents['game:announce'].safeParse({ emote: 'rock' }).success).toBe(true);
    expect(ClientEvents['game:announce'].safeParse({ emote: 5 }).success).toBe(false);
  });

  it('restricts game:announce to bluff emotes or null', () => {
    expect(ClientEvents['game:announce'].safeParse({ emote: 'hello' }).success).toBe(false);
    expect(ClientEvents['game:announce'].safeParse({ emote: '' }).success).toBe(false);
    expect(ClientEvents['game:announce'].safeParse({ emote: null }).success).toBe(true);
    for (const emote of BLUFF_EMOTES) {
      expect(ClientEvents['game:announce'].safeParse({ emote }).success).toBe(true);
    }
    expect(ClientEvents['game:pick'].safeParse({ gesture: 'rock' }).success).toBe(true);
    expect(ClientEvents['game:pick'].safeParse({}).success).toBe(false);
  });

  it('accepts empty payloads for room:start, game:next and room:rematch', () => {
    for (const name of ['room:start', 'game:next', 'room:rematch'] as const) {
      expect(ClientEvents[name].safeParse({}).success).toBe(true);
    }
  });
});

describe('ServerEvents', () => {
  it('room:joined carries code, token and seat', () => {
    expectTypeOf<ServerEvents['room:joined']>().toEqualTypeOf<RoomJoined>();
    expectTypeOf<RoomJoined>().toEqualTypeOf<{ code: string; token: string; seat: SeatId }>();
    const joined: RoomJoined = { code: 'ABCDE', token: 'f'.repeat(32), seat: 'a0' };
    expect(Object.keys(joined).sort()).toEqual(['code', 'seat', 'token']);
  });
});

describe('ERROR_CODES', () => {
  it('includes rate_limited and internal next to the game errors', () => {
    expect(ERROR_CODES).toContain('rate_limited');
    expect(ERROR_CODES).toContain('internal');
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});
