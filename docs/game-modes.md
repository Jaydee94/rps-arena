# Game Modes and Rules

How the game plays: the modes, the rules, rooms, spectators, the bot and the timings. Tournaments have their own
page: [tournament.md](tournament.md).

## Rooms and players

- **Rooms:** Whoever creates a room gets a 5-character code and a link. The others join with the code or the
  link. Nickname and comic avatar (32 to choose from) are picked when joining. Nothing is stored permanently.
- **Match format:** Best of 3, 5 or 7, chosen by the room creator.
- **Bot:** Solo play against a bot on three levels (easy, medium, hard), in all duel modes (not 2v2).
- **Reconnecting:** Whoever drops briefly (reload, network change) returns to their seat in the same browser tab
  (session token in `sessionStorage`).
- **Rematch:** After a match, anyone in the room can start a rematch. Whoever forfeited the match gives up their
  seat.

## Spectators

Whoever joins a room whose match is already running (or finished) watches it live as a spectator.

- At most `MAX_SPECTATORS` (16) per room. Further joiners get "room full". A lobby that is full and still waiting
  also says "room full".
- Picks stay secret until the reveal: spectators see who has locked in, never what, and never a session token.
- Spectators take no seat, do not count as players and never change the timing, the deadlines or the idle abort.
- A reload brings a spectator back to the same room (session token).

## The screen

- **Comic-panel look:** Every screen is a comic page made of panels, with sticker buttons and animations.
- **Reveal countdown:** Before each result, a short "Rock, Paper, Scissors" countdown plays (three beats, about
  1.26 s; in German "Schnick, Schnack, Schnuck"). A key press skips it.
- **Matchup scene:** The reveal shows what happens ("Rock crushes Scissors"). See
  [matchup-scenes.md](matchup-scenes.md).
- **Rule hints:** Hovering or focusing a gesture tile shows what it beats. A collapsible "Rules" panel in the
  lobby and on the pick screen lists it for the whole mode (the way to see it on touch screens).
- **Languages:** German and English, switchable. The default follows the browser.
- **Audio:** Comic sound effects and an optional music loop, each muted separately. Sound only starts after a
  user action.
- **Camera control (experimental):** Rock, paper and scissors by hand gesture, recognized in the browser. See
  [operations.md](operations.md#camera-control).
- **Access:** Mouse, touch and keyboard, also at phone width. With `prefers-reduced-motion: reduce`, all
  animations and the countdown are off and the result shows at once.

## Modes

The server decides everything. The client only sends its pick. The server reveals once everyone has picked (or
time has run out) and settles the round.

| Mode (`ModeId`) | Gesture set | Rule |
| --- | --- | --- |
| Classic (`classic`) | `classic` (3) | Rock beats scissors, scissors beats paper, paper beats rock. |
| Lizard-Spock (`lizard-spock`) | `lizard-spock` (5) | The 5-gesture variant with the standard rules. |
| Wheel 7 / 9 / 15 (`wheel7`, `wheel9`, `wheel15`) | same name (7, 9, 15) | Gestures on a circle, see below. |
| Bluff (`bluff`) | `lizard-spock` (5) | A duel with a non-binding announcement first. |
| 2v2 Team (`team2v2`) | `classic` (3) | Four players, two duels per round. |

### Gesture sets

The sets are in `packages/shared/src/gestures.ts`, in circle order. Each gesture beats the next (n-1)/2 gestures
clockwise and loses to the rest.

| Set | Gestures (circle order) |
| --- | --- |
| `classic` | rock, scissors, paper |
| `lizard-spock` | rock, scissors, lizard, paper, spock |
| `wheel7` | rock, scissors, human, wolf, air, dragon, lightning |
| `wheel9` | rock, scissors, snake, tree, sponge, paper, water, devil, lightning |
| `wheel15` | rock, fire, scissors, snake, human, tree, wolf, sponge, paper, air, water, dragon, devil, lightning, gun |

`wheel7` and `wheel9` are evenly spaced subsets of `wheel15` (same order), so icons and translations are shared.

### Bluff

Each round has two phases:

1. **Announcement** (8 s): each side may announce an emote (a Lizard-Spock gesture, shown as a speech bubble) or
   skip. The other side sees it at once. It is **non-binding**, so lying is allowed. There is no free text.
2. **Pick:** both sides pick secretly from the Lizard-Spock set as usual.

The bot announces at random (in about a quarter of the rounds it says nothing) and ignores the human's
announcement.

### 2v2 Team

- Four seats: `a0`, `a1` (team A) and `b0`, `b1` (team B). Players choose a free seat in the lobby. The room
  creator can move players and starts once all four seats are taken.
- Each player secretly picks one Classic gesture per round. There are two duels: `a0` vs `b0` and `a1` vs `b1`.
- The team that wins more duels takes the round. At 1:1 the round is a draw.
- There is no bot in 2v2.

## Draws and timings

Drawn rounds do not count and are replayed. A match ends as soon as one side has won `ceil(bestOf / 2)` rounds.
`bestOf` is odd and only wins count, so a series can never end level. That is why there is no separate "sudden
death".

The timings are in `packages/shared/src/constants.ts`:

| Constant | Value | Meaning |
| --- | --- | --- |
| `PICK_TIMEOUT_MS` | 20 s | Time to pick. Whoever does not pick loses their duel. If nobody picks, the round is a draw. |
| `ANNOUNCE_TIMEOUT_MS` | 8 s | Time to announce in Bluff. Silence means no announcement. |
| `REVEAL_MS` | 5.5 s | How long the result stays on screen, countdown included. If all connected players click "next", the next round starts sooner. |
| `RECONNECT_GRACE_MS` | 30 s | How long a disconnected player can return. After that they lose their duel in this and every later round (forfeit). |
| `MAX_SPECTATORS` | 16 | Most spectators per room. Disconnected spectators inside their grace period still count. Further joins get `room_full`. |
| `IDLE_ROUNDS_LIMIT` | 3 | Idle rounds in a row before a match is aborted, see below. |
| `ROOM_TTL_S` | 1800 s | Inactive rooms disappear from Redis after 30 minutes. |

The tournament constants are in [tournament.md](tournament.md#constants).

## Abandoned matches

A round that runs out without any human pick or announcement is "idle". After `IDLE_ROUNDS_LIMIT` (3) idle rounds
in a row, the match ends without a winner, so abandoned rooms do not run forever. The result screen then shows
"Spiel vorzeitig beendet" ("Match ended early") instead of victory or defeat. If all humans are gone after the
grace period, the server deletes the room.

**Forfeit:** Whoever leaves for good (or does not return within the grace period) loses each of their duels from
then on. The match ends at once when no duel has two active players left (rule `drawGuard` in
`apps/server/src/settle.ts`):

- **1v1 (also against the bot):** if one side forfeits, the other wins. If both forfeit, the side with more
  points wins; on equal points there is no winner.
- **2v2:** while one duel still has two active players (for example `a1` vs `b1` when `a0` leaves), the match goes
  on and the abandoned duel goes to the other side every round. Otherwise (both seats of a team gone, or `a0` and
  `b1`, or `a1` and `b0` gone), the team with more active seats wins, then the one with more points, else nobody.
