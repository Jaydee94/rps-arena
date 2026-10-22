import { ClientEvents, ProtocolError, RuleError } from '@rps/shared';
import type {
  ClientEventName,
  ClientEventPayloads,
  ErrorCode,
  RuleErrorCode,
  SeatId,
  ServerEvents,
} from '@rps/shared';
import type { Server, Socket } from 'socket.io';
import {
  applyAnnounce,
  applyNext,
  applyPick,
  createRoom,
  joinRoom,
  markDisconnected,
  moveSeat,
  rejoinRoom,
  rematch,
  seatOfSocket,
  startMatch,
} from './engine';
import { TokenBucket } from './rate-limit';
import type { Room } from './room';
import type { RoomStore } from './store';
import { viewFor } from './view';

export interface GatewayOptions {
  /** rng for room codes (tests inject collisions). */
  codeRng?: () => number;
  /** rng for bot moves. */
  botRng?: () => number;
  /** Per-socket token bucket. Default 20 events/s, burst 40. */
  rateLimit?: { perSecond: number; burst: number };
  /** Room code draws before `room:create` gives up with `internal`. */
  maxCodeAttempts?: number;
}

export interface Gateway {
  /** Sends every seated human its own view. Reaches all replicas through the adapter. */
  broadcast(room: Room): void;
  /** Detaches all sockets from a deleted room. */
  dropRoom(code: string): void;
  /** Resolves once no socket event is being processed (for graceful shutdown). */
  idle(): Promise<void>;
}

type SocketData = { code?: string };
type ServerListeners = { [K in keyof ServerEvents]: (payload: ServerEvents[K]) => void };
type GameSocket = Socket<Record<string, never>, ServerListeners, Record<string, never>, SocketData>;

const RULE_ERRORS: Record<RuleErrorCode, ErrorCode> = {
  invalid_emote: 'invalid_input',
  unknown_seat: 'invalid_input',
  wrong_phase: 'wrong_phase',
  invalid_gesture: 'invalid_gesture',
  already_picked: 'already_picked',
};

/** Events without payload: a missing argument means `{}`. */
const EMPTY_PAYLOAD_EVENTS = new Set<ClientEventName>(['room:start', 'game:next', 'room:rematch']);

/** Socket.IO room carrying one seat's private view. */
export const seatChannel = (code: string, seat: SeatId) => `${code}:${seat}`;

function errorCodeOf(error: unknown): ErrorCode {
  if (error instanceof ProtocolError) return error.code;
  if (error instanceof RuleError) return RULE_ERRORS[error.code];
  // Unexpected: log without payloads (they could hold tokens).
  console.error('gateway: unexpected error', error instanceof Error ? error.message : error);
  return 'internal';
}

/**
 * Wires the client events to the engine. Every change goes through `store.update`, so it is
 * atomic across replicas; afterwards each seat gets its `viewFor` view on its seat channel.
 * Failures become `room:error { code, message: code }` (the client localizes by code), never a
 * crash or a dropped connection.
 */
export function createGateway(
  io: Server,
  store: RoomStore,
  clock: () => number = Date.now,
  options: GatewayOptions = {},
): Gateway {
  const { perSecond, burst } = options.rateLimit ?? { perSecond: 20, burst: 40 };
  const maxCodeAttempts = options.maxCodeAttempts ?? 10;
  const botRng = options.botRng ?? Math.random;
  const inFlight = new Set<Promise<void>>();
  /** Tracks a never-rejecting task so shutdown can wait for it. */
  function track(task: Promise<void>): Promise<void> {
    const safe = task.catch((error: unknown) => void errorCodeOf(error));
    inFlight.add(safe);
    void safe.finally(() => inFlight.delete(safe));
    return safe;
  }

  function broadcast(room: Room): void {
    for (const [seat, player] of Object.entries(room.players) as [SeatId, Room['players'][SeatId]][]) {
      if (player && !player.isBot) io.to(seatChannel(room.code, seat)).emit('room:state', viewFor(room, seat));
    }
  }

  function dropRoom(code: string): void {
    io.in(code).socketsLeave([code, ...(['a0', 'a1', 'b0', 'b1'] as const).map((s) => seatChannel(code, s))]);
  }

  io.on('connection', (raw) => {
    const socket = raw as GameSocket;
    const bucket = new TokenBucket(perSecond, burst, clock);
    const fail = (code: ErrorCode): void => {
      socket.emit('room:error', { code, message: code });
    };

    socket.use((_packet, next) => {
      if (bucket.take()) next();
      else fail('rate_limited');
    });

    async function bind(room: Room, seat: SeatId): Promise<void> {
      socket.data.code = room.code;
      await socket.join([room.code, seatChannel(room.code, seat)]);
      socket.emit('room:joined', { code: room.code, token: room.players[seat]!.token, seat });
      broadcast(room);
    }

    /** Leaves the room this socket sits in (switching rooms counts as a disconnect there). */
    async function release(): Promise<void> {
      const code = socket.data.code;
      if (!code) return;
      socket.data.code = undefined;
      for (const channel of socket.rooms) if (channel !== socket.id) await socket.leave(channel);
      let changed = false;
      const room = await store.update(code, (current) => {
        const seat = seatOfSocket(current, socket.id);
        if (!seat) return null;
        changed = true;
        return markDisconnected(current, seat, clock());
      });
      if (room && changed) broadcast(room);
    }

    /**
     * Runs `fn` for this socket's own seat, atomically, then broadcasts (after `beforeBroadcast`,
     * e.g. moving sockets to new seat channels).
     */
    async function asSeat(
      fn: (room: Room, seat: SeatId, now: number) => Room,
      beforeBroadcast?: (room: Room) => void,
    ): Promise<void> {
      const code = socket.data.code;
      if (!code) throw new ProtocolError('bad_token');
      const room = await store.update(code, (current) => {
        const seat = seatOfSocket(current, socket.id);
        if (!seat) throw new ProtocolError('bad_token');
        return fn(current, seat, clock());
      });
      if (!room) throw new ProtocolError('room_not_found');
      beforeBroadcast?.(room);
      broadcast(room);
    }

    const handlers: { [K in ClientEventName]: (p: ClientEventPayloads[K]) => Promise<unknown> } = {
      'room:create': async (p) => {
        await release();
        for (let attempt = 0; attempt < maxCodeAttempts; attempt++) {
          const room = createRoom({ ...p, socketId: socket.id }, clock(), options.codeRng);
          if (await store.create(room)) return bind(room, 'a0');
        }
        throw new ProtocolError('internal');
      },
      'room:join': async (p) => {
        await release();
        let seat: SeatId = 'a0';
        const room = await store.update(p.code, (current) => {
          const joined = joinRoom(current, p.nickname, p.avatar, clock(), socket.id);
          seat = joined.seat;
          return joined.room;
        });
        if (!room) throw new ProtocolError('room_not_found');
        await bind(room, seat);
      },
      'room:rejoin': async (p) => {
        if (socket.data.code !== p.code) await release();
        let seat: SeatId = 'a0';
        let previous: string | null = null;
        const room = await store.update(p.code, (current) => {
          const result = rejoinRoom(current, p.token, clock(), socket.id);
          seat = result.seat;
          previous = result.previousSocketId;
          return result.room;
        });
        if (!room) throw new ProtocolError('room_not_found');
        if (previous) {
          // The seat now belongs to this socket; cut the old one (on any replica) off the room.
          io.to(previous).emit('room:error', { code: 'bad_token', message: 'bad_token' });
          io.in(previous).socketsLeave([room.code, seatChannel(room.code, seat)]);
        }
        await bind(room, seat);
      },
      'room:start': () => asSeat((room, seat, now) => startMatch(room, seat, now)),
      'seat:move': (p) =>
        asSeat(
          (room, seat) => moveSeat(room, seat, p.from, p.to),
          (room) => {
            // Re-home the moved player's sockets (on any replica) before the views go out.
            const from = seatChannel(room.code, p.from);
            io.in(from).socketsJoin(seatChannel(room.code, p.to));
            io.in(from).socketsLeave(from);
          },
        ),
      'game:announce': (p) => asSeat((room, seat, now) => applyAnnounce(room, seat, p, now, botRng)),
      'game:pick': (p) => asSeat((room, seat, now) => applyPick(room, seat, p, now, botRng)),
      'game:next': () => asSeat((room, seat, now) => applyNext(room, seat, now, botRng)),
      'room:rematch': () => asSeat((room, seat, now) => rematch(room, seat, now, botRng)),
    };

    /**
     * Events of one socket run strictly one after another (a pick must not overtake the join
     * before it). The queue is bounded by the rate limit and the store's command timeout.
     */
    let queue: Promise<void> = Promise.resolve();
    const enqueue = (task: () => Promise<void>) => {
      queue = track(queue.then(task));
    };

    for (const name of Object.keys(ClientEvents) as ClientEventName[]) {
      socket.on(name as never, ((payload: unknown) => enqueue(async () => {
        try {
          const input =
            EMPTY_PAYLOAD_EVENTS.has(name) && (payload === undefined || typeof payload === 'function')
              ? {}
              : payload;
          const parsed = ClientEvents[name].safeParse(input);
          if (!parsed.success) return fail('invalid_input');
          await (handlers[name] as (p: unknown) => Promise<unknown>)(parsed.data);
        } catch (error) {
          fail(errorCodeOf(error));
        }
      })) as never);
    }

    socket.on('disconnect', () => {
      enqueue(() => release().catch((error: unknown) => void errorCodeOf(error)));
    });
  });

  return {
    broadcast,
    dropRoom,
    async idle() {
      while (inFlight.size > 0) await Promise.all(inFlight);
    },
  };
}
