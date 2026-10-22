import { createServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { ConfigError, loadConfig } from './config';
import type { ServerConfig } from './config';
import { createGateway } from './gateway';
import { createHttpHandler } from './http';
import { createIoServer } from './io';
import { installUnhandledRejectionGuard } from './process-guards';
import { RedisRoomStore } from './redis-store';
import type { RoomStore } from './store';
import { MemoryRoomStore } from './store';
import { startTicker } from './ticker';

const SHUTDOWN_TIMEOUT_MS = 10_000;

interface Backend {
  store: RoomStore;
  isReady: () => Promise<boolean>;
  /** Redis connections for the Socket.IO adapter (cross-replica broadcast), if any. */
  adapter: { pub: Redis; sub: Redis } | null;
  close: () => Promise<void>;
}

function log(message: string): void {
  console.log(`[rps-server] ${message}`);
}

/** Logs a recurring error only when it changes (Redis outages retry many times a second). */
function dedupedLogger(prefix: string): { error(message: string): void; ok(message: string): void } {
  let last: string | null = null;
  return {
    error(message) {
      if (message !== last) log(`${prefix}: ${message}`);
      last = message;
    },
    ok(message) {
      if (last !== null) log(`${prefix}: ${message}`);
      last = null;
    },
  };
}

function backend(config: ServerConfig): Backend {
  if (config.redisUrl === null) {
    console.warn(
      '[rps-server] WARNING: RPS_DEV_MEMORY_STORE=1 - rooms live in memory: single replica, ' +
        'not for production. Rooms are lost on restart.',
    );
    return { store: new MemoryRoomStore(), isReady: async () => true, adapter: null, close: async () => {} };
  }

  /*
   * The store client needs bounded commands:
   * - commandTimeout: a stalled Redis call must reject instead of blocking. RedisRoomStore runs
   *   all updates of one connection through a queue, so one hanging command would otherwise
   *   freeze every room on this replica.
   * - maxRetriesPerRequest: bounded retries while reconnecting, so callers get an error.
   * - lazyConnect: we connect explicitly below and log failures; ioredis keeps reconnecting in
   *   the background and /readyz reports 503 until PING succeeds.
   */
  const redis = new Redis(config.redisUrl, {
    commandTimeout: 5000,
    maxRetriesPerRequest: 2,
    lazyConnect: true,
  });
  /*
   * Pub/sub needs dedicated connections (a subscribed connection cannot run other commands), and
   * they get their OWN options instead of `redis.duplicate()`, which would copy the bounded ones
   * above. @socket.io/redis-adapter fires publish()/psubscribe() without catching the returned
   * promise, so a command that times out or runs out of retries during a Redis outage becomes an
   * unhandled rejection. Here commands wait for the reconnect (default backoff) instead of failing.
   */
  const pubSubOptions = { maxRetriesPerRequest: null, lazyConnect: true };
  const pub = new Redis(config.redisUrl, pubSubOptions);
  const sub = new Redis(config.redisUrl, pubSubOptions);
  for (const [name, client] of [
    ['store', redis],
    ['pub', pub],
    ['sub', sub],
  ] as const) {
    // Never log the URL: it may contain a password.
    const logger = dedupedLogger(`redis ${name}`);
    client.on('error', (error: Error) => logger.error(error.message));
    client.on('ready', () => logger.ok('connected'));
    client.connect().catch((error: Error) => logger.error(`connect failed: ${error.message}`));
  }

  return {
    store: new RedisRoomStore(redis),
    isReady: async () => (await redis.ping()) === 'PONG',
    adapter: { pub, sub },
    close: async () => {
      await Promise.allSettled([redis.quit(), pub.quit(), sub.quit()]);
    },
  };
}

function main(): void {
  installUnhandledRejectionGuard(process, log);
  let config: ServerConfig;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`[rps-server] configuration error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  const { store, isReady, adapter, close } = backend(config);
  const http = createServer(createHttpHandler({ staticDir: config.staticDir, isReady }));
  const io = createIoServer(http);
  if (adapter) io.adapter(createAdapter(adapter.pub, adapter.sub));
  const gateway = createGateway(io, store);
  const tickerLog = dedupedLogger('ticker');
  const ticker = startTicker(store, gateway.broadcast, 500, Date.now, {
    onDelete: gateway.dropRoom,
    onError: (error) => tickerLog.error(error instanceof Error ? error.message : String(error)),
  });

  http.listen(config.port, () => {
    log(`listening on :${config.port} (static: ${config.staticDir})`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal} received, shutting down`);
    setTimeout(() => {
      log('shutdown timed out, exiting');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    void (async () => {
      await ticker.stop();
      // Stops accepting connections, disconnects clients (they reconnect to another replica
      // and rejoin) and closes the HTTP server.
      await new Promise<void>((resolve) => void io.close(() => resolve()));
      await gateway.idle(); // let the disconnect bookkeeping reach the store
      await close();
      log('bye');
      process.exit(0);
    })();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
