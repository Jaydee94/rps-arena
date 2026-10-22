import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

const base = '/srv/app/apps/server/dist';

describe('loadConfig', () => {
  it('requires REDIS_URL unless the dev memory store is enabled explicitly', () => {
    expect(() => loadConfig({}, base)).toThrow(ConfigError);
    expect(() => loadConfig({}, base)).toThrow(/REDIS_URL/);
    expect(() => loadConfig({ RPS_DEV_MEMORY_STORE: 'true' }, base)).toThrow(ConfigError);
    expect(loadConfig({ RPS_DEV_MEMORY_STORE: '1' }, base)).toMatchObject({
      redisUrl: null,
      devMemoryStore: true,
    });
  });

  it('defaults PORT to 8080 and STATIC_DIR to ../web/dist of the server package', () => {
    expect(loadConfig({ REDIS_URL: 'redis://r:6379' }, base)).toEqual({
      port: 8080,
      redisUrl: 'redis://r:6379',
      devMemoryStore: false,
      staticDir: '/srv/app/apps/web/dist',
    });
  });

  it('reads PORT and STATIC_DIR and rejects a bad port', () => {
    const env = { REDIS_URL: 'redis://r', PORT: '9000', STATIC_DIR: './public' };
    const config = loadConfig(env, base);
    expect(config.port).toBe(9000);
    expect(config.staticDir).toBe(`${process.cwd()}/public`);
    for (const PORT of ['0', '70000', 'abc', '80.5', '']) {
      expect(() => loadConfig({ REDIS_URL: 'redis://r', PORT }, base)).toThrow(ConfigError);
    }
  });

  it('rejects a REDIS_URL that is not redis:// or rediss://', () => {
    expect(() => loadConfig({ REDIS_URL: 'http://x' }, base)).toThrow(ConfigError);
    expect(loadConfig({ REDIS_URL: 'rediss://x:6380' }, base).redisUrl).toBe('rediss://x:6380');
  });
});
