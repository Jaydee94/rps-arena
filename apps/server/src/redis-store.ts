import { ROOM_TTL_S } from '@rps/shared';
import type { Redis } from 'ioredis';
import type { Room } from './room';
import type { RoomStore } from './store';

/** Optimistic-lock attempts of one `update` before it gives up with an error. */
export const MAX_UPDATE_ATTEMPTS = 20;

export interface RedisRoomStoreOptions {
  /** Inactivity TTL of a room key in seconds. Defaults to `ROOM_TTL_S`. */
  ttlSeconds?: number;
  /** Prefix of every key. Defaults to `rps:`. */
  keyPrefix?: string;
}

/** SET NX EX plus the deadline index entry in one atomic step, so a crash cannot split them. */
const CREATE_SCRIPT = `
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2]) then
  if ARGV[3] ~= '' then redis.call('ZADD', KEYS[2], ARGV[3], ARGV[4]) end
  return 1
end
return 0`;

/**
 * Unconditional, atomic removal of the room and its index entry. A script (not MULTI/EXEC) so it
 * can never abort and, unlike EXEC, never touches the connection's WATCH state.
 */
const DELETE_SCRIPT = `
redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return 1`;

/**
 * Due codes whose room key is gone (expired or deleted elsewhere) are removed from the index
 * inside the same script, so a concurrent create of the same code cannot lose its entry.
 * (Assumes a single Redis, not Cluster: room keys are derived from ARGV.)
 */
const DUE_SCRIPT = `
local due = {}
for _, code in ipairs(redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])) do
  if redis.call('EXISTS', ARGV[2] .. code) == 1 then
    due[#due + 1] = code
  else
    redis.call('ZREM', KEYS[1], code)
  end
end
return due`;

/**
 * `WATCH` state belongs to the connection, not to a call. Two `update` loops interleaving on one
 * ioredis connection would share (and `UNWATCH`/`EXEC` away) each other's watches, which silently
 * breaks the optimistic lock. So all `update` loops (and `delete`, which must not land between a
 * running update's WATCH and EXEC) on one connection run one after another,
 * tracked per connection (not per store) so two stores sharing a connection stay safe too.
 * Other processes and other connections are covered by WATCH/MULTI/EXEC itself.
 */
const updateQueues = new WeakMap<Redis, Promise<unknown>>();

function runExclusive<T>(redis: Redis, task: () => Promise<T>): Promise<T> {
  const previous = updateQueues.get(redis) ?? Promise.resolve();
  const result = previous.then(task);
  updateQueues.set(
    redis,
    result.catch(() => undefined),
  );
  return result;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Room store on Redis, so several server replicas share rooms and a restart keeps them.
 *
 * - `<prefix>room:<code>`: the room as JSON, with `EX ttl`, renewed on every successful
 *   `update` and on `touch`.
 * - `<prefix>deadlines`: sorted set, member = code, score = `deadline`; holds only rooms with a
 *   pending deadline. Entries of rooms that expired are removed lazily by `dueRooms`.
 */
export class RedisRoomStore implements RoomStore {
  private readonly ttlSeconds: number;
  private readonly roomPrefix: string;
  private readonly deadlineKey: string;

  constructor(
    private readonly redis: Redis,
    opts: RedisRoomStoreOptions = {},
  ) {
    const prefix = opts.keyPrefix ?? 'rps:';
    this.ttlSeconds = opts.ttlSeconds ?? ROOM_TTL_S;
    this.roomPrefix = `${prefix}room:`;
    this.deadlineKey = `${prefix}deadlines`;
  }

  private roomKey(code: string): string {
    return this.roomPrefix + code;
  }

  async create(room: Room): Promise<boolean> {
    const created = await this.redis.eval(
      CREATE_SCRIPT,
      2,
      this.roomKey(room.code),
      this.deadlineKey,
      JSON.stringify(room),
      String(this.ttlSeconds),
      typeof room.deadline === 'number' ? String(room.deadline) : '',
      room.code,
    );
    return created === 1;
  }

  async get(code: string): Promise<Room | null> {
    const raw = await this.redis.get(this.roomKey(code));
    return raw === null ? null : (JSON.parse(raw) as Room);
  }

  update(code: string, fn: (room: Room) => Room | null): Promise<Room | null> {
    return runExclusive(this.redis, () => this.updateLocked(code, fn));
  }

  private async updateLocked(
    code: string,
    fn: (room: Room) => Room | null,
  ): Promise<Room | null> {
    const key = this.roomKey(code);
    for (let attempt = 1; attempt <= MAX_UPDATE_ATTEMPTS; attempt++) {
      await this.redis.watch(key);
      let executed = false;
      try {
        const raw = await this.redis.get(key);
        if (raw === null) return null;

        const current = JSON.parse(raw) as Room;
        const baseVersion = current.version;
        const next = fn(current);
        // `fn` may have mutated its argument; hand back a pristine copy of what is stored.
        if (next === null) return JSON.parse(raw) as Room;

        const stored: Room = { ...next, version: baseVersion + 1 };
        const json = JSON.stringify(stored);
        const tx = this.redis.multi().set(key, json, 'EX', this.ttlSeconds);
        if (typeof stored.deadline === 'number') tx.zadd(this.deadlineKey, stored.deadline, code);
        else tx.zrem(this.deadlineKey, code);

        executed = true; // EXEC clears the watch whether it commits or aborts
        const results = await tx.exec();
        if (results === null) {
          // Someone else changed (or deleted) the room since WATCH: read again and retry.
          await sleep(Math.random() * 5);
          continue;
        }
        for (const [error] of results) if (error) throw error;
        return JSON.parse(json) as Room;
      } finally {
        if (!executed) await this.redis.unwatch().catch(() => undefined);
      }
    }
    throw new Error(
      `Room ${code}: update conflict, gave up after ${MAX_UPDATE_ATTEMPTS} optimistic-lock attempts`,
    );
  }

  /**
   * Queued behind running `update` loops on the same connection: it must not interleave with a
   * WATCH..EXEC there, or the update would commit unwatched and resurrect the deleted room.
   */
  delete(code: string): Promise<void> {
    return runExclusive(this.redis, async () => {
      await this.redis.eval(DELETE_SCRIPT, 2, this.roomKey(code), this.deadlineKey, code);
    });
  }

  async dueRooms(now: number): Promise<string[]> {
    const due = await this.redis.eval(DUE_SCRIPT, 1, this.deadlineKey, String(now), this.roomPrefix);
    return due as string[];
  }

  async touch(code: string): Promise<void> {
    await this.redis.expire(this.roomKey(code), this.ttlSeconds);
  }
}
