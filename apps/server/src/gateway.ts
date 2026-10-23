import { ClientEvents, ProtocolError, RuleError } from '@rps/shared';
import type {
  ClientEventName,
  ClientEventPayloads,
  ErrorCode,
  RoomJoined,
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
  markSpectatorDisconnected,
  moveSeat,
  rejoinRoom,
  rematch,
  startMatch,
  whoOfSocket,
} from './engine';
import type { Who } from './engine';
import { TokenBucket } from './rate-limit';
import { spectatorsOf } from './room';
import type { Room } from './room';
import type { Rng } from './settle';
import type { RoomStore } from './store';
import {
  createTournamentRoom,
  joinTournamentRoom,
  markParticipantDisconnected,
  participantIdOfSeat,
  rejoinTournament,
  skipTournamentWait,
  startTournament,
  tournamentRematch,
  tournamentWhoOfSocket,
} from './tournament';
import type { TournamentWho } from './tournament';
import { participantViewFor, spectatorViewFor, viewFor } from './view';

export interface GatewayOptions {
  /** rng for room codes (tests inject collisions). */
  codeRng?: () => number;
  /** rng for bot moves. */
  botRng?: () => number;
  /** rng for tournament draws and coin flips (tests inject fixed values). */
  tournamentRng?: () => number;
  /** Per-socket token bucket. Default 20 events/s, burst 40. */
  rateLimit?: { perSecond: number; burst: number };
  /** Room code draws before `room:create` gives up with `internal`. */
  maxCodeAttempts?: number;
}

export interface Gateway {
  /**
   * Sends every seated human its own view and the shared spectator view once to the spectator
   * channel; in a tournament room every participant gets its own view on its personal channel.
   * Reaches all replicas through the adapter.
   */
  broadcast(room: Room): void;
  /**
   * Detaches all sockets from a deleted room. `room` is its last stored state (the ticker passes
   * it); it is required because the personal channels of its participants and spectators are
   * named by their ids and are left too.
   */
  dropRoom(code: string, room: Room): void;
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
const EMPTY_PAYLOAD_EVENTS = new Set<ClientEventName>([
  'room:start',
  'game:next',
  'room:rematch',
  'tournament:skip',
]);

/** Socket.IO room carrying one seat's private view. */
export const seatChannel = (code: string, seat: SeatId) => `${code}:${seat}`;

/** Socket.IO room carrying the spectator view (identical for every spectator of the room). */
export const spectatorChannel = (code: string) => `${code}:spec`;

/**
 * Socket.IO room carrying the own view of one person of a tournament room (`id` is the
 * tournament-local participant or spectator id, never a token). Every participant receives all of
 * its views here, whether it plays (a `PlayerView`) or watches (a `SpectatorView` with `me`), so a
 * pairing change never needs to move sockets between channels. Tournament spectators join it too
 * (next to the shared spectator channel) so a rematch can re-home them without a socket handle.
 */
export const participantChannel = (code: string, id: string) => `${code}:p:${id}`;

/** The private channel of a player seat or the shared one of all spectators (duel rooms). */
const channelOf = (code: string, who: Who) =>
  who.role === 'player' ? seatChannel(code, who.seat) : spectatorChannel(code);

/**
 * A person of a tournament room: a participant (playing, waiting, eliminated or forfeited) or a
 * plain spectator. Participant ids and spectator ids share one id space.
 */
type Person = { kind: 'participant' | 'spectator'; id: string };

/** The person behind `who` in a tournament room (a seat resolves to its pairing participant). */
function personOf(room: Room, who: TournamentWho): Person | null {
  if (who.role === 'player') {
    const id = participantIdOfSeat(room, who.seat);
    return id === null ? null : { kind: 'participant', id };
  }
  if (who.role === 'participant') return { kind: 'participant', id: who.id };
  // A forfeited participant comes back as `{ role: 'spectator' }` under its participant id.
  const isParticipant = room.tournament?.participants.some((p) => p.id === who.id) ?? false;
  return { kind: isParticipant ? 'participant' : 'spectator', id: who.id };
}

/** The channels (besides the room code) a socket bound as `who` sits in. */
function channelsOf(room: Room, who: TournamentWho): string[] {
  if (!room.tournament) return [channelOf(room.code, who as Who)];
  const person = personOf(room, who);
  if (!person) return [];
  const own = participantChannel(room.code, person.id);
  return person.kind === 'spectator' ? [own, spectatorChannel(room.code)] : [own];
}

/** Who `socketId` is: a seat or spectator, in a tournament room also a waiting participant. */
function whoOf(room: Room, socketId: string): TournamentWho | null {
  return room.tournament ? tournamentWhoOfSocket(room, socketId) : whoOfSocket(room, socketId);
}

function sameWho(room: Room, a: TournamentWho, b: TournamentWho): boolean {
  if (room.tournament) {
    const x = personOf(room, a);
    const y = personOf(room, b);
    return x !== null && y !== null && x.kind === y.kind && x.id === y.id;
  }
  if (a.role === 'player') return b.role === 'player' && a.seat === b.seat;
  return b.role === 'spectator' && a.id === b.id;
}

/**
 * Marks a player seat, participant or spectator as disconnected (starting its reconnect grace).
 * `rng` drives the settle of a tournament room (the gateway's `tournamentRng`).
 */
function markGone(room: Room, who: TournamentWho, now: number, rng: Rng): Room {
  if (room.tournament) {
    const person = personOf(room, who);
    if (!person) return room;
    return person.kind === 'participant'
      ? markParticipantDisconnected(room, person.id, now, rng)
      : markSpectatorDisconnected(room, person.id, now);
  }
  return who.role === 'player'
    ? markDisconnected(room, who.seat, now)
    : markSpectatorDisconnected(room, (who as Who & { role: 'spectator' }).id, now);
}

/**
 * What `room:joined` tells the bound socket; null if `who` is not in the room. In a tournament
 * room only a member of the running pairing joins as `role: 'player'` with its seat; everyone else
 * (waiting, eliminated, forfeited, plain spectators) joins as `role: 'spectator'`, `seat: null`
 * (a participant's own view then carries `me`). The token is always the person's own.
 */
function joinedMessage(room: Room, who: TournamentWho): RoomJoined | null {
  if (room.tournament) {
    const person = personOf(room, who);
    if (!person) return null;
    const pool = person.kind === 'participant' ? room.tournament.participants : spectatorsOf(room);
    const record = pool.find((p) => p.id === person.id);
    if (!record) return null;
    return who.role === 'player'
      ? { code: room.code, token: record.token, role: 'player', seat: who.seat }
      : { code: room.code, token: record.token, role: 'spectator', seat: null };
  }
  if (who.role === 'participant') return null;
  if (who.role === 'player') {
    const player = room.players[who.seat];
    return player ? { code: room.code, token: player.token, role: 'player', seat: who.seat } : null;
  }
  const spectator = spectatorsOf(room).find((s) => s.id === who.id);
  return spectator ? { code: room.code, token: spectator.token, role: 'spectator', seat: null } : null;
}

function errorCodeOf(error: unknown): ErrorCode {
  if (error instanceof ProtocolError) return error.code;
  if (error instanceof RuleError) return RULE_ERRORS[error.code];
  // Unexpected: log without payloads (they could hold tokens).
  console.error('gateway: unexpected error', error instanceof Error ? error.message : error);
  return 'internal';
}

/**
 * Notes for clients (hazards and conventions):
 * - `room:state` snapshots carry no version. A `bind` sends its snapshot after the store update,
 *   so in rare interleavings a late snapshot can overtake a newer one (inherited from Stage 1);
 *   the next change corrects it.
 * - In tournament rooms `room:joined.role`/`seat` only describe the binding at that moment (a
 *   pairing member is `player` on a0/b0, everyone else `spectator` with seat null). Pairing changes
 *   send no new `room:joined`, so clients route on `room:state.role` and `me` (`me` set = a
 *   participant), never on `room:joined.role`. `hostSeat` is meaningless in tournament views; use
 *   `isHost`.
 * - `tournament:skip`, like the other host events, answers `bad_token` for an unbound socket.
 *
 * Wires the client events to the engine. Every change goes through `store.update`, so it is
 * atomic across replicas; afterwards each seat gets its `viewFor` view on its seat channel and all
 * spectators share one `spectatorViewFor` view on the spectator channel. Spectators may only watch:
 * game and host events from them are `not_player`.
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
  const tournamentRng = options.tournamentRng ?? Math.random;
  /** Tournament rooms draw and flip coins with `tournamentRng`, duel rooms move bots with `botRng`. */
  const rngFor = (room: Room) => (room.tournament ? tournamentRng : botRng);
  const inFlight = new Set<Promise<void>>();
  /** Tracks a never-rejecting task so shutdown can wait for it. */
  function track(task: Promise<void>): Promise<void> {
    const safe = task.catch((error: unknown) => void errorCodeOf(error));
    inFlight.add(safe);
    void safe.finally(() => inFlight.delete(safe));
    return safe;
  }

  function broadcast(room: Room): void {
    if (room.tournament) {
      broadcastTournament(room);
      return;
    }
    for (const [seat, player] of Object.entries(room.players) as [SeatId, Room['players'][SeatId]][]) {
      if (player && !player.isBot) io.to(seatChannel(room.code, seat)).emit('room:state', viewFor(room, seat));
    }
    if (spectatorsOf(room).length > 0) io.to(spectatorChannel(room.code)).emit('room:state', spectatorViewFor(room));
  }

  /**
   * Tournament rooms: each participant gets exactly one view per change on its personal channel
   * (the seat's `viewFor` while it plays in the running pairing, otherwise its own
   * `participantViewFor`), plain spectators share one `spectatorViewFor` on the spectator channel.
   * The seat channels are not used, so whoever the pairing projects onto a0/b0 next, no socket can
   * still sit on a channel that now carries someone else's picks; and since the view kind is
   * chosen here from the room alone, ticker-driven pairing changes need no socket re-homing.
   */
  function broadcastTournament(room: Room): void {
    const seatOf = new Map<string, SeatId>();
    for (const seat of ['a0', 'b0'] as const) {
      const id = participantIdOfSeat(room, seat);
      if (id !== null && room.players[seat]) seatOf.set(id, seat);
    }
    for (const participant of room.tournament?.participants ?? []) {
      const seat = seatOf.get(participant.id);
      io.to(participantChannel(room.code, participant.id)).emit(
        'room:state',
        seat ? viewFor(room, seat) : participantViewFor(room, participant.id),
      );
    }
    if (spectatorsOf(room).length > 0) {
      // Never to a participant: a socket that still sits on `:spec` (e.g. a spectator's `bind`
      // that committed before a rematch made it a participant and joined `:spec` only after
      // `rehomeTournament` ran) would otherwise get the shared `me: null` view next to its own.
      const participantChannels = (room.tournament?.participants ?? []).map((p) => participantChannel(room.code, p.id));
      io.to(spectatorChannel(room.code)).except(participantChannels).emit('room:state', spectatorViewFor(room));
    }
  }

  /**
   * After a tournament rematch some spectators became participants (and disconnected participants
   * may have become spectators): move their sockets, on any replica, between the shared spectator
   * channel and their personal one only. Runs before the broadcast. This is cleanup only: the
   * shared spectator emit already excludes every participant channel (see `broadcastTournament`).
   */
  function rehomeTournament(room: Room): void {
    for (const participant of room.tournament?.participants ?? []) {
      io.in(participantChannel(room.code, participant.id)).socketsLeave(spectatorChannel(room.code));
    }
    for (const spectator of spectatorsOf(room)) {
      io.in(participantChannel(room.code, spectator.id)).socketsJoin(spectatorChannel(room.code));
    }
  }

  function dropRoom(code: string, room: Room): void {
    const people = [...(room.tournament?.participants ?? []), ...spectatorsOf(room)];
    io.in(code).socketsLeave([
      code,
      ...(['a0', 'a1', 'b0', 'b1'] as const).map((s) => seatChannel(code, s)),
      spectatorChannel(code),
      ...people.map((p) => participantChannel(code, p.id)),
    ]);
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

    async function bind(room: Room, who: TournamentWho): Promise<void> {
      // Resolve first, so an (unreachable) inconsistency cannot leave the socket half bound.
      const joined = joinedMessage(room, who);
      if (!joined) throw new ProtocolError('internal');
      socket.data.code = room.code;
      await socket.join([room.code, ...channelsOf(room, who)]);
      socket.emit('room:joined', joined);
      broadcast(room);
    }

    /**
     * `store.update` that also hands out a typed side result of `fn` (the stored room plus
     * e.g. who joined). Throws `room_not_found` for an unknown code.
     */
    async function updateWith<T>(
      code: string,
      fn: (current: Room) => { room: Room; result: T },
    ): Promise<{ room: Room; result: T }> {
      const box: { out: { result: T } | null } = { out: null };
      const room = await store.update(code, (current) => {
        const { room: next, result } = fn(current);
        box.out = { result };
        return next;
      });
      if (!room || !box.out) throw new ProtocolError('room_not_found');
      return { room, result: box.out.result };
    }

    /** Leaves the room this socket sits in (switching rooms counts as a disconnect there). */
    async function release(): Promise<void> {
      const code = socket.data.code;
      if (!code) return;
      socket.data.code = undefined;
      for (const channel of socket.rooms) if (channel !== socket.id) await socket.leave(channel);
      let changed = false;
      const room = await store.update(code, (current) => {
        const who = whoOf(current, socket.id);
        if (!who) return null;
        changed = true;
        return markGone(current, who, clock(), tournamentRng);
      });
      if (room && changed) broadcast(room);
    }

    /**
     * Runs `fn` for whoever this socket is bound as, atomically, then broadcasts (after
     * `beforeBroadcast`, e.g. moving sockets to new channels). An unbound socket gets `bad_token`.
     */
    async function act(
      fn: (room: Room, who: TournamentWho, now: number) => Room,
      beforeBroadcast?: (room: Room) => void,
    ): Promise<void> {
      const code = socket.data.code;
      if (!code) throw new ProtocolError('bad_token');
      const room = await store.update(code, (current) => {
        const who = whoOf(current, socket.id);
        if (!who) throw new ProtocolError('bad_token');
        return fn(current, who, clock());
      });
      if (!room) throw new ProtocolError('room_not_found');
      beforeBroadcast?.(room);
      broadcast(room);
    }

    /**
     * `act` for this socket's own seat. Anyone without a seat (a spectator, or in a tournament a
     * participant outside the running pairing) gets `not_player` and the room stays as it is.
     */
    function asSeat(
      fn: (room: Room, seat: SeatId, now: number) => Room,
      beforeBroadcast?: (room: Room) => void,
    ): Promise<void> {
      return act((room, who, now) => {
        if (who.role !== 'player') throw new ProtocolError('not_player');
        return fn(room, who.seat, now);
      }, beforeBroadcast);
    }

    /**
     * Host events. In a tournament room the acting participant (on a seat or not) is passed by its
     * participant id (the engine checks it is the host: `not_host`); spectators, forfeited
     * participants included, get `not_player`. In a duel room `duel` runs for the own seat.
     */
    function asHost(
      tournament: (room: Room, byId: string, now: number) => Room,
      duel: (room: Room, seat: SeatId, now: number) => Room,
      beforeBroadcast?: (room: Room) => void,
    ): Promise<void> {
      return act((room, who, now) => {
        if (!room.tournament) {
          if (who.role !== 'player') throw new ProtocolError('not_player');
          return duel(room, who.seat, now);
        }
        const person = personOf(room, who);
        if (who.role === 'spectator' || !person || person.kind !== 'participant') {
          throw new ProtocolError('not_player');
        }
        return tournament(room, person.id, now);
      }, beforeBroadcast);
    }

    const handlers: { [K in ClientEventName]: (p: ClientEventPayloads[K]) => Promise<unknown> } = {
      'room:create': async (p) => {
        await release();
        const { tournament, ...duel } = p;
        // A tournament has no bots.
        if (tournament && duel.vsBot) throw new ProtocolError('invalid_input');
        for (let attempt = 0; attempt < maxCodeAttempts; attempt++) {
          if (tournament) {
            // Mode and length are checked by `createTournamentRoom` (invalid_input).
            const room = createTournamentRoom(
              { config: p.config, format: tournament.format, nickname: p.nickname, avatar: p.avatar, socketId: socket.id },
              clock(),
              options.codeRng,
            );
            const hostId = room.tournament?.hostId;
            if (!hostId) throw new ProtocolError('internal');
            if (await store.create(room)) return bind(room, { role: 'participant', id: hostId });
            continue;
          }
          const room = createRoom({ ...duel, socketId: socket.id }, clock(), options.codeRng);
          if (await store.create(room)) return bind(room, { role: 'player', seat: 'a0' });
        }
        throw new ProtocolError('internal');
      },
      'room:join': async (p) => {
        // Policy: a join always makes a new player or spectator, even into the room this socket
        // is already in. The old binding is released like any room switch (it is marked
        // disconnected and its slot frees up once its reconnect grace runs out).
        await release();
        const { room, result: who } = await updateWith(p.code, (current) => {
          const joined: { room: Room; who: TournamentWho } = current.tournament
            ? joinTournamentRoom(current, p.nickname, p.avatar, clock(), socket.id, tournamentRng)
            : joinRoom(current, p.nickname, p.avatar, clock(), socket.id);
          return { room: joined.room, result: joined.who };
        });
        await bind(room, who);
      },
      'tournament:skip': () =>
        asHost(
          (room, byId, now) => skipTournamentWait(room, byId, now, tournamentRng),
          () => {
            // A duel has no draw or intermission to skip.
            throw new ProtocolError('wrong_phase');
          },
        ),
      'room:rejoin': async (p) => {
        if (socket.data.code !== p.code) await release();
        const { room, result } = await updateWith(p.code, (current) => {
          const now = clock();
          // Within the same room the socket may hold another binding (e.g. a spectator rejoining
          // with a player token): release it, or it would stay connected forever as a ghost.
          // Rejoining the own binding again changes nothing here.
          const before = whoOf(current, socket.id);
          // Tournament rooms have their own rejoin (`rejoinRoom` refuses them): it also finds
          // waiting, eliminated and forfeited participants.
          const rejoined: { room: Room; who: TournamentWho; previousSocketId: string | null } =
            current.tournament
              ? rejoinTournament(current, p.token, now, socket.id, tournamentRng)
              : rejoinRoom(current, p.token, now, socket.id);
          const stale = before && !sameWho(current, before, rejoined.who) ? before : null;
          return {
            room: stale ? markGone(rejoined.room, stale, now, tournamentRng) : rejoined.room,
            result: {
              who: rejoined.who,
              previous: rejoined.previousSocketId,
              staleChannels: stale ? channelsOf(current, stale) : [],
            },
          };
        });
        const { who, previous, staleChannels } = result;
        for (const channel of staleChannels) await socket.leave(channel);
        if (previous) {
          // The seat (or spectator, or participant) now belongs to this socket; cut the old one
          // (on any replica) off the room.
          io.to(previous).emit('room:error', { code: 'bad_token', message: 'bad_token' });
          io.in(previous).socketsLeave([room.code, ...channelsOf(room, who)]);
        }
        await bind(room, who);
      },
      'room:start': () =>
        asHost(
          (room, byId, now) => startTournament(room, byId, now, tournamentRng),
          (room, seat, now) => startMatch(room, seat, now),
        ),
      'seat:move': (p) =>
        act(
          (room, who) => {
            // A tournament places its pairings itself.
            if (room.tournament) throw new ProtocolError('invalid_input');
            if (who.role !== 'player') throw new ProtocolError('not_player');
            return moveSeat(room, who.seat, p.from, p.to);
          },
          (room) => {
            // Re-home the moved player's sockets (on any replica) before the views go out.
            const from = seatChannel(room.code, p.from);
            io.in(from).socketsJoin(seatChannel(room.code, p.to));
            io.in(from).socketsLeave(from);
          },
        ),
      'game:announce': (p) => asSeat((room, seat, now) => applyAnnounce(room, seat, p, now, rngFor(room))),
      'game:pick': (p) => asSeat((room, seat, now) => applyPick(room, seat, p, now, rngFor(room))),
      'game:next': () => asSeat((room, seat, now) => applyNext(room, seat, now, rngFor(room))),
      'room:rematch': () =>
        asHost(
          (room, byId, now) => tournamentRematch(room, byId, now, tournamentRng),
          (room, seat, now) => rematch(room, seat, now, botRng),
          (room) => {
            if (room.tournament) rehomeTournament(room);
          },
        ),
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
