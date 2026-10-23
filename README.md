<p align="center"><img src="docs/images/logo.svg" alt="RPS Arena logo" width="720"></p>

<p align="center"><strong>Comic-panel rock-paper-scissors for the browser: no account, no install, just a room code.</strong></p>

<p align="center">
  <a href="https://github.com/Jaydee94/rps-arena/actions/workflows/release.yml"><img src="https://github.com/Jaydee94/rps-arena/actions/workflows/release.yml/badge.svg" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Jaydee94/rps-arena" alt="MIT license"></a>
</p>

# RPS Arena

Rock-paper-scissors in a comic look, played in the browser. Create a room, share the code or link, and play.
The server settles every round and keeps each pick secret until everyone has picked.

- **Modes:** Classic, Lizard-Spock, Wheel 7 / 9 / 15, Bluff and 2v2 Team, or solo against a bot.
- **Spectators:** late joiners watch a running match live.
- **Tournaments:** 4 to 8 players, knockout or round robin.
- **Matchup scenes:** every reveal shows what happens, like "Rock crushes Scissors".
- **German and English**, usable with mouse, touch and keyboard.
- **Self-hostable:** one Node server plus Redis, with a Helm chart and a Docker image.

## Quick start

You need Node 24 (see [`.nvmrc`](.nvmrc)).

```bash
npm ci

# Terminal 1: game server on :8080, rooms kept in memory
RPS_DEV_MEMORY_STORE=1 npm run dev -w @rps/server

# Terminal 2: web app on :5173
npm run dev -w @rps/web
```

1. Open <http://localhost:5173>, pick a nickname and create a room.
2. Open the room link in a second browser tab or window and join as the second player.

The first `npm run dev -w @rps/web` downloads the camera model, so it needs network access.

With Docker instead: `npm run compose:up` starts Redis and the app on <http://127.0.0.1:8080>.

## Docs

- [Game modes and rules](docs/game-modes.md): modes, 2v2, Bluff, bot, spectators, timings.
- [Tournament mode](docs/tournament.md): formats, flow, forfeits, rematch.
- [Matchup scenes](docs/matchup-scenes.md): the reveal scenes and how to add one.
- [Development](docs/development.md): dev server, demo views, checks and tests.
- [Docker Compose](docs/docker-compose.md): the real image with Redis and the smoke test.
- [Architecture](docs/architecture.md): code layout, secret picks, Redis as the only state.
- [Deployment](docs/deployment.md): install on Kubernetes with Helm.
- [Operations and privacy](docs/operations.md): environment variables, Redis, headers, camera.
- [Release and CI](docs/release.md): commits, releases, CI and Renovate.
- [Manual steps](docs/manual-steps.md): one-time GitHub setup.
- [Decisions](docs/decisions.md): the non-obvious choices.
- [Assets](docs/assets.md): illustrations, fonts and audio.

All docs: [docs/README.md](docs/README.md).

## License

The code is under the [MIT license](LICENSE). The illustrations are self-drawn and MIT too. The fonts are
self-hosted under the SIL Open Font License 1.1, and the sound is generated in the browser.
Details: [docs/assets.md](docs/assets.md).
