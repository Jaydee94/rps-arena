import { describe, expect, expectTypeOf, it } from 'vitest';
import { BLUFF_EMOTES, MAX_SPECTATORS } from './constants';
import { AVATARS, ClientEvents, ERROR_CODES, ProtocolError, parseNickname } from './protocol';
import type { StandingRow, TournamentFormat } from './tournament';
import type {
  PlayerView,
  PublicPairing,
  PublicParticipant,
  PublicSpectator,
  PublicTournament,
  RoomJoined,
  RoomView,
  ServerEvents,
  SpectatorView,
} from './protocol';
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
  it('lists 32 lowercase kebab ids', () => {
    expect(AVATARS).toHaveLength(32);
    for (const a of AVATARS) expect(a).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('has no duplicates and keeps the original 8 first, in order', () => {
    expect(new Set(AVATARS).size).toBe(AVATARS.length);
    expect(AVATARS.slice(0, 8)).toStrictEqual(['fox', 'robot', 'cat', 'owl', 'panda', 'dino', 'alien', 'ghost']);
  });

  it('accepts every avatar in room:create and rejects unknown ones', () => {
    const base = { config: { mode: 'classic', bestOf: 3 }, nickname: 'Ann' };
    for (const avatar of AVATARS) expect(ClientEvents['room:create'].safeParse({ ...base, avatar }).success).toBe(true);
    expect(ClientEvents['room:create'].safeParse({ ...base, avatar: 'dragon' }).success).toBe(false);
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
    expect(ClientEvents['room:create'].safeParse({ ...create, avatar: 'dragon' }).success).toBe(false);
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

  it('accepts empty payloads for room:start, game:next, room:rematch and room:leave', () => {
    for (const name of ['room:start', 'game:next', 'room:rematch', 'room:leave'] as const) {
      expect(ClientEvents[name].safeParse({}).success).toBe(true);
    }
  });
});

describe('ServerEvents', () => {
  it('room:joined carries code, token, role and seat', () => {
    expectTypeOf<ServerEvents['room:joined']>().toEqualTypeOf<RoomJoined>();
    expectTypeOf<RoomJoined>().toEqualTypeOf<{
      code: string;
      token: string;
      role: 'player' | 'spectator';
      seat: SeatId | null;
    }>();
    const joined: RoomJoined = { code: 'ABCDE', token: 'f'.repeat(32), role: 'player', seat: 'a0' };
    expect(Object.keys(joined).sort()).toEqual(['code', 'role', 'seat', 'token']);
  });

  it('room:state carries the union of player and spectator views', () => {
    expectTypeOf<ServerEvents['room:state']>().toEqualTypeOf<RoomView>();
    expectTypeOf<RoomView>().toEqualTypeOf<PlayerView | SpectatorView>();
  });
});

describe('ERROR_CODES', () => {
  it('includes rate_limited and internal next to the game errors', () => {
    expect(ERROR_CODES).toContain('rate_limited');
    expect(ERROR_CODES).toContain('internal');
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});

describe('spectator protocol additions', () => {
  it('has the not_player error code', () => {
    expect(ERROR_CODES).toContain('not_player');
  });

  it('caps spectators at 16', () => {
    expect(MAX_SPECTATORS).toBe(16);
  });

  it('discriminates views by role and gives spectators no seat of their own', () => {
    const config = { mode: 'classic', bestOf: 3 } as const;
    const spectators: PublicSpectator[] = [{ id: 's1', nickname: 'Zed', avatar: 'fox', connected: true }];
    const base = {
      code: 'ABCDE',
      config,
      hostSeat: 'a0' as SeatId,
      isHost: false,
      players: {},
      spectators,
      match: null,
      tournament: null,
      deadline: null,
    };
    const spectator = { role: 'spectator', me: null, ...base } satisfies SpectatorView;
    const player = { role: 'player', you: 'a0', ...base } satisfies PlayerView;
    // @ts-expect-error a player view requires role: 'player'
    const noRole: PlayerView = { you: 'a0', ...base };
    // @ts-expect-error a spectator view has no `you`
    const withYou: SpectatorView = { role: 'spectator', me: null, you: 'a0', ...base };
    const views: RoomView[] = [spectator, player];
    expect(views.map((view) => view.role)).toEqual(['spectator', 'player']);
    expect('you' in spectator).toBe(false);
    expect([noRole, withYou]).toHaveLength(2);
  });
});

describe('tournament protocol additions', () => {
  const create = { config: { mode: 'classic', bestOf: 3 }, nickname: 'Ann', avatar: 'fox' };

  it('accepts room:create with a knockout or roundrobin tournament', () => {
    for (const format of ['knockout', 'roundrobin']) {
      const result = ClientEvents['room:create'].safeParse({ ...create, tournament: { format } });
      expect(result.success).toBe(true);
    }
    expect(ClientEvents['room:create'].parse({ ...create, tournament: { format: 'knockout' } }).tournament).toEqual({
      format: 'knockout',
    });
  });

  it('keeps the tournament optional on room:create', () => {
    expect(ClientEvents['room:create'].parse(create).tournament).toBeUndefined();
  });

  it('rejects room:create with any other tournament format', () => {
    for (const format of ['swiss', '', 'Knockout', 3, null]) {
      const result = ClientEvents['room:create'].safeParse({ ...create, tournament: { format } });
      expect(result.success).toBe(false);
    }
    expect(ClientEvents['room:create'].safeParse({ ...create, tournament: {} }).success).toBe(false);
  });

  it('keeps bestOf 1 out of room:create (internal to tie-break matches)', () => {
    expect(ClientEvents['room:create'].safeParse({ ...create, config: { mode: 'classic', bestOf: 1 } }).success).toBe(
      false,
    );
  });

  it('has an empty schema for tournament:skip', () => {
    expect(ClientEvents['tournament:skip'].safeParse({}).success).toBe(true);
    expect(ClientEvents['tournament:skip'].safeParse(undefined).success).toBe(false);
    expect(ClientEvents['tournament:skip'].safeParse('x').success).toBe(false);
  });

  it('has the not_enough_players error code', () => {
    expect(ERROR_CODES).toContain('not_enough_players');
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it('types the public tournament shapes', () => {
    expectTypeOf<PublicParticipant>().toEqualTypeOf<{
      id: string;
      nickname: string;
      avatar: string;
      connected: boolean;
      forfeited: boolean;
    }>();
    expectTypeOf<PublicPairing>().toEqualTypeOf<{
      id: string;
      round: number;
      a: string | null;
      b: string | null;
      bestOf: 1 | 3;
      tiebreak: boolean;
      winner: string | null;
      decidedBy: 'match' | 'forfeit' | 'coin' | 'bye' | 'none' | null;
      score: { a: number; b: number } | null;
    }>();
    expectTypeOf<PublicTournament>().toEqualTypeOf<{
      format: TournamentFormat;
      phase: 'lobby' | 'draw' | 'match' | 'intermission' | 'finished';
      participants: PublicParticipant[];
      pairings: PublicPairing[];
      currentPairingId: string | null;
      standings: StandingRow[];
      podium: { rank: 1 | 2 | 3; ids: string[] }[];
      youId: string | null;
      hostId: string | null;
      untilMs: number | null;
    }>();
  });

  it('requires a tournament field (nullable) on both views', () => {
    expectTypeOf<PlayerView['tournament']>().toEqualTypeOf<PublicTournament | null>();
    expectTypeOf<SpectatorView['tournament']>().toEqualTypeOf<PublicTournament | null>();
    const base = {
      code: 'ABCDE',
      config: { mode: 'classic', bestOf: 3 } as const,
      hostSeat: 'a0' as SeatId,
      isHost: false,
      players: {},
      spectators: [],
      match: null,
      deadline: null,
    };
    // @ts-expect-error a player view requires the tournament field
    const player: PlayerView = { role: 'player', you: 'a0', ...base };
    // @ts-expect-error a spectator view requires the tournament field
    const spectator: SpectatorView = { role: 'spectator', me: null, ...base };
    const ok: PlayerView = { role: 'player', you: 'a0', ...base, tournament: null };
    expect([player, spectator, ok]).toHaveLength(3);
  });
});
