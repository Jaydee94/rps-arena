# Tournament Stage 2: Knockout Bracket and Round-Robin – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4 to 8 players in one room play a tournament (knockout bracket or round-robin), with a random draw, best-of-3 matches running one after another, live spectating, automatic transition, bracket/table and award ceremony.

**Architecture:** A **pure tournament logic** in `packages/shared` (draw, pairings, results, table, tie-break, podium) without time and IO. Per room the server holds a `tournament` (participants, state, phase, deadlines) and **projects the current pairing onto the seats `a0`/`b0`**, so that the existing match engine plays a match unchanged; result → tournament logic → intermission → next pairing. All other participants and spectators watch the running match through the spectator infrastructure from stage 1.

**Tech Stack:** TypeScript, Zod, Socket.IO, Redis, Svelte 5, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-tournament-mode-design.md`. **Prerequisite:** Stage 1 (`2026-10-22-tournament-stage1-spectators.md`) is implemented and merged: `Spectator`, `Who`, `whoOfSocket`, `spectatorChannel`, `spectatorViewFor`, `PlayerView`/`SpectatorView` (with `isHost`, `me`), `MAX_SPECTATORS`.

## Global Constraints

- 4 to 8 participants (`TOURNAMENT_MIN_PLAYERS = 4`, `TOURNAMENT_MAX_PLAYERS = 8`). The host is a participant. If the lobby is full (8) or the tournament has started, further joiners become **spectators** (stage 1).
- Gesture mode: one for the tournament, from `classic`, `lizard-spock`, `wheel7`, `wheel9`, `wheel15` (not `bluff`, not `team2v2`; otherwise `invalid_input`). Every match is **best of 3**, except tie-break matches (**best of 1**).
- No bots, no parallel matches. Matches run one after another. After every match: intermission `INTERMISSION_MS = 6_000` with bracket/table, then the next one automatically; the host can skip the intermission (and the draw animation, `DRAW_MS = 3_000`) (`tournament:skip`).
- Rules: knockout bracket with byes (no pairing of two byes), winner advances, loser becomes a spectator. Round-robin: table ranked by matches won, ties first resolved via the head-to-head record **only among the tied players** (mini-table), tie-break match (best of 1) **only for 1st place**; with more than two involved a tie-break round-robin among them, at most `TIEBREAK_MAX_ROUNDS = 2` repetitions, then a coin flip. Places behind remain shared. Podium up to 3rd place (knockout: both semifinal losers share 3rd place).
- Match without a winner (idle abort, both gone at the same time): knockout: more rounds won wins, otherwise **coin flip** (visible, `decidedBy: 'coin'`, testable with injected randomness); round-robin: **lost for both**.
- Reconnect grace period (`RECONNECT_GRACE_MS`, 30 s) runs per person from the moment their match is called up or they drop out during the match, not between matches. Eliminated players and spectators have no grace period. Intermission and the following match never wait for absent people. After that, forfeit; later pairings of this person are automatically counted as lost.
- Host change only to connected **participants** (join order, not spectators); no connected participants left → tournament ends, room cleans itself up.
- “Nochmal” (Rematch) (host only): back to the lobby; all currently connected people (participants first, then spectators, in join order) are participants up to 8, the rest stays spectators; new draw with the start.
- Randomness only via an injected `rng: () => number` (draw, coin flip); tests run with fixed randomness.
- Secrecy as in stage 1 (no unchosen gesture, no token in the network traffic).
- New room fields optional (older stored rooms keep loading); the room stays **one** JSON document (mind the size: pairings are small, do not store histories).
- All copy in DE and EN; comic-panel look; motion only in `animations.css` (`prefers-reduced-motion: no-preference`), the draw is omitted under reduced motion (result immediately); no inline styles except `style:--x`; no hex values.
- Change existing tests only where the plan explicitly says so. Commits are Conventional Commits, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Randomness: the draw covers every participant count 4–8; no bye pair; every participant exactly once in round 1; reproducible with a fixed `rng` (Task 1).
2. Round-robin with a three-way cycle (A beats B, B beats C, C beats A), shared places behind 1st place, tie-break repetition and coin-flip fallback (Task 1).
3. Intermission transition and draw as **deadlines in the room** (`deadline`), so that the ticker of every replica fires them; two replicas must not start the next match twice (`tick` stays idempotent) (Task 3b).
4. A participant disconnects during the intermission, then their match is called up: the grace period only starts then, forfeit after 30 s, opponent advances, the tournament never freezes (Task 3b).
5. Spectators and waiting participants never see an unchosen gesture of the running match (Task 4, 7).

## Order and parallelism

Task 1 (pure, shared) and Task 2 (types) are independent of each other and run in parallel. Task 3a uses both. Task 3b follows 3a. Task 4 follows 3b. Task 5 may run in parallel with 3a–4 after Task 2, using the demo/mock data; Task 6 follows Task 5; Task 7 last.

---

### Task 1: Pure tournament logic

**Files:**
- Create: `packages/shared/src/tournament.ts`, `packages/shared/src/tournament.test.ts`
- Modify: `packages/shared/src/constants.ts`, `packages/shared/src/index.ts` (export)

**Interfaces:**
- Produces in `constants.ts`: `TOURNAMENT_MIN_PLAYERS = 4`, `TOURNAMENT_MAX_PLAYERS = 8`, `DRAW_MS = 3_000`, `INTERMISSION_MS = 6_000`, `TIEBREAK_MAX_ROUNDS = 2`.
- Produces in `tournament.ts` (all pure, without time, without IO; `Rng = () => number`):
  - `type TournamentFormat = 'knockout' | 'roundrobin'`
  - `interface MatchOutcome { winner: 'a' | 'b' | null; score: { a: number; b: number }; forfeit: 'a' | 'b' | 'both' | null }`
  - `interface PairingResult { winner: string | null; score: { a: number; b: number } | null; decidedBy: 'match' | 'forfeit' | 'coin' | 'bye' | 'none' }`
  - `interface Pairing { id: string; round: number; a: string | null; b: string | null; bestOf: 1 | 3; tiebreak: boolean; result: PairingResult | null }` (`null` = bye slot; `a`/`b` are participant IDs).
  - `interface TournamentState { format: TournamentFormat; participants: string[]; pairings: Pairing[]; forfeited: string[]; tiebreakRounds: number; coinWinner: string | null }`
  - `createTournament(format: TournamentFormat, participantIds: string[], rng: Rng): TournamentState` (draws; throws for fewer than 4 or more than 8 or duplicate IDs; byes in the knockout bracket are resolved immediately as `decidedBy: 'bye'`)
  - `nextPairing(state: TournamentState): Pairing | null` (first undecided pairing in order that has two real participants and in which no one involved is eliminated/forfeited; pairings with forfeited participants are decided automatically beforehand; **does not return the state**, so resolving belongs in `settleAutomatic(state, rng): TournamentState`)
  - `settleAutomatic(state: TournamentState, rng: Rng): TournamentState` (decides all pairings with a bye or forfeited participants, creates the next round in the knockout bracket, adds necessary tie-break matches in round-robin)
  - `recordResult(state: TournamentState, pairingId: string, outcome: MatchOutcome, rng: Rng): TournamentState` (rules from the Global Constraints incl. no winner/coin flip; calls `settleAutomatic` afterwards)
  - `markForfeited(state: TournamentState, participantId: string, rng: Rng): TournamentState`
  - `isFinished(state: TournamentState): boolean`
  - `interface StandingRow { participantId: string; played: number; wins: number; losses: number; roundsWon: number; roundsLost: number; rank: number }`; `standings(state: TournamentState): StandingRow[]` (sorted by rank, equal ranks share the number)
  - `podium(state: TournamentState): { rank: 1 | 2 | 3; ids: string[] }[]` (only places that are settled; complete after `isFinished`)

- [ ] **Step 1: Failing tests** (`tournament.test.ts`, fixed `rng` via a small helper): (a) `createTournament('knockout', n ∈ 4..8)`: every ID exactly once in round 1, number of byes = next power of two minus n, no pair of two byes, bye pairings are `decidedBy: 'bye'`, no byes for 4 and 8; same `rng` → same draw; (b) knockout 4 players: results of round 1 → round 2 (final) is created with the winners in pairing order; final decided → `isFinished`, `podium` = 1st place winner, 2nd place final loser, 3rd place both semifinal losers shared; (c) knockout 5 to 8: byes advance without a game, `nextPairing` never returns a bye pairing; (d) `recordResult` with `winner: null` in the knockout bracket: more rounds won wins (`score`), on a tie coin flip (`rng() < 0.5` → `a`), `decidedBy: 'coin'`; round-robin: `decidedBy: 'none'`, both without a win; (e) round-robin 4 and 5 players: every pairing exactly once, no participant twice in the same `round`; table by wins; (f) tie: two players level on 1st place → tie-break match (`tiebreak: true`, `bestOf: 1`) is created, after its result 1st place is settled; three-way cycle (4 players A, B, C, D: A beats B, B beats C, C beats A, and all three beat D, so A, B and C each have 2 wins and the head-to-head mini-table among them resolves nothing, each has 1 win and 1 loss) → tie-break round-robin among the three, after `TIEBREAK_MAX_ROUNDS` repetitions without a decision `coinWinner` decides; a partially resolved group is split before the tie-break match; a tie for 2nd place creates **no** tie-break match, the rank stays shared; (g) `markForfeited` of a participant: their open pairings are automatically lost (`decidedBy: 'forfeit'`), in the knockout bracket the opponent advances; if both involved are forfeited, no winner results and the opponent of the next round gets a bye; (h) all functions are pure (input is not mutated: `structuredClone` comparison).
- [ ] **Step 2:** `npx vitest run packages/shared/src/tournament.test.ts` → FAIL.
- [ ] **Step 3:** Implement (Fisher-Yates with `rng`, circle method for round-robin; the pairing order is the playing order). Per signature only what is necessary, no helper exports besides the named ones.
- [ ] **Step 4:** Tests → PASS; `npm run typecheck -w @rps/shared`.
- [ ] **Step 5: Commit** `feat(shared): add pure tournament logic`.

### Task 2: Protocol and types

**Files:**
- Modify: `packages/shared/src/protocol.ts`, `match.ts` (`bestOf`), `protocol.test.ts`, `match.test.ts`

**Interfaces:**
- `RoomConfig.bestOf: 1 | 3 | 5 | 7` (type only; the Zod schema `configSchema` for `room:create` stays `3 | 5 | 7`, `1` is only internal for tie-break matches). `scoreWinner` already calculates correctly with `ceil(bestOf/2)` (add a test).
- `ClientEvents['room:create']` gets `tournament: z.object({ format: z.enum(['knockout','roundrobin']) }).optional()`; `ClientEvents['tournament:skip'] = emptySchema`.
- `ERROR_CODES += 'not_enough_players'`.
- `interface PublicParticipant { id: string; nickname: string; avatar: string; connected: boolean; forfeited: boolean }`
- `interface PublicPairing { id: string; round: number; a: string | null; b: string | null; bestOf: 1 | 3; tiebreak: boolean; winner: string | null; decidedBy: PairingResult['decidedBy'] | null; score: { a: number; b: number } | null }`
- `interface PublicTournament { format: TournamentFormat; phase: 'lobby' | 'draw' | 'match' | 'intermission' | 'finished'; participants: PublicParticipant[]; pairings: PublicPairing[]; currentPairingId: string | null; standings: StandingRow[]; podium: { rank: 1 | 2 | 3; ids: string[] }[]; youId: string | null; untilMs: number | null }` (`untilMs` = end of draw or intermission).
- `PlayerView` and `SpectatorView` get `tournament: PublicTournament | null`.

- [ ] **Step 1: Failing tests:** `room:create` accepts `tournament: { format: 'knockout' }` and rejects other formats; `tournament:skip` has an empty schema; `ERROR_CODES` contains `not_enough_players`; `scoreWinner` with `bestOf: 1` decides after one won round; a `PlayerView` literal without `tournament` is a type error (`@ts-expect-error`). Ignore follow-up errors in server/web (Tasks 3–6), commit only `packages/shared`.
- [ ] **Step 2:** → FAIL. **Step 3:** implement. **Step 4:** `npx vitest run packages/shared` green. **Step 5: Commit** `feat(shared): add tournament protocol types`.

### Task 3a: Server – tournament room, start, match projection, intermission

**Files:**
- Create: `apps/server/src/tournament.ts`, `apps/server/src/tournament.test.ts`
- Modify: `apps/server/src/room.ts`, `engine.ts`, `settle.ts`

**Interfaces:**
- Consumes: Task 1/2, stage 1 (`Spectator`, `Who`).
- Produces in `room.ts`: `export type Participant = Spectator;` and `export interface TournamentRoom { hostId: string; participants: Participant[]; state: TournamentState | null; phase: 'lobby' | 'draw' | 'match' | 'intermission' | 'finished'; currentPairingId: string | null; untilMs: number | null }`; `Room.tournament?: TournamentRoom`.
- Produces in `tournament.ts` (pure, `Room` in/out):
  - `createTournamentRoom(input: { config: RoomConfig; format: TournamentFormat; nickname: string; avatar: string; socketId?: string | null; code?: string }, now: number, rng?: Rng): Room` (host is a participant; `players` empty; `hostSeat` stays `'a0'` without meaning, `isHost` in views comes from `tournament.hostId`; rejects `bluff`/`team2v2` and `bestOf !== 3` with `invalid_input`)
  - `joinTournamentRoom(room, nickname, avatar, now, socketId?): { room: Room; who: TournamentWho }` with `type TournamentWho = Who | { role: 'participant'; id: string }`: lobby and `participants.length < TOURNAMENT_MAX_PLAYERS` → participant, otherwise spectator (stage 1)
  - `startTournament(room, byId: string, now: number, rng: Rng): Room` (host only, otherwise `not_host`; fewer than `TOURNAMENT_MIN_PLAYERS` → `not_enough_players`; only in the lobby, otherwise `wrong_phase`) → phase `draw`, `untilMs = now + DRAW_MS`, `state = createTournament(...)`
  - `skipTournamentWait(room, byId, now, rng): Room` (host only; ends the draw or intermission immediately)
  - `advanceTournament(room: Room, now: number, rng: Rng): Room` (draw/intermission expired → next pairing via `nextPairing`; none → phase `finished`)
  - `projectPairing(room, pairing): Room` (sets `players = { a0: player of pairing.a, b0: player of pairing.b }` from the `participants` — same tokens, `socketId`, `connected` —, `match = createMatch(config with pairing.bestOf)`, `phase = 'match'`, `phaseDeadline` via `settle`)
  - `finishPairing(room, now, rng): Room` (if `match.phase === 'finished'`: build `MatchOutcome` from `match.winner`/`score`/`forfeited`, `recordResult`, phase `intermission`, `untilMs = now + INTERMISSION_MS`; if it was the last pairing: `finished`)
- In `settle.ts`: after `drawGuard` a step that calls `finishPairing` when `room.tournament?.phase === 'match'` and the match is finished; `schedule` includes `tournament.untilMs` in `deadline` (only as wake-up time); `tick` calls `advanceTournament` when `untilMs` is due.
- The **single source of truth** for people in the tournament is `participants`; `players` (a0/b0) must be re-derived from `participants` after every operation (`syncPairing`), so that connecting/disconnecting is correct in both places.

- [ ] **Step 1: Failing tests** (`tournament.test.ts`, fixed `rng`/time): create → lobby with the host as a participant; 7 more join, the 9th becomes a spectator; start with 3 → `not_enough_players`, by a non-host → `not_host`, with 4 → phase `draw`; after `DRAW_MS` (`advanceTournament`) pairing 1 runs: `players.a0/b0` are the two participants, `match.phase` is `pick`; two matches played to the end (via the existing `applyPick`) → after match 1 phase `intermission` with `untilMs = now + INTERMISSION_MS`, after expiry pairing 2; `skipTournamentWait` starts immediately; last pairing finished → phase `finished`, `podium` filled; match without a winner (idle abort) in the knockout bracket → coin flip with fixed `rng`; `applyPick`/`applyNext` behave in a tournament room as in a duel; existing duel tests run unchanged.
- [ ] **Step 2:** → FAIL. **Step 3:** implement. **Step 4:** `npx vitest run apps/server` green.
- [ ] **Step 5: Commit** `feat(server): run tournament matches through the existing engine`.

### Task 3b: Server – grace period, forfeit, host change, rematch

**Files:**
- Modify: `apps/server/src/tournament.ts`, `engine.ts`, `settle.ts`, `tournament.test.ts`

**Interfaces:**
- Produces: `markParticipantDisconnected(room, id, now): Room`, `markParticipantConnected(room, id, now, socketId): Room`, `leaveParticipant(room, id, now, rng): Room` (forfeit: in a running match `forfeitSeat`, otherwise `markForfeited`; host change), `tournamentRematch(room, byId, now, rng): Room`, `rejoinTournament(room, token, now, socketId): { room; who: TournamentWho; previousSocketId: string | null }`.
- Rules: a participant's 30-s grace period starts at `max(disconnectedAt, time at which their pairing was called up)`; if they are not connected at call-up, it runs from then; intermission and draw never wait. After expiry: forfeit (opponent advances; match ends via `drawGuard`). A forfeiter who comes back is treated as a spectator. Host change to the next connected, non-forfeited participant; if there is none: tournament `finished`, `isAbandoned` applies. `tournamentRematch` (host only, only in `finished`) → lobby with the participants/spectators per the plan rule, `state = null`.

- [ ] **Step 1: Failing tests:** (a) a participant disconnects during the intermission and is gone when their match is called up: the grace period starts only at call-up, after 30 s forfeit, opponent advances, next intermission follows; (b) a participant disconnects 20 s before their call-up and comes back: no forfeit; (c) forfeit in a running match ends it immediately and counts as a win for the opponent; (d) round-robin: later pairings of a forfeiter are automatically lost; (e) host forfeits → next participant is host; no participant left → `finished`; (f) rejoin by token (participant, spectator, forfeiter→spectator); (g) `tournamentRematch` only host in `finished`; lobby contains connected people per the plan rule, max. 8; (h) `tick` is idempotent (twice with the same `now` changes nothing after the first run); rooms without `tournament` do not change.
- [ ] **Step 2–4:** FAIL → implement → `npx vitest run apps/server` green.
- [ ] **Step 5: Commit** `feat(server): handle absence, forfeits, host changes and rematch in tournaments`.

### Task 4: Views and gateway

**Files:**
- Modify: `apps/server/src/view.ts`, `gateway.ts`, `view.test.ts`, `gateway.test.ts`

**Interfaces:**
- `tournamentViewFor(room: Room, forId: string | null): PublicTournament` (participants without tokens; `standings`/`podium` from Task 1; `youId`).
- `viewFor` (players of the current pairing): `PlayerView` with `tournament` and `isHost = (hostId === their participant ID)`. Waiting participants receive their **own** `SpectatorView` (`me: { id }`, `isHost`, `tournament`) on a person channel `${code}:p:${id}`; pure spectators still get the shared view on `spectatorChannel` (`me: null`, `isHost: false`, `tournament` with `youId: null`).
- Gateway: `room:create` with `tournament` calls `createTournamentRoom`; `room:join` in tournament rooms calls `joinTournamentRoom`; `room:start` → `startTournament`, `room:rematch` → `tournamentRematch`, new `tournament:skip` → `skipTournamentWait` (all host only); `game:*` only for members of the current pairing, otherwise `not_player`; `seat:move` in tournament rooms `invalid_input`; channel switch on pairing change (participant switches between person channel and seat channel) before the broadcast, analogous to `seat:move`; `dropRoom` also clears person channels (all participant IDs are known).

- [ ] **Step 1: Failing tests:** `view.test.ts`: spectator/waiting JSON contains neither gestures nor tokens during the pick phase; `tournament` contains no tokens; winner/podium after the end. `gateway.test.ts` (with real Socket.IO clients, four participants): create tournament, three join, start, draw, play the first pairing; the two non-involved receive `role: 'spectator'` views with `me`; raw frames of the waiting contain no gesture before the reveal; after the match intermission, then second match; non-host `room:start`/`tournament:skip` → `not_host`; waiting participant sends `game:pick` → `not_player`; knockout final finished → `finished` with podium; `room:rematch` → lobby.
- [ ] **Step 2–4:** FAIL → implement → `npx vitest run apps/server`, `npm run typecheck -w @rps/server` green.
- [ ] **Step 5: Commit** `feat(server): serve tournament views and events`.

### Task 5: Web – create, lobby, routing

**Files:**
- Modify: `apps/web/src/components/CreatePanel.svelte`, `Home.svelte` (only if needed), `App.svelte`, `lib/connection.ts`, `lib/seats.ts`, `lib/demo.ts`, `lib/locales/de.json`, `en.json`, `test/fixtures.ts`
- Create: `components/TournamentLobby.svelte` (+ test), `components/TournamentFormatPicker.svelte`

**Interfaces:**
- `CreatePanel`: new “Turnier” (Tournament) switch (native `checkbox` in switch style); on: the mode picker offers only `classic`, `lizard-spock`, `wheel7/9/15` (no Bluff/2v2), best-of is dropped (fixed 3), new radio group “Format” (`knockout`/`roundrobin`), bot option disappears; payload `tournament: { format }`.
- `connection.ts`: `skipWait = () => send('tournament:skip', {})`.
- `App.svelte`: screen choice takes `room.tournament?.phase` into account — `lobby` → `TournamentLobby`, `draw` → draw (Task 6), `match` → players `Board` / otherwise `Spectate` (with tournament header, Task 6), `intermission` → bracket/table (Task 6), `finished` → award ceremony (Task 6).
- `TournamentLobby.svelte`: participant list (avatars, names, “Host” badge, connection status), show format and mode, counter “n / 8”, host: “Turnier starten” (Start tournament) (disabled below 4, hint `tournament.need_players`), invite/code copy row (`CopyRow`), spectator note. No seats, no `SeatSlot`.
- New keys DE/EN: `tournament.title`, `tournament.format`, `tournament.format.knockout`, `tournament.format.roundrobin`, `tournament.switch`, `tournament.players` (`{n}`), `tournament.need_players`, `tournament.start`, `tournament.host`, `tournament.spectators_note`, `error.not_enough_players`.

- [ ] **Step 1: Failing tests:** `Home.test.ts`/`CreatePanel`: the tournament switch hides Bluff/2v2/bot/best-of, sends `tournament: { format }` with default format `knockout`; `TournamentLobby.test.ts`: participant list, start only for the host and from 4, hint text, spectators see no start button; `App.routing.test.ts`: tournament phases select the right screens. Existing tests stay unchanged.
- [ ] **Step 2–4:** FAIL → implement → `npx vitest run apps/web`, `npm run lint`, `npm run typecheck`. Layout check with headless Chromium (no shared browser tool): `?demo=tournament-lobby` at 360/1280 px, light/dark, no overflow.
- [ ] **Step 5: Commit** `feat(web): create and wait in tournament lobbies`.

### Task 6: Web – draw, bracket, table, intermission, award ceremony

**Files:**
- Create: `components/TournamentDraw.svelte`, `Bracket.svelte`, `StandingsTable.svelte`, `TournamentHeader.svelte`, `Intermission.svelte`, `Podium.svelte` (+ tests)
- Modify: `components/Board.svelte`/`BoardView.svelte` and `Spectate.svelte` (hook in tournament header), `App.svelte`, `styles/animations.css`, `lib/locales/*`, `lib/demo.ts`

**Interfaces:**
- `Bracket.svelte`: props `{ tournament: PublicTournament }`; columns per `round`, cards per pairing with avatars/names, bye as “Freilos” (Bye), winner marked (checkmark + frame, not only color), current pairing highlighted (`aria-current="true"`), coin-flip hint at `decidedBy === 'coin'`; horizontally scrollable only inside the component, the page never scrolls horizontally.
- `StandingsTable.svelte`: props `{ tournament }`; real `<table>` with rank, name, wins, losses, rounds; shared ranks visible; tie-break matches as their own row “Stichmatch” (Tie-break match).
- `TournamentDraw.svelte`: shows the names that “whirl around” and land in the bracket/table (motion only via classes in `animations.css`); under reduced motion without animation directly the result; host button “Überspringen” (Skip) (`tournament.skip`).
- `Intermission.svelte`: bracket or table + result of the last match + hint “Nächstes Match: A gegen B” (Next match: A vs B) + countdown display until `untilMs`; host: “Überspringen” (Skip).
- `Podium.svelte`: podium places 1–3 with avatars (shared places side by side), confetti for the winner (existing `Confetti`), host: “Nochmal” (Rematch) (`rematch`), everyone: “Zurück” (Back).
- `TournamentHeader.svelte`: slim bar above Board/Spectate: format, “Runde x” (Round x), current pairing, link “Baum”/“Tabelle” (Bracket/Table) as a collapsible area (`<details>`).
- New keys DE/EN: `tournament.draw`, `tournament.skip`, `tournament.bye`, `tournament.next_match` (`{a}`, `{b}`), `tournament.round` (`{n}`), `tournament.final`, `tournament.semifinal`, `tournament.tiebreak`, `tournament.coin`, `tournament.champion` (`{name}`), `tournament.place` (`{n}`), `tournament.table.*`, `tournament.again`.

- [ ] **Step 1: Failing tests:** `Bracket.test.ts`: 8-player state shows 3 columns, bye card, winner marking with checkmark, `aria-current` on the current pairing; `StandingsTable.test.ts`: rank sharing, tie-break row; `Podium.test.ts`: podium with a shared 3rd place, host sees “Nochmal” (Rematch), non-host does not; `TournamentDraw.test.ts`: names visible, skip only for the host, with `matchMedia` stub `reduce` no animation class; `Intermission.test.ts`: shows the next match and the countdown (fake timers). `animations.test.ts` and the component `<style>` guard stay green.
- [ ] **Step 2–4:** FAIL → implement → `npx vitest run apps/web`, lint, typecheck. Layout check as in Task 5 for demo states `tournament-draw`, `-bracket` (8 players), `-table`, `-intermission`, `-podium`, 360/390/1280 px, light/dark, with and without reduced motion; look at the screenshots.
- [ ] **Step 5: Commit** `feat(web): show tournament draw, bracket, standings and podium`.

### Task 7: End-to-end and docs

**Files:**
- Modify: `e2e/game.spec.ts` or new `e2e/tournament.spec.ts`, `e2e/helpers/app.ts`, `README.md`

- [ ] **Step 1:** E2E with **four browser contexts** (`reducedMotion: 'reduce'`, so that the draw and countdown are omitted): the host creates a knockout tournament (Classic), three join by code, the host starts; the two players of the first pairing play their match (A picks rock, B scissors); the two others watch the match as spectators without a gesture before the reveal (check raw frames); after the intermission (host skips) pairing 2 is played; in the final someone wins, the award ceremony shows places 1 to 3, “Nochmal” (Rematch) leads to the lobby. Second test: round-robin with four players, one participant reloads during the intermission and stays in the tournament; another leaves the tournament (close context) and loses by forfeit after the grace period (shorten the grace period in the test via the existing configuration/clock if available, otherwise only check up to the display “Wiederverbinden …” (Reconnecting …) and leave the forfeit to the server test).
- [ ] **Step 2:** README: tournament mode (format, rules, grace periods, spectators) in one section, extend the constants table with `TOURNAMENT_*`, `DRAW_MS`, `INTERMISSION_MS`.
- [ ] **Step 3:** `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run e2e`: all green.
- [ ] **Step 4: Commit** `test(e2e): cover knockout and round-robin tournaments`.

## Self-Review

- **Spec coverage:** format choice (Task 2/5), 4–8 players and spectators afterwards (Task 3a), fixed mode/best of 3 (Task 2/3a), random draw with animation (Task 1/6), one after another + live spectating (Task 3a/4), automatic intermission with skip (Task 3a/4/6), host plays along (Task 3a), tie/tie-break match/shared places (Task 1), no winner → coin flip or lost for both (Task 1/3a), grace period per person from call-up and forfeit (Task 3b), host change only to participants (Task 3b), rematch (Task 3b/6), award ceremony (Task 6), secrecy (Task 4/7).
- **Type consistency:** `TournamentState`, `Pairing`, `PairingResult`, `MatchOutcome`, `PublicTournament`, `PublicPairing`, `PublicParticipant`, `TournamentRoom`, `TournamentWho`, constants `TOURNAMENT_MIN_PLAYERS`/`MAX`, `DRAW_MS`, `INTERMISSION_MS`, `TIEBREAK_MAX_ROUNDS` and the event/error names (`tournament:skip`, `not_enough_players`) are identical everywhere.
- **Open plan assumptions:** The overall scope is large; Tasks 3a/3b/4 are the riskiest part (state in the room JSON, channel switching, ticker idempotence) and should be implemented with the best model tier and reviewed individually.
