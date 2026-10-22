import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));
const PASSWORD = 's3cretpw';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A port nothing listens on (bound once and released again). */
async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

interface Running {
  child: ChildProcess;
  output: () => string;
  exited: () => boolean;
}

const children: ChildProcess[] = [];

/** Starts the real `src/main.ts` entry point in its own process. */
function start(env: Record<string, string>): Running {
  let output = '';
  let exited = false;
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
    cwd: SERVER_DIR,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.on('exit', () => (exited = true));
  return { child, output: () => output, exited: () => exited };
}

async function waitForHealthy(base: string, running: Running): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (running.exited()) throw new Error(`server exited early:\n${running.output()}`);
    try {
      if ((await fetch(`${base}/healthz`)).status === 200) return;
    } catch {
      // not listening yet
    }
    await sleep(100);
  }
  throw new Error(`server did not become healthy:\n${running.output()}`);
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await new Promise((resolve) => child.once('exit', resolve));
    }
  }
});

describe('server process with an unreachable Redis', () => {
  it('stays alive, answers /healthz 200 and /readyz 503, and never logs the password', async () => {
    const port = await unusedPort();
    const redisPort = await unusedPort();
    const running = start({
      PORT: String(port),
      REDIS_URL: `redis://:${PASSWORD}@127.0.0.1:${redisPort}`,
    });
    const base = `http://127.0.0.1:${port}`;

    await waitForHealthy(base, running);
    // The bounded retries of the old pub/sub clients ran out within ~150 ms and killed the process.
    await sleep(2500);

    expect(running.exited(), running.output()).toBe(false);
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/readyz`)).status).toBe(503);
    expect(running.output()).not.toContain(PASSWORD);
  }, 40_000);
});
