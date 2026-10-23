# Operations and Privacy

What runs in production: environment variables, Redis, security headers, and how the camera keeps video on the
device.

## Environment variables

Read in [`apps/server/src/config.ts`](../apps/server/src/config.ts):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | HTTP and WebSocket port (integer 1 to 65535) |
| `REDIS_URL` | (none) | Required in production. Must start with `redis://` or `rediss://`. The URL is never logged. |
| `RPS_DEV_MEMORY_STORE` | (off) | `1` = rooms in memory, for development and tests only (see [development.md](development.md#dev-server)) |
| `STATIC_DIR` | `apps/web/dist` relative to the server | Directory of the built web app. The image puts it in the right place, so it is not needed there. |

The image sets `NODE_ENV=production` and `PORT=8080`. On `SIGTERM`, the server shuts down gracefully (clients
reconnect to another pod).

## Redis

- Redis is required (except in dev mode) and is the only state.
- Each room is one key with an inactivity TTL of 30 minutes (`ROOM_TTL_S`).
- No game histories, accounts or leaderboards are stored. The bot remembers at most the last 50 rounds of a room
  (also across rematches), so a room does not grow with the length of play.

The bundled Redis has a memory limit: `--maxmemory 100mb` with the policy `volatile-lru` (`redis.maxmemory`,
`redis.maxmemoryPolicy`; the container limit of 128Mi is above it).

- At the limit, Redis evicts the least recently used *rooms* (only these have a TTL) instead of being killed by
  the kernel and losing all rooms.
- The small deadline index `rps:deadlines` has no TTL and is never evicted.
- When you raise `redis.maxmemory`, also raise `redis.resources.limits.memory`.
- The same setting (`maxmemory` plus `volatile-lru`) is recommended for an external Redis; the chart cannot set it
  there.

## Security headers

- A strict Content-Security-Policy: `default-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`,
  `worker-src 'self' blob:` (for MediaPipe).
- `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` and
  `Permissions-Policy: camera=(self), microphone=(), geolocation=()`.
- Hashed assets under `/assets/` are cached long-term; everything else must be revalidated.
- Messages are limited to 10 kB (`MAX_MESSAGE_BYTES`). Each connection has a rate limit (token bucket: 20 events
  per second, bursts up to 40).

## Camera control

- **Everything in the browser:** hand gestures are recognized with MediaPipe (`@mediapipe/tasks-vision`) in the
  browser. **No video image** leaves the device; only the confirmed pick (rock, paper or scissors) is sent. The
  library, WASM files and model come from your own server. There is no request to a CDN or to Google.
- **Only on request:** the library and model load only when the camera is switched on. The camera opens only after
  the model has loaded. Without a camera, or with permission denied, the app shows a message and clicking still
  works.
- **Scope:** experimental, and only for games with the Classic set (Classic and 2v2). It knows `Closed_Fist`
  (rock), `Open_Palm` (paper) and `Victory` (scissors). A gesture counts only after it is held for 900 ms without a
  break.
- **Pinned to 0.10.x:** `@mediapipe/tasks-vision` is pinned to exactly `0.10.35` in `apps/web/package.json`.
  Versions from 1.0 on ship telemetry (a POST to a Google logging endpoint; the logger was found in the 1.1.1
  bundle). 0.10.x contains no external URLs. Do not raise it to 1.x without checking this again. A rule in
  `renovate.json` keeps Renovate below 1.0 (`allowedVersions: "<1"`).
- **Model download at build time:** `scripts/fetch-model.mjs` runs as `predev`/`prebuild` of the web app (so also
  in the Docker build). It downloads `gesture_recognizer.task` from `storage.googleapis.com`, checks the SHA-256
  checksum and aborts on a mismatch. So the build needs **network access**; runtime does not. A verified model is
  not downloaded again. The script also copies the WASM files from the npm package to
  `apps/web/public/mediapipe-wasm/`.
- **`.wasm`:** the server serves `.wasm` as `application/wasm`. If another server serves the static files, it must
  do the same and allow `wasm-unsafe-eval` in the CSP.
