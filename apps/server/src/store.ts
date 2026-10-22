import type { Room } from './room';

/**
 * Persistence boundary for rooms. Every method is async so a Redis implementation can
 * replace `MemoryRoomStore` without touching callers.
 */
export interface RoomStore {
  /** Stores a new room. Resolves false (and stores nothing) if the code is already taken. */
  create(room: Room): Promise<boolean>;
  get(code: string): Promise<Room | null>;
  /**
   * Atomic read-modify-write. `fn` receives the current room and returns the next one, or
   * `null` for "no change" (no version bump, the stored room is returned as is). On success
   * the store sets `version` to the previous version + 1. Resolves null for an unknown code.
   */
  update(code: string, fn: (room: Room) => Room | null): Promise<Room | null>;
  delete(code: string): Promise<void>;
  /** Codes of rooms with `deadline !== null && deadline <= now`. */
  dueRooms(now: number): Promise<string[]>;
  /** Refreshes the inactivity TTL of a room. */
  touch(code: string): Promise<void>;
}

/**
 * In-memory store for tests and single-process dev.
 *
 * Atomicity: `fn` is synchronous, and `update` reads, calls `fn` and writes without any
 * `await` in between. JavaScript runs that stretch to completion before any other callback
 * can start, so concurrent `update` calls (e.g. via `Promise.all`) are serialized and none
 * can overwrite another's result. If `fn` throws, nothing has been written yet and the
 * returned promise rejects without affecting later calls.
 *
 * Rooms are deep-copied in and out so callers cannot mutate stored state by reference.
 * Inactivity expiry is not enforced here; `touch` only records `touchedAt` bookkeeping.
 */
export class MemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, Room>();
  private readonly touchedAt = new Map<string, number>();

  constructor(private readonly clock: () => number = Date.now) {}

  create(room: Room): Promise<boolean> {
    if (this.rooms.has(room.code)) return Promise.resolve(false);
    this.rooms.set(room.code, structuredClone(room));
    this.touchedAt.set(room.code, this.clock());
    return Promise.resolve(true);
  }

  get(code: string): Promise<Room | null> {
    const room = this.rooms.get(code);
    return Promise.resolve(room ? structuredClone(room) : null);
  }

  update(code: string, fn: (room: Room) => Room | null): Promise<Room | null> {
    // No await between read and write: this whole body is one synchronous critical section.
    try {
      const current = this.rooms.get(code);
      if (!current) return Promise.resolve(null);
      const next = fn(structuredClone(current));
      if (next === null) return Promise.resolve(structuredClone(current));
      const stored: Room = { ...structuredClone(next), version: current.version + 1 };
      this.rooms.set(code, stored);
      this.touchedAt.set(code, this.clock());
      return Promise.resolve(structuredClone(stored));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  delete(code: string): Promise<void> {
    this.rooms.delete(code);
    this.touchedAt.delete(code);
    return Promise.resolve();
  }

  dueRooms(now: number): Promise<string[]> {
    const due: string[] = [];
    for (const [code, room] of this.rooms) {
      if (room.deadline !== null && room.deadline <= now) due.push(code);
    }
    return Promise.resolve(due);
  }

  touch(code: string): Promise<void> {
    if (this.rooms.has(code)) this.touchedAt.set(code, this.clock());
    return Promise.resolve();
  }

  /** Last create/update/touch time of a room (ms from the injected clock), or null. */
  lastTouchedAt(code: string): number | null {
    return this.touchedAt.get(code) ?? null;
  }
}
