import { vi } from 'vitest';
import { writable } from 'svelte/store';
import type { RoomView } from '@rps/shared';
import type { LastError } from '../lib/connection';

/**
 * Drop-in replacement for lib/connection.ts in component tests:
 *   vi.mock('../lib/connection', async () => (await import('../test/connection-mock')).connectionMock);
 * Stores are writable so tests can feed state; actions are spies.
 */
export const roomStore = writable<RoomView | null>(null);
export const lastErrorStore = writable<LastError | null>(null);

export const actions = {
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  startMatch: vi.fn(),
  moveSeat: vi.fn(),
  announce: vi.fn(),
  pick: vi.fn(),
  next: vi.fn(),
  rematch: vi.fn(),
  forgetSession: vi.fn(),
  clearError: vi.fn(() => lastErrorStore.set(null)),
  connect: vi.fn(),
};

export const connectionMock = {
  ...actions,
  room: roomStore,
  lastError: lastErrorStore,
  status: writable('connected'),
};

export function resetConnectionMock(): void {
  roomStore.set(null);
  lastErrorStore.set(null);
  for (const spy of Object.values(actions)) spy.mockClear();
}
