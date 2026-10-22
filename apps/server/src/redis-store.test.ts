import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_UPDATE_ATTEMPTS, RedisRoomStore } from './redis-store';
import { makePlayer, makeRoom, runStoreContract } from './store.contract';

const REDIS_URL = process.env.REDIS_URL;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!REDIS_URL)('RedisRoomStore', () => {
  const runId = randomUUID().slice(0, 8);
  let counter = 0;
  const openConnections: Redis[] = [];
  const prefixes = new Set<string>();

  const connect = (): Redis => {
    const redis = new Redis(REDIS_URL ?? '');
    openConnections.push(redis);
    return redis;
  };
  const nextPrefix = (): string => {
    const prefix = `rps-test:${runId}:${counter++}:`;
    prefixes.add(prefix);
    return prefix;
  };

  /** Deletes only the keys this test run created, then closes every connection it opened. */
  const flushOwnKeys = async (): Promise<void> => {
    const [admin] = openConnections.length > 0 ? openConnections : [connect()];
    if (admin) {
      for (const prefix of prefixes) {
        const keys = await admin.keys(`${prefix}*`);
        if (keys.length > 0) await admin.del(...keys);
      }
    }
    prefixes.clear();
    await Promise.all(openConnections.splice(0).map((redis) => redis.quit()));
  };

  runStoreContract('RedisRoomStore', () =>
    Promise.resolve({
      store: new RedisRoomStore(connect(), { keyPrefix: nextPrefix() }),
      cleanup: flushOwnKeys,
    }),
  );

  describe('Redis specifics', () => {
    afterEach(flushOwnKeys);

    it('uses the documented keys and defaults (rps:room:<code>, rps:deadlines)', async () => {
      const redis = connect();
      const prefix = nextPrefix();
      const store = new RedisRoomStore(redis, { keyPrefix: prefix });
      await store.create(makeRoom('AAAA', 123));
      expect(JSON.parse((await redis.get(`${prefix}room:AAAA`)) ?? 'null')).toEqual(
        makeRoom('AAAA', 123),
      );
      expect(await redis.zscore(`${prefix}deadlines`, 'AAAA')).toBe('123');
      await store.update('AAAA', (r) => ({ ...r, deadline: null }));
      expect(await redis.zscore(`${prefix}deadlines`, 'AAAA')).toBeNull();
    });

    it('expires an idle room after the TTL and drops it from dueRooms too', async () => {
      const store = new RedisRoomStore(connect(), { keyPrefix: nextPrefix(), ttlSeconds: 1 });
      await store.create(makeRoom('AAAA', 10));
      expect(await store.dueRooms(100)).toEqual(['AAAA']);
      await sleep(1500);
      expect(await store.get('AAAA')).toBeNull();
      expect(await store.dueRooms(100)).toEqual([]);
    });

    it('create, update and touch (re)set the TTL; a failed update does not', async () => {
      const redis = connect();
      const prefix = nextPrefix();
      const store = new RedisRoomStore(redis, { keyPrefix: prefix, ttlSeconds: 100 });
      const key = `${prefix}room:AAAA`;
      await store.create(makeRoom('AAAA'));
      expect(await redis.ttl(key)).toBeGreaterThan(90);

      await redis.expire(key, 5);
      await store.touch('AAAA');
      expect(await redis.ttl(key)).toBeGreaterThan(90);

      await redis.expire(key, 5);
      await store.update('AAAA', (r) => ({ ...r, deadline: 1 }));
      expect(await redis.ttl(key)).toBeGreaterThan(90);

      await redis.expire(key, 5);
      await store.update('AAAA', () => null);
      expect(await redis.ttl(key)).toBeLessThanOrEqual(5);
    });

    it('touch does not resurrect a missing room', async () => {
      const redis = connect();
      const prefix = nextPrefix();
      const store = new RedisRoomStore(redis, { keyPrefix: prefix });
      await store.touch('NOPE');
      expect(await redis.exists(`${prefix}room:NOPE`)).toBe(0);
    });

    it('20 parallel updates over two store instances and connections give version 20', async () => {
      const prefix = nextPrefix();
      const first = new RedisRoomStore(connect(), { keyPrefix: prefix });
      const second = new RedisRoomStore(connect(), { keyPrefix: prefix });
      await first.create(makeRoom('AAAA', 0));
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          (i % 2 === 0 ? first : second).update('AAAA', (r) => ({
            ...r,
            deadline: (r.deadline ?? 0) + 1,
          })),
        ),
      );
      const room = await first.get('AAAA');
      expect(room?.version).toBe(20);
      expect(room?.deadline).toBe(20);
    });

    it('parallel updates to different rooms on one connection do not corrupt each other', async () => {
      const store = new RedisRoomStore(connect(), { keyPrefix: nextPrefix() });
      const codes = ['AAAA', 'BBBB', 'CCCC'];
      for (const code of codes) await store.create(makeRoom(code, 0));
      await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          store.update(codes[i % 3] ?? 'AAAA', (r) => ({ ...r, deadline: (r.deadline ?? 0) + 1 })),
        ),
      );
      for (const code of codes) {
        const room = await store.get(code);
        expect(room?.version).toBe(10);
        expect(room?.deadline).toBe(10);
      }
    });

    it('a throwing fn leaves no WATCH behind on the connection', async () => {
      const redis = connect();
      const prefix = nextPrefix();
      const store = new RedisRoomStore(redis, { keyPrefix: prefix });
      await store.create(makeRoom('AAAA'));
      await expect(
        store.update('AAAA', () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      // If the watch had survived, this foreign write would make the next EXEC on `redis` fail.
      await connect().set(`${prefix}room:AAAA`, JSON.stringify(makeRoom('AAAA')));
      await redis.multi().set(`${prefix}other`, '1').exec();
      expect(await redis.get(`${prefix}other`)).toBe('1');
    });

    it('gives up with a clear error after MAX_UPDATE_ATTEMPTS lost optimistic locks', async () => {
      const redis = connect();
      const rival = connect();
      const prefix = nextPrefix();
      const store = new RedisRoomStore(redis, { keyPrefix: prefix });
      await store.create(makeRoom('AAAA'));
      // Between the store's read and its EXEC, a rival connection always writes the room.
      const realGet = redis.get.bind(redis) as (key: string) => Promise<string | null>;
      Object.assign(redis, {
        get: async (key: string) => {
          const value = await realGet(key);
          await rival.set(key, value ?? '');
          return value;
        },
      });
      let calls = 0;
      await expect(
        store.update('AAAA', (r) => {
          calls++;
          return { ...r, deadline: 1 };
        }),
      ).rejects.toThrow(/conflict/i);
      expect(calls).toBe(MAX_UPDATE_ATTEMPTS);
      expect(MAX_UPDATE_ATTEMPTS).toBeGreaterThanOrEqual(10);
    });

    describe('delete racing an update on one connection', () => {
      /**
       * Makes the first `redis.get` of the connection (the update's read, issued while its WATCH
       * is held) pause until `release()` is called. `reached` resolves once the update is parked
       * there. With `dirtyWith`, a foreign connection also writes the watched key at that point.
       */
      const parkFirstGet = (redis: Redis, dirtyWith?: { rival: Redis; json: string }) => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        let reached!: () => void;
        const parked = new Promise<void>((resolve) => (reached = resolve));
        const realGet = redis.get.bind(redis) as (key: string) => Promise<string | null>;
        let first = true;
        Object.assign(redis, {
          get: async (key: string) => {
            const value = await realGet(key);
            if (!first) return value;
            first = false;
            if (dirtyWith) await dirtyWith.rival.set(key, dirtyWith.json);
            reached();
            await gate;
            return value;
          },
        });
        return { release, parked };
      };

      const expectGone = async (store: RedisRoomStore, redis: Redis, prefix: string) => {
        expect(await store.get('AAAA')).toBeNull();
        expect(await redis.exists(`${prefix}room:AAAA`)).toBe(0);
        expect(await redis.zscore(`${prefix}deadlines`, 'AAAA')).toBeNull();
      };

      it('a delete issued while an update holds its WATCH stays deleted', async () => {
        const redis = connect();
        const prefix = nextPrefix();
        const store = new RedisRoomStore(redis, { keyPrefix: prefix });
        await store.create(makeRoom('AAAA', 10));
        const { release, parked } = parkFirstGet(redis);

        const updating = store.update('AAAA', (r) => ({ ...r, deadline: 20 }));
        await parked;
        const deleting = store.delete('AAAA');
        await sleep(50); // an unserialized delete would run (and clear the watch) right now
        release();
        await Promise.all([updating, deleting]);

        await expectGone(store, redis, prefix);
      });

      it('a delete still deletes when a foreign write dirties the key the update watches', async () => {
        const redis = connect();
        const prefix = nextPrefix();
        const store = new RedisRoomStore(redis, { keyPrefix: prefix });
        await store.create(makeRoom('AAAA', 10));
        const { release, parked } = parkFirstGet(redis, {
          rival: connect(),
          json: JSON.stringify(makeRoom('AAAA', 10)),
        });

        const updating = store.update('AAAA', (r) => ({ ...r, deadline: 20 }));
        await parked;
        const deleting = store.delete('AAAA');
        await sleep(50);
        release();
        await Promise.all([updating, deleting]);

        await expectGone(store, redis, prefix);
      });
    });

    it('dueRooms removes ghost entries whose room key is gone', async () => {
      const redis = connect();
      const prefix = nextPrefix();
      const store = new RedisRoomStore(redis, { keyPrefix: prefix });
      await store.create(makeRoom('REAL', 10));
      await redis.zadd(`${prefix}deadlines`, 5, 'GHOST');
      expect(await store.dueRooms(100)).toEqual(['REAL']);
      expect(await redis.zscore(`${prefix}deadlines`, 'GHOST')).toBeNull();
      expect(await redis.zscore(`${prefix}deadlines`, 'REAL')).toBe('10');
    });

    it('delete removes both the room key and its deadline entry', async () => {
      const redis = connect();
      const prefix = nextPrefix();
      const store = new RedisRoomStore(redis, { keyPrefix: prefix });
      await store.create(makeRoom('AAAA', 10));
      await store.delete('AAAA');
      expect(await redis.exists(`${prefix}room:AAAA`)).toBe(0);
      expect(await redis.zscore(`${prefix}deadlines`, 'AAAA')).toBeNull();
    });

    it('create is atomic: a duplicate create does not touch the stored deadline entry', async () => {
      const redis = connect();
      const prefix = nextPrefix();
      const store = new RedisRoomStore(redis, { keyPrefix: prefix });
      await store.create({ ...makeRoom('AAAA', 10), players: { a0: makePlayer('a0') } });
      expect(await store.create(makeRoom('AAAA', 99))).toBe(false);
      expect(await redis.zscore(`${prefix}deadlines`, 'AAAA')).toBe('10');
    });
  });
});
