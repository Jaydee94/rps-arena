<p align="center"><img src="docs/images/logo.svg" alt="RPS Arena logo" width="720"></p>

<p align="center"><strong>Comic-panel rock-paper-scissors for the browser: no account, no install, just a room code.</strong></p>

<p align="center">
  <a href="https://github.com/Jaydee94/rps-arena/actions/workflows/release.yml"><img src="https://github.com/Jaydee94/rps-arena/actions/workflows/release.yml/badge.svg" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Jaydee94/rps-arena" alt="MIT license"></a>
</p>

# RPS Arena

Rock-paper-scissors in a comic look for the browser: no account, no installation, just a room code or a link.
The server settles every round and keeps each side's pick secret until everyone has picked. The project runs on
Kubernetes (Helm, Redis) and is released automatically on every release-worthy merge to `main`
(semantic-release, image and chart on GHCR).

## Contents

1. [Overview and Features](#overview-and-features)
2. [Game Modes in Detail](#game-modes-in-detail)
3. [Architecture](#architecture)
4. [Local Development](#local-development)
5. [Local Testing with Docker Compose](#local-testing-with-docker-compose)
6. [Deployment with Helm](#deployment-with-helm)
7. [Operations and Privacy](#operations-and-privacy)
8. [Release and CI](#release-and-ci)
9. [One-Time Manual Steps After the First Push](#one-time-manual-steps-after-the-first-push)
10. [Licenses and Assets](#licenses-and-assets)
11. [Decisions](#decisions)

## Overview and Features

- **Comic-panel look:** Every screen is built like a comic page out of panels, with sticker-style buttons,
  animations and a stronger impact when the result is revealed.
- **Reveal countdown:** Before each result is revealed, a short "Rock, Paper, Scissors" countdown plays (three
  beats, about 1.26 s; in German "Schnick, Schnack, Schnuck"). It is skipped entirely for users with
  `prefers-reduced-motion: reduce`, who get the static result straight away.
- **Modes:** Classic, Lizard-Spock, Wheel 7 / 9 / 15, Bluff and 2v2 Team.
- **Rule hints:** Hovering or focusing a gesture tile shows what it beats. A collapsible "Rules" panel in the lobby
  and on the pick screen lists the same for the whole mode (the way to see it on touch screens).
- **Rooms:** Whoever creates a room gets a 5-character code and a shareable link. The others join with the code
  or the link. Nickname and comic avatar (32 to choose from) are picked when joining; nothing is stored
  permanently.
- **Spectators:** Anyone who joins a room whose match is already running (or finished) watches it live as a
  spectator, up to `MAX_SPECTATORS` (16) per room; further joiners get "room full". Picks stay secret until the
  reveal: spectators see who has locked in, never what, and no session tokens. Spectators do not take a seat, do
  not count as players and never influence the match timing, the deadlines or the idle abort. A reload brings a
  spectator back to the same room (session token). While a lobby is still waiting, a full room stays full.
- **Bot:** Solo play against a bot on three levels (easy, medium, hard), in all duel modes (not 2v2).
- **Match format:** Best of 3, 5 or 7, chosen by the room creator.
- **Reveal time:** The round result stays on screen for 5.5 s (`REVEAL_MS`), including the countdown. If all
  connected players click "next", the next round starts sooner.
- **Languages:** German and English, switchable. The default follows the browser.
- **Audio:** Comic sound effects and an optional music loop, each can be muted separately. Sound only starts
  after a user action.
- **Camera control (experimental):** Rock, paper and scissors by hand gesture, recognition runs entirely in the
  browser (MediaPipe). See [Operations and Privacy](#operations-and-privacy).
- **Reconnecting:** Anyone who drops briefly (reload, network change) returns to their seat in the same browser
  tab (session token in `sessionStorage`).
- Usable with mouse, touch and keyboard, also at phone width. `prefers-reduced-motion` is respected: all
  animations and the countdown are switched off.

## Game Modes in Detail

All modes are server-authoritative: The client only sends its pick, and the server reveals once everyone has
picked (or time has run out) and settles the round.

| Mode (`ModeId`) | Gesture set | Rule |
| --- | --- | --- |
| Classic (`classic`) | `classic` (3) | Rock beats scissors, scissors beats paper, paper beats rock. |
| Lizard-Spock (`lizard-spock`) | `lizard-spock` (5) | The 5-gesture variant with the standard rules. |
| Wheel 7 (`wheel7`) | `wheel7` (7) | Gestures on a circle, see below. |
| Wheel 9 (`wheel9`) | `wheel9` (9) | Like Wheel 7, with 9 gestures. |
| Wheel 15 (`wheel15`) | `wheel15` (15) | Like Wheel 7, with 15 gestures. |
| Bluff (`bluff`) | `lizard-spock` (5) | Classic duel preceded by a non-binding announcement. |
| 2v2 Team (`team2v2`) | `classic` (3) | Four players, two simultaneous duels per round. |

### Gesture Sets

The gestures are listed in circle order in `packages/shared/src/gestures.ts`. Each gesture beats the next (n-1)/2
gestures clockwise and loses to the rest.

| Set | Gestures (circle order) |
| --- | --- |
| `classic` | rock, scissors, paper |
| `lizard-spock` | rock, scissors, lizard, paper, spock |
| `wheel7` | rock, scissors, human, wolf, air, dragon, lightning |
| `wheel9` | rock, scissors, snake, tree, sponge, paper, water, devil, lightning |
| `wheel15` | rock, fire, scissors, snake, human, tree, wolf, sponge, paper, air, water, dragon, devil, lightning, gun |

`wheel7` and `wheel9` are evenly spaced subsets of `wheel15` (in the same order), so icons and translations can
be reused.

### Bluff

Each round has two phases. First comes an **announcement phase** (8 seconds): Each side can announce an emote (a
gesture of the Lizard-Spock set, shown as a speech bubble) or skip it. The announcement is immediately visible
to the other side in the room and is **non-binding**, so lying is allowed. There is no free text. After that,
both sides pick secretly from the Lizard-Spock set as usual. The bot announces at random (in about a quarter of
the rounds it says nothing at all) and does not evaluate the human's announcement.

### 2v2 Team

Four seats: `a0`, `a1` (team A) and `b0`, `b1` (team B). In the lobby, players choose a free seat themselves, and
the room creator can move players around. The room creator starts the match as soon as all four seats are
taken. Each player secretly picks one gesture from the Classic set per round. There are two duels, `a0` against
`b0` and `a1` against `b1`. The team with more duels won takes the round; at 1:1 the round is a draw. There is no
bot in this mode.

### Draws, Sudden Death and Timings

- Drawn rounds do not count and are replayed. A match ends as soon as one side has won `ceil(bestOf / 2)`
  rounds. Because only wins count and `bestOf` is odd, the series can never end level: The replay rule takes
  the place of a separate "sudden death".
- The timings are defined in `packages/shared/src/constants.ts`:

| Constant | Value | Meaning |
| --- | --- | --- |
| `PICK_TIMEOUT_MS` | 20 s | Time to pick a gesture. Whoever does not pick loses their duel. If nobody picks, the round is a draw. |
| `ANNOUNCE_TIMEOUT_MS` | 8 s | Time for the announcement in Bluff mode. Whoever stays silent announces nothing. |
| `REVEAL_MS` | 5.5 s | How long the round result stays on screen. The client first shows a short countdown ("Rock, Paper, Scissors", in German "Schnick, Schnack, Schnuck", about 1.26 s, skipped with reduced motion), so the result stays visible for the remainder. If all connected players are "next", the next round starts sooner. |
| `RECONNECT_GRACE_MS` | 30 s | How long a disconnected player can return. After that they lose their duel in this and all further rounds (forfeit). |
| `MAX_SPECTATORS` | 16 | Most spectators in one room. Disconnected spectators inside their grace period still count; further joins get `room_full`. |
| `IDLE_ROUNDS_LIMIT` | 3 | See below. |
| `ROOM_TTL_S` | 1800 s | Inactive rooms disappear from Redis after 30 minutes. |

### Abandoned Matches

A round that runs out without any human pick or announcement counts as "idle". After three idle rounds in a row
(`IDLE_ROUNDS_LIMIT`), the match ends without a winner so that abandoned rooms do not run forever. The result
screen then shows "Spiel vorzeitig beendet" ("Match ended early") instead of victory or defeat, with a note that
the game could not be continued. If all humans are gone after the grace period, the server deletes the room.

**Ending early by forfeit:** Whoever leaves the match for good (or does not return after the grace period)
forfeits and loses each of their duels from then on. The match ends immediately as soon as no duel has two
active participants any more (rule `drawGuard` in `apps/server/src/settle.ts`):

- **1v1 (also against the bot):** If one side forfeits, the other wins. If both forfeit, there is no winner
  (or, if the scores differ, the leading side wins).
- **2v2:** As long as a duel with two active players remains (for example `a1` against `b1` when `a0` leaves),
  the match continues, and the abandoned duel goes to the opposing side every round. Otherwise (both seats of a
  team gone, or `a0` and `b1` or `a1` and `b0` gone), the team with more active seats wins, on a tie the one
  with more points, otherwise there is no winner.

After a match ends, anyone in the room can start a rematch. Anyone who forfeited the match gives up their seat
in the process.

## Architecture

```text
 Browser (Svelte SPA)                       Kubernetes
 ┌──────────────────┐   WebSocket    ┌──────────────────────────┐
 │ UI, i18n, audio  │ ─────────────► │ Pod 1: Node server       │──┐
 │ Camera (local)   │ ◄───────────── │ HTTP + Socket.IO         │  │
 └──────────────────┘  only "views"  ├──────────────────────────┤  ├──► Redis
        ▲                            │ Pod 2 ... N (identical)  │──┘   rooms, timers,
        └── static files (/) ────────┴──────────────────────────┘      Pub/Sub
```

Monorepo with npm workspaces:

| Path | Contents |
| --- | --- |
| `packages/shared` | Game logic (`match.ts`, `gestures.ts`, `constants.ts`), protocol with zod schemas, room codes. Used by client and server. |
| `apps/server` | Node 24, Socket.IO with Redis adapter, rooms, ticker, bot, HTTP (static files, `/healthz`, `/readyz`). |
| `apps/web` | Svelte 5 SPA with Vite. Styles in `src/styles` (design tokens as CSS variables), SVG assets in `src/assets`. |
| `charts/rps-arena` | Helm chart (Deployment, Service, optional Ingress, optional Redis). |
| `e2e` | Playwright end-to-end tests. |
| `scripts` | Release script, Compose and Helm checks, model download. |

Key properties:

- **Secret picks:** The client never receives the raw state. `apps/server/src/view.ts` builds a separate view per
  seat from an allow-list. For other seats, only *whether* they have picked is visible (`lockedSeats`), never
  *what*. Only after the reveal does the pick appear in `lastRound`. Other players' session tokens are never part
  of a view.
- **Spectator channel:** Each seat has its own Socket.IO channel for its personal view; all spectators of a room
  share one channel `<code>:spec` that carries a single identical view (`spectatorViewFor` in
  `apps/server/src/view.ts`). It is built from the same allow-list as the seat views, so it never contains a
  pick (`yourPick` is always `null`) or any token, and it is never emitted to a seated participant.
- **Redis is the only state:** Rooms, scores and deadlines live in Redis. The server pods hold nothing that a
  restart would lose. Updates to a room are atomic read-modify-write operations, and the pods distribute events
  through the Socket.IO Redis adapter. Several replicas without sticky sessions are possible because the
  transport is WebSocket only (no HTTP long-polling, which would be tied to one pod).
- **Deadlines in the room:** Each room carries its next deadline (`deadline`). Every pod checks every 500 ms
  which rooms are due and executes the deadline atomically. The pod that loses the race changes nothing. When a
  pod restarts, clients reconnect automatically and continue from the Redis state. Without Redis (not yet
  reachable at startup, or failed later), the process stays alive: `/healthz` keeps answering 200, `/readyz`
  answers 503, and as soon as Redis answers again, all connections reconnect on their own and `/readyz` returns
  to 200. A Helm install where the app starts before Redis therefore needs no restart.
- **Short-lived state:** Redis keys expire after 30 minutes of inactivity. The bundled Redis has no persistence
  by default (see [Deployment with Helm](#deployment-with-helm)).

The detailed design is in
[`docs/superpowers/specs/2026-10-22-rps-arena-design.md`](docs/superpowers/specs/2026-10-22-rps-arena-design.md).

## Local Development

Prerequisites: Node 24 (see [`.nvmrc`](.nvmrc), for example `nvm use`) and Docker (only for Compose, for image
builds and optionally for a local Redis).

```bash
npm install
```

### Dev Server

Two processes, one terminal each:

```bash
# Terminal 1: game server on :8080 (tsx watch)
RPS_DEV_MEMORY_STORE=1 npm run dev -w @rps/server

# Terminal 2: Vite dev server of the web app (default port 5173)
npm run dev -w @rps/web
```

The web app runs on `http://localhost:5173`. Vite forwards `/socket.io` (including WebSocket) to
`http://localhost:8080` (`apps/web/vite.config.ts`). The web app's `predev` hook calls
`scripts/fetch-model.mjs` (downloads the camera model and copies the WASM files, needs network access the first
time, see [Operations and Privacy](#operations-and-privacy)).

`RPS_DEV_MEMORY_STORE=1` keeps rooms in the process's memory. It is intended **for development and tests only**:
a single process, all rooms are lost on restart, no replicas. Without `REDIS_URL` and without this flag, the
server refuses to start with a configuration error message. If `REDIS_URL` is set, Redis is used and the flag is
ignored. With a real Redis (for example from [Docker Compose](#local-testing-with-docker-compose)), start the
server with `REDIS_URL=redis://127.0.0.1:6380`.

To check the built version (the server serves the SPA itself):

```bash
npm run build
RPS_DEV_MEMORY_STORE=1 npm start -w @rps/server   # http://localhost:8080
```

### Demo Views (Dev Only)

In the Vite dev server, `?demo=<screen>` renders a screen from mock data, without a server. This is for checking
the look. The code is in `apps/web/src/lib/demo.ts` and is only loaded when `import.meta.env.DEV` is true; a
production build does not contain it.

```text
http://localhost:5173/?demo=home|lobby|board|reveal|result|gallery
```

Further parameters: `mode=<mode ID>`, `outcome=win|lose|draw`, `picked=1`, `phase=announce`, `left=<seconds>`,
`bot=1`, for example `?demo=board&mode=wheel15`.

### Checking and Building

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint across the repo and all workspaces |
| `npm run typecheck` | `tsc` or `svelte-check` in all workspaces and `tsc -p e2e` |
| `npm test` | Vitest for all workspaces and `scripts/` |
| `npm run build` | Build the server bundle (esbuild) and the web app (Vite), downloads the camera model first |
| `npm run e2e` | `npm run build`, then Playwright (Chromium) |

The Redis tests (`apps/server/src/redis-store.test.ts`) only run when `REDIS_URL` is set and are skipped
otherwise. `npm run compose:test` runs them against a real Redis.

For `npm run e2e`, install the browser once: `npx playwright install chromium`. The test starts the built server
itself (with `RPS_DEV_MEMORY_STORE=1`) on port 47831, adjustable with `E2E_PORT`. The scenarios cover, among
others, a two-player Classic match, the secrecy of picks, a bot match, Wheel 15, error cases, reconnecting,
language switching and phone width.

## Local Testing with Docker Compose

Prerequisite: Docker with Compose v2. For `compose:smoke` and `compose:check`, a script runs on the host and
needs the dependencies: run `npm ci` in the repo once. All ports are bound to `127.0.0.1` only.

```bash
npm run compose:up      # builds the image, starts Redis + app on http://127.0.0.1:8080
npm run compose:test    # whole test suite in one container, with Redis (Redis tests run)
npm run compose:smoke   # Redis + app + second instance (:8081), then smoke test across both
npm run compose:check   # complete run including cleanup
npm run compose:down    # stop everything, remove volumes and orphaned containers
```

The services in [`compose.yaml`](compose.yaml):

| Service | Profile | Purpose |
| --- | --- | --- |
| `redis` | (always) | Redis 7, host port `REDIS_PORT` (default 6380, deliberately not 6379) |
| `app` | (always) | The runtime image of the Dockerfile, read-only root file system, `/tmp` as tmpfs, port `APP_PORT` (8080) |
| `app2` | `replicas` | Second instance on the same Redis, port `APP2_PORT` (8081) |
| `tests` | `test` | Test suite from the `test` stage of the Dockerfile |

- **Ports and names:** Occupied ports can be changed with `APP_PORT`, `APP2_PORT` and `REDIS_PORT`, for example
  `APP_PORT=18080 npm run compose:up`. No service has a fixed container name; multiple checkouts run side by
  side with different `COMPOSE_PROJECT_NAME` values and their own ports.
- **Custom ports with `compose:smoke`:** The smoke script runs on the host and by default talks to
  `127.0.0.1:8080` and `127.0.0.1:8081`. With changed ports, `APP_URL` and `APP2_URL` must therefore be set as
  well. Only `compose:check` passes `APP_PORT`, `APP2_PORT` and `REDIS_PORT` on to the script itself.

  ```bash
  export APP_PORT=18080 APP2_PORT=18081
  APP_URL=http://127.0.0.1:18080 APP2_URL=http://127.0.0.1:18081 npm run compose:smoke
  ```

- **`tests` service:** Built from the `test` stage of the [`Dockerfile`](Dockerfile). Source code and
  dependencies are inside the image, there is **no bind mount**, and nothing is written to the working
  directory. `compose:test` rebuilds with `--build` on every call (the Docker cache applies). A different
  command can be set with `COMPOSE_TEST_CMD`:
  `COMPOSE_TEST_CMD="npm test -w @rps/server" npm run compose:test`.
- **`compose:smoke`** starts `redis`, `app` and `app2` and runs
  [`scripts/compose-smoke.mjs`](scripts/compose-smoke.mjs). The stack keeps running afterwards; clean up with
  `npm run compose:down`.
- **`compose:check`** ([`scripts/compose-check.sh`](scripts/compose-check.sh)) validates the Compose
  configuration (all profiles), builds and starts the app, checks `/healthz` and `/readyz`, runs the tests
  against Redis (and makes sure the Redis tests really run and are not skipped), starts the second instance and
  runs the smoke test. It always cleans up afterwards. It automatically appends `-- --reporter=verbose` to
  `COMPOSE_TEST_CMD`. If the command is overridden, it must still include the `@rps/server` tests, because the
  "Redis tests ran" check looks for them in the log. By default it uses the project `rps-arena-check`, so a
  running dev stack is not torn down (`COMPOSE_PROJECT_NAME` overrides this). It needs `docker`, `curl`, `node`
  and the dependencies installed via `npm ci` on the host.

**What the smoke test proves:** Two clients connect to *different* instances of the same Redis database and play
a room. It checks that (1) creating and joining works across instances, (2) A's secret pick does not reach B
before B has picked, (3) the reveal is distributed to both instances via the Redis adapter, and (4) reconnecting
through the other instance with the session token restores the seat.

## Deployment with Helm

The chart lives in [`charts/rps-arena`](charts/rps-arena) and is published on every release as an OCI artifact
to `ghcr.io/jaydee94/charts/rps-arena` (chart name `rps-arena`, `version` and `appVersion` are the release
version). The chart in the repository carries the placeholder `0.0.0`. It deploys the app (server with embedded
web app), a Service, optionally an Ingress and, by default, a simple Redis.

```bash
helm install rps oci://ghcr.io/jaydee94/charts/rps-arena --version 1.0.0 \
  --namespace rps --create-namespace -f values.yaml
```

The version (`--version`) is a published release. If the chart package is private, log in first with
`helm registry login ghcr.io`. With the release name `rps`, the resources are named `rps-rps-arena` (and
`rps-rps-arena-redis`).

Example `values.yaml`:

```yaml
replicaCount: 2

image:
  tag: ""            # empty = appVersion of the chart

resources:
  requests: { cpu: 100m, memory: 128Mi }
  limits: { cpu: 500m, memory: 256Mi }

ingress:
  enabled: true
  className: nginx
  host: rps.example.com
  tls:
    enabled: true
    clusterIssuer: letsencrypt-prod   # sets the annotation cert-manager.io/cluster-issuer

# Your own Redis instead of the bundled one (URL without password; with a password see redis.existingSecret below):
redis:
  enabled: false
  externalUrl: redis://redis.example.internal:6379
```

All values with their defaults are in [`charts/rps-arena/values.yaml`](charts/rps-arena/values.yaml). Further
environment variables for the container go through the `env` map. Without an Ingress, the game is reachable via
`kubectl --namespace rps port-forward svc/rps-rps-arena 8080:80` (the notes shown after `helm install` print the
matching command).

**Redis:** With `redis.enabled: true` (the default), the chart starts a single Redis (`redis:7-alpine`) without
authentication and without persistence. If it fails, running rooms are lost. With
`redis.persistence.enabled=true`, a PVC is created (`redis.persistence.size`, `storageClass`). With
`redis.enabled: false`, either `redis.externalUrl` or `redis.existingSecret` is required, otherwise
`helm template` aborts with a clear message. `redis.externalUrl` appears in plain text in the Deployment
environment (and in `helm get values`), so it is only suitable for a URL without a password. With a password,
put the URL in a Secret of your own and reference it:

```bash
kubectl --namespace rps create secret generic rps-redis \
  --from-literal=redis-url='rediss://user:password@redis.example.internal:6379'
helm upgrade --install rps ... --set redis.enabled=false --set redis.existingSecret=rps-redis
```

`REDIS_URL` then comes from the Secret via `secretKeyRef` (key `redis.existingSecretKey`, default `redis-url`),
`redis.externalUrl` is not needed, and the Secret wins if both are set. The notes after `helm install` and
`upgrade` (and therefore the CI logs) never print the URL, only whether an external Redis is configured.

**Ingress requirements:**

- **WebSocket timeouts:** The annotations `nginx.ingress.kubernetes.io/proxy-read-timeout` and
  `proxy-send-timeout` default to 3600 s (ingress-nginx). With other controllers, adjust them via
  `ingress.annotations`.
- **The `Host` header must be preserved:** The server only accepts a WebSocket connection if the browser's
  `Origin` matches the request's `Host` (no CORS, `apps/server/src/io.ts`). A proxy that rewrites the `Host`
  causes rejected connections.
- **No sticky sessions needed.** The state is in Redis, several replicas are the normal case.
- Ingress only, no Gateway API.

**Probes and security:** Liveness `GET /healthz`, readiness `GET /readyz` (200 only if Redis answers). The
container runs as non-root (UID/GID 1000), with `readOnlyRootFilesystem`, without privilege escalation, without
Linux capabilities and with the seccomp profile `RuntimeDefault`. `/tmp` is an `emptyDir`. Default resources:
50m CPU / 96Mi request, 500m CPU / 256Mi limit.

**Checking the chart:**

```bash
helm lint charts/rps-arena
bash scripts/helm-check.sh   # needs helm and yq, plus kubeconform or Docker
```

[`scripts/helm-check.sh`](scripts/helm-check.sh) lints the chart in several variants, renders it with
`helm template`, uses `yq` to check the most important properties (security context, probes, Redis variants,
Ingress, no sticky annotations) and validates the manifests with kubeconform.

## Operations and Privacy

### Environment Variables

Read in [`apps/server/src/config.ts`](apps/server/src/config.ts):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | HTTP and WebSocket port (integer 1 to 65535) |
| `REDIS_URL` | (none) | Required in production. Must start with `redis://` or `rediss://`. The URL is never logged. |
| `RPS_DEV_MEMORY_STORE` | (off) | `1` = rooms in memory, development and tests only (see above) |
| `STATIC_DIR` | `apps/web/dist` relative to the server | Directory of the built web app. The image places it accordingly, so the variable is not needed there. |

The image sets `NODE_ENV=production` and `PORT=8080`. On `SIGTERM`, the server shuts down gracefully (clients
reconnect to another pod).

### Redis

Redis is required (except in dev mode) and is the only state. Each room is a key with an inactivity TTL of 30
minutes (`ROOM_TTL_S`). No game histories, accounts or leaderboards are stored. The bot remembers at most the
last 50 rounds of a room (also across rematches), so a room does not grow in Redis with the length of play.

The bundled Redis has limited memory: `--maxmemory 100mb` with the policy `volatile-lru` (`redis.maxmemory`,
`redis.maxmemoryPolicy`; the container limit of 128Mi is above it). When the limit is reached, Redis evicts the
least recently used *rooms* (only these carry a TTL) instead of being killed by the kernel and losing all rooms.
The small deadline index `rps:deadlines` has no TTL and is never evicted. When raising `redis.maxmemory`, also
raise the container limit `redis.resources.limits.memory`. The same recommendation (`maxmemory` plus
`volatile-lru`) applies to an external Redis; the chart cannot set it there.

### Security Headers

The server sets a strict Content-Security-Policy (`default-src 'self'`, `script-src 'self'
'wasm-unsafe-eval'`, `worker-src 'self' blob:` for MediaPipe), `X-Content-Type-Options`, `Referrer-Policy:
no-referrer`, `X-Frame-Options: DENY` and `Permissions-Policy: camera=(self), microphone=(), geolocation=()`.
Hashed assets under `/assets/` are cached long-term, everything else must be revalidated. Messages are limited
to 10 kB, and there is a rate limit per connection.

### Camera Control

- **Everything in the browser:** Hand-gesture recognition runs with MediaPipe (`@mediapipe/tasks-vision`)
  entirely in the browser. **No video image** leaves the device; only the confirmed pick (rock, paper or
  scissors) is sent. The library, WASM files and model come from your own server; there is no request to a CDN
  or to Google.
- **Only on request:** The library and the model are only loaded when the camera is switched on. The camera is
  only opened after the model has loaded. Without a camera or with a denied permission, the app shows a
  message, and click control is unaffected.
- **Scope:** Experimental and only for games with the Classic set (Classic and 2v2). Recognized are
  `Closed_Fist` (rock), `Open_Palm` (paper) and `Victory` (scissors). A gesture only counts once it has been
  held without interruption for 900 ms.
- **Pinned to 0.10.x:** `@mediapipe/tasks-vision` is pinned exactly to `0.10.35` in `apps/web/package.json`.
  Versions from 1.0 on ship built-in telemetry (a POST to a Google logging endpoint, as the Renovate rule also
  describes it). In the analysis of 1.1.1, this logger was found in the bundle; 0.10.x contains no external
  URLs. That would contradict the promise "no requests to third parties". The version must therefore not be
  raised to 1.x without checking this. Renovate is configured by a rule in `renovate.json` not to raise the
  version to 1.x (`allowedVersions: "<1"`).
- **Model download at build time:** `scripts/fetch-model.mjs` (runs as `predev`/`prebuild` of the web app and
  therefore also in the Docker build) downloads `gesture_recognizer.task` from `storage.googleapis.com`,
  verifies the SHA-256 checksum and aborts on a mismatch. The build therefore needs **network access**. An
  existing, verified model is not downloaded again. No network access is needed at runtime. The script copies
  the WASM files from the npm package to `apps/web/public/mediapipe-wasm/`.
- **`.wasm`:** The server serves `.wasm` as `application/wasm`. Anyone serving the static files behind a
  different server must ensure this as well and allow `wasm-unsafe-eval` in the CSP.

## Release and CI

### Conventional Commits and Release Plan

Commit messages (for squash merges, the PR title) follow
[Conventional Commits](https://www.conventionalcommits.org/). The rules are in
[`.releaserc.json`](.releaserc.json):

| Commit | Release |
| --- | --- |
| `feat` | minor |
| `fix`, `perf` | patch |
| `fix(deps)` (Renovate) | patch |
| Breaking change (`feat!:` or footer `BREAKING CHANGE:`) | major |
| `docs`, `ci`, `chore`, `test`, `refactor`, `build`, `style` | no release |

The first release is `1.0.0`. Every push to `main` starts the workflow
[`release.yml`](.github/workflows/release.yml): It installs the dependencies and runs
`npm run lint && npm run typecheck && npm test` as a quality gate. Only after that does semantic-release run.
The end-to-end test only runs in the PR CI. If the commits justify a release, the following are produced:

- the Git tag `vX.Y.Z` and a GitHub Release with a changelog,
- the multi-arch image (linux/amd64 and linux/arm64) `ghcr.io/jaydee94/rps-arena:X.Y.Z`, plus `:latest` for
  stable versions,
- the Helm chart as OCI artifact `oci://ghcr.io/jaydee94/charts/rps-arena` in version `X.Y.Z` (with
  `appVersion` `X.Y.Z`).

The Dockerfile builds `source`, `build`, `test` and `deps` on the build platform (`--platform=$BUILDPLATFORM`),
so that `npm ci` and the Vite build for the arm64 variant do not run under QEMU. This is possible because the
server bundle, the SPA and the production dependencies are pure JavaScript (the test
[`scripts/dockerfile-deps.test.ts`](scripts/dockerfile-deps.test.ts) fails as soon as a production dependency
becomes platform-specific). Only the final stage `runtime` is built for the target platform and contains no
`RUN`.

semantic-release commits **nothing** back to `main`. It only sets the tag and GitHub Release; the chart gets its
version only when it is packaged in [`scripts/publish.sh`](scripts/publish.sh). As a result, `main` needs no
exception in branch protection and no bot token. `publish.sh` never overwrites an existing image or chart and
aborts if the registry does not answer unambiguously.

### Pull Requests

Merging is done by **squash merge** with a Conventional Commit title. The workflow
[`pr-title.yml`](.github/workflows/pr-title.yml) checks the PR title (allowed types: `feat`, `fix`, `perf`,
`docs`, `ci`, `chore`, `test`, `refactor`, `build`, `style`). The PR CI [`ci.yml`](.github/workflows/ci.yml)
runs on pull requests against `main` (and manually) with these jobs:

| Job | Contents |
| --- | --- |
| `test` | `npm ci`, lint, type check, tests (with a Redis service, so the Redis tests run) |
| `e2e` | Build and Playwright tests with Chromium (on failure, the report is uploaded as an artifact) |
| `image` | Docker build without push |
| `chart` | `scripts/helm-check.sh` (Helm lint, `helm template`, kubeconform) |
| `renovate-config` | Validates `renovate.json` with the Renovate config validator (`--strict`) |

### When Publishing Fails

semantic-release creates the tag and GitHub Release *before* it calls `scripts/publish.sh`. If publishing the
image or chart fails, a re-run finds nothing new and does nothing. Instead: **Actions → release → Run
workflow** and enter the existing version without the `v`, for example `1.2.3`. The `republish` job checks out
the tag, rebuilds image and chart and publishes both. Existing artifacts are not overwritten, so a half-finished
release can be completed this way. Alternatively by hand (needs `docker`, `helm` and `git` as well as a buildx
builder that can build multi-platform images, for example with QEMU):

```bash
git checkout v1.2.3
docker login ghcr.io
bash scripts/publish.sh 1.2.3
# Dry run: builds locally for your own platform only, pushes nothing, does not contact the registry
bash scripts/publish.sh 1.2.3 --dry-run
```

**First publish:** For packages that do not exist yet, GHCR answers with `403 denied`. This cannot be told apart
from a real permission problem, so `publish.sh` normally aborts on such an answer and pushes nothing. At the very
first release, however, there is nothing that could be overwritten: The `publishCmd` in
[`.releaserc.json`](.releaserc.json) sets `PUBLISH_ASSUME_MISSING=1` exactly when semantic-release knows no
earlier release (`lastRelease.version` is empty) and leaves it empty for every later release. The first release
therefore needs **no manual step**. An authorization response is then treated as "package does not exist yet"
(warning line in the log); network errors, timeouts and server errors still abort. An empty value unlocks
nothing, only exactly `1` counts. The test [`scripts/release-config.test.ts`](scripts/release-config.test.ts)
renders the `publishCmd` with the same lodash function as semantic-release and checks both cases.

If the very first run still fails while publishing (the tag and GitHub Release then already exist, for example
because of an unexpected registry response), the route from above remains: a manual run with the generated
version (for example `1.0.0`) and additionally **`first_publish = true`**. By hand, the same works with
`bash scripts/publish.sh 1.0.0 --assume-missing` (or the environment variable `PUBLISH_ASSUME_MISSING=1`).
Never set `first_publish` for later releases. The run on a push can only set the flag through the first-release
rule above, never otherwise.

### Renovate

[`renovate.json`](renovate.json) extends `config:recommended` and applies to npm, Dockerfile, GitHub Actions and
Helm as well as two custom managers (the Node image in the Dockerfile and the pinned Renovate version in the
job `renovate-config`). The rules at a glance; details and rationale are in the `description` fields in the
file:

- Renovate commits have the prefix `fix(deps)`, so an update produces a patch release. Exceptions with
  `build(deps)` (no release): the release tooling (see below) and the Renovate version pinned in `ci.yml`, which
  only affects the CI validation and is not a game update. Automerge applies to it as usual (minor and patch).
- Minor and patch updates of the npm dependencies are grouped into one PR. Minor and patch updates are merged
  automatically (platform automerge) as soon as the required checks are green. **Major updates stay manual.**
- The release tooling (`semantic-release` and its plugins) gets its own group, no automerge and the prefix
  `build(deps)`, so it triggers no release and is reviewed by hand.
- Version limits: `@mediapipe/tasks-vision` stays below 1.0 (telemetry, see above) and
  `conventional-changelog-conventionalcommits` below 10 (incompatible with the release notes generator).
- The Node major version of the Dockerfile image follows `.nvmrc` and is raised by hand.

The configuration is validated in CI (job `renovate-config`).

## One-Time Manual Steps After the First Push

- [ ] **Repository:** Create or connect the `Jaydee94/rps-arena` repository on GitHub and push `main`.
- [ ] **Renovate:** Install it by granting the Renovate GitHub App access to the repository. It reads the existing
  `renovate.json` and then opens the update PRs.
- [ ] **Merge settings** (Settings → General → Pull Requests): allow only *Squash merging* and choose "Pull
  request title" as the commit message. Disable merge commits and rebase merging.
- [ ] **Auto-merge:** Allow it (Settings → General → Pull Requests → *Allow auto-merge*). Renovate uses
  `platformAutomerge` and needs this setting.
- [ ] **Open the first pull request** (for example a small docs change) so that `ci.yml` and `pr-title.yml` run
  once. GitHub only offers status checks for selection in branch protection after they have run.
- [ ] **Branch protection** for `main` (Settings → Branches or Rulesets), after the first PR: require a pull
  request and require these status checks (the job names): `test`, `e2e`, `image`, `chart`,
  `renovate-config` (from `ci.yml`) and `pr-title` (from `pr-title.yml`).
  Renovate automerge then waits for green checks. An exception for the release bot is not necessary, because
  nothing is written back to `main`.
- [ ] **Actions permissions** (Settings → Actions → General → Workflow permissions): The workflows request their
  permissions themselves via `permissions:` (`contents: write`, `packages: write`, `issues: write`,
  `pull-requests: write` in the release job). An org or repo setting must not cap these, so that `GITHUB_TOKEN`
  can create tags, releases and packages. If there are tag rulesets, they must allow GitHub Actions to create
  `v*` tags.
- [ ] **GHCR packages:** After the first publish, two packages appear, `rps-arena` (image) and
  `charts/rps-arena` (chart). New GHCR packages are private. If desired, make them public under *Package
  settings* (then no login is needed for `helm install` and `docker pull`), link each package to the
  repository (*Connect repository*) and give the repository write access for Actions (*Manage Actions
  access*). The image carries the label `org.opencontainers.image.source`; the chart package should be checked.
- [ ] **First release:** The first push to `main` with `feat` commits produces `1.0.0` and publishes image and
  chart without a manual step. If publishing fails anyway, start the manual run with
  `first_publish = true` (see [Release and CI](#release-and-ci)).

## Licenses and Assets

The source code is under the [MIT license](LICENSE). All illustrations (avatars, gestures) are self-drawn SVGs
and are under the same license. The fonts Bangers and Comic Neue are self-hosted (SIL Open Font License 1.1,
the license texts sit next to the files). SFX and music are generated at runtime with the Web Audio API; there
are no audio files. No third-party asset is loaded at runtime. Sources and licenses are in
[`docs/assets.md`](docs/assets.md).

## Decisions

Non-obvious commitments (details in the [design](docs/superpowers/specs/2026-10-22-rps-arena-design.md)):

- **Bluff uses the Lizard-Spock set** (the announcement emotes are its five gestures). The announcement is
  non-binding and a fixed emote selection, not free text, so that no moderation and no length limits are
  needed.
- **2v2 uses the Classic set.** The data model separates mode and gesture set (`gestureSetFor`), so other
  combinations are possible later. There is no bot in 2v2.
- **Redis is the only state.** There is no in-process state, so multiple replicas, pod restarts and rolling
  updates work without sticky sessions. `RPS_DEV_MEMORY_STORE=1` is only a development and test tool.
- **WebSocket only**, no long-polling fallback, so that no pod is tied to a session.
- **Abort rule:** Three idle rounds in a row end a match without a winner, so that abandoned rooms do not run
  forever and keep renewing their TTL.
- **No sudden death as a separate phase:** Drawn rounds are replayed, and a series tie is impossible with an
  odd `bestOf`.
- **Camera only for the Classic set**, as an experimental feature that can be switched off, with a hold time
  against misrecognition. The library is pinned to 0.10.x (telemetry in 1.x).
- **No write-back to `main`:** The chart version is only set when packaging.
- **No accounts, no leaderboard, no matchmaking** with strangers, no hot-seat mode.
