# Architecture

How the code is laid out and how the server keeps picks secret and state in Redis.

```text
 Browser (Svelte SPA)                       Kubernetes
 ┌──────────────────┐   WebSocket    ┌──────────────────────────┐
 │ UI, i18n, audio  │ ─────────────► │ Pod 1: Node server       │──┐
 │ Camera (local)   │ ◄───────────── │ HTTP + Socket.IO         │  │
 └──────────────────┘  only "views"  ├──────────────────────────┤  ├──► Redis
        ▲                            │ Pod 2 ... N (identical)  │──┘   rooms, timers,
        └── static files (/) ────────┴──────────────────────────┘      Pub/Sub
```

## Monorepo

npm workspaces:

| Path | Contents |
| --- | --- |
| `packages/shared` | Game logic (`match.ts`, `gestures.ts`, `constants.ts`), protocol with zod schemas, room codes. Used by client and server. |
| `apps/server` | Node 24, Socket.IO with Redis adapter, rooms, ticker, bot, HTTP (static files, `/healthz`, `/readyz`). |
| `apps/web` | Svelte 5 SPA with Vite. Styles in `src/styles` (design tokens as CSS variables), SVG assets in `src/assets`. |
| `charts/rps-arena` | Helm chart (Deployment, Service, optional Ingress, optional Redis). |
| `e2e` | Playwright end-to-end tests. |
| `scripts` | Release script, Compose and Helm checks, model download. |

## Secret picks

The client never gets the raw state. `apps/server/src/view.ts` builds a separate view per seat from an
allow-list. For other seats, a view only shows *whether* they have picked (`lockedSeats`), never *what*. The pick
appears in `lastRound` only after the reveal. A view never contains other players' session tokens.

## Channels

- **Seats:** each seat has its own Socket.IO channel for its personal view.
- **Spectators:** all spectators of a room share one channel `<code>:spec` with one identical view
  (`spectatorViewFor` in `view.ts`). It uses the same allow-list, so it never contains a pick (`yourPick` is always
  `null`) or a token. It is never sent to a seated participant.
- **Tournaments:** every participant has a personal channel `<code>:p:<id>` for the whole tournament, so new
  pairings never move sockets between channels. The two players of the running pairing get their seat view there
  (`viewFor`). Every other participant gets a watcher view (`participantViewFor`: the spectator view plus their
  own id and host flag). Plain spectators share `<code>:spec`, which is never sent to a participant channel.
- The host skips the draw or intermission with `tournament:skip`. The tournament code is in
  `apps/server/src/tournament.ts` (room flow) and `packages/shared/src/tournament.ts` (pure rules: draw, pairings,
  standings, tie-breaks, podium).

## Redis is the only state

- Rooms, scores and deadlines live in Redis. A pod holds nothing that a restart would lose.
- Room updates are atomic read-modify-write operations. Pods share events through the Socket.IO Redis adapter.
- The transport is WebSocket only (no HTTP long-polling, which would tie a client to one pod), so several replicas
  work without sticky sessions.
- Redis keys expire after 30 minutes of inactivity. The bundled Redis has no persistence by default (see
  [deployment.md](deployment.md#redis)).

## Deadlines

- Each room carries its next deadline (`deadline`). Every pod checks every 500 ms which rooms are due and runs the
  deadline atomically. The pod that loses the race changes nothing.
- When a pod restarts, clients reconnect and continue from the Redis state.
- Without Redis (not reachable at startup, or lost later), the process stays up: `/healthz` answers 200,
  `/readyz` answers 503. When Redis is back, all connections reconnect by themselves and `/readyz` returns to 200.
  So a Helm install where the app starts before Redis needs no restart.

The full design is in
[the design spec](superpowers/specs/2026-10-22-rps-arena-design.md). Key choices are in
[decisions.md](decisions.md).
