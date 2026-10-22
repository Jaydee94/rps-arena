# Turnier Stufe 2: K.o.-Baum und Alle gegen alle – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4 bis 8 Spieler in einem Raum spielen ein Turnier (K.o.-Baum oder Alle gegen alle), mit zufälliger Auslosung, nacheinander laufenden Best-of-3-Matches, Live-Zuschauen, automatischem Übergang, Baum/Tabelle und Siegerehrung.

**Architecture:** Eine **reine Turnierlogik** in `packages/shared` (Auslosung, Paarungen, Ergebnisse, Tabelle, Gleichstand, Treppchen) ohne Zeit und IO. Der Server hält pro Raum ein `tournament` (Teilnehmer, Zustand, Phase, Fristen) und **projiziert die aktuelle Paarung auf die Plätze `a0`/`b0`**, damit die vorhandene Match-Engine unverändert ein Match spielt; Ergebnis → Turnierlogik → Pause → nächste Paarung. Alle anderen Teilnehmer und Zuschauer sehen das laufende Match über die Zuschauer-Infrastruktur aus Stufe 1.

**Tech Stack:** TypeScript, Zod, Socket.IO, Redis, Svelte 5, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-tournament-mode-design.md`. **Voraussetzung:** Stufe 1 (`2026-10-22-tournament-stage1-spectators.md`) ist umgesetzt und gemergt: `Spectator`, `Who`, `whoOfSocket`, `spectatorChannel`, `spectatorViewFor`, `PlayerView`/`SpectatorView` (mit `isHost`, `me`), `MAX_SPECTATORS`.

## Global Constraints

- 4 bis 8 Teilnehmer (`TOURNAMENT_MIN_PLAYERS = 4`, `TOURNAMENT_MAX_PLAYERS = 8`). Der Host ist Teilnehmer. Ist die Lobby voll (8) oder das Turnier gestartet, werden weitere Beitretende **Zuschauer** (Stufe 1).
- Gesten-Modus: einer für das Turnier, aus `classic`, `lizard-spock`, `wheel7`, `wheel9`, `wheel15` (nicht `bluff`, nicht `team2v2`; sonst `invalid_input`). Jedes Match ist **Best of 3**, außer Stichmatches (**Best of 1**).
- Keine Bots, keine parallelen Matches. Matches laufen nacheinander. Nach jedem Match: Pause `INTERMISSION_MS = 6_000` mit Baum/Tabelle, dann automatisch das nächste; der Host kann die Pause (und die Auslosungsanimation, `DRAW_MS = 3_000`) überspringen (`tournament:skip`).
- Regeln: K.o.-Baum mit Freilosen (kein Paar aus zwei Freilosen), Gewinner steigt auf, Verlierer wird Zuschauer. Alle gegen alle: Tabelle nach gewonnenen Matches, Gleichstand zuerst über den direkten Vergleich **nur unter den Gleichstehenden** (Mini-Tabelle), Stichmatch (Best of 1) **nur um Platz 1**; bei mehr als zwei Beteiligten ein Stich-Rundenturnier unter ihnen, höchstens `TIEBREAK_MAX_ROUNDS = 2` Wiederholungen, danach Münzwurf. Plätze dahinter bleiben geteilt. Treppchen bis Platz 3 (K.o.: beide Halbfinal-Verlierer teilen Platz 3).
- Match ohne Sieger (Leerlauf-Abbruch, beide gleichzeitig weg): K.o.: mehr gewonnene Runden gewinnt, sonst **Münzwurf** (sichtbar, `decidedBy: 'coin'`, mit injiziertem Zufall testbar); Alle gegen alle: für **beide verloren**.
- Wiederverbinden-Frist (`RECONNECT_GRACE_MS`, 30 s) läuft pro Person ab dem Moment, in dem deren Match aufgerufen wird bzw. sie im Match wegbricht, nicht zwischen den Matches. Ausgeschiedene und Zuschauer haben keine Frist. Pause und Folgematch warten nie auf Abwesende. Danach Forfait; spätere Paarungen dieser Person werden automatisch als verloren gewertet.
- Host-Wechsel nur auf verbundene **Teilnehmer** (Beitrittsreihenfolge, nicht Zuschauer); keine verbundenen Teilnehmer mehr → Turnier endet, Raum räumt sich ab.
- „Nochmal“ (nur Host): zurück in die Lobby; alle aktuell Verbundenen (Teilnehmer zuerst, dann Zuschauer, in Beitrittsreihenfolge) sind Teilnehmer bis 8, der Rest bleibt Zuschauer; neue Auslosung mit dem Start.
- Zufall nur über einen injizierten `rng: () => number` (Auslosung, Münzwurf); Tests laufen mit festem Zufall.
- Geheimhaltung wie Stufe 1 (keine ungewählte Geste, kein Token im Datenverkehr).
- Neue Raumfelder optional (ältere gespeicherte Räume laden weiter); Raum bleibt **ein** JSON-Dokument (Größe beachten: Paarungen sind klein, keine Verläufe speichern).
- Alle Texte DE und EN; Comic-Panel-Look; Bewegung nur in `animations.css` (`prefers-reduced-motion: no-preference`), Auslosung entfällt bei reduzierter Bewegung (Ergebnis sofort); keine Inline-Styles außer `style:--x`; keine Hex-Werte.
- Bestehende Tests nur ändern, wo der Plan es ausdrücklich nennt. Commits Conventional Commits, Trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Zufall: Auslosung deckt jede Teilnehmerzahl 4–8 ab; kein Freilos-Paar; jeder Teilnehmer genau einmal in Runde 1; mit festem `rng` reproduzierbar (Task 1).
2. Alle gegen alle mit Dreier-Zyklus (A schlägt B, B schlägt C, C schlägt A), geteilte Plätze hinter Platz 1, Stichmatch-Wiederholung und Münzwurf-Abbruch (Task 1).
3. Pause-Übergang und Auslosung als **Fristen im Raum** (`deadline`), damit der Ticker jeder Replik sie auslöst; zwei Repliken dürfen das nächste Match nicht doppelt starten (`tick` bleibt idempotent) (Task 3b).
4. Teilnehmer trennt sich in der Pause, dann wird sein Match aufgerufen: Frist läuft erst dann, Forfait nach 30 s, Gegner kommt weiter, Turnier friert nie ein (Task 3b).
5. Zuschauer und wartende Teilnehmer sehen nie eine ungewählte Geste des laufenden Matches (Task 4, 7).

## Reihenfolge und Parallelität

Task 1 (rein, shared) und Task 2 (Typen) sind unabhängig voneinander und laufen parallel. Task 3a nutzt beide. Task 3b folgt 3a. Task 4 folgt 3b. Task 5 darf nach Task 2 mit den Demo-/Mock-Daten parallel zu 3a–4 laufen; Task 6 folgt Task 5; Task 7 zuletzt.

---

### Task 1: Reine Turnierlogik

**Files:**
- Create: `packages/shared/src/tournament.ts`, `packages/shared/src/tournament.test.ts`
- Modify: `packages/shared/src/constants.ts`, `packages/shared/src/index.ts` (Export)

**Interfaces:**
- Produces in `constants.ts`: `TOURNAMENT_MIN_PLAYERS = 4`, `TOURNAMENT_MAX_PLAYERS = 8`, `DRAW_MS = 3_000`, `INTERMISSION_MS = 6_000`, `TIEBREAK_MAX_ROUNDS = 2`.
- Produces in `tournament.ts` (alle rein, ohne Zeit, ohne IO; `Rng = () => number`):
  - `type TournamentFormat = 'knockout' | 'roundrobin'`
  - `interface MatchOutcome { winner: 'a' | 'b' | null; score: { a: number; b: number }; forfeit: 'a' | 'b' | 'both' | null }`
  - `interface PairingResult { winner: string | null; score: { a: number; b: number } | null; decidedBy: 'match' | 'forfeit' | 'coin' | 'bye' | 'none' }`
  - `interface Pairing { id: string; round: number; a: string | null; b: string | null; bestOf: 1 | 3; tiebreak: boolean; result: PairingResult | null }` (`null` = Freilos-Platz; `a`/`b` sind Teilnehmer-IDs).
  - `interface TournamentState { format: TournamentFormat; participants: string[]; pairings: Pairing[]; forfeited: string[]; tiebreakRounds: number; coinWinner: string | null }`
  - `createTournament(format: TournamentFormat, participantIds: string[], rng: Rng): TournamentState` (lost aus; wirft bei weniger als 4 oder mehr als 8 oder doppelten IDs; Freilose im K.o. werden sofort als `decidedBy: 'bye'` aufgelöst)
  - `nextPairing(state: TournamentState): Pairing | null` (erste unentschiedene Paarung in Reihenfolge, die zwei echte Teilnehmer hat und in der kein Beteiligter ausgeschieden/forfeited ist; Paarungen mit Forfeit-Beteiligten werden vorher automatisch entschieden; **gibt den Zustand nicht zurück**, daher gehört das Auflösen in `settleAutomatic(state, rng): TournamentState`)
  - `settleAutomatic(state: TournamentState, rng: Rng): TournamentState` (entscheidet alle Paarungen mit Freilos oder forfeited Beteiligten, erzeugt im K.o. die nächste Runde, fügt bei Alle gegen alle nötige Stichmatches hinzu)
  - `recordResult(state: TournamentState, pairingId: string, outcome: MatchOutcome, rng: Rng): TournamentState` (Regeln aus den Global Constraints inkl. kein Sieger/Münzwurf; ruft danach `settleAutomatic`)
  - `markForfeited(state: TournamentState, participantId: string, rng: Rng): TournamentState`
  - `isFinished(state: TournamentState): boolean`
  - `interface StandingRow { participantId: string; played: number; wins: number; losses: number; roundsWon: number; roundsLost: number; rank: number }`; `standings(state: TournamentState): StandingRow[]` (nach Rang sortiert, gleiche Ränge teilen sich die Zahl)
  - `podium(state: TournamentState): { rank: 1 | 2 | 3; ids: string[] }[]` (nur Plätze, die feststehen; nach `isFinished` vollständig)

- [ ] **Step 1: Failing tests** (`tournament.test.ts`, fester `rng` per kleiner Hilfsfunktion): (a) `createTournament('knockout', n ∈ 4..8)`: jede ID genau einmal in Runde 1, Anzahl Freilose = nächste Zweierpotenz minus n, kein Paar aus zwei Freilosen, Freilos-Paarungen sind `decidedBy: 'bye'`, bei 4 und 8 keine Freilose; gleicher `rng` → gleiche Auslosung; (b) K.o. 4 Spieler: Ergebnisse Runde 1 → Runde 2 (Finale) entsteht mit den Siegern in Paarungsreihenfolge; Finale entschieden → `isFinished`, `podium` = Platz 1 Sieger, Platz 2 Finalverlierer, Platz 3 beide Halbfinal-Verlierer geteilt; (c) K.o. 5 bis 8: Freilose rücken ohne Spiel vor, `nextPairing` gibt nie eine Freilos-Paarung zurück; (d) `recordResult` mit `winner: null` im K.o.: mehr Runden gewinnt (`score`), bei Gleichstand Münzwurf (`rng() < 0.5` → `a`), `decidedBy: 'coin'`; Alle gegen alle: `decidedBy: 'none'`, beide ohne Sieg; (e) Alle gegen alle 4 und 5 Spieler: jede Paarung genau einmal, kein Teilnehmer zweimal in derselben `round`; Tabelle nach Siegen; (f) Gleichstand: zwei Spieler gleichauf auf Platz 1 → Stichmatch (`tiebreak: true`, `bestOf: 1`) wird erzeugt, nach dessen Ergebnis steht Platz 1 fest; Dreier-Zyklus (A>B, B>C, C>A, alle 1 Sieg gegen die anderen zwei außer… Aufbau so, dass der direkte Vergleich nichts löst) → Stich-Rundenturnier unter den dreien, nach `TIEBREAK_MAX_ROUNDS` Wiederholungen ohne Entscheidung entscheidet `coinWinner`; teilweise aufgelöste Gruppe wird vor dem Stichmatch geteilt; Gleichstand um Platz 2 erzeugt **kein** Stichmatch, Rang bleibt geteilt; (g) `markForfeited` eines Teilnehmers: seine offenen Paarungen sind automatisch verloren (`decidedBy: 'forfeit'`), im K.o. rückt der Gegner vor, wenn beide Beteiligte forfeited sind, entsteht kein Sieger und der Gegner der nächsten Runde bekommt ein Freilos; (h) alle Funktionen sind rein (Eingabe wird nicht mutiert: `structuredClone`-Vergleich).
- [ ] **Step 2:** `npx vitest run packages/shared/src/tournament.test.ts` → FAIL.
- [ ] **Step 3:** Implementieren (Fisher-Yates mit `rng`, Kreisverfahren für Alle gegen alle; die Paarungsreihenfolge ist die Spielreihenfolge). Pro Signatur nur das Nötige, keine Hilfs-Exporte außer den genannten.
- [ ] **Step 4:** Tests → PASS; `npm run typecheck -w @rps/shared`.
- [ ] **Step 5: Commit** `feat(shared): add pure tournament logic`.

### Task 2: Protokoll und Typen

**Files:**
- Modify: `packages/shared/src/protocol.ts`, `match.ts` (`bestOf`), `protocol.test.ts`, `match.test.ts`

**Interfaces:**
- `RoomConfig.bestOf: 1 | 3 | 5 | 7` (nur der Typ; das Zod-Schema `configSchema` für `room:create` bleibt `3 | 5 | 7`, `1` ist nur intern für Stichmatches). `scoreWinner` rechnet mit `ceil(bestOf/2)` bereits richtig (Test ergänzen).
- `ClientEvents['room:create']` bekommt `tournament: z.object({ format: z.enum(['knockout','roundrobin']) }).optional()`; `ClientEvents['tournament:skip'] = emptySchema`.
- `ERROR_CODES += 'not_enough_players'`.
- `interface PublicParticipant { id: string; nickname: string; avatar: string; connected: boolean; forfeited: boolean }`
- `interface PublicPairing { id: string; round: number; a: string | null; b: string | null; bestOf: 1 | 3; tiebreak: boolean; winner: string | null; decidedBy: PairingResult['decidedBy'] | null; score: { a: number; b: number } | null }`
- `interface PublicTournament { format: TournamentFormat; phase: 'lobby' | 'draw' | 'match' | 'intermission' | 'finished'; participants: PublicParticipant[]; pairings: PublicPairing[]; currentPairingId: string | null; standings: StandingRow[]; podium: { rank: 1 | 2 | 3; ids: string[] }[]; youId: string | null; untilMs: number | null }` (`untilMs` = Ende von Auslosung oder Pause).
- `PlayerView` und `SpectatorView` bekommen `tournament: PublicTournament | null`.

- [ ] **Step 1: Failing tests:** `room:create` akzeptiert `tournament: { format: 'knockout' }` und lehnt andere Formate ab; `tournament:skip` hat ein leeres Schema; `ERROR_CODES` enthält `not_enough_players`; `scoreWinner` mit `bestOf: 1` entscheidet nach einem gewonnenen Round; ein `PlayerView`-Literal ohne `tournament` ist ein Typfehler (`@ts-expect-error`). Folgefehler in Server/Web ignorieren (Tasks 3–6), Commit nur `packages/shared`.
- [ ] **Step 2:** → FAIL. **Step 3:** umsetzen. **Step 4:** `npx vitest run packages/shared` grün. **Step 5: Commit** `feat(shared): add tournament protocol types`.

### Task 3a: Server – Turnierraum, Start, Match-Projektion, Pause

**Files:**
- Create: `apps/server/src/tournament.ts`, `apps/server/src/tournament.test.ts`
- Modify: `apps/server/src/room.ts`, `engine.ts`, `settle.ts`

**Interfaces:**
- Consumes: Task 1/2, Stufe 1 (`Spectator`, `Who`).
- Produces in `room.ts`: `export type Participant = Spectator;` und `export interface TournamentRoom { hostId: string; participants: Participant[]; state: TournamentState | null; phase: 'lobby' | 'draw' | 'match' | 'intermission' | 'finished'; currentPairingId: string | null; untilMs: number | null }`; `Room.tournament?: TournamentRoom`.
- Produces in `tournament.ts` (rein, `Room` rein/raus):
  - `createTournamentRoom(input: { config: RoomConfig; format: TournamentFormat; nickname: string; avatar: string; socketId?: string | null; code?: string }, now: number, rng?: Rng): Room` (Host ist Teilnehmer; `players` leer; `hostSeat` bleibt `'a0'` ohne Bedeutung, `isHost` in Views kommt aus `tournament.hostId`; lehnt `bluff`/`team2v2` und `bestOf !== 3` mit `invalid_input` ab)
  - `joinTournamentRoom(room, nickname, avatar, now, socketId?): { room: Room; who: TournamentWho }` mit `type TournamentWho = Who | { role: 'participant'; id: string }`: Lobby und `participants.length < TOURNAMENT_MAX_PLAYERS` → Teilnehmer, sonst Zuschauer (Stufe 1)
  - `startTournament(room, byId: string, now: number, rng: Rng): Room` (nur Host, sonst `not_host`; weniger als `TOURNAMENT_MIN_PLAYERS` → `not_enough_players`; nur in der Lobby, sonst `wrong_phase`) → Phase `draw`, `untilMs = now + DRAW_MS`, `state = createTournament(...)`
  - `skipTournamentWait(room, byId, now, rng): Room` (nur Host; beendet Auslosung bzw. Pause sofort)
  - `advanceTournament(room: Room, now: number, rng: Rng): Room` (Auslosung/Pause abgelaufen → nächste Paarung via `nextPairing`; keine → Phase `finished`)
  - `projectPairing(room, pairing): Room` (setzt `players = { a0: Spieler von pairing.a, b0: Spieler von pairing.b }` aus den `participants` — gleiche Tokens, `socketId`, `connected` —, `match = createMatch(config mit pairing.bestOf)`, `phase = 'match'`, `phaseDeadline` über `settle`)
  - `finishPairing(room, now, rng): Room` (wenn `match.phase === 'finished'`: `MatchOutcome` aus `match.winner`/`score`/`forfeited` bilden, `recordResult`, Phase `intermission`, `untilMs = now + INTERMISSION_MS`; war es die letzte Paarung: `finished`)
- In `settle.ts`: nach `drawGuard` ein Schritt, der bei `room.tournament?.phase === 'match'` und beendetem Match `finishPairing` aufruft; `schedule` nimmt `tournament.untilMs` in `deadline` auf (nur als Aufwachzeit); `tick` ruft bei fälligem `untilMs` `advanceTournament`.
- **Einzige Quelle der Wahrheit** für Personen im Turnier sind `participants`; `players` (a0/b0) ist nach jeder Operation aus `participants` neu abzuleiten (`syncPairing`), damit Verbinden/Trennen an beiden Stellen stimmt.

- [ ] **Step 1: Failing tests** (`tournament.test.ts`, fester `rng`/Zeit): Erzeugen → Lobby mit Host als Teilnehmer; 7 weitere treten bei, der 9. wird Zuschauer; Start mit 3 → `not_enough_players`, von Nicht-Host → `not_host`, mit 4 → Phase `draw`; nach `DRAW_MS` (`advanceTournament`) läuft Paarung 1: `players.a0/b0` sind die zwei Teilnehmer, `match.phase` ist `pick`; zwei Matches zu Ende gespielt (über die vorhandenen `applyPick`) → nach Match 1 Phase `intermission` mit `untilMs = now + INTERMISSION_MS`, nach Ablauf Paarung 2; `skipTournamentWait` startet sofort; letzte Paarung beendet → Phase `finished`, `podium` gefüllt; Match ohne Sieger (Leerlauf-Abbruch) im K.o. → Münzwurf mit festem `rng`; `applyPick`/`applyNext` verhalten sich in einem Turnierraum wie im Duell; bestehende Duell-Tests laufen unverändert.
- [ ] **Step 2:** → FAIL. **Step 3:** implementieren. **Step 4:** `npx vitest run apps/server` grün.
- [ ] **Step 5: Commit** `feat(server): run tournament matches through the existing engine`.

### Task 3b: Server – Frist, Forfait, Host-Wechsel, Nochmal

**Files:**
- Modify: `apps/server/src/tournament.ts`, `engine.ts`, `settle.ts`, `tournament.test.ts`

**Interfaces:**
- Produces: `markParticipantDisconnected(room, id, now): Room`, `markParticipantConnected(room, id, now, socketId): Room`, `leaveParticipant(room, id, now, rng): Room` (Forfait: im laufenden Match `forfeitSeat`, sonst `markForfeited`; Host-Wechsel), `tournamentRematch(room, byId, now, rng): Room`, `rejoinTournament(room, token, now, socketId): { room; who: TournamentWho; previousSocketId: string | null }`.
- Regeln: Die 30-s-Frist eines Teilnehmers beginnt bei `max(disconnectedAt, Zeitpunkt, zu dem seine Paarung aufgerufen wurde)`; ist er beim Aufruf nicht verbunden, läuft sie ab da; Pause und Auslosung warten nie. Nach Ablauf: Forfait (Gegner kommt weiter; Match endet über `drawGuard`). Ein Forfaiter, der zurückkommt, wird als Zuschauer geführt. Host-Wechsel auf den nächsten verbundenen, nicht forfaiteten Teilnehmer; gibt es keinen: Turnier `finished`, `isAbandoned` greift. `tournamentRematch` (nur Host, nur in `finished`) → Lobby mit den Teilnehmern/Zuschauern nach Plan-Regel, `state = null`.

- [ ] **Step 1: Failing tests:** (a) Teilnehmer trennt sich in der Pause und ist beim Aufruf seines Matches weg: Frist startet erst beim Aufruf, nach 30 s Forfait, Gegner kommt weiter, nächste Pause folgt; (b) Teilnehmer trennt sich 20 s vor seinem Aufruf und kommt zurück: kein Forfait; (c) Forfait im laufenden Match beendet es sofort und zählt als Sieg des Gegners; (d) Alle gegen alle: spätere Paarungen eines Forfaiters sind automatisch verloren; (e) Host forfaitet → nächster Teilnehmer ist Host; kein Teilnehmer mehr → `finished`; (f) Rejoin per Token (Teilnehmer, Zuschauer, Forfaiter→Zuschauer); (g) `tournamentRematch` nur Host in `finished`; Lobby enthält verbundene Personen nach Plan-Regel, max. 8; (h) `tick` ist idempotent (zweimal mit demselben `now` ändert nichts nach dem ersten Lauf); Räume ohne `tournament` ändern sich nicht.
- [ ] **Step 2–4:** FAIL → implementieren → `npx vitest run apps/server` grün.
- [ ] **Step 5: Commit** `feat(server): handle absence, forfeits, host changes and rematch in tournaments`.

### Task 4: Ansichten und Gateway

**Files:**
- Modify: `apps/server/src/view.ts`, `gateway.ts`, `view.test.ts`, `gateway.test.ts`

**Interfaces:**
- `tournamentViewFor(room: Room, forId: string | null): PublicTournament` (Teilnehmer ohne Tokens; `standings`/`podium` aus Task 1; `youId`).
- `viewFor` (Spielende der aktuellen Paarung): `PlayerView` mit `tournament` und `isHost = (hostId === ihre Teilnehmer-ID)`. Wartende Teilnehmer erhalten eine **eigene** `SpectatorView` (`me: { id }`, `isHost`, `tournament`) auf einem Personenkanal `${code}:p:${id}`; reine Zuschauer weiter die gemeinsame View auf `spectatorChannel` (`me: null`, `isHost: false`, `tournament` mit `youId: null`).
- Gateway: `room:create` mit `tournament` ruft `createTournamentRoom`; `room:join` in Turnierräumen ruft `joinTournamentRoom`; `room:start` → `startTournament`, `room:rematch` → `tournamentRematch`, neues `tournament:skip` → `skipTournamentWait` (alle nur Host); `game:*` nur für Mitglieder der aktuellen Paarung, sonst `not_player`; `seat:move` in Turnierräumen `invalid_input`; Kanalwechsel beim Paarungswechsel (Teilnehmer wechselt zwischen Personenkanal und Seat-Kanal) vor dem Broadcast, analog zu `seat:move`; `dropRoom` räumt auch Personenkanäle (alle Teilnehmer-IDs bekannt).

- [ ] **Step 1: Failing tests:** `view.test.ts`: Zuschauer-/Wartenden-JSON enthält während der Pick-Phase weder Gesten noch Tokens; `tournament` enthält keine Tokens; Gewinner/Podium nach Ende. `gateway.test.ts` (mit echten Socket.IO-Clients, vier Teilnehmer): Turnier erstellen, drei treten bei, Start, Auslosung, erste Paarung spielen; die zwei Nicht-Beteiligten erhalten `role: 'spectator'`-Views mit `me`; Rohframes der Wartenden enthalten vor dem Aufdecken keine Geste; nach dem Match Pause, dann zweites Match; Nicht-Host `room:start`/`tournament:skip` → `not_host`; Wartender sendet `game:pick` → `not_player`; K.o.-Finale beendet → `finished` mit Podium; `room:rematch` → Lobby.
- [ ] **Step 2–4:** FAIL → implementieren → `npx vitest run apps/server`, `npm run typecheck -w @rps/server` grün.
- [ ] **Step 5: Commit** `feat(server): serve tournament views and events`.

### Task 5: Web – Anlegen, Lobby, Routing

**Files:**
- Modify: `apps/web/src/components/CreatePanel.svelte`, `Home.svelte` (nur falls nötig), `App.svelte`, `lib/connection.ts`, `lib/seats.ts`, `lib/demo.ts`, `lib/locales/de.json`, `en.json`, `test/fixtures.ts`
- Create: `components/TournamentLobby.svelte` (+ Test), `components/TournamentFormatPicker.svelte`

**Interfaces:**
- `CreatePanel`: neuer Schalter „Turnier“ (nativer `checkbox` im Switch-Stil); an: der Modus-Picker bietet nur `classic`, `lizard-spock`, `wheel7/9/15` (kein Bluff/2v2), Best-of entfällt (fest 3), neue Radiogruppe „Format“ (`knockout`/`roundrobin`), Bot-Option verschwindet; Payload `tournament: { format }`.
- `connection.ts`: `skipWait = () => send('tournament:skip', {})`.
- `App.svelte`: Screen-Wahl berücksichtigt `room.tournament?.phase` — `lobby` → `TournamentLobby`, `draw` → Auslosung (Task 6), `match` → Spielende `Board` / sonst `Spectate` (mit Turnierkopf, Task 6), `intermission` → Baum/Tabelle (Task 6), `finished` → Siegerehrung (Task 6).
- `TournamentLobby.svelte`: Teilnehmerliste (Avatare, Namen, „Host“-Marke, Verbindungsstatus), Format und Modus anzeigen, Zähler „n / 8“, Host: „Turnier starten“ (deaktiviert unter 4, Hinweis `tournament.need_players`), Einladungs-/Code-Kopierzeile (`CopyRow`), Zuschauer-Hinweis. Keine Plätze, kein `SeatSlot`.
- Neue Keys DE/EN: `tournament.title`, `tournament.format`, `tournament.format.knockout`, `tournament.format.roundrobin`, `tournament.switch`, `tournament.players` (`{n}`), `tournament.need_players`, `tournament.start`, `tournament.host`, `tournament.spectators_note`, `error.not_enough_players`.

- [ ] **Step 1: Failing tests:** `Home.test.ts`/`CreatePanel`: Turnier-Schalter blendet Bluff/2v2/Bot/Best-of aus, sendet `tournament: { format }` mit Standardformat `knockout`; `TournamentLobby.test.ts`: Teilnehmerliste, Start nur für Host und ab 4, Hinweistext, Zuschauer sehen keinen Startknopf; `App.routing.test.ts`: Turnierphasen wählen die richtigen Screens. Bestehende Tests bleiben unverändert.
- [ ] **Step 2–4:** FAIL → implementieren → `npx vitest run apps/web`, `npm run lint`, `npm run typecheck`. Layoutprüfung mit Headless-Chromium (kein geteiltes Browser-Tool): `?demo=tournament-lobby` bei 360/1280 px, hell/dunkel, kein Überlauf.
- [ ] **Step 5: Commit** `feat(web): create and wait in tournament lobbies`.

### Task 6: Web – Auslosung, Baum, Tabelle, Pause, Siegerehrung

**Files:**
- Create: `components/TournamentDraw.svelte`, `Bracket.svelte`, `StandingsTable.svelte`, `TournamentHeader.svelte`, `Intermission.svelte`, `Podium.svelte` (+ Tests)
- Modify: `components/Board.svelte`/`BoardView.svelte` und `Spectate.svelte` (Turnierkopf einhängen), `App.svelte`, `styles/animations.css`, `lib/locales/*`, `lib/demo.ts`

**Interfaces:**
- `Bracket.svelte`: Props `{ tournament: PublicTournament }`; Spalten pro `round`, Karten pro Paarung mit Avataren/Namen, Freilos als „Freilos“, Sieger markiert (Häkchen + Rahmen, nicht nur Farbe), aktuelle Paarung hervorgehoben (`aria-current="true"`), Münzwurf-Hinweis bei `decidedBy === 'coin'`; horizontal scrollbar nur innerhalb der Komponente, die Seite scrollt nie horizontal.
- `StandingsTable.svelte`: Props `{ tournament }`; echte `<table>` mit Rang, Name, Siege, Niederlagen, Runden; geteilte Ränge sichtbar; Stichmatches als eigene Zeile „Stichmatch“.
- `TournamentDraw.svelte`: zeigt die Namen, die „durcheinanderwirbeln“ und im Baum/Tabelle landen (Bewegung nur über Klassen in `animations.css`); bei reduzierter Bewegung ohne Animation direkt das Ergebnis; Host-Knopf „Überspringen“ (`tournament.skip`).
- `Intermission.svelte`: Baum bzw. Tabelle + Ergebnis des letzten Matches + Hinweis „Nächstes Match: A gegen B“ + Countdown-Anzeige bis `untilMs`; Host: „Überspringen“.
- `Podium.svelte`: Treppchen Platz 1–3 mit Avataren (geteilte Plätze nebeneinander), Konfetti für den Sieger (vorhandene `Confetti`), Host: „Nochmal“ (`rematch`), alle: „Zurück“.
- `TournamentHeader.svelte`: schmale Leiste über Board/Spectate: Format, „Runde x“, aktuelle Paarung, Link „Baum“/„Tabelle“ als Aufklappbereich (`<details>`).
- Neue Keys DE/EN: `tournament.draw`, `tournament.skip`, `tournament.bye`, `tournament.next_match` (`{a}`, `{b}`), `tournament.round` (`{n}`), `tournament.final`, `tournament.semifinal`, `tournament.tiebreak`, `tournament.coin`, `tournament.champion` (`{name}`), `tournament.place` (`{n}`), `tournament.table.*`, `tournament.again`.

- [ ] **Step 1: Failing tests:** `Bracket.test.ts`: 8-Spieler-Zustand zeigt 3 Spalten, Freilos-Karte, Sieger-Markierung mit Häkchen, `aria-current` auf der aktuellen Paarung; `StandingsTable.test.ts`: Rang-Teilung, Stichmatch-Zeile; `Podium.test.ts`: Treppchen mit geteiltem 3. Platz, Host sieht „Nochmal“, Nicht-Host nicht; `TournamentDraw.test.ts`: Namen sichtbar, Skip nur für Host, bei `matchMedia`-Stub `reduce` keine Animationsklasse; `Intermission.test.ts`: zeigt das nächste Match und den Countdown (Fake-Timer). `animations.test.ts` und der Komponenten-`<style>`-Wächter bleiben grün.
- [ ] **Step 2–4:** FAIL → implementieren → `npx vitest run apps/web`, Lint, Typecheck. Layoutprüfung wie Task 5 für Demo-Zustände `tournament-draw`, `-bracket` (8 Spieler), `-table`, `-intermission`, `-podium`, 360/390/1280 px, hell/dunkel, mit und ohne reduzierte Bewegung; Screenshots ansehen.
- [ ] **Step 5: Commit** `feat(web): show tournament draw, bracket, standings and podium`.

### Task 7: End-to-End und Doku

**Files:**
- Modify: `e2e/game.spec.ts` oder neu `e2e/tournament.spec.ts`, `e2e/helpers/app.ts`, `README.md`

- [ ] **Step 1:** E2E mit **vier Browser-Kontexten** (`reducedMotion: 'reduce'`, damit Auslosung und Countdown entfallen): Host legt ein K.o.-Turnier (Klassisch) an, drei treten per Code bei, Host startet; die zwei Spielenden der ersten Paarung spielen ihr Match (A wählt Stein, B Schere); die zwei anderen sehen das Match als Zuschauer ohne Geste vor dem Aufdecken (Rohframes prüfen); nach der Pause (Host überspringt) spielt Paarung 2; im Finale gewinnt jemand, Siegerehrung zeigt Platz 1 bis 3, „Nochmal“ führt in die Lobby. Zweiter Test: Alle gegen alle mit vier Spielern, ein Teilnehmer lädt in der Pause neu und bleibt im Turnier; ein anderer verlässt das Turnier (Kontext schließen) und verliert nach der Frist per Forfait (Frist im Test über die vorhandene Konfiguration/Uhr abkürzen, falls vorhanden, sonst nur bis zur Anzeige „Wiederverbinden …“ prüfen und den Forfait im Servertest belassen).
- [ ] **Step 2:** README: Turniermodus (Format, Regeln, Fristen, Zuschauer) in einem Abschnitt, Konstanten-Tabelle um `TOURNAMENT_*`, `DRAW_MS`, `INTERMISSION_MS` ergänzen.
- [ ] **Step 3:** `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run e2e`: alle grün.
- [ ] **Step 4: Commit** `test(e2e): cover knockout and round-robin tournaments`.

## Self-Review

- **Spec-Abdeckung:** Format-Wahl (Task 2/5), 4–8 Spieler und Zuschauer danach (Task 3a), Modus fix/Best of 3 (Task 2/3a), zufällige Auslosung mit Animation (Task 1/6), nacheinander + Live-Zuschauen (Task 3a/4), automatische Pause mit Skip (Task 3a/4/6), Host spielt mit (Task 3a), Gleichstand/Stichmatch/geteilte Plätze (Task 1), kein Sieger → Münzwurf bzw. beide verloren (Task 1/3a), Frist pro Person ab Aufruf und Forfait (Task 3b), Host-Wechsel nur auf Teilnehmer (Task 3b), Nochmal (Task 3b/6), Siegerehrung (Task 6), Geheimhaltung (Task 4/7).
- **Typkonsistenz:** `TournamentState`, `Pairing`, `PairingResult`, `MatchOutcome`, `PublicTournament`, `PublicPairing`, `PublicParticipant`, `TournamentRoom`, `TournamentWho`, Konstanten `TOURNAMENT_MIN_PLAYERS`/`MAX`, `DRAW_MS`, `INTERMISSION_MS`, `TIEBREAK_MAX_ROUNDS` und die Event-/Fehlernamen (`tournament:skip`, `not_enough_players`) sind überall gleich.
- **Offene Planannahmen:** Der Gesamtumfang ist groß; die Tasks 3a/3b/4 sind der riskanteste Teil (Zustand im Raum-JSON, Kanalwechsel, Idempotenz des Tickers) und sollten mit der besten Modellstufe umgesetzt und einzeln reviewt werden.
