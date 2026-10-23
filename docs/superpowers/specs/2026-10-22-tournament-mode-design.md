# Tournament Mode – Design

As of 2026-10-22. Developed in conversation with Jan. Nothing built yet.

## What this is about and why

Today RPS Arena only knows duels (1 vs 1, 2 vs 2). Jan wants a group of friends (or a team) to be able to play a tournament with **everyone in the room**: randomly drawn, with a bracket or a table, with an award ceremony. The appeal is the shared event: everyone is in the same room, watches the others' matches live and roots for them.

## Goals

- 4 to 8 players in **one** room play a tournament.
- In the lobby the host picks the **format**: knockout bracket or round-robin.
- The host picks **one gesture mode** for the whole tournament (Classic, Lizard-Spock, Wheel of 7/9/15; not Bluff, not 2 vs 2). Every match is **best of 3**.
- The draw is random. It is shown as a small comic animation (omitted under reduced motion).
- Matches run **one after another**. Everyone else in the room, including eliminated players and spectators, **watches the running match live** (the chosen gestures stay secret until the reveal, as always).
- Between two matches the room shows the bracket or table with the result for about 6 seconds, then the next match starts **automatically**. The host can skip the intermission.
- The host plays as a normal participant and additionally has the start and settings rights.
- Anyone who joins **after the start** enters the room as a **spectator** (sees the bracket/table and the matches, does not play).
- The **spectator role applies to all rooms**, not only tournaments: anyone who joins a running normal duel (1v1, 2v2, bot) via an invite link also enters as a spectator instead of getting “room full” (Jan's decision).
- Award ceremony at the end; afterwards “Nochmal” (Rematch: same participants, new draw) and “Zurück” (Back).

## Tournament rules

- **Knockout bracket:** random seeding. With an odd number of players there are **byes** (whoever has one advances without a match). Whoever loses is eliminated and becomes a spectator.
- **Round-robin:** everyone plays everyone, table ranked by matches won. On a tie the **head-to-head record** counts first. If three or more players are tied and the head-to-head record does not resolve it, those involved play a **tie-break match** (best of 1; with more than two involved, again under the same rules).
- **Disconnect:** the existing reconnect grace period of 30 s applies. After that the person has lost by **forfeit**. In the knockout bracket the opponent advances; in round-robin the person's remaining matches count as lost. The tournament continues.
- Eliminated players and spectators may disconnect and reconnect without affecting the tournament or the room.

## Non-goals

- No bots in the tournament (no filling up to 4/8 players).
- No 2-vs-2 tournament, no Bluff mode in the tournament.
- No parallel play of several matches, no double-elimination brackets, no Swiss system.
- No accounts, no ranking across several tournaments, no archiving.
- No chat.

## Anti-goals (what it would fail on, even if it works technically)

- A single disconnect, a bored spectator or the host's decision must **not** freeze the tournament.
- Spectators must **never** see a gesture before the reveal (neither in the view nor in the network traffic).
- The existing duels (1v1, 2v2, bot) must not change or get slower **for the players**. The only intended behavior change: late joiners become spectators instead of getting “room full” (the existing tests for this are deliberately adjusted). Before a game starts, a full duel room lobby stays full (spectators only exist once the game is running).

## Constraints from the existing code (research)

The `packages/shared` package and the server are built around **one** match with **four fixed seats** (`a0`, `a1`, `b0`, `b1`):

- `SeatId` is a union of four values and runs through the protocol (zod), room model, views, channels, gateway, web (`teamOf`, `Lobby`, `Result`, `sfx-bridge`) and many tests (e.g. `view.test.ts`, `protocol.test.ts`, `store.contract.ts`).
- A room has exactly **one** `match`, one timer (`deadline`/`phaseDeadline`), one bot level and a bounded `history` (max. 50). The ticker (`ticker.ts`) and `settle`/`tick` hang off these.
- There are **no spectators**: views go through per-seat channels; `RoomView.you` is mandatory; `joinRoom` rejects with `room_full` once the match has begun; `seatOfSocket` throws for sockets that are not seated.
- The room is stored as **one JSON document** in memory or in Redis (optimistic locking, TTL 1800 s, retry up to 20). The bracket/table and the participant count make it bigger; the view distribution (`broadcast`, one view per participant) grows with it.
- The match logic (`match.ts`: `createMatch`, `pick`, `advance`, `timeoutPhase`, `forfeitSeat`) is pure and works on two seats (`a0` against `b0`). A pairing can be mapped as `a0 = player X`, `b0 = player Y` and thus **reused unchanged**.
- The idle abort (`IDLE_ROUNDS_LIMIT = 3`) and the abandon logic (`isAbandoned`, `graceEnd`) treat the room as “seated humans”. Spectators and eliminated players must not count as players there.
- Tests that pin down shapes and therefore must be adjusted or deliberately extended: `view.test.ts` (whole view via `toEqual`, secrecy checks), `protocol.test.ts` (`RoomJoined` is exactly `{code, seat, token}`), gateway tests for `room_full` after start, `store.contract.ts`.

## Approach (Jan agreed to build in two stages)

**Stage 1 – Foundation: participants and spectators in the room.** No tournament logic. Result: a room can hold more than two/four people, each person has their own identifier (participant ID instead of a fixed seat), there is a spectator role with its own secrecy-safe view, and late joins during a running match are possible as spectators **in all room types**. The gameplay of the existing modes stays unchanged for the players (backward compatibility of behavior, not necessarily of the data shape). Spectators never count as players: not for the idle abort, leaving the room, the reconnect grace period or “everyone pressed ‘Weiter’ (Next)”. This is the biggest intervention and should be tested and reviewed on its own before stage 2 builds on it.

**Stage 2 – Tournament.** A tournament layer on the server that owns the format, seeding, byes, table, tie-break match rules and the flow “pairing → match → result → intermission → next pairing”, and runs the existing match logic for each pairing. Plus the user interfaces: tournament settings in the lobby, draw animation, bracket and table views, spectator board with the running match, award ceremony. Copy in DE and EN, comic-panel look, motion only in `animations.css` (see `2026-10-22-comic-panel-design-handoff.md`).

## Decisions of the author (Jan did not explicitly make these, please review)

- **Match without a winner** (both idle, idle abort, both disconnected at the same time): in the knockout bracket, whoever won more rounds advances; on a tie a visible **coin flip** decides (random, testable with a fixed random source). In round-robin the match counts as **lost for both** (no point).
- **Reconnect grace period in the tournament:** it runs per person from the moment their match is called up or they drop out during a running match, not already between matches. The intermission and the next match never wait for an absent person: if they are not connected when called up, the 30-second grace period runs, then forfeit. Eliminated players and spectators have no grace period.
- **Host change:** if the host leaves the room or loses by forfeit/grace period, the host role goes to the next connected **tournament participant** in join order. Spectators never become host (their view is identical for everyone and contains no personal role). If no connected participants are left, the tournament is over and the room cleans itself up via the existing abort mechanism. This way “Weiter” (Next), “Nochmal” (Rematch) and “Zurück” (Back) never depend on an absent person. (Planning decision taken while writing the stage 2 plan; replaces the earlier rule “then spectator”.)
- **Round-robin, tie:** the head-to-head record is computed only among the tied players as a mini-table; partially resolved groups are split before a tie-break match applies. A **tie-break match exists only for 1st place**; ties at the places behind it remain as a shared place. The award ceremony shows the podium up to 3rd place (with shared places accordingly).
- **“Nochmal” (Rematch):** the room goes back to the lobby. All currently connected people (former spectators included) can take part; the first 8 by join order become players, the others stay spectators. The number of players is only fixed when the new tournament starts, not before.

## What the builder may decide

- Structure of the participant identifier and its channels, shape of the spectator view, migration of the types (e.g. replace or extend `SeatId`) and how the tests are adjusted.
- Concrete presentation of bracket and table, length of the draw animation, exact intermission length (guideline 6 s), copy.
- How the seeding is generated randomly (must be reproducible in tests with a fixed random source).
- Whether stage 1 is protected by a fixed upper-limit value (players plus spectators per room). Guideline: 8 players, spectators additionally up to a sensible upper limit.

## Open / undecided

- Upper limit for spectators per room (guideline see above).
- Whether the tournament setting “best of” should later be adjustable separately for the final (now: best of 3 for all matches).
