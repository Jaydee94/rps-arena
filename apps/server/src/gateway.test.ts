import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect } from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';
import { CODE_ALPHABET, RECONNECT_GRACE_MS } from '@rps/shared';
import type { PlayerView as RoomView, RoomConfig, RoomJoined } from '@rps/shared';
import { createGateway } from './gateway';
import type { GatewayOptions } from './gateway';
import { createIoServer } from './io';
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
  return { url, store, clock, ticker, client };
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

  it('a join after the match started is room_full', async () => {
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
    expect((await errorOf(e)).code).toBe('room_full');
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
