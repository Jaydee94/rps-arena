# RPS Arena – Design

Date: 2026-10-22 · Status: draft for approval

## 1. What this is about

A browser-based rock-paper-scissors game for two or more people that does
not feel like standard RPS: comic look, several unusual game modes and a
bluffing element. It runs in the browser, with no account and no
installation. You share a link and play.

The project is also an exercise in clean operations: the game runs on
Kubernetes, is deployed with Helm and is released automatically on every
merge to `main` (semantic-release). Renovate keeps the dependencies up to
date.

The design (look, animations, polish) is built roughly first and perfected
later with Claude Design. The frontend structure has to allow for that:
styles, assets and components cleanly separated, no scattered inline styles.

## 2. Goals

- Two people play in real time via a room code or link.
- Play against a bot with three difficulty levels.
- Several game modes, chosen per room (see 4).
- Click controls first. Optional camera recognition via hand gestures (see 6).
- Comic/cartoon look, SFX and optional music, German and English.
- Fully deployable on Kubernetes with Helm, scaling via Redis.
- Every release-worthy merge to `main` automatically creates a new release
  (Git tag, GitHub Release with changelog, container image, Helm chart).

## 3. Non-goals

- No accounts, no login, no leaderboard, no persistent match history.
- No random pairing with strangers (matchmaking queue).
- No local hot-seat mode on the same device.
- No power-ups or roguelike elements.
- No mobile app build. The web app should still be usable on a phone.
- No Gateway API support in the chart (Ingress only).

## 4. Game modes (chosen per room)

All modes are **server-authoritative**: the server keeps both sides' choices
secret until everyone has chosen, then reveals them simultaneously. The
client never evaluates anything itself.

The room creator chooses the mode and the match format. The match format is
**best of 3, 5 or 7**. If it ends in a tie, there is sudden death.

| Mode | Rule |
|---|---|
| Classic | Rock, paper, scissors. |
| Lizard-Spock | The 5-gesture variant (Rock, Paper, Scissors, Lizard, Spock) with the standard rules. |
| Wheel 7 / 9 / 15 | Gestures on a circle. Each gesture beats the next (n−1)/2 gestures clockwise and loses to the rest. The 15-gesture variant uses the well-known list (Rock, Fire, Scissors, Snake, Human, Tree, Wolf, Sponge, Paper, Air, Water, Dragon, Devil, Lightning, Gun). The sets for 7 and 9 are subsets that the builder chooses. |
| Bluff | Before the secret choice, each side has a short time window for an **announcement** (chat or emote) about what it will play. After that, both choose secretly. The announcement is non-binding; lying is allowed. *My decision:* The announcement is a fixed selection of emotes (the gestures as speech bubbles), not free text. This avoids moderation, length limits and abuse. The other side sees the announcement immediately. Skipping the announcement is also allowed. |
| 2v2 Team | Two teams of two people each. See the assumption below. |

**2v2 (confirmed by the user):** Each person secretly chooses one gesture
per round. There are two simultaneous duels (person 1 against person 1,
person 2 against person 2). The team with more duels won wins the round. At
1:1 the round is a tie and is replayed. The room holds exactly four players.

My decisions on this (builder check):
- **Teams:** In the lobby there are two teams with two seats each. You pick
  a free seat yourself, and the room creator can move players. The match
  starts when all four seats are taken. Who plays against whom follows from
  the seat (seat 1 against seat 1).
- **Gestures:** 2v2 initially uses the Classic set. The data model separates
  mode and gesture set so that a different set can be combined later.
- **Bot:** No bot in 2v2 mode.
- **Disconnect:** If someone does not return within the grace period, the
  affected duel is lost, and the round is evaluated normally.

## 5. Game flow and multiplayer

- **Room:** A player creates a room and gets a short code and a shareable
  link. Others join via code or link.
- **Identity:** On joining, you choose a nickname and a comic avatar.
  Nothing is stored permanently. Room and score live only in the room.
- **Bot:** Solo mode with three levels. Easy is random, Medium detects
  simple patterns, Hard learns from the moves so far and counters. The bot
  never sees the human's current choice. *My decision:* The bot supports all
  duel modes (Classic, Lizard-Spock, Wheel, Bluff), but not 2v2. In Bluff
  mode it makes random announcements and ignores the human's announcement.
- **Sudden death:** If the best-of-N series ends in a tie, an extra round is
  played until one side wins. Tied rounds do not count and are replayed.
- **Restart and failure (my decision):** The complete room state lives in
  Redis; timers are represented as expiring keys or timestamps. A short
  interruption during a pod restart is acceptable, provided the clients
  reconnect automatically and the game resumes from the Redis state.
  Seamless failover is not required.
- **Real time:** WebSockets. The server manages rooms, rounds, timers and
  evaluation.
- **Disconnect:** Anyone who drops briefly can rejoin the room with the same
  browser (session token in `sessionStorage`). The grace period is a builder
  decision.
- **Room cleanup:** Inactive rooms are deleted after a timeout (TTL in
  Redis).

## 6. Input: click and camera

- **Default:** Click/tap on the gesture selection. This must work flawlessly
  from the start and be operable by keyboard.
- **Camera (optional extra, can be switched on):** Hand gesture recognition
  via the MediaPipe Gesture Recognizer **entirely in the browser**. No video
  image leaves the device. Only the recognized gestures are sent as the
  choice.
- **Assumption (my idea):** The camera initially covers only the modes whose
  gestures can be mapped to the built-in hand poses (rock = closed fist,
  paper = open hand, scissors = victory). Exotic gestures stay click-only.
  *My decision on scope:* The camera is included in the first release, as a
  switchable feature labeled "experimental", for the Classic set only. It
  counts as successful when rock, paper and scissors are reliably recognized
  under normal lighting and the feature falls back cleanly when there is no
  camera or permission is denied. More gestures are evaluated only after
  that. The choice is confirmed only after a short hold time, to catch
  misdetections.
- The camera feature loads its library and the model **only on activation**
  (lazy loading), so that the normal start stays fast.

## 7. Look & feel

- **Direction:** Comic/cartoon. Thick outlines, loud colors, battle sounds
  like "POW" and "BAM", slight exaggeration in animations.
- **Audio:** Comic SFX and an optional music loop, each with a mute switch.
  Respect browser autoplay rules (audio starts only after a user action).
- **Languages:** German and English, switchable. The default follows the
  browser. All texts go through i18n keys.
- **Accessibility (my requirement):** Respect `prefers-reduced-motion`,
  sufficient contrast, gestures not distinguishable by color alone.
- **Mobile:** The layout must work at phone width.
- The first draft does not have to be perfect, but the structure must make a
  later redesign easy (design tokens as CSS variables).

## 8. Technology (user's decisions)

- **Stack:** Full-stack TypeScript. Node.js server with WebSockets, frontend
  with Vite. Types for messages and game logic are shared between client
  and server.
- **State:** Room state and pub/sub in **Redis**, so that multiple replicas
  are possible. The Redis part is part of the chart.
- **Registry:** GitHub Container Registry (`ghcr.io`) for the image **and**
  the Helm chart (as an OCI artifact).

### To be decided by the builder (my suggestions)

- Frontend framework (suggestion: Svelte, because it is animation-friendly
  and small; React is equally fine).
- WebSocket library (suggestion: Socket.IO with the Redis adapter, or `ws`
  with custom pub/sub). With replicas, this needs sticky sessions or a
  strategy that works without them.
- Monorepo layout (suggestion: npm workspaces with `packages/shared`,
  `apps/server`, `apps/web`).
- Redis in the chart: a lean template of its own or a subchart. Redis should
  be switchable off via a value, so that an external Redis can be used.
- Test tooling (suggestion: Vitest for the game logic, Playwright for an
  end-to-end test with two browsers).

## 9. Kubernetes and Helm

- The chart lives in the repo (e.g. `charts/rps-arena`) and deploys the
  server with embedded frontend, Service, Ingress and Redis.
- **Ingress:** Standard Ingress with WebSocket support, host and
  `ingressClassName` via `values.yaml`, TLS via cert-manager annotation
  (optionally switchable).
- Liveness and readiness probes, resource limits with sensible defaults,
  non-root container, read-only root filesystem where possible.
- Multiple replicas must work (see Redis).
- `helm lint` and `helm template` run in CI.

## 10. Release and automation

- **Semantic release** on GitHub Actions on every push/merge to `main`.
- **Release-worthy:** `feat` (minor), `fix` and `perf` (patch), breaking
  changes (major). Dependency updates from Renovate produce a **patch**
  (commit prefix `fix(deps)`). `docs`, `ci`, `chore`, `test`, `refactor`
  produce **no** release.
- A release produces: Git tag, GitHub Release with changelog, container
  image (`ghcr.io/jaydee94/rps-arena:<version>`, multi-arch amd64/arm64) and
  the Helm chart with matching `version` and `appVersion` as an OCI artifact
  in `ghcr.io`.
- **Versioning (my decision):** The first release is `1.0.0` (the
  semantic-release default). The chart version is set only when packaging in
  the pipeline. semantic-release commits **nothing** back to `main`; it only
  sets the tag and the GitHub Release. This way no branch-protection
  exception and no bot token are needed. The `Chart.yaml` in the repo
  carries a placeholder.
- **Merge rule:** Squash merge with a Conventional Commit title. A PR title
  check in CI enforces this.
- **PR CI:** Lint, type check, tests, Docker build (without push), Helm lint.
- **Renovate:** `renovate.json` with grouping of small updates, automerge for
  patch updates when CI is green (my idea, can be switched off), updates for
  npm, Dockerfile, GitHub Actions and the Helm chart. Commit prefix chosen so
  that the release plan in section 10 applies.
- The repo lives at `github.com/Jaydee94/rps-arena`.

## 11. Anti-goals (would be a failure even if it runs technically)

- The client can read out or manipulate the opponent's choice before the
  reveal.
- A pod restart or a second replica breaks running rooms.
- The release process needs manual steps or produces a release for
  docs-only changes.
- Camera images leave the browser.
- The first impression feels like a generic "template" game. The comic look
  must have character.

## 12. Open points for the builder (small decisions)

- Exact gesture sets and order for Wheel 7 and 9.
- Duration of the pick timer, bluff time window, reconnect grace period and
  room TTL.
- Names and behavior of the bot levels in detail.
- Concrete length and shape of the room codes.
- Source of the assets (avatars, SFX, music): self-made or freely licensed.
  Licenses must be documented.
