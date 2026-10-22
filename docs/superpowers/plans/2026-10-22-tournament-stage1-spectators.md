# Turnier Stufe 1: Zuschauer und Personen im Raum – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Raum kann zusätzlich zu den Spielenden beliebig viele (bis `MAX_SPECTATORS`) **Zuschauer** halten. Wer einer bereits gestarteten Partie beitritt, schaut zu, statt „Raum voll“ zu bekommen. Zuschauer sehen alles, was der Gegner auch sieht, aber nie eine ungewählte Geste.

**Architecture:** Die Match-Logik und die vier festen Plätze (`a0`, `a1`, `b0`, `b1`) bleiben unverändert. Neu ist ein zweiter Personentyp `Spectator` im Raum, eine zweite View-Form (`SpectatorView`, für alle Zuschauer identisch, daher ein gemeinsamer Socket-Kanal) und ein `role`-Feld in `RoomView`. Stufe 2 (Turnier, siehe `2026-10-22-tournament-stage2-tournament.md`) baut darauf auf.

**Tech Stack:** TypeScript, Zod, Socket.IO, Redis (Raum als ein JSON-Dokument), Svelte 5, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-tournament-mode-design.md` (Abschnitte „Ziele“, „Anti-Ziele“, „Rahmenbedingungen aus dem Bestand“, „Stufe 1“, „Entscheidungen des Autors“). Dieser Plan setzt nur Stufe 1 um. Er startet auf dem Stand von `feat/comic-panel` (oder `main`, sobald der Comic-Panel-PR gemergt ist), nicht davor.

## Global Constraints

- Das Spielverhalten für Spielende bleibt unverändert (1v1, 2v2, Bot, Bluff). Einzige gewollte Verhaltensänderung: ein Beitritt **nach dem Start der Partie** wird Zuschauer statt `room_full`. Vor dem Start bleibt ein volles Duell-Lobby voll (`room_full`).
- Zuschauer zählen **nie** als Spieler: nicht für `isAbandoned`, Leerlauf-Abbruch (`IDLE_ROUNDS_LIMIT`), „Weiter“-Abstimmung (`applyNext`), Forfait, Verlassen, Wiederverbinden-Frist der Spielenden.
- Geheimhaltung: `PublicMatch` für Zuschauer hat `yourPick: null`; kein `picks`, kein `token` irgendeiner Person im Datenverkehr (auch nicht im Rohframe). Views bleiben explizite Erlaubnislisten ohne Spread.
- Die Zuschauer-View ist für alle Zuschauer identisch (sie enthält keine eigene ID). Ein gemeinsamer Kanal `${code}:spec`.
- `MAX_SPECTATORS = 16` (neu in `packages/shared/src/constants.ts`). Darüber: `room_full`.
- Räume, die vor dieser Änderung gespeichert wurden, müssen weiter laden: neue Raumfelder sind **optional** (fehlend = leer).
- Neue Fehlercode `not_player` (Zuschauer sendet Spiel- oder Host-Ereignis); DE/EN-Text; `i18n.test.ts` prüft alle `ERROR_CODES`.
- Alle neuen Texte in `de.json` **und** `en.json`. Keine Hex-Werte in Komponenten; Bewegung nur in `styles/animations.css` (Block `prefers-reduced-motion: no-preference`); keine Inline-Styles außer `style:--x`; Comic-Panel-Look (`.panel`, Tokens).
- Bestehende Tests nur ändern, wo dieser Plan es ausdrücklich nennt.
- Commits Conventional Commits, Trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Zuschauer-JSON (Zustand und Rohframes) enthält nie eine ungewählte Geste, Token oder `picks` (Task 3, 4, 7).
2. Ein Zuschauer, der sich trennt oder dessen Frist abläuft, ändert weder Phasenzeiten noch `deadline` der Spielenden noch den Leerlauf-Abbruch; sein Platz wird freigegeben (Task 2).
3. Zuschauer rejoint per Token nach Reload und bekommt wieder die Zuschauer-View, nicht „bad_token“ (Task 2, 5).
4. Ein Zuschauer sendet `game:pick`, `room:start`, `seat:move`, `game:next`, `room:rematch`: Fehler `not_player`, kein Zustand ändert sich (Task 4).
5. Raum mit abgelaufenen Spielenden wird abgeräumt (`isAbandoned`) auch wenn Zuschauer verbunden sind; deren Sockets verlassen den Raum (`dropRoom`) (Task 2, 4).

---

### Task 1: Gemeinsame Typen, Konstante, Fehlercode

**Files:**
- Modify: `packages/shared/src/protocol.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/protocol.test.ts`

**Interfaces:**
- Produces in `constants.ts`: `export const MAX_SPECTATORS = 16;`
- Produces in `protocol.ts`:
  - `ERROR_CODES` bekommt `'not_player'` (Zuschauer darf das nicht).
  - `export interface PublicSpectator { id: string; nickname: string; avatar: string; connected: boolean }`
  - `export interface PlayerView { role: 'player'; code: string; config: RoomConfig; you: SeatId; hostSeat: SeatId; isHost: boolean; players: Partial<Record<SeatId, PublicPlayer>>; spectators: PublicSpectator[]; match: PublicMatch | null; deadline: number | null }` (das bisherige `RoomView` plus `role`, `isHost`, `spectators`).
  - `export interface SpectatorView { role: 'spectator'; code: string; config: RoomConfig; hostSeat: SeatId; isHost: boolean; me: { id: string } | null; players: Partial<Record<SeatId, PublicPlayer>>; spectators: PublicSpectator[]; match: PublicMatch | null; deadline: number | null }` (ohne `you`; `match.yourPick` ist immer `null`). In Stufe 1 ist `isHost` immer `false` und `me` immer `null`; Stufe 2 füllt beides für Turnierteilnehmer, die gerade nicht spielen.
  - `export type RoomView = PlayerView | SpectatorView;`
  - `RoomJoined` wird `{ code: string; token: string; role: 'player' | 'spectator'; seat: SeatId | null }` (`seat` ist für Zuschauer `null`).

- [ ] **Step 1: Failing tests** in `protocol.test.ts`: `ERROR_CODES` enthält `not_player`; `MAX_SPECTATORS` ist `16`; Typtest per `satisfies`-Zuweisung, dass ein `PlayerView`-Literal `role: 'player'` verlangt und ein `SpectatorView`-Literal kein `you` hat (compile-time, per `// @ts-expect-error`). Der bestehende Test, der `RoomJoined` auf genau `{code, seat, token}` festschreibt (`protocol.test.ts:134-137`), wird auf `{code, token, role, seat}` angepasst (die einzige erlaubte Änderung eines bestehenden Tests hier).
- [ ] **Step 2:** `npx vitest run packages/shared` → FAIL.
- [ ] **Step 3:** Typen und Konstante wie oben anlegen; `RoomView` und `RoomJoined` ersetzen. Folgefehler in `apps/server` und `apps/web` (Typecheck) bewusst ignorieren, sie werden in den Tasks 2–5 behoben; Task 1 committet nur `packages/shared`, `npx vitest run packages/shared` und `npm run typecheck -w @rps/shared` sind grün.
- [ ] **Step 4: Commit** `feat(shared): add spectator role, views and error code`.

### Task 2: Server-Raummodell und Engine

**Files:**
- Modify: `apps/server/src/room.ts`, `engine.ts`, `settle.ts`
- Test: `apps/server/src/engine.test.ts` (nur ergänzen; zwei bestehende Fälle werden angepasst, siehe Step 1), `settle`-Tests falls vorhanden

**Interfaces:**
- Consumes: `MAX_SPECTATORS`, `PublicSpectator` (Task 1).
- Produces in `room.ts`:
  - `export type Spectator = PublicSpectator & { token: string; socketId: string | null; disconnectedAt: number | null };`
  - `Room.spectators?: Spectator[]` (optional; fehlend = `[]`). Hilfsfunktion `spectatorsOf(room: Room): Spectator[]`.
- Produces in `engine.ts`:
  - `export type Who = { role: 'player'; seat: SeatId } | { role: 'spectator'; id: string };`
  - `joinRoom(room, nickname, avatar, now, socketId?)` liefert jetzt `{ room: Room; who: Who }`. Regel: `room.match === null` → wie bisher Platz oder `room_full`; `room.match !== null` (läuft oder beendet) → Zuschauer, `room_full` ab `MAX_SPECTATORS`. Die Zuschauer-ID ist 8 Zeichen Hex (`randomBytes(4)`), Token 128 Bit wie bei Spielenden.
  - `whoOfSocket(room: Room, socketId: string): Who | null` (ergänzt `seatOfSocket`, das unverändert bleibt).
  - `markSpectatorDisconnected(room, id, now): Room`, `markSpectatorConnected(room, id, now, socketId): Room`, `leaveSpectator(room, id): Room`.
  - `rejoinRoom(room, token, now, socketId)` liefert `{ room; who: Who; previousSocketId: string | null }`; ein Zuschauer-Token wird gefunden wie ein Spieler-Token (zeitkonstant verglichen); abgelaufene Frist → `bad_token`.
  - `tick`: entfernt Zuschauer, deren Wiederverbinden-Frist (`RECONNECT_GRACE_MS`) abgelaufen ist; dies ist die **einzige** Wirkung von Zuschauern auf den Ticker.
- Produces in `settle.ts`: `schedule` nimmt die Frist-Enden der Zuschauer in `deadline` auf (nur zum Aufwecken), nie in `phaseDeadline`. `humans`, `isAbandoned`, `graceEnd` bleiben **nur** Spielende.

- [ ] **Step 1: Failing tests** (`engine.test.ts`, feste Zeiten/`rng`): (a) Beitritt in ein Duell **vor** Start mit besetzten Plätzen → `room_full` (unverändert); (b) Beitritt **nach** `startMatch` → `who.role === 'spectator'`, Raum hat einen Zuschauer, `room.match` unverändert (`toBe`); (c) auch nach beendetem Match → Zuschauer; (d) 17. Zuschauer → `room_full`; (e) Zuschauer verbunden, alle Spielenden weg und Frist abgelaufen → `isAbandoned` ist `true`; (f) ein Zuschauer, der sich trennt/zurückkommt/Frist überschreitet, ändert `phaseDeadline`, `idleRounds`, `nextReady`, `match` nicht (`toEqual` auf diese Felder) und wird beim Frist-Ablauf aus `spectators` entfernt; (g) `applyNext` zählt Zuschauer nicht als Abstimmende; (h) `rejoinRoom` mit Zuschauer-Token → `who.role === 'spectator'`, mit abgelaufener Frist → `bad_token`; (i) `rematch` lässt Zuschauer unverändert; (j) ältere gespeicherte Räume ohne `spectators`-Feld funktionieren (`joinRoom`, `tick`). **Bestehende Fälle**, die `room_full` für einen Beitritt nach Start oder die alte Rückgabeform von `joinRoom` (`{room, seat}`) erwarten, werden auf die neue Form/Regel angepasst und im Bericht aufgelistet.
- [ ] **Step 2:** `npx vitest run apps/server/src/engine.test.ts` → FAIL.
- [ ] **Step 3:** Implementieren nach den Interfaces. Hinweis: `joinRoom` bleibt rein (nimmt `now`, `socketId`).
- [ ] **Step 4:** `npx vitest run apps/server` grün (Gateway-Tests, die noch die alte Form nutzen, sind Task 4; bis dahin dürfen **nur** diese rot sein und müssen im Bericht benannt werden).
- [ ] **Step 5: Commit** `feat(server): add spectators to the room model and engine`.

### Task 3: Views

**Files:**
- Modify: `apps/server/src/view.ts`, `apps/server/src/store.contract.ts` (Fixture `makeRoom`)
- Test: `apps/server/src/view.test.ts`

**Interfaces:**
- Consumes: `Spectator`, `spectatorsOf` (Task 2), `PlayerView`, `SpectatorView` (Task 1).
- Produces: `viewFor(room: Room, seat: SeatId): PlayerView` (jetzt mit `role: 'player'`, `isHost: seat === room.hostSeat`, `spectators: PublicSpectator[]`) und `spectatorViewFor(room: Room): SpectatorView` (explizite Erlaubnisliste; `match.yourPick` ist `null`; `isHost: false`, `me: null`; keine Tokens).

- [ ] **Step 1: Failing tests:** `spectatorViewFor` auf einem Raum mit laufender Pick-Phase und gesetzten Picks beider Seiten: `JSON.stringify(view)` enthält weder die Gesten-Namen der Picks noch irgendeinen Token (Spielende und Zuschauer), `Object.keys(view.match)` enthält kein `picks`; `lockedSeats` ist vorhanden; nach dem Aufdecken enthält `lastRound` die Gesten; `yourPick` ist `null`. `viewFor` enthält `role: 'player'`, `isHost` und die Zuschauerliste (nur `id`, `nickname`, `avatar`, `connected`). Der bestehende `toEqual` auf die ganze Spieler-View (`view.test.ts:124`) wird um die drei neuen Felder ergänzt (einzige erlaubte Änderung).
- [ ] **Step 2:** Tests → FAIL. **Step 3:** Implementieren. **Step 4:** `npx vitest run apps/server/src/view.test.ts` grün.
- [ ] **Step 5: Commit** `feat(server): add the spectator view and role fields`.

### Task 4: Gateway

**Files:**
- Modify: `apps/server/src/gateway.ts`
- Test: `apps/server/src/gateway.test.ts` (bestehende `room_full`-Fälle nach Start siehe Step 1), ggf. `http.test.ts` unberührt

**Interfaces:**
- Consumes: `joinRoom`/`rejoinRoom` → `Who`, `whoOfSocket`, `markSpectatorDisconnected` (Task 2), `viewFor`, `spectatorViewFor` (Task 3).
- Produces: `export const spectatorChannel = (code: string) => `${code}:spec``. `bind` tritt für Zuschauer dem Raumkanal `code` und `spectatorChannel(code)` bei und sendet `room:joined { code, token, role: 'spectator', seat: null }`. `broadcast` sendet jeder Spielenden-Seat seine `viewFor` und **einmal** `spectatorViewFor` auf `spectatorChannel`. `dropRoom` lässt auch `spectatorChannel` los. `release()` unterscheidet über `whoOfSocket` Spielende (wie bisher `markDisconnected`) und Zuschauer (`markSpectatorDisconnected`). Spiel- und Host-Ereignisse (`room:start`, `seat:move`, `game:announce`, `game:pick`, `game:next`, `room:rematch`) von einem Zuschauer-Socket → `room:error { code: 'not_player' }`, der Zustand ändert sich nicht (`asSeat` prüft `whoOfSocket`).

- [ ] **Step 1: Failing tests:** (a) Spiel läuft, dritter Client tritt per `room:join` bei → bekommt `room:joined` mit `role: 'spectator'`, `seat: null`, und danach `room:state` mit `role: 'spectator'`; (b) Spieler-Views bleiben unverändert (nur zusätzliche Felder); (c) Zuschauer sendet `game:pick`/`room:start`/`seat:move`/`game:next`/`room:rematch` → jeweils `not_player`, kein `room:state`-Broadcast mit geändertem Inhalt; (d) **Geheimhaltung im Rohdatenverkehr:** Spieler A wählt `rock`; alle Frames, die der Zuschauer-Socket bis zum Aufdecken empfängt, enthalten weder `rock` noch den Token von A oder B (Muster des bestehenden E2E-Tests „secrecy“); nach dem Aufdecken enthält `lastRound` beide Gesten; (e) Zuschauer trennt sich → Spielende bekommen keinen Zustand mit geänderter Phase; `room:rejoin` mit Zuschauer-Token → wieder `role: 'spectator'`; (f) Raum wird abgeräumt (Ticker/`dropRoom`): Zuschauer-Socket verlässt `spectatorChannel`. **Bestehende** `gateway.test.ts`-Fälle (`:167-199`) „room_full nach Start“ werden angepasst (neuer Beitritt = Zuschauer; `room_full` erst bei 17 Zuschauern) und im Bericht aufgelistet.
- [ ] **Step 2:** → FAIL. **Step 3:** Implementieren. **Step 4:** `npx vitest run apps/server` komplett grün, `npm run typecheck -w @rps/server` grün.
- [ ] **Step 5: Commit** `feat(server): let late joiners watch as spectators`.

### Task 5: Web-Datenschicht

**Files:**
- Modify: `apps/web/src/lib/connection.ts`, `lib/seats.ts`, `lib/sfx-bridge.ts`, `lib/demo.ts`, `App.svelte`, `test/fixtures.ts`, `test/connection-mock.ts`, alle Komponenten, die den Typ `RoomView` als Spieler-View benutzen (`BoardView`, `Board`, `Lobby`, `Result`, `Scoreboard`-Aufrufer usw.)
- Test: `lib/seats.test.ts`, `lib/sfx-bridge.test.ts`, `App.routing.test.ts` (nur ergänzen), `lib/connection.test.ts`

**Interfaces:**
- Consumes: `PlayerView`, `SpectatorView`, `RoomView`, `RoomJoined` (Task 1).
- Produces in `connection.ts`: der Store `room: Readable<RoomView | null>` bleibt; neu `playerRoom: Readable<PlayerView | null>` und `spectatorRoom: Readable<SpectatorView | null>` (abgeleitet über `role`). Die Sitzung (`rps.session`) bleibt `{code, token}`; `room:joined` für Zuschauer speichert sie genauso.
- `seats.ts`: `isHost(room: PlayerView | SpectatorView): boolean` liest `room.isHost` (statt `you === hostSeat`); `canStart` bleibt für `PlayerView`.
- `sfx-bridge.ts`: `diffRoomSounds(prev, next)` verwendet `next.you` nur für `role === 'player'`; für Zuschauer liefert es höchstens `reveal` (Phasenwechsel auf `reveal`) und nie `lock`/`win`/`lose`/`draw`.
- `App.svelte`: neuer Screen `'spectate'` für `role === 'spectator'` (Komponente folgt in Task 6; bis dahin Platzhalter `<Spectate />`-Import, der in Task 6 entsteht, bitte in Task 6 anlegen und hier nur den Zweig vorbereiten).
- `test/fixtures.ts`: `makeRoom` erzeugt `PlayerView` mit `role: 'player'`, `isHost`, `spectators: []`; neu `makeSpectatorRoom(overrides)`.

- [ ] **Step 1: Failing tests:** `seats.test.ts`: `isHost` folgt `room.isHost`; `sfx-bridge.test.ts`: Zuschauer-Übergang `pick → reveal` liefert nur `['reveal']` (und mit `prev === null` `[]`); `connection.test.ts`: Zustand mit `role: 'spectator'` füllt `spectatorRoom` und leert `playerRoom`; `App.routing.test.ts`: Zustand `spectator` wählt den Screen `spectate`, Spielende wie bisher. **Alle bestehenden Web-Tests bleiben unverändert und grün** (die Fixture liefert die neuen Felder).
- [ ] **Step 2:** → FAIL. **Step 3:** implementieren; `npm run typecheck -w @rps/web` ist erst nach Task 6 vollständig grün (`Spectate` fehlt), bis dahin nur `npx vitest run apps/web`.
- [ ] **Step 4:** `npx vitest run apps/web` grün. **Step 5: Commit** `feat(web): route and type the spectator role`.

### Task 6: Zuschauer-Screen, Hinweise, Texte

**Files:**
- Create: `apps/web/src/components/Spectate.svelte`, `Spectate.test.ts`, `RevealPanel.svelte` (aus `BoardView` herausgelöst), `SpectatorBadge.svelte`
- Modify: `components/BoardView.svelte` (Reveal-Zweig nutzt `RevealPanel`, Verhalten unverändert), `Lobby.svelte` und `BoardView.svelte` (Badge „n Zuschauer“), `lib/locales/de.json`, `en.json`, `components/ErrorBanner.svelte` falls Fehlertexte dort abgebildet werden, `styles/animations.css` nur falls nötig
- Test: `Board.test.ts` bleibt unverändert grün

**Interfaces:**
- `RevealPanel.svelte`: Props `{ duels: DuelView[]; labels…; burst… }` – die Darstellung der Aufdeck-Ansicht aus `BoardView` (Panel, Sticker, Burst, Speed-Lines), ohne Statussatz, Weiter-Button und Countdown. `Spectate` und `BoardView` benutzen sie. `[data-testid="duel"]` und die Regionen `aria-label` bleiben erhalten.
- `Spectate.svelte`: liest `spectatorRoom`; zeigt Kopfband „Du schaust zu“ (`spectate.banner`), `Scoreboard` (beide Spielende, ohne „Du“), `TimerBar`, Statussatz als `role="status"` (z. B. „A überlegt …“, „B hat gewählt“, danach Ergebnis), die zwei Spielenden als Namensschilder, im Reveal das `RevealPanel`, bei `phase === 'finished'` einen Abschluss-Kasten („Match beendet“, Sieger) und „Zurück zum Start“ (`forgetSession()` + Reload wie `Result`). Kein Gesten-Pad, keine Kamera, kein „Weiter“.
- Neue Keys DE/EN: `spectate.banner`, `spectate.waiting_pick` (`{name}`), `spectate.locked` (`{name}`), `spectate.finished` (`{name}`), `spectate.count` (`{n}`; Plural „1 Zuschauer“/„n Zuschauer“), `error.not_player`.
- `SpectatorBadge.svelte`: Props `{ spectators: PublicSpectator[] }`, zeigt Anzahl und Namen als Tooltip-Text (`title` + sichtbarer Zähler), nichts bei 0.

- [ ] **Step 1: Failing tests** (`Spectate.test.ts`, `makeSpectatorRoom`): Pick-Phase mit `lockedSeats: ['b0']` zeigt „… hat gewählt“ für den Gegner und „… überlegt …“ für den anderen, **keine** Geste; Reveal zeigt beide Gesten, `[data-testid="duel"]` und das Ergebnis; kein Button „Weiter“, keine `radio`-Rolle; `finished` zeigt Sieger und „Zurück zum Start“; `SpectatorBadge` zeigt „2 Zuschauer“ bei zwei. `Board.test.ts`/Lobby-Tests unverändert grün (Regression für den Ausschnitt in `RevealPanel`).
- [ ] **Step 2:** → FAIL. **Step 3:** implementieren; Svelte-Meldungen zu fehlenden Texten per `npm run typecheck -w @rps/web` und `i18n.test.ts` (Parität, `ERROR_CODES`) prüfen.
- [ ] **Step 4:** `npx vitest run apps/web`, `npm run lint`, `npm run typecheck` grün. Echte Layoutprüfung (jsdom sieht kein Layout): Vite-Dev-Server von `apps/web` auf einem freien Port starten (`cd apps/web && npx vite --port <p>`), mit Headless-Chromium via Playwright (kein geteiltes Browser-Tool) `?demo=spectate` (neuer Demo-Zustand in `lib/demo.ts`) bei 360/1280 px, hell/dunkel, ohne horizontalen Überlauf, Screenshots ansehen.
- [ ] **Step 5: Commit** `feat(web): add the spectator screen and spectator badge`.

### Task 7: End-to-End und Doku

**Files:**
- Modify: `e2e/game.spec.ts`, `e2e/helpers/app.ts`, `README.md` (Abschnitt Protokoll/Räume)

- [ ] **Step 1:** Neuer Test in `game.spec.ts`: A und B spielen ein Duell, C öffnet `?room=<code>` und tritt bei → C sieht den Zuschauer-Screen (Banner „You are watching“), die Namen von A und B, aber **keine** Geste; nach dem Aufdecken sieht C beide Gesten; C wird in der Spieleransicht als „1 spectator“ angezeigt; die Rohframes von C enthalten vor dem Aufdecken weder die gewählte Geste noch einen Token (Muster des bestehenden Geheimhaltungstests); C lädt neu und bleibt Zuschauer. Zweiter Test: Beitritt in ein volles Duell **vor** dem Start liefert weiter `room_full`.
- [ ] **Step 2:** README: Zuschauerrolle, `MAX_SPECTATORS`, Kanalmodell in einem kurzen Absatz.
- [ ] **Step 3:** Gesamtlauf `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run e2e`: alle grün.
- [ ] **Step 4: Commit** `test(e2e): cover spectators joining a running duel`.

## Self-Review

- **Spec-Abdeckung:** Zuschauerrolle in allen Räumen (T2/T4/T6), Beitritt nach Start (T2), identische geheimhaltungssichere Zuschauer-View (T3), Nicht-Zählen als Spieler (T2), Rejoin per Token (T2/T4/T5), „Raum voll“ vor dem Start (T2/T7), Texte DE/EN (T6), Teilnehmer-Identität für Stufe 2 wird über `Who` und `isHost` vorbereitet. **Nicht** in Stufe 1: Host-Wechsel zu Zuschauern, Platz einnehmen aus der Zuschauerrolle, Turnier.
- **Typkonsistenz:** `Who`, `Spectator`, `spectatorsOf`, `whoOfSocket`, `spectatorChannel`, `spectatorViewFor`, `PlayerView`, `SpectatorView`, `PublicSpectator`, `RoomJoined { role, seat: SeatId | null }`, `MAX_SPECTATORS` sind in den Tasks 1–6 gleich benannt.
- **Proportion:** Der Plan enthält Signaturen und Testfälle, keine Funktionskörper.
