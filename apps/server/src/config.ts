import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface ServerConfig {
  port: number;
  /** null only with the explicit dev memory store. */
  redisUrl: string | null;
  /** `RPS_DEV_MEMORY_STORE=1`: in-memory rooms, single replica, never for production. */
  devMemoryStore: boolean;
  /** Built web app (`apps/web/dist`). */
  staticDir: string;
}

/** Directory of the running module: `apps/server/dist` (bundle) or `apps/server/src` (tsx). */
const moduleDir = dirname(fileURLToPath(import.meta.url));

/**
 * Parses the environment. `baseDir` is the directory of the running server module; the default
 * static dir is `../web/dist` relative to the server package, i.e. `<baseDir>/../../web/dist`.
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  baseDir: string = moduleDir,
): ServerConfig {
  const rawPort = env.PORT ?? '8080';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || port < 1 || port > 65535) {
    throw new ConfigError(`PORT must be an integer between 1 and 65535, got "${rawPort}"`);
  }

  const devMemoryStore = env.RPS_DEV_MEMORY_STORE === '1';
  const redisUrl = env.REDIS_URL?.trim() || null;
  if (redisUrl === null && !devMemoryStore) {
    throw new ConfigError(
      'REDIS_URL is not set. Set REDIS_URL=redis://host:6379, or RPS_DEV_MEMORY_STORE=1 for a ' +
        'single-replica in-memory store (local development and tests only).',
    );
  }
  if (redisUrl !== null && !/^rediss?:\/\//.test(redisUrl)) {
    throw new ConfigError('REDIS_URL must start with redis:// or rediss://');
  }

  const staticDir = env.STATIC_DIR
    ? resolve(env.STATIC_DIR)
    : resolve(baseDir, '..', '..', 'web', 'dist');
  return { port, redisUrl, devMemoryStore: redisUrl === null, staticDir };
}
