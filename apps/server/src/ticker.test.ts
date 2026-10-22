import { describe, expect, it } from 'vitest';
import { PICK_TIMEOUT_MS, REVEAL_MS } from '@rps/shared';
import { createRoom, joinRoom, startMatch } from './engine';
import { MemoryRoomStore } from './store';
import { startTicker } from './ticker';
import type { Room } from './room';

describe('ticker', () => {
  it('(e) an idle match ends after 3 rounds and is never written again', async () => {
    const clock = { now: 1_000_000 };
    const store = new MemoryRoomStore(() => clock.now);
    let room = createRoom({ config: { mode: 'classic', bestOf: 3 }, nickname: 'A', avatar: 'fox', code: 'IDLE1' }, clock.now);
    room = startMatch(joinRoom(room, 'B', 'owl', clock.now).room, 'a0', clock.now);
    await store.create(room);
    const changes: Room[] = [];
    const ticker = startTicker(store, (r) => changes.push(r), 60_000, () => clock.now);
    for (let i = 0; i < 6; i++) {
      clock.now += PICK_TIMEOUT_MS + REVEAL_MS;
      await ticker.runOnce();
    }
    const finished = await store.get('IDLE1');
    expect(finished?.match).toMatchObject({ phase: 'finished', winner: null });
    expect(finished?.deadline).toBeNull();
    const version = finished!.version;
    for (let i = 0; i < 5; i++) {
      clock.now += 10 * (PICK_TIMEOUT_MS + REVEAL_MS);
      await ticker.runOnce();
    }
    expect((await store.get('IDLE1'))?.version).toBe(version);
    expect(await store.dueRooms(Number.MAX_SAFE_INTEGER)).toEqual([]);
    expect(changes.at(-1)?.version).toBe(version);
    await ticker.stop();
  });
});
