import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpHandler } from './http';

let root: string;
let server: Server;
let url: string;
let ready = true;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rps-static-'));
  const dist = join(root, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>RPS</title>');
  writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');
  writeFileSync(join(root, 'secret.txt'), 'top secret');
  server = createServer(createHttpHandler({ staticDir: dist, isReady: async () => ready }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
});

describe('http handler', () => {
  it('/healthz is always 200 ok', async () => {
    const res = await fetch(`${url}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('/readyz follows the readiness probe', async () => {
    expect((await fetch(`${url}/readyz`)).status).toBe(200);
    ready = false;
    expect((await fetch(`${url}/readyz`)).status).toBe(503);
    ready = true;
  });

  it('serves files with type and cache headers, plus security headers', async () => {
    const res = await fetch(`${url}/assets/app-abc123.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/javascript/);
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toContain("media-src 'self'");
    expect(csp).toMatch(/connect-src 'self' ws:\/\/127\.0\.0\.1:\d+ wss:\/\/127\.0\.0\.1:\d+/);
    expect(csp).not.toContain('*');
  });

  it('falls back to index.html for app routes, but 404s missing files', async () => {
    const res = await fetch(`${url}/r/AB3DE`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>RPS</title>');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect((await fetch(`${url}/assets/missing.js`)).status).toBe(404);
  });

  it('never serves files outside the static dir', async () => {
    for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/..%2f..%2fsecret.txt']) {
      const res = await fetch(`${url}${path}`);
      expect(await res.text()).not.toContain('top secret');
    }
    expect((await fetch(`${url}/%00`)).status).toBe(400);
  });

  it('only allows GET and HEAD', async () => {
    expect((await fetch(`${url}/`, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${url}/`, { method: 'HEAD' })).status).toBe(200);
  });
});
