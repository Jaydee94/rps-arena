# Local Testing with Docker Compose

How to run the real image with Redis, a second instance and the full test suite on your machine.

Needs Docker with Compose v2. `compose:smoke` and `compose:check` run a script on the host, so run `npm ci` in the
repo once. All ports are bound to `127.0.0.1` only.

```bash
npm run compose:up      # builds the image, starts Redis + app on http://127.0.0.1:8080
npm run compose:test    # whole test suite in one container, with Redis (Redis tests run)
npm run compose:smoke   # Redis + app + second instance (:8081), then a smoke test across both
npm run compose:check   # complete run including cleanup
npm run compose:down    # stop everything, remove volumes and orphaned containers
```

## Services

From [`compose.yaml`](../compose.yaml):

| Service | Profile | Purpose |
| --- | --- | --- |
| `redis` | (always) | Redis 7, host port `REDIS_PORT` (default 6380, deliberately not 6379) |
| `app` | (always) | The runtime image of the Dockerfile, read-only root file system, `/tmp` as tmpfs, port `APP_PORT` (8080) |
| `app2` | `replicas` | Second instance on the same Redis, port `APP2_PORT` (8081) |
| `tests` | `test` | Test suite from the `test` stage of the Dockerfile |

## Ports and names

- Change busy ports with `APP_PORT`, `APP2_PORT` and `REDIS_PORT`, for example `APP_PORT=18080 npm run compose:up`.
- No service has a fixed container name. Several checkouts can run side by side with different
  `COMPOSE_PROJECT_NAME` values and their own ports.
- The smoke script runs on the host and talks to `127.0.0.1:8080` and `127.0.0.1:8081`. With other ports, also set
  `APP_URL` and `APP2_URL` (only `compose:check` passes the ports to the script itself):

  ```bash
  export APP_PORT=18080 APP2_PORT=18081
  APP_URL=http://127.0.0.1:18080 APP2_URL=http://127.0.0.1:18081 npm run compose:smoke
  ```

## The commands in detail

- **`compose:test`:** the `tests` service is built from the `test` stage of the [`Dockerfile`](../Dockerfile).
  Code and dependencies are inside the image: **no bind mount**, nothing is written to the working directory. It
  rebuilds with `--build` on every call (the Docker cache applies). Set another command with `COMPOSE_TEST_CMD`,
  for example `COMPOSE_TEST_CMD="npm test -w @rps/server" npm run compose:test`.
- **`compose:smoke`:** starts `redis`, `app` and `app2` and runs
  [`scripts/compose-smoke.mjs`](../scripts/compose-smoke.mjs). The stack keeps running; clean up with
  `npm run compose:down`.
- **`compose:check`** ([`scripts/compose-check.sh`](../scripts/compose-check.sh)):
  - validates the Compose config (all profiles), builds and starts the app, checks `/healthz` and `/readyz`;
  - runs the tests against Redis and makes sure the Redis tests really ran (not skipped);
  - starts the second instance and runs the smoke test;
  - always cleans up afterwards.

  It appends `-- --reporter=verbose` to `COMPOSE_TEST_CMD`. An overridden command must still include the
  `@rps/server` tests, because the "Redis tests ran" check looks for them in the log. It uses the project
  `rps-arena-check` by default, so a running dev stack is not torn down (`COMPOSE_PROJECT_NAME` overrides this).
  It needs `docker`, `curl`, `node` and the dependencies from `npm ci` on the host.

## What the smoke test proves

Two clients connect to *different* instances on the same Redis and play a room. It checks that:

1. creating and joining works across instances;
2. A's secret pick does not reach B before B has picked;
3. the reveal reaches both instances through the Redis adapter;
4. reconnecting through the other instance with the session token restores the seat.
