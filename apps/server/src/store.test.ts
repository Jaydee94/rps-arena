import { describe, expect, it } from 'vitest';
import { MemoryRoomStore } from './store';
import { makeRoom, runStoreContract } from './store.contract';

runStoreContract('MemoryRoomStore', () => Promise.resolve({ store: new MemoryRoomStore() }));

// Behaviour specific to MemoryRoomStore (the shared behaviour lives in store.contract.ts).
describe('MemoryRoomStore specifics', () => {
  it('touch refreshes the injected-clock bookkeeping and ignores unknown codes', async () => {
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

  it('update refreshes lastTouchedAt, delete clears it', async () => {
    let now = 10;
    const store = new MemoryRoomStore(() => now);
    await store.create(makeRoom('AAAA'));
    now = 30;
    await store.update('AAAA', () => null);
    expect(store.lastTouchedAt('AAAA')).toBe(10);
    await store.update('AAAA', (r) => ({ ...r, deadline: 1 }));
    expect(store.lastTouchedAt('AAAA')).toBe(30);
    await store.delete('AAAA');
    expect(store.lastTouchedAt('AAAA')).toBeNull();
  });

  it('serializes through JSON like Redis does (undefined fields are dropped)', async () => {
    const store = new MemoryRoomStore();
    await store.create(makeRoom('AAAA'));
    await store.update('AAAA', (r) => ({ ...r, deadline: undefined as unknown as null }));
    // undefined is dropped by JSON; the read-back room no longer carries the key.
    const stored = await store.get('AAAA');
    expect(stored && 'deadline' in stored).toBe(false);
  });
});
