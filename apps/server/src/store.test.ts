import { describe, expect, it } from 'vitest';
import { MemoryRoomStore } from './store';
import type { Room } from './room';

const makeRoom = (code: string, deadline: number | null = null): Room => ({
  code,
  version: 0,
  config: { mode: 'classic', bestOf: 3 },
  hostSeat: 'a0',
  players: {},
  match: null,
  deadline,
  botLevel: null,
});

describe('MemoryRoomStore', () => {
  it('creates a room and returns it with version 0', async () => {
    const store = new MemoryRoomStore();
    expect(await store.create(makeRoom('AAAA'))).toBe(true);
    expect((await store.get('AAAA'))?.version).toBe(0);
  });

  it('returns false when the code already exists and keeps the original', async () => {
    const store = new MemoryRoomStore();
    await store.create(makeRoom('AAAA', 5));
    expect(await store.create(makeRoom('AAAA', 9))).toBe(false);
    expect((await store.get('AAAA'))?.deadline).toBe(5);
  });

  it('returns null for an unknown code', async () => {
    const store = new MemoryRoomStore();
    expect(await store.get('NOPE')).toBeNull();
  });

  it('update applies fn and bumps version by exactly 1', async () => {
    const store = new MemoryRoomStore();
    await store.create(makeRoom('AAAA'));
    const updated = await store.update('AAAA', (r) => ({ ...r, deadline: 42 }));
    expect(updated?.version).toBe(1);
    expect(updated?.deadline).toBe(42);
    expect(await store.get('AAAA')).toEqual(updated);
  });

  it('update returns null for a missing code and does not call fn', async () => {
    const store = new MemoryRoomStore();
    let called = false;
    const result = await store.update('NOPE', (r) => {
      called = true;
      return r;
    });
    expect(result).toBeNull();
    expect(called).toBe(false);
  });

  it('update with fn returning null changes nothing and keeps the version', async () => {
    const store = new MemoryRoomStore();
    await store.create(makeRoom('AAAA'));
    const result = await store.update('AAAA', () => null);
    expect(result?.version).toBe(0);
    expect((await store.get('AAAA'))?.version).toBe(0);
  });

  it('two parallel updates are both applied', async () => {
    const store = new MemoryRoomStore();
    await store.create(makeRoom('AAAA'));
    await Promise.all([
      store.update('AAAA', (r) => ({ ...r, players: { ...r.players, a0: player('a0') } })),
      store.update('AAAA', (r) => ({ ...r, players: { ...r.players, b0: player('b0') } })),
    ]);
    const room = await store.get('AAAA');
    expect(room?.version).toBe(2);
    expect(Object.keys(room?.players ?? {}).sort()).toEqual(['a0', 'b0']);
  });

  it('many parallel updates lose nothing', async () => {
    const store = new MemoryRoomStore();
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
    const store = new MemoryRoomStore();
    await store.create(makeRoom('AAAA'));
    const failing = store.update('AAAA', () => {
      throw new Error('boom');
    });
    const following = store.update('AAAA', (r) => ({ ...r, deadline: 7 }));
    await expect(failing).rejects.toThrow('boom');
    expect((await following)?.version).toBe(1);
  });

  it('does not let callers mutate stored state through returned rooms', async () => {
    const store = new MemoryRoomStore();
    await store.create(makeRoom('AAAA'));
    const got = await store.get('AAAA');
    if (got) got.deadline = 99;
    expect((await store.get('AAAA'))?.deadline).toBeNull();
  });

  it('delete removes the room', async () => {
    const store = new MemoryRoomStore();
    await store.create(makeRoom('AAAA'));
    await store.delete('AAAA');
    expect(await store.get('AAAA')).toBeNull();
    await expect(store.delete('AAAA')).resolves.toBeUndefined();
  });

  it('dueRooms returns only rooms with deadline <= now', async () => {
    const store = new MemoryRoomStore();
    await store.create(makeRoom('PAST', 50));
    await store.create(makeRoom('EXACT', 100));
    await store.create(makeRoom('FUTURE', 101));
    await store.create(makeRoom('NONE', null));
    expect((await store.dueRooms(100)).sort()).toEqual(['EXACT', 'PAST']);
  });

  it('touch refreshes bookkeeping without changing the room and ignores unknown codes', async () => {
    let now = 10;
    const store = new MemoryRoomStore(() => now);
    await store.create(makeRoom('AAAA'));
    expect(store.lastTouchedAt('AAAA')).toBe(10);
    now = 20;
    await store.touch('AAAA');
    await store.touch('NOPE');
    expect(store.lastTouchedAt('AAAA')).toBe(20);
    expect(store.lastTouchedAt('NOPE')).toBeNull();
    expect((await store.get('AAAA'))?.version).toBe(0);
  });
});

function player(seat: 'a0' | 'b0') {
  return { seat, nickname: seat, avatar: 'fox', token: `t-${seat}`, connected: true, disconnectedAt: null, isBot: false };
}
