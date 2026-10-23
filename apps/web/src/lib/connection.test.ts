import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { PlayerView, SpectatorView } from '@rps/shared';

type Handler = (payload?: unknown) => void;

const fake = vi.hoisted(() => {
  const handlers = new Map<string, Handler[]>();
  const socket = {
    connected: false,
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return socket;
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
  return {
    socket,
    io: vi.fn(() => socket),
    trigger(event: string, payload?: unknown) {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
    reset() {
      handlers.clear();
      socket.connected = false;
      socket.on.mockClear();
      socket.emit.mockClear();
      socket.disconnect.mockClear();
      fake.io.mockClear();
    },
  };
});

vi.mock('socket.io-client', () => ({ io: fake.io }));

const SESSION_KEY = 'rps.session';

const VIEW = {
  role: 'player',
  code: 'ABCD',
  config: { mode: 'classic', bestOf: 3 },
  you: 'a0',
  hostSeat: 'a0',
  isHost: true,
  players: {},
  spectators: [],
  match: null,
  tournament: null,
  deadline: null,
} satisfies PlayerView;

const SPECTATOR_VIEW = {
  role: 'spectator',
  code: 'ABCD',
  config: { mode: 'classic', bestOf: 3 },
  hostSeat: 'a0',
  isHost: false,
  me: null,
  players: {},
  spectators: [],
  match: null,
  tournament: null,
  deadline: null,
} satisfies SpectatorView;

async function load() {
  vi.resetModules();
  return import('./connection');
}

describe('connection', () => {
  beforeEach(() => {
    fake.reset();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has no side effects at import time', async () => {
    await load();
    expect(fake.io).not.toHaveBeenCalled();
  });

  it('connects with the websocket transport only', async () => {
    const { connect } = await load();
    connect();
    connect();
    expect(fake.io).toHaveBeenCalledTimes(1);
    expect(fake.io).toHaveBeenCalledWith({ transports: ['websocket'] });
  });

  it('emits room:rejoin on connect when credentials are stored', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: 'ABCD', token: 'secret' }));
    const { connect, status } = await load();
    connect();
    fake.trigger('connect');
    expect(fake.socket.emit).toHaveBeenCalledWith('room:rejoin', { code: 'ABCD', token: 'secret' });
    expect(get(status)).toBe('connected');
  });

  it('rejoins again after a reconnect', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: 'ABCD', token: 'secret' }));
    const { connect, status } = await load();
    connect();
    fake.trigger('connect');
    fake.trigger('disconnect');
    expect(get(status)).toBe('disconnected');
    fake.trigger('connect');
    expect(fake.socket.emit).toHaveBeenCalledTimes(2);
  });

  it('does not emit room:rejoin without credentials', async () => {
    const { connect } = await load();
    connect();
    fake.trigger('connect');
    expect(fake.socket.emit).not.toHaveBeenCalled();
  });

  it('ignores malformed stored credentials', async () => {
    sessionStorage.setItem(SESSION_KEY, '{not json');
    const { connect } = await load();
    connect();
    fake.trigger('connect');
    expect(fake.socket.emit).not.toHaveBeenCalled();
  });

  it('updates the room store on room:state', async () => {
    const { connect, room } = await load();
    connect();
    expect(get(room)).toBeNull();
    fake.trigger('room:state', VIEW);
    expect(get(room)).toEqual(VIEW);
  });

  it('fills playerRoom and empties spectatorRoom for a player view', async () => {
    const { connect, room, playerRoom, spectatorRoom } = await load();
    connect();
    expect(get(playerRoom)).toBeNull();
    expect(get(spectatorRoom)).toBeNull();
    fake.trigger('room:state', VIEW);
    expect(get(room)).toEqual(VIEW);
    expect(get(playerRoom)).toEqual(VIEW);
    expect(get(spectatorRoom)).toBeNull();
  });

  it('fills spectatorRoom and empties playerRoom for a spectator view', async () => {
    const { connect, room, playerRoom, spectatorRoom } = await load();
    connect();
    fake.trigger('room:state', VIEW);
    fake.trigger('room:state', SPECTATOR_VIEW);
    expect(get(room)).toEqual(SPECTATOR_VIEW);
    expect(get(spectatorRoom)).toEqual(SPECTATOR_VIEW);
    expect(get(playerRoom)).toBeNull();
  });

  it('stores the session on room:joined for a spectator like for a player', async () => {
    const { connect } = await load();
    connect();
    fake.trigger('room:joined', { code: 'WXYZ', token: 'spec-tok', role: 'spectator', seat: null });
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')).toEqual({
      code: 'WXYZ',
      token: 'spec-tok',
    });
  });

  it('rejoins a stored spectator session and gets the spectator view again', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: 'ABCD', token: 'spec-tok' }));
    const { connect, spectatorRoom, playerRoom } = await load();
    connect();
    fake.trigger('connect');
    expect(fake.socket.emit).toHaveBeenCalledWith('room:rejoin', { code: 'ABCD', token: 'spec-tok' });
    fake.trigger('room:state', SPECTATOR_VIEW);
    expect(get(spectatorRoom)).toEqual(SPECTATOR_VIEW);
    expect(get(playerRoom)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it('updates lastError on room:error and clears it again', async () => {
    const { connect, lastError, clearError } = await load();
    connect();
    fake.trigger('room:error', { code: 'room_full', message: 'Room is full' });
    expect(get(lastError)).toMatchObject({ code: 'room_full' });
    clearError();
    expect(get(lastError)).toBeNull();
  });

  it.each(['bad_token', 'room_not_found'] as const)(
    'drops credentials and the stale room when a rejoin is rejected with %s',
    async (code) => {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: 'ABCD', token: 'old' }));
      const { connect, room } = await load();
      connect();
      fake.trigger('room:state', VIEW);
      expect(get(room)).toEqual(VIEW);
      fake.trigger('connect');
      fake.trigger('room:error', { code, message: 'rejected' });
      expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
      expect(get(room)).toBeNull();
    },
  );

  it('keeps the session and room when a user-initiated join fails with room_not_found', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: 'ABCD', token: 'valid' }));
    const { connect, room, joinRoom } = await load();
    connect();
    fake.trigger('connect');
    fake.trigger('room:state', VIEW);
    joinRoom({ code: 'TYPO', nickname: 'Bob', avatar: 'cat' });
    fake.trigger('room:error', { code: 'room_not_found', message: 'nope' });
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')).toEqual({
      code: 'ABCD',
      token: 'valid',
    });
    expect(get(room)).toEqual(VIEW);
  });

  it('does not treat a later error as a rejoin rejection once the rejoin succeeded', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: 'ABCD', token: 'valid' }));
    const { connect, room } = await load();
    connect();
    fake.trigger('connect');
    fake.trigger('room:state', VIEW);
    fake.trigger('room:error', { code: 'room_not_found', message: 'later' });
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
    expect(get(room)).toEqual(VIEW);
  });

  it('stores code and token on room:joined', async () => {
    const { connect } = await load();
    connect();
    fake.trigger('room:joined', { code: 'WXYZ', token: 'tok', role: 'player', seat: 'b0' });
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')).toEqual({
      code: 'WXYZ',
      token: 'tok',
    });
  });

  it('forgetSession removes the stored credentials so a reload does not rejoin', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: 'WXYZ', token: 'tok' }));
    const { forgetSession } = await load();
    forgetSession();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('keeps working when storage throws', async () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    vi.stubGlobal('sessionStorage', broken);
    const { connect, room, lastError } = await load();
    connect();
    expect(() => fake.trigger('connect')).not.toThrow();
    expect(() => fake.trigger('room:joined', { code: 'WXYZ', token: 'tok', role: 'player', seat: 'a0' })).not.toThrow();
    expect(() => fake.trigger('room:error', { code: 'bad_token', message: '' })).not.toThrow();
    fake.trigger('room:state', VIEW);
    expect(get(room)).toEqual(VIEW);
    expect(get(lastError)).toMatchObject({ code: 'bad_token' });
    expect(fake.socket.emit).not.toHaveBeenCalled();
  });

  it('emits the client events with their payloads', async () => {
    const api = await load();
    api.createRoom({
      config: { mode: 'classic', bestOf: 3 },
      nickname: 'Ann',
      avatar: 'fox',
      vsBot: 'easy',
    });
    api.joinRoom({ code: 'ABCD', nickname: 'Bob', avatar: 'cat' });
    api.startMatch();
    api.moveSeat('a1', 'b0');
    api.announce('rock');
    api.announce(null);
    api.pick('paper');
    api.next();
    api.rematch();
    expect(fake.socket.emit.mock.calls).toEqual([
      ['room:create', { config: { mode: 'classic', bestOf: 3 }, nickname: 'Ann', avatar: 'fox', vsBot: 'easy' }],
      ['room:join', { code: 'ABCD', nickname: 'Bob', avatar: 'cat' }],
      ['room:start', {}],
      ['seat:move', { from: 'a1', to: 'b0' }],
      ['game:announce', { emote: 'rock' }],
      ['game:announce', { emote: null }],
      ['game:pick', { gesture: 'paper' }],
      ['game:next', {}],
      ['room:rematch', {}],
    ]);
    expect(fake.io).toHaveBeenCalledTimes(1);
  });

  it('emits tournament:skip with an empty payload', async () => {
    const api = await load();
    api.skipWait();
    expect(fake.socket.emit.mock.calls).toEqual([['tournament:skip', {}]]);
  });
});
