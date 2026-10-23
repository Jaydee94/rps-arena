import { isAbandoned, tick } from './engine';
import type { Room } from './room';
import type { RoomStore } from './store';

export interface TickerOptions {
  /**
   * Called after the ticker deleted an abandoned room, with the room as it was last stored (so
   * the caller can detach the sockets of everyone it held, e.g. tournament personal channels).
   */
  onDelete?: (code: string, room: Room) => void;
  /** Called for a failed room tick (e.g. Redis timeout); the next run retries. */
  onError?: (error: unknown, code: string) => void;
  rng?: () => number;
}

export interface Ticker {
  /** One pass over all due rooms. Never rejects. */
  runOnce(): Promise<void>;
  /** Stops the interval and waits for a running pass. */
  stop(): Promise<void>;
}

/**
 * Drives every room deadline. All state lives in `Room.deadline` in the store, never in process
 * timers, so any replica can run this: `update` is atomic and `tick` is a no-op once another
 * replica has handled the deadline (it is then in the future again), so a racing replica
 * changes nothing and broadcasts nothing.
 */
export function startTicker(
  store: RoomStore,
  onChange: (room: Room) => void,
  intervalMs = 500,
  clock: () => number = Date.now,
  options: TickerOptions = {},
): Ticker {
  const onError =
    options.onError ??
    ((error: unknown, code: string) => console.error(`ticker: room ${code} failed`, error));

  async function tickRoom(code: string, now: number): Promise<void> {
    let changed = false;
    let abandoned: Room | null = null;
    const room = await store.update(code, (current) => {
      if (current.deadline === null || current.deadline > now) return null;
      const next = tick(current, now, options.rng);
      if (isAbandoned(next, now)) {
        abandoned = current;
        return null;
      }
      changed = next !== current;
      return changed ? next : null;
    });
    if (room === null) return; // vanished meanwhile: nothing to do
    if (abandoned) {
      // Nobody can come back (joins and rejoins refuse an abandoned room), so delete it.
      await store.delete(code);
      options.onDelete?.(code, abandoned);
    } else if (changed) {
      onChange(room);
    }
  }

  async function runOnce(): Promise<void> {
    const now = clock();
    let codes: string[];
    try {
      codes = await store.dueRooms(now);
    } catch (error) {
      onError(error, '*');
      return;
    }
    for (const code of codes) {
      try {
        await tickRoom(code, now);
      } catch (error) {
        onError(error, code);
      }
    }
  }

  let running: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (running) return; // never overlap passes
    running = runOnce().finally(() => {
      running = null;
    });
  }, intervalMs);
  timer.unref();

  return {
    runOnce,
    async stop() {
      clearInterval(timer);
      await running;
    },
  };
}
