# Tournament Stage 1: Spectators and People in the Room – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In addition to the players, a room can hold any number of **spectators** (up to `MAX_SPECTATORS`). Anyone who joins a game that has already started watches instead of getting “room full”. Spectators see everything the opponent sees, but never an unchosen gesture.

**Architecture:** The match logic and the four fixed seats (`a0`, `a1`, `b0`, `b1`) stay unchanged. New are a second person type `Spectator` in the room, a second view shape (`SpectatorView`, identical for all spectators, hence one shared socket channel) and a `role` field in `RoomView`. Stage 2 (tournament, see `2026-10-22-tournament-stage2-tournament.md`) builds on it.

**Tech Stack:** TypeScript, Zod, Socket.IO, Redis (room as one JSON document), Svelte 5, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-tournament-mode-design.md` (sections “Goals”, “Anti-goals”, “Constraints from the existing code”, “Stage 1”, “Decisions of the author”). This plan implements stage 1 only. It starts from the state of `feat/comic-panel` (or `main`, once the comic-panel PR is merged), not before.

## Global Constraints

- Gameplay for players stays unchanged (1v1, 2v2, bot, Bluff). The only intended behavior change: a join **after the game has started** becomes a spectator instead of `room_full`. Before the start, a full duel lobby stays full (`room_full`).
- Spectators **never** count as players: not for `isAbandoned`, idle abort (`IDLE_ROUNDS_LIMIT`), the “Weiter” (Next) vote (`applyNext`), forfeit, leaving, or the players' reconnect grace period.
- Secrecy: `PublicMatch` for spectators has `yourPick: null`; no `picks`, no `token` of any person in the network traffic (not even in the raw frame). Views remain explicit allowlists without spread.
- The spectator view is identical for all spectators (it contains no own ID). One shared channel `${code}:spec`.
- `MAX_SPECTATORS = 16` (new in `packages/shared/src/constants.ts`). Beyond that: `room_full`.
- Rooms stored before this change must keep loading: new room fields are **optional** (missing = empty).
- New error code `not_player` (spectator sends a game or host event); DE/EN text; `i18n.test.ts` checks all `ERROR_CODES`.
- All new copy in `de.json` **and** `en.json`. No hex values in components; motion only in `styles/animations.css` (block `prefers-reduced-motion: no-preference`); no inline styles except `style:--x`; comic-panel look (`.panel`, tokens).
- Change existing tests only where this plan explicitly says so.
- Commits are Conventional Commits, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Spectator JSON (state and raw frames) never contains an unchosen gesture, token or `picks` (Task 3, 4, 7).
2. A spectator who disconnects or whose grace period expires changes neither the phase times nor the `deadline` of the players nor the idle abort; their slot is released (Task 2).
3. A spectator rejoins by token after a reload and gets the spectator view again, not “bad_token” (Task 2, 5).
4. A spectator sends `game:pick`, `room:start`, `seat:move`, `game:next`, `room:rematch`: error `not_player`, no state changes (Task 4).
5. A room with expired players is cleaned up (`isAbandoned`) even when spectators are connected; their sockets leave the room (`dropRoom`) (Task 2, 4).

---

### Task 1: Shared types, constant, error code

**Files:**
- Modify: `packages/shared/src/protocol.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/protocol.test.ts`

**Interfaces:**
- Produces in `constants.ts`: `export const MAX_SPECTATORS = 16;`
- Produces in `protocol.ts`:
  - `ERROR_CODES` gets `'not_player'` (a spectator may not do that).
  - `export interface PublicSpectator { id: string; nickname: string; avatar: string; connected: boolean }`
  - `export interface PlayerView { role: 'player'; code: string; config: RoomConfig; you: SeatId; hostSeat: SeatId; isHost: boolean; players: Partial<Record<SeatId, PublicPlayer>>; spectators: PublicSpectator[]; match: PublicMatch | null; deadline: number | null }` (the previous `RoomView` plus `role`, `isHost`, `spectators`).
  - `export interface SpectatorView { role: 'spectator'; code: string; config: RoomConfig; hostSeat: SeatId; isHost: boolean; me: { id: string } | null; players: Partial<Record<SeatId, PublicPlayer>>; spectators: PublicSpectator[]; match: PublicMatch | null; deadline: number | null }` (without `you`; `match.yourPick` is always `null`). In stage 1 `isHost` is always `false` and `me` always `null`; stage 2 fills both for tournament participants who are not currently playing.
  - `export type RoomView = PlayerView | SpectatorView;`
  - `RoomJoined` becomes `{ code: string; token: string; role: 'player' | 'spectator'; seat: SeatId | null }` (`seat` is `null` for spectators).

- [ ] **Step 1: Failing tests** in `protocol.test.ts`: `ERROR_CODES` contains `not_player`; `MAX_SPECTATORS` is `16`; type test via `satisfies` assignment that a `PlayerView` literal requires `role: 'player'` and a `SpectatorView` literal has no `you` (compile-time, via `// @ts-expect-error`). The existing test that pins `RoomJoined` to exactly `{code, seat, token}` (`protocol.test.ts:134-137`) is adjusted to `{code, token, role, seat}` (the only permitted change to an existing test here).
- [ ] **Step 2:** `npx vitest run packages/shared` → FAIL.
- [ ] **Step 3:** Create the types and constant as above; replace `RoomView` and `RoomJoined`. Deliberately ignore follow-up errors in `apps/server` and `apps/web` (typecheck), they are fixed in Tasks 2–5; Task 1 commits only `packages/shared`, and `npx vitest run packages/shared` and `npm run typecheck -w @rps/shared` are green.
- [ ] **Step 4: Commit** `feat(shared): add spectator role, views and error code`.

### Task 2: Server room model and engine

**Files:**
- Modify: `apps/server/src/room.ts`, `engine.ts`, `settle.ts`
- Test: `apps/server/src/engine.test.ts` (additions only; two existing cases are adjusted, see Step 1), `settle` tests if present

**Interfaces:**
- Consumes: `MAX_SPECTATORS`, `PublicSpectator` (Task 1).
- Produces in `room.ts`:
  - `export type Spectator = PublicSpectator & { token: string; socketId: string | null; disconnectedAt: number | null };`
  - `Room.spectators?: Spectator[]` (optional; missing = `[]`). Helper function `spectatorsOf(room: Room): Spectator[]`.
- Produces in `engine.ts`:
  - `export type Who = { role: 'player'; seat: SeatId } | { role: 'spectator'; id: string };`
  - `joinRoom(room, nickname, avatar, now, socketId?)` now returns `{ room: Room; who: Who }`. Rule: `room.match === null` → as before seat or `room_full`; `room.match !== null` (running or finished) → spectator, `room_full` from `MAX_SPECTATORS` on. The spectator ID is 8 hex characters (`randomBytes(4)`), token 128 bit as for players.
  - `whoOfSocket(room: Room, socketId: string): Who | null` (complements `seatOfSocket`, which stays unchanged).
  - `markSpectatorDisconnected(room, id, now): Room`, `markSpectatorConnected(room, id, now, socketId): Room`, `leaveSpectator(room, id): Room`.
  - `rejoinRoom(room, token, now, socketId)` returns `{ room; who: Who; previousSocketId: string | null }`; a spectator token is found like a player token (compared in constant time); expired grace period → `bad_token`.
  - `tick`: removes spectators whose reconnect grace period (`RECONNECT_GRACE_MS`) has expired; this is the **only** effect spectators have on the ticker.
- Produces in `settle.ts`: `schedule` includes the spectators' grace period ends in `deadline` (only for waking up), never in `phaseDeadline`. `humans`, `isAbandoned`, `graceEnd` remain **players only**.

- [ ] **Step 1: Failing tests** (`engine.test.ts`, fixed times/`rng`): (a) join into a duel **before** the start with occupied seats → `room_full` (unchanged); (b) join **after** `startMatch` → `who.role === 'spectator'`, the room has one spectator, `room.match` unchanged (`toBe`); (c) also after a finished match → spectator; (d) 17th spectator → `room_full`; (e) spectator connected, all players gone and grace period expired → `isAbandoned` is `true`; (f) a spectator who disconnects/comes back/exceeds the grace period does not change `phaseDeadline`, `idleRounds`, `nextReady`, `match` (`toEqual` on these fields) and is removed from `spectators` when the grace period expires; (g) `applyNext` does not count spectators as voters; (h) `rejoinRoom` with a spectator token → `who.role === 'spectator'`, with an expired grace period → `bad_token`; (i) `rematch` leaves spectators unchanged; (j) older stored rooms without a `spectators` field work (`joinRoom`, `tick`). **Existing cases** that expect `room_full` for a join after the start or the old return shape of `joinRoom` (`{room, seat}`) are adjusted to the new shape/rule and listed in the report.
- [ ] **Step 2:** `npx vitest run apps/server/src/engine.test.ts` → FAIL.
- [ ] **Step 3:** Implement according to the interfaces. Note: `joinRoom` stays pure (takes `now`, `socketId`).
- [ ] **Step 4:** `npx vitest run apps/server` green (gateway tests that still use the old shape are Task 4; until then **only** those may be red and must be named in the report).
- [ ] **Step 5: Commit** `feat(server): add spectators to the room model and engine`.

### Task 3: Views

**Files:**
- Modify: `apps/server/src/view.ts`, `apps/server/src/store.contract.ts` (fixture `makeRoom`)
- Test: `apps/server/src/view.test.ts`

**Interfaces:**
- Consumes: `Spectator`, `spectatorsOf` (Task 2), `PlayerView`, `SpectatorView` (Task 1).
- Produces: `viewFor(room: Room, seat: SeatId): PlayerView` (now with `role: 'player'`, `isHost: seat === room.hostSeat`, `spectators: PublicSpectator[]`) and `spectatorViewFor(room: Room): SpectatorView` (explicit allowlist; `match.yourPick` is `null`; `isHost: false`, `me: null`; no tokens).

- [ ] **Step 1: Failing tests:** `spectatorViewFor` on a room in a running pick phase with picks set on both sides: `JSON.stringify(view)` contains neither the gesture names of the picks nor any token (players and spectators), `Object.keys(view.match)` contains no `picks`; `lockedSeats` is present; after the reveal `lastRound` contains the gestures; `yourPick` is `null`. `viewFor` contains `role: 'player'`, `isHost` and the spectator list (only `id`, `nickname`, `avatar`, `connected`). The existing `toEqual` on the whole player view (`view.test.ts:124`) is extended by the three new fields (the only permitted change).
- [ ] **Step 2:** Tests → FAIL. **Step 3:** Implement. **Step 4:** `npx vitest run apps/server/src/view.test.ts` green.
- [ ] **Step 5: Commit** `feat(server): add the spectator view and role fields`.

### Task 4: Gateway

**Files:**
- Modify: `apps/server/src/gateway.ts`
- Test: `apps/server/src/gateway.test.ts` (existing `room_full` cases after the start, see Step 1), `http.test.ts` untouched if possible

**Interfaces:**
- Consumes: `joinRoom`/`rejoinRoom` → `Who`, `whoOfSocket`, `markSpectatorDisconnected` (Task 2), `viewFor`, `spectatorViewFor` (Task 3).
- Produces: `export const spectatorChannel = (code: string) => `${code}:spec``. For spectators, `bind` joins the room channel `code` and `spectatorChannel(code)` and sends `room:joined { code, token, role: 'spectator', seat: null }`. `broadcast` sends each player seat its `viewFor` and **once** `spectatorViewFor` on `spectatorChannel`. `dropRoom` also releases `spectatorChannel`. `release()` distinguishes via `whoOfSocket` between players (as before `markDisconnected`) and spectators (`markSpectatorDisconnected`). Game and host events (`room:start`, `seat:move`, `game:announce`, `game:pick`, `game:next`, `room:rematch`) from a spectator socket → `room:error { code: 'not_player' }`, the state does not change (`asSeat` checks `whoOfSocket`).

- [ ] **Step 1: Failing tests:** (a) game running, a third client joins via `room:join` → gets `room:joined` with `role: 'spectator'`, `seat: null`, and afterwards `room:state` with `role: 'spectator'`; (b) player views stay unchanged (only additional fields); (c) spectator sends `game:pick`/`room:start`/`seat:move`/`game:next`/`room:rematch` → `not_player` each time, no `room:state` broadcast with changed content; (d) **secrecy in the raw traffic:** player A picks `rock`; all frames the spectator socket receives until the reveal contain neither `rock` nor the token of A or B (pattern of the existing E2E test “secrecy”); after the reveal `lastRound` contains both gestures; (e) spectator disconnects → players receive no state with a changed phase; `room:rejoin` with the spectator token → `role: 'spectator'` again; (f) room is cleaned up (ticker/`dropRoom`): the spectator socket leaves `spectatorChannel`. **Existing** `gateway.test.ts` cases (`:167-199`) “room_full after start” are adjusted (a new join = spectator; `room_full` only at 17 spectators) and listed in the report.
- [ ] **Step 2:** → FAIL. **Step 3:** Implement. **Step 4:** `npx vitest run apps/server` fully green, `npm run typecheck -w @rps/server` green.
- [ ] **Step 5: Commit** `feat(server): let late joiners watch as spectators`.

### Task 5: Web data layer

**Files:**
- Modify: `apps/web/src/lib/connection.ts`, `lib/seats.ts`, `lib/sfx-bridge.ts`, `lib/demo.ts`, `App.svelte`, `test/fixtures.ts`, `test/connection-mock.ts`, all components that use the `RoomView` type as a player view (`BoardView`, `Board`, `Lobby`, `Result`, `Scoreboard` callers, etc.)
- Test: `lib/seats.test.ts`, `lib/sfx-bridge.test.ts`, `App.routing.test.ts` (additions only), `lib/connection.test.ts`

**Interfaces:**
- Consumes: `PlayerView`, `SpectatorView`, `RoomView`, `RoomJoined` (Task 1).
- Produces in `connection.ts`: the store `room: Readable<RoomView | null>` stays; new are `playerRoom: Readable<PlayerView | null>` and `spectatorRoom: Readable<SpectatorView | null>` (derived via `role`). The session (`rps.session`) stays `{code, token}`; `room:joined` for spectators stores it the same way.
- `seats.ts`: `isHost(room: PlayerView | SpectatorView): boolean` reads `room.isHost` (instead of `you === hostSeat`); `canStart` stays for `PlayerView`.
- `sfx-bridge.ts`: `diffRoomSounds(prev, next)` uses `next.you` only for `role === 'player'`; for spectators it yields at most `reveal` (phase change to `reveal`) and never `lock`/`win`/`lose`/`draw`.
- `App.svelte`: new screen `'spectate'` for `role === 'spectator'` (component follows in Task 6; until then a placeholder `<Spectate />` import that is created in Task 6, please create it in Task 6 and only prepare the branch here).
- `test/fixtures.ts`: `makeRoom` produces `PlayerView` with `role: 'player'`, `isHost`, `spectators: []`; new `makeSpectatorRoom(overrides)`.

- [ ] **Step 1: Failing tests:** `seats.test.ts`: `isHost` follows `room.isHost`; `sfx-bridge.test.ts`: spectator transition `pick → reveal` yields only `['reveal']` (and with `prev === null` `[]`); `connection.test.ts`: state with `role: 'spectator'` fills `spectatorRoom` and empties `playerRoom`; `App.routing.test.ts`: state `spectator` selects the screen `spectate`, players as before. **All existing web tests stay unchanged and green** (the fixture supplies the new fields).
- [ ] **Step 2:** → FAIL. **Step 3:** implement; `npm run typecheck -w @rps/web` is only fully green after Task 6 (`Spectate` is missing), until then only `npx vitest run apps/web`.
- [ ] **Step 4:** `npx vitest run apps/web` green. **Step 5: Commit** `feat(web): route and type the spectator role`.

### Task 6: Spectator screen, hints, copy

**Files:**
- Create: `apps/web/src/components/Spectate.svelte`, `Spectate.test.ts`, `RevealPanel.svelte` (extracted from `BoardView`), `SpectatorBadge.svelte`
- Modify: `components/BoardView.svelte` (reveal branch uses `RevealPanel`, behavior unchanged), `Lobby.svelte` and `BoardView.svelte` (badge “n spectators”), `lib/locales/de.json`, `en.json`, `components/ErrorBanner.svelte` if error texts are mapped there, `styles/animations.css` only if necessary
- Test: `Board.test.ts` stays unchanged and green

**Interfaces:**
- `RevealPanel.svelte`: props `{ duels: DuelView[]; labels…; burst… }` – the presentation of the reveal view from `BoardView` (panel, sticker, burst, speed lines), without status sentence, “Weiter” (Next) button and countdown. `Spectate` and `BoardView` use it. `[data-testid="duel"]` and the `aria-label` regions are preserved.
- `Spectate.svelte`: reads `spectatorRoom`; shows header band “Du schaust zu” (“You are watching”, `spectate.banner`), `Scoreboard` (both players, without “Du” (You)), `TimerBar`, status sentence as `role="status"` (e.g. “A is thinking …”, “B has locked in”, then the result), the two players as name tags, in the reveal the `RevealPanel`, at `phase === 'finished'` a closing box (“Match beendet” (Match finished), winner) and “Zurück zum Start” (Back to start) (`forgetSession()` + reload like `Result`). No gesture pad, no camera, no “Weiter” (Next).
- New keys DE/EN: `spectate.banner`, `spectate.waiting_pick` (`{name}`), `spectate.locked` (`{name}`), `spectate.finished` (`{name}`), `spectate.count` (`{n}`; plural “1 Zuschauer”/“n Zuschauer”, i.e. “1 spectator”/“n spectators”), `error.not_player`.
- `SpectatorBadge.svelte`: props `{ spectators: PublicSpectator[] }`, shows count and names as tooltip text (`title` + visible counter), nothing at 0.

- [ ] **Step 1: Failing tests** (`Spectate.test.ts`, `makeSpectatorRoom`): pick phase with `lockedSeats: ['b0']` shows “… hat gewählt” (“… has locked in”) for the opponent and “… überlegt …” (“… is thinking …”) for the other, **no** gesture; reveal shows both gestures, `[data-testid="duel"]` and the result; no “Weiter” (Next) button, no `radio` role; `finished` shows the winner and “Zurück zum Start” (Back to start); `SpectatorBadge` shows “2 Zuschauer” (“2 spectators”) with two. `Board.test.ts`/lobby tests stay green unchanged (regression for the extraction into `RevealPanel`).
- [ ] **Step 2:** → FAIL. **Step 3:** implement; check Svelte messages about missing texts via `npm run typecheck -w @rps/web` and `i18n.test.ts` (parity, `ERROR_CODES`).
- [ ] **Step 4:** `npx vitest run apps/web`, `npm run lint`, `npm run typecheck` green. Real layout check (jsdom sees no layout): start the Vite dev server of `apps/web` on a free port (`cd apps/web && npx vite --port <p>`), with headless Chromium via Playwright (no shared browser tool) open `?demo=spectate` (new demo state in `lib/demo.ts`) at 360/1280 px, light/dark, without horizontal overflow, look at the screenshots.
- [ ] **Step 5: Commit** `feat(web): add the spectator screen and spectator badge`.

### Task 7: End-to-end and docs

**Files:**
- Modify: `e2e/game.spec.ts`, `e2e/helpers/app.ts`, `README.md` (section protocol/rooms)

- [ ] **Step 1:** New test in `game.spec.ts`: A and B play a duel, C opens `?room=<code>` and joins → C sees the spectator screen (banner “You are watching”), the names of A and B, but **no** gesture; after the reveal C sees both gestures; C is shown in the player view as “1 spectator”; C's raw frames contain neither the chosen gesture nor a token before the reveal (pattern of the existing secrecy test); C reloads and stays a spectator. Second test: joining a full duel **before** the start still yields `room_full`.
- [ ] **Step 2:** README: spectator role, `MAX_SPECTATORS`, channel model in one short paragraph.
- [ ] **Step 3:** Full run `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run e2e`: all green.
- [ ] **Step 4: Commit** `test(e2e): cover spectators joining a running duel`.

## Self-Review

- **Spec coverage:** spectator role in all rooms (T2/T4/T6), join after start (T2), identical secrecy-safe spectator view (T3), not counting as players (T2), rejoin by token (T2/T4/T5), “room full” before the start (T2/T7), copy DE/EN (T6), participant identity for stage 2 is prepared via `Who` and `isHost`. **Not** in stage 1: host change to spectators, taking a seat from the spectator role, tournament.
- **Type consistency:** `Who`, `Spectator`, `spectatorsOf`, `whoOfSocket`, `spectatorChannel`, `spectatorViewFor`, `PlayerView`, `SpectatorView`, `PublicSpectator`, `RoomJoined { role, seat: SeatId | null }`, `MAX_SPECTATORS` are named identically in Tasks 1–6.
- **Proportion:** the plan contains signatures and test cases, no function bodies.
