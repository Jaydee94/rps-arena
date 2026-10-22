import { afterEach, describe, expect, it } from 'vitest';
import { createMatch, pick } from '@rps/shared';
import type { Room } from './room';
import type { RoomStore } from './store';

export const makeRoom = (code: string, deadline: number | null = null): Room => ({
  code,
  version: 0,
  config: { mode: 'classic', bestOf: 3 },
  hostSeat: 'a0',
  players: {},
  match: null,
  deadline,
  phaseDeadline: null,
  botLevel: null,
  history: [],
  nextReady: [],
});

export const makePlayer = (seat: 'a0' | 'b0') => ({
  seat,
  nickname: seat,
  avatar: 'fox',
  token: `t-${seat}`,
  socketId: null,
  connected: true,
  disconnectedAt: null,
  isBot: false,
});

export interface StoreHandle {
  store: RoomStore;
  /** Releases resources (connections, test keys). Called after every test. */
  cleanup?: () => Promise<void>;
}

/**
 * Behaviour every `RoomStore` implementation must show. `makeStore` is called once per test and
 * must return an empty, isolated store.
 */
export function runStoreContract(name: string, makeStore: () => Promise<StoreHandle>): void {
  describe(`${name} (RoomStore contract)`, () => {
    const handles: StoreHandle[] = [];

    afterEach(async () => {
      for (const handle of handles.splice(0)) await handle.cleanup?.();
    });

    const fresh = async (): Promise<RoomStore> => {
      const handle = await makeStore();
      handles.push(handle);
      return handle.store;
    };

    it('creates a room and returns it with version 0', async () => {
      const store = await fresh();
      expect(await store.create(makeRoom('AAAA'))).toBe(true);
      expect((await store.get('AAAA'))?.version).toBe(0);
    });

    it('returns false when the code already exists and keeps the original', async () => {
      const store = await fresh();
      await store.create(makeRoom('AAAA', 5));
      expect(await store.create(makeRoom('AAAA', 9))).toBe(false);
      expect((await store.get('AAAA'))?.deadline).toBe(5);
    });

    it('returns null for an unknown code', async () => {
      const store = await fresh();
      expect(await store.get('NOPE')).toBeNull();
    });

    it('update applies fn and bumps version by exactly 1', async () => {
      const store = await fresh();
      await store.create(makeRoom('AAAA'));
      const updated = await store.update('AAAA', (r) => ({ ...r, deadline: 42 }));
      expect(updated?.version).toBe(1);
      expect(updated?.deadline).toBe(42);
      expect(await store.get('AAAA')).toEqual(updated);
    });

    it('update returns null for a missing code and does not call fn', async () => {
      const store = await fresh();
      let called = false;
      const result = await store.update('NOPE', (r) => {
        called = true;
        return r;
      });
      expect(result).toBeNull();
      expect(called).toBe(false);
    });

    it('update with fn returning null changes nothing and keeps the version', async () => {
      const store = await fresh();
      await store.create(makeRoom('AAAA'));
      const result = await store.update('AAAA', () => null);
      expect(result?.version).toBe(0);
      expect((await store.get('AAAA'))?.version).toBe(0);
    });

    it('two parallel updates are both applied', async () => {
      const store = await fresh();
      await store.create(makeRoom('AAAA'));
      await Promise.all([
        store.update('AAAA', (r) => ({ ...r, players: { ...r.players, a0: makePlayer('a0') } })),
        store.update('AAAA', (r) => ({ ...r, players: { ...r.players, b0: makePlayer('b0') } })),
      ]);
      const room = await store.get('AAAA');
      expect(room?.version).toBe(2);
      expect(Object.keys(room?.players ?? {}).sort()).toEqual(['a0', 'b0']);
    });

    it('50 parallel updates lose nothing', async () => {
      const store = await fresh();
      await store.create(makeRoom('AAAA', 0));
      await Promise.all(
        Array.from({ length: 50 }, () =>
          store.update('AAAA', (r) => ({ ...r, deadline: (r.deadline ?? 0) + 1 })),
        ),
      );
      const room = await store.get('AAAA');
      expect(room?.version).toBe(50);
      expect(room?.deadline).toBe(50);
    });

    it('a failing fn rejects without blocking later updates or changing the room', async () => {
      const store = await fresh();
      await store.create(makeRoom('AAAA'));
      const failing = store.update('AAAA', () => {
        throw new Error('boom');
      });
      const following = store.update('AAAA', (r) => ({ ...r, deadline: 7 }));
      await expect(failing).rejects.toThrow('boom');
      expect((await following)?.version).toBe(1);
      expect((await store.get('AAAA'))?.deadline).toBe(7);
    });

    it('delete removes the room and is idempotent', async () => {
      const store = await fresh();
      await store.create(makeRoom('AAAA'));
      await store.delete('AAAA');
      expect(await store.get('AAAA')).toBeNull();
      await expect(store.delete('AAAA')).resolves.toBeUndefined();
    });

    it('dueRooms returns exactly the rooms with deadline <= now', async () => {
      const store = await fresh();
      await store.create(makeRoom('PAST', 50));
      await store.create(makeRoom('EXACT', 100));
      await store.create(makeRoom('FUTURE', 101));
      await store.create(makeRoom('NONE', null));
      expect((await store.dueRooms(100)).sort()).toEqual(['EXACT', 'PAST']);
      expect((await store.dueRooms(49)).sort()).toEqual([]);
      expect((await store.dueRooms(101)).sort()).toEqual(['EXACT', 'FUTURE', 'PAST']);
    });

    it('dueRooms follows deadline changes made by update', async () => {
      const store = await fresh();
      await store.create(makeRoom('AAAA', 10));
      await store.update('AAAA', (r) => ({ ...r, deadline: null }));
      expect(await store.dueRooms(1000)).toEqual([]);
      await store.update('AAAA', (r) => ({ ...r, deadline: 20 }));
      expect(await store.dueRooms(19)).toEqual([]);
      expect(await store.dueRooms(20)).toEqual(['AAAA']);
    });

    it('delete removes the room from dueRooms as well', async () => {
      const store = await fresh();
      await store.create(makeRoom('AAAA', 10));
      await store.create(makeRoom('BBBB', 10));
      await store.delete('AAAA');
      expect(await store.dueRooms(100)).toEqual(['BBBB']);
    });

    it('touch keeps the room unchanged and ignores unknown codes', async () => {
      const store = await fresh();
      await store.create(makeRoom('AAAA', 10));
      await store.touch('AAAA');
      await store.touch('NOPE');
      expect(await store.get('AAAA')).toEqual(makeRoom('AAAA', 10));
      expect(await store.get('NOPE')).toBeNull();
      expect(await store.dueRooms(10)).toEqual(['AAAA']);
    });

    describe('isolation from storage', () => {
      it('does not let callers mutate stored state through get()', async () => {
        const store = await fresh();
        await store.create(makeRoom('AAAA'));
        const got = await store.get('AAAA');
        if (got) got.deadline = 99;
        expect((await store.get('AAAA'))?.deadline).toBeNull();
      });

      it('does not let callers mutate stored state through the room passed to create()', async () => {
        const store = await fresh();
        const room = makeRoom('AAAA');
        await store.create(room);
        room.deadline = 99;
        expect((await store.get('AAAA'))?.deadline).toBeNull();
      });

      it('does not let callers mutate stored state through update() results', async () => {
        const store = await fresh();
        await store.create(makeRoom('AAAA'));
        const updated = await store.update('AAAA', (r) => ({ ...r, deadline: 5 }));
        if (updated) updated.deadline = 99;
        expect((await store.get('AAAA'))?.deadline).toBe(5);
      });

      it('does not store mutations made to the fn argument when fn returns null', async () => {
        const store = await fresh();
        await store.create(makeRoom('AAAA'));
        const result = await store.update('AAAA', (r) => {
          r.deadline = 99;
          r.players.a0 = makePlayer('a0');
          return null;
        });
        if (result) result.deadline = 77;
        const stored = await store.get('AAAA');
        expect(stored?.deadline).toBeNull();
        expect(stored?.players).toEqual({});
        expect(stored?.version).toBe(0);
      });
    });

    it('a room survives a JSON round trip unchanged (no Map/Date/undefined in Room)', async () => {
      const store = await fresh();
      const match = pick(createMatch({ mode: 'classic', bestOf: 3 }), 'a0', 'rock');
      const room: Room = {
        ...makeRoom('AAAA', 1234),
        hostSeat: 'b0',
        players: { a0: makePlayer('a0'), b0: { ...makePlayer('b0'), isBot: true } },
        match,
        botLevel: 'hard',
      };
      await store.create(room);
      expect(await store.get('AAAA')).toEqual(room);
      const updated = await store.update('AAAA', (r) => ({ ...r }));
      expect(updated).toEqual({ ...room, version: 1 });
    });
  });
}
