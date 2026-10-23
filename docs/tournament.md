# Tournament Mode

How a tournament of 4 to 8 players in one room works: formats, flow, grace periods, the host and the rematch.

## Setup

- Turn on "Tournament (4 to 8 players)" when creating a room. The room creator is the **host** and plays along
  as a normal participant.
- The host picks the **format** and **one gesture mode** for the whole tournament: Classic, Lizard-Spock or
  Wheel 7 / 9 / 15. No Bluff, no 2v2, no bots.
- Every match is **best of 3**. Tie-break matches are best of 1.
- Up to `TOURNAMENT_MAX_PLAYERS` (8) people join the lobby by code or link. The host can start once at least
  `TOURNAMENT_MIN_PLAYERS` (4) are connected. Whoever joins later, or joins a full lobby, watches as a spectator.

## Formats

**Knockout:**

- Random seeding. If the player count is not a power of two, some players get a **bye** and advance without a
  match (never two byes in one pairing).
- The loser of a match is out and watches from then on.
- There is no match for 3rd place: both semifinal losers share it.

**Round robin:**

- Everyone plays everyone once. With an odd count, one player sits out each round.
- Ranked by matches won. Ties are broken by the head-to-head record among the tied players, again for every group
  that is still tied.
- Only a tie for **1st place** is played out: the tied group plays a tie-break round robin of best-of-1 matches.
  If 1st place is still tied, they play again, up to `TIEBREAK_MAX_ROUNDS` (2) tie-break rounds in total. After
  that, a coin flip picks the winner and the rest of the group shares 2nd place.
- Ties anywhere else stay shared places.

**Match without a winner** (both idle, or both gone): in the knockout, whoever won more rounds advances, else a
visible coin flip decides. In the round robin, the match counts as lost for both.

## Flow

1. A random **draw** (`DRAW_MS`, 3 s): an animation, or the static result with reduced motion.
2. The matches, **one after another**.
3. Between two matches, an **intermission** (`INTERMISSION_MS`, 6 s) shows the result, the bracket or table and
   the next pairing. Then the next match starts by itself.

The host can skip the draw and the intermission.

**Watching:** Everyone who is not in the running match (waiting or eliminated participants, late joiners)
watches it live. Picks stay secret until the reveal, as for duel spectators: no watcher's view or network frame
contains a pick or anyone else's session token.

## Grace periods and forfeits

- The reconnect grace period (`RECONNECT_GRACE_MS`, 30 s) runs per person. It starts only when their match is
  called up, or when they drop out during their own match. It never runs between matches.
- The intermission and the next match wait for nobody. Whoever is away when called up has 30 s to come back, then
  loses by **forfeit**. In the knockout, the opponent advances. In the round robin, all their remaining matches
  count as lost.
- Leaving the room ("Back to start") counts as a disconnect.
- Waiting or eliminated participants and spectators can drop and come back without any effect. A reload brings
  everyone back to their place.

## Host hand-over

If the host is gone past their grace period or has forfeited, the role passes to the next connected participant
in join order who has not forfeited (never to a spectator). If there is none, a running tournament ends.

## Podium and rematch

- The end shows a podium with places 1 to 3 (shared places side by side).
- The host's "Play again" goes back to the tournament lobby with everyone who is connected, former spectators
  included. The first 8 in join order (participants first) become players, the others watch. The next start
  brings a new draw.
- "Back to start" leaves the room.

## Constants

In `packages/shared/src/constants.ts`:

| Constant | Value | Meaning |
| --- | --- | --- |
| `TOURNAMENT_MIN_PLAYERS` | 4 | Fewest participants to start (`not_enough_players` otherwise). The start button waits for this many connected participants. Before counting, the server drops lobby participants who have been gone longer than `RECONNECT_GRACE_MS`. |
| `TOURNAMENT_MAX_PLAYERS` | 8 | Most participants. Whoever joins a full lobby or a running tournament watches as a spectator. |
| `DRAW_MS` | 3 s | Length of the draw before the first match. The host can skip it. |
| `INTERMISSION_MS` | 6 s | Pause between two matches. The host can skip it. |
| `TIEBREAK_MAX_ROUNDS` | 2 | Round robin only: tie-break rounds for a group tied for 1st place before a coin flip decides. |

The general timings (`PICK_TIMEOUT_MS`, `REVEAL_MS`, `RECONNECT_GRACE_MS`, ...) are in
[game-modes.md](game-modes.md#draws-and-timings).
