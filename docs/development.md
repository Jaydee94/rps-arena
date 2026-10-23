# Local Development

How to run the game locally, look at single screens, and run the checks and tests.

## Prerequisites

- Node 24 (see [`.nvmrc`](../.nvmrc), for example `nvm use`).
- Docker, only for [Docker Compose](docker-compose.md), image builds or a local Redis.

```bash
npm ci
```

## Dev server

Two processes, one terminal each:

```bash
# Terminal 1: game server on :8080 (tsx watch)
RPS_DEV_MEMORY_STORE=1 npm run dev -w @rps/server

# Terminal 2: Vite dev server of the web app on :5173
npm run dev -w @rps/web
```

- Open `http://localhost:5173`. Vite forwards `/socket.io` (WebSocket included) to `http://localhost:8080`
  (`apps/web/vite.config.ts`).
- The web app's `predev` hook runs `scripts/fetch-model.mjs`. It downloads the camera model and copies the WASM
  files, so the first run needs network access (see [operations.md](operations.md#camera-control)).

**`RPS_DEV_MEMORY_STORE=1`** keeps rooms in the process's memory. It is for **development and tests only**: one
process, no replicas, all rooms are lost on restart.

- Without `REDIS_URL` and without this flag, the server refuses to start with a configuration error.
- If `REDIS_URL` is set, Redis is used and the flag is ignored.
- With a real Redis (for example from Docker Compose), start the server with `REDIS_URL=redis://127.0.0.1:6380`.

To check the built version (the server serves the SPA itself):

```bash
npm run build
RPS_DEV_MEMORY_STORE=1 npm start -w @rps/server   # http://localhost:8080
```

## Demo views (dev only)

In the Vite dev server, `?demo=<screen>` renders a screen from mock data, without a server, to check the look.
The code is in `apps/web/src/lib/demo.ts`. It is loaded only when `import.meta.env.DEV` is true, so a production
build does not contain it.

```text
http://localhost:5173/?demo=home|lobby|board|reveal|result|spectate|gallery
http://localhost:5173/?demo=tournament-lobby|tournament-draw|tournament-intermission|tournament-bracket|tournament-table|tournament-podium|tournament-finished
http://localhost:5173/?demo=fx|fxgallery
```

- Common parameters: `mode=<mode ID>`, `outcome=win|lose|draw`, `picked=1`, `phase=announce`, `left=<seconds>`,
  `bot=1`. Example: `?demo=board&mode=wheel15`.
- Tournament demos also take `n=<4..8>`, `format=knockout|roundrobin`, `as=spectator|player|champion` and more.
- `fx` and `fxgallery` show the matchup scenes, see [matchup-scenes.md](matchup-scenes.md#dev-gallery).
- The full parameter list is in the comment at the top of `demo.ts`.

## Checks and build

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint across the repo and all workspaces |
| `npm run typecheck` | `tsc` or `svelte-check` in all workspaces, plus `tsc -p e2e` |
| `npm test` | Vitest for all workspaces and `scripts/` |
| `npm run build` | Server bundle (esbuild) and web app (Vite). Downloads the camera model first. |
| `npm run e2e` | `npm run build`, then Playwright (Chromium) |

The Redis tests (`apps/server/src/redis-store.test.ts`) run only when `REDIS_URL` is set and are skipped
otherwise. `npm run compose:test` runs them against a real Redis.

## End-to-end tests

- Install the browser once: `npx playwright install chromium`.
- The test starts the built server itself (with `RPS_DEV_MEMORY_STORE=1`) on port 47831. Change it with
  `E2E_PORT`.
- `e2e/game.spec.ts` covers a two-player Classic match, the secrecy of picks, a bot match, Wheel 15, the reveal
  countdown, the matchup scene, error cases, reconnecting, language switching, phone width and spectators.
- `e2e/tournament.spec.ts` plays two four-browser tournaments: a knockout with live watchers, host skip, podium
  and rematch, and a round robin with a reload and a dropped player.
