import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect } from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';
import { CODE_ALPHABET, DRAW_MS, INTERMISSION_MS, RECONNECT_GRACE_MS } from '@rps/shared';
import type { PlayerView as RoomView, RoomConfig, RoomJoined, SpectatorView } from '@rps/shared';
import type { Server } from 'socket.io';
import { createGateway, participantChannel, spectatorChannel } from './gateway';
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

// --- Tournaments (Stage 2 Task 4) --------------------------------------------------------------

type AnyView = RoomView | SpectatorView;

interface Entrant {
  c: Client;
  joined: RoomJoined;
  /** The participant id (from the first view's `me`). */
  id: string;
  name: string;
}

const tPhase = (phase: string) => (v: AnyView) => v.tournament?.phase === phase;

/** Host creates a knockout tournament, three more join; everyone has its first own view. */
async function tournamentLobby(h: Harness, format: 'knockout' | 'roundrobin' = 'knockout') {
  const names = ['Hal', 'Ida', 'Jo', 'Kim'];
  const entrants: Entrant[] = [];
  let code = '';
  for (const [i, name] of names.entries()) {
    const c = await h.client();
    if (i === 0) c.send('room:create', { config: classic, nickname: name, avatar: 'fox', tournament: { format } });
    else c.send('room:join', { code, nickname: name, avatar: 'owl' });
    const joined = await c.next<RoomJoined>('room:joined');
    code = joined.code;
    const view = await c.next<SpectatorView>('room:state');
    entrants.push({ c, joined, id: view.me!.id, name });
  }
  // Everyone has seen the full lobby (the last joiner with its first view).
  for (const e of entrants.slice(0, -1)) {
    await e.c.next<SpectatorView>('room:state', (v) => v.tournament?.participants.length === 4);
  }
  return { code, entrants, host: entrants[0]! };
}

/** The views every entrant receives for a new pairing (phase match, round 1, pick), skipping `played`. */
async function matchViews(entrants: Entrant[], played: string[] = []) {
  const views = new Map<Entrant, AnyView>();
  for (const e of entrants) {
    views.set(
      e,
      await e.c.next<AnyView>(
        'room:state',
        (v) =>
          v.tournament?.phase === 'match' &&
          !played.includes(v.tournament.currentPairingId ?? '') &&
          v.match?.round === 1 &&
          v.match.phase === 'pick',
      ),
    );
  }
  const members = entrants.filter((e) => views.get(e)!.role === 'player');
  const a = members.find((e) => (views.get(e) as RoomView).you === 'a0')!;
  const b = members.find((e) => (views.get(e) as RoomView).you === 'b0')!;
  const waiting = entrants.filter((e) => views.get(e)!.role === 'spectator');
  return { views, a, b, waiting, pairingId: views.get(entrants[0]!)!.tournament!.currentPairingId! };
}

/**
 * Plays the running pairing (its round-1 pick views already consumed by `matchViews`): `a` (on a0)
 * beats `b` 2-0, both press next after every reveal.
 */
async function playPairing(a: Entrant, b: Entrant, pairingId: string) {
  for (let round = 1; round <= 2; round++) {
    const inPick = (v: AnyView) =>
      v.tournament?.currentPairingId === pairingId && v.match?.phase === 'pick' && v.match.round === round;
    if (round > 1) {
      await a.c.next<AnyView>('room:state', inPick);
      await b.c.next<AnyView>('room:state', inPick);
    }
    a.c.send('game:pick', { gesture: 'rock' });
    b.c.send('game:pick', { gesture: 'scissors' });
    const revealed = (v: AnyView) =>
      v.tournament?.currentPairingId === pairingId && v.match?.phase === 'reveal' && v.match.round === round;
    await a.c.next<AnyView>('room:state', revealed);
    await b.c.next<AnyView>('room:state', revealed);
    a.c.send('game:next');
    b.c.send('game:next');
  }
}

/** Starts the tournament (host, no payload) and lets the draw run out through the ticker. */
async function startAndDraw(h: Harness, host: Entrant, entrants: Entrant[]) {
  host.c.send('room:start');
  for (const e of entrants) await e.c.next<SpectatorView>('room:state', tPhase('draw'));
  h.clock.now += DRAW_MS;
  await h.ticker.runOnce();
  return matchViews(entrants);
}

/** Raw frames of `c` must not hold `gesture` nor any token except its own `room:joined`. */
function expectNoSecrets(c: Client, gesture: string, tokens: string[], own: string | null) {
  const frames = JSON.stringify(c.events);
  expect(frames).not.toContain(gesture);
  expect(frames).not.toContain('picks');
  for (const token of tokens) if (token !== own) expect(frames).not.toContain(token);
  if (own) expect(JSON.stringify(states(c))).not.toContain(own);
}

describe('gateway: tournaments', () => {
  it('creates a tournament lobby: the host is a participant watching from its own channel', async () => {
    const h = await harness({ codeRng: codeRng('TQRNX') });
    const c = await h.client();
    c.send('room:create', { config: classic, nickname: 'Hal', avatar: 'fox', tournament: { format: 'roundrobin' } });
    const joined = await c.next<RoomJoined>('room:joined');
    expect(joined).toEqual({ code: 'TQRNX', token: joined.token, role: 'spectator', seat: null });
    const view = await c.next<SpectatorView>('room:state');
    const id = view.me!.id;
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    expect(view).toMatchObject({ role: 'spectator', isHost: true, match: null, players: {} });
    expect(view.tournament).toMatchObject({ format: 'roundrobin', phase: 'lobby', youId: id, pairings: [] });
    expect(h.io.sockets.adapter.rooms.get(participantChannel('TQRNX', id))?.has(c.socket.id!)).toBe(true);
    expect(h.io.sockets.adapter.rooms.get(spectatorChannel('TQRNX'))).toBeUndefined();
    expect(JSON.stringify(states(c))).not.toContain(joined.token);
  });

  it('refuses tournament modes, lengths and bots that are not allowed', async () => {
    const h = await harness();
    const c = await h.client();
    for (const payload of [
      { config: { mode: 'bluff', bestOf: 3 }, nickname: 'Hal', avatar: 'fox', tournament: { format: 'knockout' } },
      { config: { mode: 'team2v2', bestOf: 3 }, nickname: 'Hal', avatar: 'fox', tournament: { format: 'knockout' } },
      { config: { mode: 'classic', bestOf: 5 }, nickname: 'Hal', avatar: 'fox', tournament: { format: 'knockout' } },
      { config: classic, nickname: 'Hal', avatar: 'fox', vsBot: 'easy', tournament: { format: 'knockout' } },
      { config: classic, nickname: 'Hal', avatar: 'fox', tournament: { format: 'swiss' } },
    ]) {
      c.send('room:create', payload);
      expect((await errorOf(c)).code, JSON.stringify(payload)).toBe('invalid_input');
    }
    for (const mode of ['lizard-spock', 'wheel7', 'wheel9', 'wheel15']) {
      c.send('room:create', { config: { mode, bestOf: 3 }, nickname: 'Hal', avatar: 'fox', tournament: { format: 'knockout' } });
      expect((await c.next<RoomJoined>('room:joined')).role).toBe('spectator');
    }
  });

  it('runs a knockout: draw, pairing views, secrecy, intermission, re-homing, final, podium, rematch', async () => {
    const h = await harness({ tournamentRng: () => 0.3 });
    const { code, entrants, host } = await tournamentLobby(h);
    for (const e of entrants) expect(e.joined).toMatchObject({ code, role: 'spectator', seat: null });
    const tokens = entrants.map((e) => e.joined.token);

    // Host rights: start and skip are host-only; too early is wrong_phase.
    const guest = entrants[1]!;
    guest.c.send('room:start');
    expect((await errorOf(guest.c)).code).toBe('not_host');
    guest.c.send('tournament:skip');
    expect((await errorOf(guest.c)).code).toBe('not_host');
    host.c.send('tournament:skip');
    expect((await errorOf(host.c)).code).toBe('wrong_phase');

    host.c.send('room:start');
    const draw = await guest.c.next<SpectatorView>('room:state', tPhase('draw'));
    expect(draw.tournament?.untilMs).toBe(h.clock.now + DRAW_MS);
    expect(draw.tournament?.pairings).toHaveLength(2); // round 1; the final is paired later
    h.clock.now += DRAW_MS;
    await h.ticker.runOnce();
    const first = await matchViews(entrants);
    expect([first.a, first.b, ...first.waiting].sort((x, y) => x.name.localeCompare(y.name))).toEqual(entrants);
    expect(first.waiting).toHaveLength(2);
    for (const [e, seat] of [[first.a, 'a0'], [first.b, 'b0']] as const) {
      const v = first.views.get(e) as RoomView;
      expect(Object.keys(v).sort()).toEqual(PLAYER_VIEW_KEYS);
      expect(v).toMatchObject({ role: 'player', you: seat, isHost: e === host, match: { phase: 'pick', yourPick: null } });
      expect(v.tournament).toMatchObject({ phase: 'match', youId: e.id, currentPairingId: first.pairingId });
    }
    for (const e of first.waiting) {
      const v = first.views.get(e) as SpectatorView;
      expect(v).toMatchObject({ role: 'spectator', me: { id: e.id }, isHost: e === host, match: { yourPick: null } });
      expect(v.tournament?.youId).toBe(e.id);
      expect(Object.keys(v.players).sort()).toEqual(['a0', 'b0']);
    }

    // A late joiner is a plain spectator on the shared channel.
    const { s, joined: sJoined, view: sView } = await spectate(h, code, 'Lou');
    expect(sJoined).toMatchObject({ role: 'spectator', seat: null });
    expect(sView).toMatchObject({ role: 'spectator', me: null, isHost: false, tournament: { youId: null, phase: 'match' } });
    const allTokens = [...tokens, sJoined.token];

    // Game events: waiting participants and spectators are not players; seat moves do not exist.
    const waiter = first.waiting[0]!;
    for (const [event, payload] of [
      ['game:pick', { gesture: 'rock' }],
      ['game:announce', { emote: null }],
      ['game:next', undefined],
    ] as const) {
      waiter.c.send(event, payload);
      expect((await errorOf(waiter.c)).code, event).toBe('not_player');
      s.send(event, payload);
      expect((await errorOf(s)).code, event).toBe('not_player');
    }
    first.a.c.send('seat:move', { from: 'a0', to: 'a1' });
    expect((await errorOf(first.a.c)).code).toBe('invalid_input');
    waiter.c.send('seat:move', { from: 'a0', to: 'a1' });
    expect((await errorOf(waiter.c)).code).toBe('invalid_input');
    for (const event of ['room:start', 'tournament:skip', 'room:rematch']) {
      s.send(event);
      expect((await errorOf(s)).code, event).toBe('not_player');
    }

    // Secrecy on the wire: a0 picks; nobody else learns the gesture before the reveal.
    first.a.c.send('game:pick', { gesture: 'rock' });
    await first.a.c.next<RoomView>('room:state', (v) => v.match?.yourPick === 'rock');
    for (const c of [first.b.c, s, ...first.waiting.map((e) => e.c)]) {
      await c.next<AnyView>('room:state', (v) => v.match?.lockedSeats.includes('a0') === true);
      await roundTrip(c);
    }
    expectNoSecrets(first.b.c, 'rock', allTokens, first.b.joined.token);
    expectNoSecrets(s, 'rock', allTokens, sJoined.token);
    for (const e of first.waiting) expectNoSecrets(e.c, 'rock', allTokens, e.joined.token);
    first.b.c.send('game:pick', { gesture: 'scissors' });
    for (const c of [s, ...first.waiting.map((e) => e.c)]) {
      const v = await c.next<SpectatorView>('room:state', (x) => x.match?.phase === 'reveal');
      expect(v.match?.lastRound?.picks).toEqual({ a0: 'rock', b0: 'scissors' });
      expect(v.match?.yourPick).toBeNull();
    }
    first.a.c.send('game:next');
    first.b.c.send('game:next');
    // Round 2 decides the match: a0 wins 2-0.
    const pickRound2 = (v: AnyView) => v.match?.phase === 'pick' && v.match.round === 2;
    await first.a.c.next<RoomView>('room:state', pickRound2);
    await first.b.c.next<RoomView>('room:state', pickRound2);
    first.a.c.send('game:pick', { gesture: 'rock' });
    first.b.c.send('game:pick', { gesture: 'scissors' });
    await first.a.c.next<RoomView>('room:state', (v) => v.match?.phase === 'reveal' && v.match.round === 2);
    first.a.c.send('game:next');
    first.b.c.send('game:next');

    // Intermission: everybody watches, the former members get their own participant views.
    const pauseAt = h.clock.now;
    for (const e of entrants) {
      const v = await e.c.next<SpectatorView>('room:state', tPhase('intermission'));
      expect(v).toMatchObject({ role: 'spectator', me: { id: e.id }, players: {}, match: { phase: 'finished' } });
      expect(v.tournament?.untilMs).toBe(pauseAt + INTERMISSION_MS);
      const played = v.tournament!.pairings.find((p) => p.id === first.pairingId)!;
      expect(played).toMatchObject({ winner: first.a.id, decidedBy: 'match', score: { a: 2, b: 0 } });
    }
    expect((await s.next<SpectatorView>('room:state', tPhase('intermission'))).me).toBeNull();

    // The ticker ends the intermission; the next pairing's members get seat views, the previous
    // members (and everyone else) get their own watcher views.
    const statesBefore = new Map(entrants.map((e) => [e, states(e.c).length]));
    h.clock.now += INTERMISSION_MS;
    await h.ticker.runOnce();
    const second = await matchViews(entrants, [first.pairingId]);
    expect(second.pairingId).not.toBe(first.pairingId);
    expect(new Set([second.a, second.b])).toEqual(new Set(first.waiting));
    for (const e of [first.a, first.b]) {
      const v = second.views.get(e) as SpectatorView;
      expect(v).toMatchObject({ role: 'spectator', me: { id: e.id } });
      // Exactly one view per broadcast: no stale seat view next to the own one.
      expect(states(e.c).length - statesBefore.get(e)!).toBe(1);
    }
    for (const e of [second.a, second.b]) expect(states(e.c).length - statesBefore.get(e)!).toBe(1);

    await playPairing(second.a, second.b, second.pairingId);
    for (const e of entrants) await e.c.next<SpectatorView>('room:state', tPhase('intermission'));
    // The host skips the intermission with a payload-less event (the host may be eliminated).
    host.c.send('tournament:skip');
    const final = await matchViews(entrants, [first.pairingId, second.pairingId]);
    expect(new Set([final.a.id, final.b.id])).toEqual(new Set([first.a.id, second.a.id]));
    await playPairing(final.a, final.b, final.pairingId);

    for (const e of entrants) {
      const v = await e.c.next<SpectatorView>('room:state', tPhase('finished'));
      expect(v.me).toEqual({ id: e.id });
      expect(v.tournament?.podium).toEqual([
        { rank: 1, ids: [final.a.id] },
        { rank: 2, ids: [final.b.id] },
        { rank: 3, ids: expect.arrayContaining([first.b.id, second.b.id]) },
      ]);
    }
    expect((await s.next<SpectatorView>('room:state', tPhase('finished'))).tournament?.podium).toHaveLength(3);
    for (const c of [s, ...entrants.map((e) => e.c)]) {
      for (const token of allTokens) expect(JSON.stringify(states(c))).not.toContain(token);
    }

    // Rematch: host only; everyone connected (the spectator too) is a participant again.
    guest.c.send('room:rematch');
    expect((await errorOf(guest.c)).code).toBe('not_host');
    host.c.send('room:rematch');
    // (Earlier lobby views from the first lobby are still unconsumed: wait for the 5-person one.)
    const rematched = (v: AnyView) => v.tournament?.phase === 'lobby' && v.tournament.participants.length === 5;
    for (const e of entrants) {
      const v = await e.c.next<SpectatorView>('room:state', rematched);
      expect(v.me).toEqual({ id: e.id });
      expect(v.isHost).toBe(e === host);
    }
    const sLobby = await s.next<SpectatorView>('room:state', tPhase('lobby'));
    const sId = sLobby.me?.id;
    expect(sId).toEqual(expect.any(String));
    expect(sLobby.tournament?.youId).toBe(sId);
    // The new participant left the shared spectator channel: no `me: null` view after its own one.
    expect(h.io.sockets.adapter.rooms.get(spectatorChannel(code))).toBeUndefined();
    expect(h.io.sockets.adapter.rooms.get(participantChannel(code, sId!))?.has(s.socket.id!)).toBe(true);
    // Force the rematch race: a `bind` of the former spectator that committed before the rematch
    // joins `:spec` only after the re-homing. It must still get exactly one view per change.
    h.io.in(participantChannel(code, sId!)).socketsJoin(spectatorChannel(code));
    expect(h.io.sockets.adapter.rooms.get(spectatorChannel(code))?.has(s.socket.id!)).toBe(true);
    const count = states(s).length;
    host.c.send('room:start');
    const sDraw = await s.next<SpectatorView>('room:state', tPhase('draw'));
    expect(sDraw.me).toEqual({ id: sId });
    expect(states(s).length - count).toBe(1);
    // A plain spectator joins the running tournament: the shared view goes out on `:spec`, yet the
    // participant still on `:spec` receives only its own view.
    const before = states(s).length;
    await spectate(h, code, 'Max');
    const own = await s.next<SpectatorView>('room:state', (v) => v.spectators[0]?.nickname === 'Max');
    expect(own.me).toEqual({ id: sId });
    await roundTrip(s);
    expect(states(s).length - before).toBe(1);
  });

  it('a pairing member and a waiting participant come back by token with the right view', async () => {
    const h = await harness();
    const { code, entrants } = await tournamentLobby(h);
    const first = await startAndDraw(h, entrants[0]!, entrants);
    const others = entrants.filter((e) => e !== first.a);

    // Member: drops, comes back on a new socket within the grace period and plays on.
    first.a.c.socket.disconnect();
    await first.b.c.next<RoomView>('room:state', (v) => v.players.a0?.connected === false);
    const back = await h.client();
    back.send('room:rejoin', { code, token: first.a.joined.token });
    expect(await back.next<RoomJoined>('room:joined')).toEqual({ code, token: first.a.joined.token, role: 'player', seat: 'a0' });
    const memberView = await back.next<RoomView>('room:state');
    expect(memberView).toMatchObject({ role: 'player', you: 'a0', tournament: { youId: first.a.id } });
    back.send('game:pick', { gesture: 'paper' });
    await first.b.c.next<RoomView>('room:state', (v) => v.match?.lockedSeats.includes('a0') === true);
    for (const e of others) expect(JSON.stringify(e.c.events)).not.toContain('paper');

    // Waiting participant: a second tab takes over; the old one is cut off.
    const waiter = first.waiting[0]!;
    const tab2 = await h.client();
    tab2.send('room:rejoin', { code, token: waiter.joined.token });
    expect(await tab2.next<RoomJoined>('room:joined')).toEqual({ code, token: waiter.joined.token, role: 'spectator', seat: null });
    const waiterView = await tab2.next<SpectatorView>('room:state');
    expect(waiterView).toMatchObject({ role: 'spectator', me: { id: waiter.id }, tournament: { youId: waiter.id } });
    expect((await errorOf(waiter.c)).code).toBe('bad_token');
    expect(h.io.sockets.adapter.rooms.get(participantChannel(code, waiter.id))).toEqual(new Set([tab2.socket.id]));
    const oldCount = states(waiter.c).length;
    first.b.c.send('game:pick', { gesture: 'rock' });
    await tab2.next<SpectatorView>('room:state', (v) => v.match?.phase === 'reveal');
    expect(states(waiter.c)).toHaveLength(oldCount);
    // The old socket's disconnect does not mark the participant as gone.
    const oldId = waiter.c.socket.id!;
    waiter.c.socket.disconnect();
    await serverForgot(h, oldId);
    const stored = (await h.store.get(code))!;
    expect(stored.tournament!.participants.find((p) => p.id === waiter.id)).toMatchObject({
      connected: true,
      socketId: tab2.socket.id,
    });
  });

  it('a waiting participant who drops is marked disconnected and returns any time', async () => {
    const h = await harness();
    const { code, entrants } = await tournamentLobby(h);
    const first = await startAndDraw(h, entrants[0]!, entrants);
    const waiter = first.waiting[1]!;
    const id = waiter.c.socket.id!;
    waiter.c.socket.disconnect();
    await serverForgot(h, id);
    const seen = await first.a.c.next<RoomView>(
      'room:state',
      (v) => v.tournament?.participants.find((p) => p.id === waiter.id)?.connected === false,
    );
    expect(seen.match?.phase).toBe('pick');
    h.clock.now += RECONNECT_GRACE_MS * 4;
    const back = await h.client();
    back.send('room:rejoin', { code, token: waiter.joined.token });
    expect((await back.next<RoomJoined>('room:joined')).role).toBe('spectator');
    expect((await back.next<SpectatorView>('room:state')).me).toEqual({ id: waiter.id });
  });

  it('a forfeited participant comes back as a watcher with its participant id', async () => {
    const h = await harness();
    const { code, entrants } = await tournamentLobby(h);
    const first = await startAndDraw(h, entrants[0]!, entrants);
    const id = first.b.c.socket.id!;
    first.b.c.socket.disconnect();
    await serverForgot(h, id);
    h.clock.now += RECONNECT_GRACE_MS;
    await h.ticker.runOnce();
    const pause = await first.a.c.next<SpectatorView>('room:state', tPhase('intermission'));
    expect(pause.tournament?.pairings.find((p) => p.id === first.pairingId)).toMatchObject({
      winner: first.a.id,
      decidedBy: 'forfeit',
    });
    const back = await h.client();
    back.send('room:rejoin', { code, token: first.b.joined.token });
    expect(await back.next<RoomJoined>('room:joined')).toEqual({ code, token: first.b.joined.token, role: 'spectator', seat: null });
    const view = await back.next<SpectatorView>('room:state');
    expect(view).toMatchObject({ role: 'spectator', isHost: false, me: { id: first.b.id }, tournament: { youId: first.b.id } });
    expect(view.tournament?.participants.find((p) => p.id === first.b.id)?.forfeited).toBe(true);
    for (const event of ['room:start', 'tournament:skip', 'room:rematch', 'game:next']) {
      back.send(event);
      expect((await errorOf(back)).code, event).toBe('not_player');
    }
  });

  it('a participant dropped from the lobby after its grace gets bad_token', async () => {
    const h = await harness();
    const { code, entrants } = await tournamentLobby(h);
    const gone = entrants[3]!;
    const id = gone.c.socket.id!;
    gone.c.socket.disconnect();
    await serverForgot(h, id);
    h.clock.now += RECONNECT_GRACE_MS;
    await h.ticker.runOnce();
    await entrants[0]!.c.next<SpectatorView>('room:state', (v) => v.tournament?.participants.length === 3);
    const back = await h.client();
    back.send('room:rejoin', { code, token: gone.joined.token });
    expect((await errorOf(back)).code).toBe('bad_token');
    entrants[0]!.c.send('room:start');
    expect((await errorOf(entrants[0]!.c)).code).toBe('not_enough_players');
  });

  it('a tournament join after the start is a spectator; the ninth lobby joiner too', async () => {
    const h = await harness();
    const { code, entrants } = await tournamentLobby(h);
    for (let i = 0; i < 4; i++) {
      const c = await h.client();
      c.send('room:join', { code, nickname: `X${i}`, avatar: 'cat' });
      expect((await c.next<RoomJoined>('room:joined')).role).toBe('spectator');
      expect((await c.next<SpectatorView>('room:state')).me).toEqual({ id: expect.any(String) });
    }
    const { joined, view } = await spectate(h, code, 'Nine');
    expect(joined.role).toBe('spectator');
    expect(view.me).toBeNull();
    expect(view.tournament?.participants).toHaveLength(8);
    expect(view.spectators.map((x) => x.nickname)).toEqual(['Nine']);
    void entrants;
  });

  it('deletes an abandoned tournament and detaches every socket from its channels', async () => {
    const h = await harness();
    const { code, entrants } = await tournamentLobby(h);
    await startAndDraw(h, entrants[0]!, entrants);
    const { s } = await spectate(h, code, 'Lou');
    for (const e of entrants) {
      const id = e.c.socket.id!;
      e.c.socket.disconnect();
      await serverForgot(h, id);
    }
    for (let i = 0; i < 5 && (await h.store.get(code)); i++) {
      h.clock.now += RECONNECT_GRACE_MS;
      await h.ticker.runOnce();
    }
    expect(await h.store.get(code)).toBeNull();
    expect(s.socket.connected).toBe(true);
    const channels = [...h.io.sockets.adapter.rooms.keys()].filter((r) => r === code || r.startsWith(`${code}:`));
    expect(channels).toEqual([]);
  });

  it('a socket switching from a tournament to another room counts as disconnected there', async () => {
    const h = await harness();
    const { code, entrants } = await tournamentLobby(h);
    const mover = entrants[2]!;
    mover.c.send('room:create', { config: classic, nickname: 'Jo', avatar: 'owl' });
    expect((await mover.c.next<RoomJoined>('room:joined')).role).toBe('player');
    await entrants[0]!.c.next<SpectatorView>(
      'room:state',
      (v) => v.tournament?.participants.find((p) => p.id === mover.id)?.connected === false,
    );
    expect(h.io.sockets.adapter.rooms.get(participantChannel(code, mover.id))).toBeUndefined();
  });
});
