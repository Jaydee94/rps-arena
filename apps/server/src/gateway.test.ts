import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect } from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';
import { CODE_ALPHABET, RECONNECT_GRACE_MS } from '@rps/shared';
import type { PlayerView as RoomView, RoomConfig, RoomJoined, SpectatorView } from '@rps/shared';
import type { Server } from 'socket.io';
import { createGateway, spectatorChannel } from './gateway';
import type { Gateway, GatewayOptions } from './gateway';
import { createIoServer } from './io';
import { spectatorsOf } from './room';
import type { Room as RoomState } from './room';
import { MemoryRoomStore } from './store';
import { startTicker } from './ticker';
import type { Ticker } from './ticker';

const classic: RoomConfig = { mode: 'classic', bestOf: 3 };
const team: RoomConfig = { mode: 'team2v2', bestOf: 3 };

type Received = { event: string; payload: unknown };

/** A connected test client that records every server event it receives. */
interface Client {
  socket: ClientSocket;
  events: Received[];
  /** Resolves with the first not yet consumed event matching `event` (and `match`). */
  next<T>(event: string, match?: (payload: T) => boolean): Promise<T>;
  send(event: string, payload?: unknown): void;
}

interface Harness {
  url: string;
  store: MemoryRoomStore;
  clock: { now: number };
  ticker: Ticker;
  io: Server;
  gateway: Gateway;
  client(opts?: { origin?: string }): Promise<Client>;
}

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

async function harness(options: GatewayOptions = {}): Promise<Harness> {
  const clock = { now: 1_000_000 };
  const now = () => clock.now;
  const store = new MemoryRoomStore(now);
  const http = createServer();
  const io = createIoServer(http);
  const gateway = createGateway(io, store, now, options);
  const ticker = startTicker(store, gateway.broadcast, 60_000, now, { onDelete: gateway.dropRoom });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const sockets: ClientSocket[] = [];
  cleanups.push(async () => {
    for (const s of sockets) s.disconnect();
    await ticker.stop();
    await io.close();
  });

  const client = async (opts: { origin?: string } = {}): Promise<Client> => {
    const socket = connect(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: opts.origin ? { origin: opts.origin } : undefined,
    });
    sockets.push(socket);
    const events: Received[] = [];
    const waiters: { event: string; match: (p: never) => boolean; resolve: (p: unknown) => void }[] = [];
    const consumedSet = new Set<number>();
    socket.onAny((event: string, payload: unknown) => {
      events.push({ event, payload });
      const index = events.length - 1;
      const waiter = waiters.findIndex((w) => w.event === event && w.match(payload as never));
      if (waiter >= 0) {
        consumedSet.add(index);
        waiters.splice(waiter, 1)[0]!.resolve(payload);
      }
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return {
      socket,
      events,
      next<T>(event: string, match: (payload: T) => boolean = () => true): Promise<T> {
        const index = events.findIndex(
          (e, i) => !consumedSet.has(i) && e.event === event && match(e.payload as T),
        );
        if (index >= 0) {
          consumedSet.add(index);
          return Promise.resolve(events[index]!.payload as T);
        }
        return new Promise<T>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 2000);
          waiters.push({
            event,
            match: match as (p: never) => boolean,
            resolve: (p) => {
              clearTimeout(timer);
              resolve(p as T);
            },
          });
        });
      },
      send(event: string, payload?: unknown) {
        if (payload === undefined) socket.emit(event);
        else socket.emit(event, payload);
      },
    };
  };
  return { url, store, clock, ticker, io, gateway, client };
}

/** rng that yields the given room code through `generateCode`, then 0.5 forever. */
function codeRng(...codes: string[]): () => number {
  const values = codes.flatMap((code) =>
    [...code].map((ch) => (CODE_ALPHABET.indexOf(ch) + 0.5) / CODE_ALPHABET.length),
  );
  return () => values.shift() ?? 0.5;
}

const roundTrip = (c: Client) =>
  new Promise<void>((resolve) => {
    // A rejected event answers with room:error; use a harmless invalid one as a barrier.
    c.send('game:pick', { gesture: '' });
    void c.next('room:error').then(() => resolve());
  });

async function createAndJoin(h: Harness, config: RoomConfig = classic) {
  const a = await h.client();
  a.send('room:create', { config, nickname: 'Ann', avatar: 'fox' });
  const aJoined = await a.next<RoomJoined>('room:joined');
  const b = await h.client();
  b.send('room:join', { code: aJoined.code, nickname: 'Ben', avatar: 'owl' });
  const bJoined = await b.next<RoomJoined>('room:joined');
  return { a, b, aJoined, bJoined };
}

async function startedDuel(h: Harness) {
  const duel = await createAndJoin(h);
  duel.a.send('room:start');
  await duel.a.next<RoomView>('room:state', (v) => v.match !== null);
  await duel.b.next<RoomView>('room:state', (v) => v.match !== null);
  return duel;
}

const errorOf = (c: Client) => c.next<{ code: string; message: string }>('room:error');

describe('gateway: rooms', () => {
  it('create + join with a lowercase, padded code; both get room:state', async () => {
    const h = await harness({ codeRng: codeRng('AB3DE') });
    const a = await h.client();
    a.send('room:create', { config: classic, nickname: 'Ann', avatar: 'fox' });
    const joined = await a.next<RoomJoined>('room:joined');
    expect(joined).toMatchObject({ code: 'AB3DE', seat: 'a0' });
    expect(joined.token).toMatch(/^[0-9a-f]{32}$/);
    const b = await h.client();
    b.send('room:join', { code: ' ab3de ', nickname: 'Ben', avatar: 'owl' });
    expect(await b.next<RoomJoined>('room:joined')).toMatchObject({ code: 'AB3DE', seat: 'b0' });
    const viewB = await b.next<RoomView>('room:state');
    expect(viewB.you).toBe('b0');
    const viewA = await a.next<RoomView>('room:state', (v) => v.players.b0 !== undefined);
    expect(viewA.players.b0?.nickname).toBe('Ben');
  });

  it('errors keep the connection open: room_not_found, room_full, invalid_input', async () => {
    const h = await harness();
    const { aJoined } = await createAndJoin(h);
    const c = await h.client();
    c.send('room:join', { code: 'ZZZZZ', nickname: 'Cid', avatar: 'cat' });
    expect(await errorOf(c)).toEqual({ code: 'room_not_found', message: 'room_not_found' });
    c.send('room:join', { code: aJoined.code, nickname: 'Cid', avatar: 'cat' });
    expect((await errorOf(c)).code).toBe('room_full');
    c.send('room:join', { code: aJoined.code, nickname: '', avatar: 'cat' });
    expect((await errorOf(c)).code).toBe('invalid_input');
    c.send('room:join', 'not an object');
    expect((await errorOf(c)).code).toBe('invalid_input');
    c.send('nonsense:event', { x: 1 });
    expect(c.socket.connected).toBe(true);
    // Still fully usable afterwards.
    c.send('room:create', { config: classic, nickname: 'Cid', avatar: 'cat' });
    expect((await c.next<RoomJoined>('room:joined')).seat).toBe('a0');
  });

  it('a join after the 2v2 match started watches as a spectator', async () => {
    const h = await harness();
    const { a, b, aJoined } = await createAndJoin(h, team);
    const c = await h.client();
    c.send('room:join', { code: aJoined.code, nickname: 'Cid', avatar: 'cat' });
    await c.next('room:joined');
    const d = await h.client();
    d.send('room:join', { code: aJoined.code, nickname: 'Dan', avatar: 'dino' });
    await d.next('room:joined');
    a.send('room:start');
    await b.next<RoomView>('room:state', (v) => v.match !== null);
    const e = await h.client();
    e.send('room:join', { code: aJoined.code, nickname: 'Eve', avatar: 'ghost' });
    expect(await e.next<RoomJoined>('room:joined')).toMatchObject({ role: 'spectator', seat: null });
    const view = await e.next<SpectatorView>('room:state');
    expect(view.role).toBe('spectator');
    expect(view.match?.phase).toBe('pick');
    expect(Object.keys(view.players).sort()).toEqual(['a0', 'a1', 'b0', 'b1']);
    expect(e.events.some((x) => x.event === 'room:error')).toBe(false);
  });

  it('retries the room code on a collision and gives up with internal', async () => {
    const h = await harness({ codeRng: codeRng('AAAAA', 'AAAAA', 'BBBBB') });
    const a = await h.client();
    a.send('room:create', { config: classic, nickname: 'Ann', avatar: 'fox' });
    expect((await a.next<RoomJoined>('room:joined')).code).toBe('AAAAA');
    const b = await h.client();
    b.send('room:create', { config: classic, nickname: 'Ben', avatar: 'owl' });
    expect((await b.next<RoomJoined>('room:joined')).code).toBe('BBBBB');

    const stuck = await harness({ codeRng: () => 0 });
    const x = await stuck.client();
    x.send('room:create', { config: classic, nickname: 'X', avatar: 'fox' });
    await x.next('room:joined');
    const y = await stuck.client();
    y.send('room:create', { config: classic, nickname: 'Y', avatar: 'fox' });
    expect((await errorOf(y)).code).toBe('internal');
    expect(y.socket.connected).toBe(true);
  });

  it('vsBot in team2v2 is invalid_input; a bot room plays a round at once', async () => {
    const h = await harness();
    const a = await h.client();
    a.send('room:create', { config: team, nickname: 'Ann', avatar: 'fox', vsBot: 'easy' });
    expect((await errorOf(a)).code).toBe('invalid_input');
    a.send('room:create', { config: classic, nickname: 'Ann', avatar: 'fox', vsBot: 'medium' });
    const first = await a.next<RoomView>('room:state');
    expect(first.match?.phase).toBe('pick');
    expect(first.players.b0?.isBot).toBe(true);
    a.send('game:pick', { gesture: 'paper' });
    const reveal = await a.next<RoomView>('room:state', (v) => v.match?.phase === 'reveal');
    expect(reveal.match?.lastRound?.picks.a0).toBe('paper');
    expect(reveal.match?.lastRound?.picks.b0).toBeDefined();
  });
});

describe('gateway: secrecy', () => {
  for (const [config, gestureA, gestureB] of [
    [classic, 'rock', 'scissors'],
    [{ mode: 'wheel15', bestOf: 3 } as RoomConfig, 'sponge', 'lightning'],
  ] as const) {
    it(`B never sees A's ${gestureA} before the reveal; both get the reveal`, async () => {
      const h = await harness();
      const { a, b, aJoined, bJoined } = await createAndJoin(h, config);
      a.send('room:start');
      await b.next<RoomView>('room:state', (v) => v.match !== null);
      a.send('game:pick', { gesture: gestureA });
      expect((await a.next<RoomView>('room:state', (v) => v.match?.yourPick === gestureA)).you).toBe(
        'a0',
      );
      await b.next<RoomView>('room:state', (v) => v.match?.lockedSeats.includes('a0') === true);
      await roundTrip(b);
      const beforeReveal = JSON.stringify(b.events);
      expect(beforeReveal).not.toContain(gestureA);
      b.send('game:pick', { gesture: gestureB });
      for (const c of [a, b]) {
        const v = await c.next<RoomView>('room:state', (x) => x.match?.phase === 'reveal');
        expect(v.match?.lastRound?.picks).toEqual({ a0: gestureA, b0: gestureB });
      }
      // Tokens only ever travel in the own room:joined, never in room:state.
      for (const c of [a, b]) {
        const states = JSON.stringify(c.events.filter((e) => e.event === 'room:state'));
        expect(states).not.toContain(aJoined.token);
        expect(states).not.toContain(bJoined.token);
      }
      expect(JSON.stringify(b.events)).not.toContain(aJoined.token);
    });
  }
});

describe('gateway: sessions', () => {
  it('rejoin with the token restores the seat (same token); a wrong token is bad_token', async () => {
    const h = await harness();
    const { a, b, aJoined, bJoined } = await startedDuel(h);
    b.socket.disconnect();
    await a.next<RoomView>('room:state', (v) => v.players.b0?.connected === false);
    const c = await h.client();
    c.send('room:rejoin', { code: aJoined.code, token: 'f'.repeat(32) });
    expect((await errorOf(c)).code).toBe('bad_token');
    c.send('room:rejoin', { code: aJoined.code.toLowerCase(), token: bJoined.token });
    expect(await c.next<RoomJoined>('room:joined')).toEqual(bJoined);
    const view = await c.next<RoomView>('room:state');
    expect(view.you).toBe('b0');
    expect(view.match?.phase).toBe('pick');
    await a.next<RoomView>('room:state', (v) => v.players.b0?.connected === true);
    c.send('game:pick', { gesture: 'rock' });
    await a.next<RoomView>('room:state', (v) => v.match?.lockedSeats.includes('b0') === true);
  });

  it('a second socket with the token takes the seat over; the old one is cut off', async () => {
    const h = await harness();
    const { a, b, aJoined } = await startedDuel(h);
    const tab2 = await h.client();
    tab2.send('room:rejoin', { code: aJoined.code, token: aJoined.token });
    await tab2.next('room:joined');
    expect((await errorOf(a)).code).toBe('bad_token');
    a.send('game:pick', { gesture: 'rock' });
    expect((await errorOf(a)).code).toBe('bad_token');
    const stateCount = a.events.filter((e) => e.event === 'room:state').length;
    tab2.send('game:pick', { gesture: 'paper' });
    await b.next<RoomView>('room:state', (v) => v.match?.lockedSeats.includes('a0') === true);
    // The old socket's disconnect must not mark the seat as disconnected.
    a.socket.disconnect();
    b.send('game:pick', { gesture: 'rock' });
    const reveal = await tab2.next<RoomView>('room:state', (v) => v.match?.phase === 'reveal');
    expect(reveal.players.a0?.connected).toBe(true);
    expect(a.events.filter((e) => e.event === 'room:state')).toHaveLength(stateCount);
  });

  it('acting without a seat is bad_token', async () => {
    const h = await harness();
    const c = await h.client();
    c.send('game:pick', { gesture: 'rock' });
    expect((await errorOf(c)).code).toBe('bad_token');
    c.send('room:start');
    expect((await errorOf(c)).code).toBe('bad_token');
  });

  it('payload-less events work with an undefined payload', async () => {
    const h = await harness();
    const { a, b } = await createAndJoin(h);
    b.send('room:start');
    expect((await errorOf(b)).code).toBe('not_host');
    a.send('game:next');
    expect((await errorOf(a)).code).toBe('wrong_phase');
    a.send('room:rematch');
    expect((await errorOf(a)).code).toBe('wrong_phase');
    a.send('room:start');
    expect((await b.next<RoomView>('room:state', (v) => v.match !== null)).match?.phase).toBe(
      'pick',
    );
  });

  it('game:next, room:rematch run a match to the end and again', async () => {
    const h = await harness();
    const { a, b } = await startedDuel(h);
    for (let round = 1; round <= 2; round++) {
      if (round > 1) {
        await a.next<RoomView>('room:state', (v) => v.match?.phase === 'pick' && v.match.round === round);
      }
      a.send('game:pick', { gesture: 'rock' });
      b.send('game:pick', { gesture: 'scissors' });
      await a.next<RoomView>('room:state', (v) => v.match?.phase === 'reveal' && v.match.round === round);
      a.send('game:next');
      b.send('game:next');
    }
    const done = await b.next<RoomView>('room:state', (v) => v.match?.phase === 'finished');
    expect(done.match?.winner).toBe('a');
    b.send('room:rematch');
    const again = await a.next<RoomView>(
      'room:state',
      (v) => v.match?.phase === 'pick' && v.match.score.a === 0,
    );
    expect(again.match?.round).toBe(1);
  });
});

describe('gateway: 2v2 seat moves', () => {
  async function lobby(h: Harness) {
    const { a, b, aJoined } = await createAndJoin(h, team); // a0, b0
    const c = await h.client();
    c.send('room:join', { code: aJoined.code, nickname: 'Cid', avatar: 'cat' }); // a1
    const cJoined = await c.next<RoomJoined>('room:joined');
    return { a, b, c, code: aJoined.code, cJoined };
  }

  it('host moves another player; the player follows on the new seat channel', async () => {
    const h = await harness();
    const { a, b } = await lobby(h);
    a.send('seat:move', { from: 'b0', to: 'b1' });
    const view = await b.next<RoomView>('room:state', (v) => v.you === 'b1');
    expect(view.players.b1?.nickname).toBe('Ben');
    expect(view.players.b0).toBeUndefined();
  });

  it('a player moves themselves; the token stays valid on the new seat', async () => {
    const h = await harness();
    const { a, c, code, cJoined } = await lobby(h);
    c.send('seat:move', { from: 'a1', to: 'b1' });
    await c.next<RoomView>('room:state', (v) => v.you === 'b1');
    await a.next<RoomView>('room:state', (v) => v.players.b1?.nickname === 'Cid');
    c.socket.disconnect();
    const c2 = await h.client();
    c2.send('room:rejoin', { code, token: cJoined.token });
    expect(await c2.next<RoomJoined>('room:joined')).toEqual({ ...cJoined, seat: 'b1' });
  });

  it('moving someone else is not_host; occupied seats are invalid_input; host self-move moves hostSeat', async () => {
    const h = await harness();
    const { a, b, c } = await lobby(h);
    b.send('seat:move', { from: 'a1', to: 'b1' });
    expect((await errorOf(b)).code).toBe('not_host');
    b.send('seat:move', { from: 'b0', to: 'a1' });
    expect((await errorOf(b)).code).toBe('invalid_input');
    b.send('seat:move', { from: 'b0', to: 'x9' });
    expect((await errorOf(b)).code).toBe('invalid_input');
    a.send('seat:move', { from: 'a0', to: 'b1' });
    const view = await c.next<RoomView>('room:state', (v) => v.hostSeat === 'b1');
    expect(view.players.b1?.nickname).toBe('Ann');
    expect((await a.next<RoomView>('room:state', (v) => v.you === 'b1')).hostSeat).toBe('b1');
    a.send('room:start');
    expect((await errorOf(a)).code).toBe('wrong_phase'); // only three seated
  });
});

describe('gateway: timers', () => {
  it('forfeits a seat after the reconnect grace and ends the match', async () => {
    const h = await harness();
    const { a, b, aJoined } = await startedDuel(h);
    b.socket.disconnect();
    await a.next<RoomView>('room:state', (v) => v.players.b0?.connected === false);
    h.clock.now += RECONNECT_GRACE_MS;
    await h.ticker.runOnce();
    const end = await a.next<RoomView>('room:state', (v) => v.match?.phase === 'finished');
    expect(end.match?.forfeited).toEqual(['b0']);
    expect(end.match?.winner).toBe('a');
    expect((await h.store.get(aJoined.code))?.deadline).toBeNull();
  });

  it('deletes a room once every seat is gone past the grace, leaving no timer behind', async () => {
    const h = await harness();
    const { a, b, aJoined } = await startedDuel(h);
    a.socket.disconnect();
    b.socket.disconnect();
    for (let i = 0; i < 50 && (await h.store.get(aJoined.code))?.players.b0?.connected; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect((await h.store.get(aJoined.code))?.deadline).not.toBeNull();
    h.clock.now += RECONNECT_GRACE_MS;
    await h.ticker.runOnce();
    expect(await h.store.get(aJoined.code)).toBeNull();
    expect(await h.store.dueRooms(Number.MAX_SAFE_INTEGER)).toEqual([]);
    await h.ticker.runOnce(); // a tick over a vanished room is a no-op
  });
});

describe('gateway: robustness', () => {
  it('rate-limits a socket and answers rate_limited, then recovers', async () => {
    const h = await harness({ rateLimit: { perSecond: 1, burst: 3 } });
    const c = await h.client();
    for (let i = 0; i < 5; i++) c.send('game:pick', { gesture: 'rock' });
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) codes.push((await errorOf(c)).code);
    expect(codes.filter((x) => x === 'rate_limited')).toHaveLength(2);
    expect(codes.filter((x) => x === 'bad_token')).toHaveLength(3);
    h.clock.now += 1000;
    c.send('game:pick', { gesture: 'rock' });
    expect((await errorOf(c)).code).toBe('bad_token');
    expect(c.socket.connected).toBe(true);
  });

  it('drops a connection whose message exceeds 10 kB', async () => {
    const h = await harness();
    const c = await h.client();
    const closed = new Promise<void>((resolve) => c.socket.once('disconnect', () => resolve()));
    c.send('room:create', { config: classic, nickname: 'x'.repeat(20_000), avatar: 'fox' });
    await closed;
    expect(c.socket.connected).toBe(false);
  });

  it('refuses cross-origin connections but allows the same origin', async () => {
    const h = await harness();
    await expect(h.client({ origin: 'https://evil.example' })).rejects.toThrow();
    const same = await h.client({ origin: h.url });
    expect(same.socket.connected).toBe(true);
  });
});

/** Joins `code` as a late joiner and waits for the spectator's room:joined and first view. */
async function spectate(h: Harness, code: string, nickname = 'Sam') {
  const s = await h.client();
  s.send('room:join', { code, nickname, avatar: 'cat' });
  const joined = await s.next<RoomJoined>('room:joined');
  const view = await s.next<SpectatorView>('room:state');
  return { s, joined, view };
}

const PLAYER_VIEW_KEYS = [
  'code',
  'config',
  'deadline',
  'hostSeat',
  'isHost',
  'match',
  'players',
  'role',
  'spectators',
  'tournament',
  'you',
];

/** Waits until the server dropped socket `id` and processed every pending event (its release). */
async function serverForgot(h: Harness, id: string): Promise<void> {
  for (let i = 0; i < 100 && h.io.sockets.sockets.has(id); i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  expect(h.io.sockets.sockets.has(id)).toBe(false);
  await h.gateway.idle();
}

/** Every connected entry (seat or spectator) bound to socket `id`. */
function bindingsOf(room: RoomState, id: string): string[] {
  return [
    ...Object.values(room.players).filter((p) => p?.connected && p.socketId === id).map((p) => p!.seat),
    ...spectatorsOf(room).filter((x) => x.connected && x.socketId === id).map((x) => `spec:${x.id}`),
  ];
}

const states = (c: Client) => c.events.filter((e) => e.event === 'room:state');

describe('gateway: spectators', () => {
  it('a late joiner of a running duel becomes a spectator; players keep their full view', async () => {
    const h = await harness();
    const { a, b, aJoined } = await startedDuel(h);
    const { s, joined, view } = await spectate(h, aJoined.code);
    expect(joined).toEqual({ code: aJoined.code, token: joined.token, role: 'spectator', seat: null });
    expect(joined.token).toMatch(/^[0-9a-f]{32}$/);
    expect(view).toMatchObject({ role: 'spectator', code: aJoined.code, isHost: false, me: null });
    expect('you' in view).toBe(false);
    expect(view.match).toMatchObject({ phase: 'pick', round: 1, yourPick: null });
    expect(view.spectators).toEqual([
      { id: expect.any(String), nickname: 'Sam', avatar: 'cat', connected: true },
    ]);
    for (const [c, seat] of [[a, 'a0'], [b, 'b0']] as const) {
      const v = await c.next<RoomView>('room:state', (x) => x.spectators.length === 1);
      expect(Object.keys(v).sort()).toEqual(PLAYER_VIEW_KEYS);
      expect(v).toMatchObject({ role: 'player', you: seat, match: { phase: 'pick', round: 1 } });
      expect(v.spectators[0]?.nickname).toBe('Sam');
    }
    expect(s.events.some((e) => e.event === 'room:error')).toBe(false);
  });

  it('a late joiner of a running bot room watches the bot play', async () => {
    const h = await harness();
    const a = await h.client();
    a.send('room:create', { config: classic, nickname: 'Ann', avatar: 'fox', vsBot: 'easy' });
    const aJoined = await a.next<RoomJoined>('room:joined');
    const { s, joined, view } = await spectate(h, aJoined.code);
    expect(joined).toMatchObject({ role: 'spectator', seat: null });
    expect(view.players.b0?.isBot).toBe(true);
    a.send('game:pick', { gesture: 'paper' });
    const reveal = await s.next<SpectatorView>('room:state', (v) => v.match?.phase === 'reveal');
    expect(reveal.match?.lastRound?.picks.a0).toBe('paper');
    expect(reveal.match?.lastRound?.picks.b0).toBeDefined();
  });

  it('a full duel lobby before the start stays room_full and stores no spectator', async () => {
    const h = await harness();
    const { aJoined } = await createAndJoin(h);
    const c = await h.client();
    c.send('room:join', { code: aJoined.code, nickname: 'Cid', avatar: 'cat' });
    expect((await errorOf(c)).code).toBe('room_full');
    expect((await h.store.get(aJoined.code))?.spectators ?? []).toEqual([]);
  });

  it('the 17th spectator is room_full', async () => {
    const h = await harness();
    const { aJoined } = await startedDuel(h);
    for (let i = 0; i < 16; i++) await spectate(h, aJoined.code, `S${i}`);
    const late = await h.client();
    late.send('room:join', { code: aJoined.code, nickname: 'Late', avatar: 'cat' });
    expect((await errorOf(late)).code).toBe('room_full');
    expect((await h.store.get(aJoined.code))?.spectators).toHaveLength(16);
  });

  it('game and host events from a spectator are not_player and change nothing', async () => {
    const h = await harness();
    const { a, b, aJoined } = await startedDuel(h);
    const { s } = await spectate(h, aJoined.code);
    await a.next<RoomView>('room:state', (v) => v.spectators.length === 1);
    await b.next<RoomView>('room:state', (v) => v.spectators.length === 1);
    const before = await h.store.get(aJoined.code);
    const counts = [a, b, s].map((c) => states(c).length);
    const attempts: [string, unknown][] = [
      ['room:start', undefined],
      ['seat:move', { from: 'a0', to: 'a1' }],
      ['game:announce', { emote: null }],
      ['game:pick', { gesture: 'rock' }],
      ['game:next', undefined],
      ['room:rematch', undefined],
    ];
    for (const [event, payload] of attempts) {
      s.send(event, payload);
      expect(await errorOf(s), event).toEqual({ code: 'not_player', message: 'not_player' });
    }
    for (const c of [a, b, s]) await roundTrip(c);
    expect(await h.store.get(aJoined.code)).toEqual(before);
    expect([a, b, s].map((c) => states(c).length)).toEqual(counts);
  });

  it('a spectator socket is rate limited like any other', async () => {
    const h = await harness({ rateLimit: { perSecond: 1, burst: 3 } });
    const { aJoined } = await startedDuel(h);
    h.clock.now += 10_000; // refill every bucket
    const { s } = await spectate(h, aJoined.code);
    for (let i = 0; i < 4; i++) s.send('game:pick', { gesture: 'rock' });
    const codes: string[] = [];
    for (let i = 0; i < 4; i++) codes.push((await errorOf(s)).code);
    expect(codes.filter((x) => x === 'rate_limited')).toHaveLength(2);
    expect(codes.filter((x) => x === 'not_player')).toHaveLength(2);
    expect(s.socket.connected).toBe(true);
  });

  for (const [config, gestureA, gestureB] of [
    [classic, 'rock', 'scissors'],
    [{ mode: 'wheel15', bestOf: 3 } as RoomConfig, 'sponge', 'lightning'],
  ] as const) {
    it(`a spectator's raw frames hold neither A's ${gestureA} nor any player token before the reveal`, async () => {
      const h = await harness();
      const { a, b, aJoined, bJoined } = await createAndJoin(h, config);
      a.send('room:start');
      await b.next<RoomView>('room:state', (v) => v.match !== null);
      const { s, joined } = await spectate(h, aJoined.code);
      a.send('game:pick', { gesture: gestureA });
      await s.next<SpectatorView>('room:state', (v) => v.match?.lockedSeats.includes('a0') === true);
      await roundTrip(s);
      const beforeReveal = JSON.stringify(s.events);
      expect(beforeReveal).not.toContain(gestureA);
      expect(beforeReveal).not.toContain(aJoined.token);
      expect(beforeReveal).not.toContain(bJoined.token);
      expect(beforeReveal).not.toContain('picks');
      b.send('game:pick', { gesture: gestureB });
      const reveal = await s.next<SpectatorView>('room:state', (v) => v.match?.phase === 'reveal');
      expect(reveal.match?.lastRound?.picks).toEqual({ a0: gestureA, b0: gestureB });
      expect(reveal.match?.yourPick).toBeNull();
      const all = JSON.stringify(s.events);
      expect(all).not.toContain(aJoined.token);
      expect(all).not.toContain(bJoined.token);
      // The own token only travels in the own room:joined, never in a room:state.
      expect(JSON.stringify(states(s))).not.toContain(joined.token);
      for (const c of [a, b]) expect(JSON.stringify(c.events)).not.toContain(joined.token);
    });
  }

  it('a spectator who drops leaves the phase alone and rejoins by token as a spectator', async () => {
    const h = await harness();
    const { a, b, aJoined } = await startedDuel(h);
    const { s, joined } = await spectate(h, aJoined.code);
    const before = await h.store.get(aJoined.code);
    s.socket.disconnect();
    const seen = await a.next<RoomView>('room:state', (v) => v.spectators[0]?.connected === false);
    expect(seen.match).toMatchObject({ phase: 'pick', round: 1 });
    expect(seen.deadline).toBe(before?.phaseDeadline);
    const stored = await h.store.get(aJoined.code);
    expect(stored?.phaseDeadline).toBe(before?.phaseDeadline);
    expect(stored?.match).toEqual(before?.match);
    expect(stored?.players.a0?.connected).toBe(true);

    const s2 = await h.client();
    s2.send('room:rejoin', { code: aJoined.code, token: joined.token });
    expect(await s2.next<RoomJoined>('room:joined')).toEqual(joined);
    const view = await s2.next<SpectatorView>('room:state');
    expect(view.role).toBe('spectator');
    expect(view.spectators[0]?.connected).toBe(true);
    await b.next<RoomView>('room:state', (v) => v.spectators[0]?.connected === true);
    a.send('game:pick', { gesture: 'rock' });
    await s2.next<SpectatorView>('room:state', (v) => v.match?.lockedSeats.includes('a0') === true);
  });

  it('a second socket with the spectator token takes over; the old one is cut off', async () => {
    const h = await harness();
    const { a, b, aJoined } = await startedDuel(h);
    const { s, joined } = await spectate(h, aJoined.code);
    const tab2 = await h.client();
    tab2.send('room:rejoin', { code: aJoined.code, token: joined.token });
    expect(await tab2.next<RoomJoined>('room:joined')).toEqual(joined);
    expect((await errorOf(s)).code).toBe('bad_token');
    expect(h.io.sockets.adapter.rooms.get(spectatorChannel(aJoined.code))?.has(s.socket.id!)).toBe(
      false,
    );
    const count = states(s).length;
    a.send('game:pick', { gesture: 'rock' });
    await tab2.next<SpectatorView>('room:state', (v) => v.match?.lockedSeats.includes('a0') === true);
    s.send('game:pick', { gesture: 'rock' });
    expect((await errorOf(s)).code).toBe('bad_token');
    // The old socket's disconnect must not mark the spectator as disconnected.
    const oldId = s.socket.id!;
    s.socket.disconnect();
    await serverForgot(h, oldId);
    expect(spectatorsOf((await h.store.get(aJoined.code))!)[0]).toMatchObject({
      connected: true,
      socketId: tab2.socket.id,
    });
    b.send('game:pick', { gesture: 'paper' });
    const reveal = await tab2.next<SpectatorView>('room:state', (v) => v.match?.phase === 'reveal');
    expect(reveal.spectators[0]?.connected).toBe(true);
    expect(states(s)).toHaveLength(count);
  });

  it('a spectator who switches to another room counts as disconnected in the old one', async () => {
    const h = await harness();
    const { a, aJoined } = await startedDuel(h);
    const { s } = await spectate(h, aJoined.code);
    s.send('room:create', { config: classic, nickname: 'Sam', avatar: 'cat' });
    expect((await s.next<RoomJoined>('room:joined')).role).toBe('player');
    await a.next<RoomView>('room:state', (v) => v.spectators[0]?.connected === false);
    expect(h.io.sockets.adapter.rooms.get(spectatorChannel(aJoined.code))).toBeUndefined();
  });

  it('an abandoned room is deleted although a spectator watches; its socket leaves the channels', async () => {
    const h = await harness();
    const { a, b, aJoined } = await startedDuel(h);
    const { s } = await spectate(h, aJoined.code);
    const code = aJoined.code;
    expect(h.io.sockets.adapter.rooms.get(spectatorChannel(code))?.has(s.socket.id!)).toBe(true);
    expect(h.io.sockets.adapter.rooms.get(code)?.has(s.socket.id!)).toBe(true);
    a.socket.disconnect();
    b.socket.disconnect();
    for (let i = 0; i < 50; i++) {
      const room = await h.store.get(code);
      if (room?.players.a0?.connected === false && room.players.b0?.connected === false) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    h.clock.now += RECONNECT_GRACE_MS;
    await h.ticker.runOnce();
    expect(await h.store.get(code)).toBeNull();
    expect(s.socket.connected).toBe(true);
    expect(h.io.sockets.adapter.rooms.get(spectatorChannel(code))).toBeUndefined();
    expect(h.io.sockets.adapter.rooms.get(code)).toBeUndefined();
  });
});

describe('gateway: switching bindings within one room', () => {
  it('a spectator socket rejoining with a player token releases its spectator slot', async () => {
    const h = await harness();
    const { a, b, aJoined, bJoined } = await startedDuel(h);
    const { s, joined } = await spectate(h, aJoined.code);
    b.socket.disconnect();
    await a.next<RoomView>('room:state', (v) => v.players.b0?.connected === false);
    s.send('room:rejoin', { code: aJoined.code, token: bJoined.token });
    expect(await s.next<RoomJoined>('room:joined')).toEqual(bJoined);
    expect((await s.next<RoomView>('room:state', (v) => v.role === 'player')).you).toBe('b0');
    const room = (await h.store.get(aJoined.code))!;
    expect(bindingsOf(room, s.socket.id!)).toEqual(['b0']);
    expect(spectatorsOf(room)).toEqual([
      expect.objectContaining({ connected: false, socketId: null, token: joined.token }),
    ]);
    expect(h.io.sockets.adapter.rooms.get(spectatorChannel(aJoined.code))).toBeUndefined();
    // The released spectator is dropped once its grace runs out; the slot is free again.
    h.clock.now += RECONNECT_GRACE_MS;
    await h.ticker.runOnce();
    const later = (await h.store.get(aJoined.code))!;
    expect(spectatorsOf(later)).toEqual([]);
    expect(later.players.b0).toMatchObject({ connected: true, socketId: s.socket.id });
  });

  it('a player socket rejoining with a spectator token releases its seat', async () => {
    const h = await harness();
    const { a, b, aJoined } = await startedDuel(h);
    const { s, joined } = await spectate(h, aJoined.code);
    const sId = s.socket.id!;
    s.socket.disconnect();
    await serverForgot(h, sId);
    b.send('room:rejoin', { code: aJoined.code, token: joined.token });
    expect(await b.next<RoomJoined>('room:joined')).toEqual(joined);
    expect((await b.next<SpectatorView>('room:state', (v) => v.role === 'spectator')).me).toBeNull();
    await a.next<RoomView>('room:state', (v) => v.players.b0?.connected === false);
    const room = (await h.store.get(aJoined.code))!;
    expect(bindingsOf(room, b.socket.id!)).toEqual([`spec:${spectatorsOf(room)[0]!.id}`]);
    expect(room.players.b0).toMatchObject({ connected: false, socketId: null });
    expect(h.io.sockets.adapter.rooms.get(`${aJoined.code}:b0`)).toBeUndefined();
    // The released seat forfeits once its grace runs out.
    h.clock.now += RECONNECT_GRACE_MS;
    await h.ticker.runOnce();
    const end = await b.next<SpectatorView>('room:state', (v) => v.match?.phase === 'finished');
    expect(end.match?.forfeited).toEqual(['b0']);
  });

  it('rejoining the own binding in the same room changes nothing', async () => {
    const h = await harness();
    const { aJoined } = await startedDuel(h);
    const { s, joined } = await spectate(h, aJoined.code);
    s.send('room:rejoin', { code: aJoined.code, token: joined.token });
    expect(await s.next<RoomJoined>('room:joined')).toEqual(joined);
    const room = (await h.store.get(aJoined.code))!;
    expect(spectatorsOf(room)).toEqual([
      expect.objectContaining({ connected: true, socketId: s.socket.id, disconnectedAt: null }),
    ]);
    expect(h.io.sockets.adapter.rooms.get(spectatorChannel(aJoined.code))?.has(s.socket.id!)).toBe(true);
  });
});
