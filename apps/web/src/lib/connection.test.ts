import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { RoomView } from '@rps/shared';

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
  code: 'ABCD',
  config: { mode: 'classic', bestOf: 3 },
  you: 'a0',
  hostSeat: 'a0',
  players: {},
  match: null,
  deadline: null,
} satisfies RoomView;

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

  it('updates lastError on room:error and clears it again', async () => {
    const { connect, lastError, clearError } = await load();
    connect();
    fake.trigger('room:error', { code: 'room_full', message: 'Room is full' });
    expect(get(lastError)).toMatchObject({ code: 'room_full' });
    clearError();
    expect(get(lastError)).toBeNull();
  });

  it('drops stored credentials when the server rejects the token', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: 'ABCD', token: 'old' }));
    const { connect } = await load();
    connect();
    fake.trigger('room:error', { code: 'bad_token', message: 'bad token' });
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('stores code and token on room:joined', async () => {
    const { connect } = await load();
    connect();
    fake.trigger('room:joined', { code: 'WXYZ', token: 'tok', seat: 'b0' });
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')).toEqual({
      code: 'WXYZ',
      token: 'tok',
    });
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
    expect(() => fake.trigger('room:joined', { code: 'WXYZ', token: 'tok', seat: 'a0' })).not.toThrow();
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
});
