# Comic-Panel-Design und Reveal-Countdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Web-Frontend (`apps/web`) bekommt den „Comic-Panel“-Look samt Animationen und einen „Schnick, Schnack, Schnuck“-Countdown vor dem Aufdecken.

**Architecture:** Erst Tokens, i18n und die reine Logik (`motion`, `shouldCountDown`, Ton-Planung), dann gemeinsame Bausteine (`.panel`, Ribbon, Segment-/Switch-Optik), dann Screen für Screen (Start → Wahl → Aufdecken+Countdown → Ergebnis/Lobby). Jede Aufgabe bringt ihre Bewegung selbst in `styles/animations.css` mit; Komponenten setzen nur Klassen.

**Tech Stack:** Svelte 5 (Runes), Vite, Vitest + jsdom + Testing Library, Playwright, reines CSS mit Tokens.

**Spec:** `docs/superpowers/specs/2026-10-22-comic-panel-design-handoff.md` (Kopie des Handoffs; §-Verweise unten beziehen sich darauf). Die dort genannten `reference/*.dc.html` liegen **nicht** vor; maßgeblich sind die Zahlen im Handoff.

## Global Constraints

Alle Pfade relativ zu `apps/web/src`, falls nicht anders angegeben. Branch: `feat/comic-panel` (von `main`).

- Keine Hex-Werte in Komponenten; Farben, Radien, Schatten, Schriften, Zeiten nur aus `styles/tokens.css`. (Ausnahme laut Spec: die Streifen-Farbe `rgb(23 15 46 / 14%)` im Timer und `#000` in der Speed-Lines-Maske.)
- Jede Bewegung (`animation`, `transition`, `@keyframes`) nur in `styles/animations.css` im einen Block `@media (prefers-reduced-motion: no-preference)`. Weder `ui.css`, `base.css` noch ein Svelte-`<style>` enthält Bewegung.
- Animationen nutzen die Einzel-Properties `translate`, `rotate`, `scale`. Dauer-Animation (`bob`, `tile-bob`) auf dem **inneren** Element, Hover/Press auf dem äußeren.
- Keine Inline-Styles außer `style:--x`.
- Modus, Best-of, Bot-Stufe bleiben native `radio` in `fieldset.group`, Bot bleibt `checkbox`; `GesturePad` bleibt `role="radiogroup"` mit Roving-Tabindex; Statussatz bleibt `role="status"`; Auswahl nie nur über Farbe.
- Jeder neue Text in `de.json` **und** `en.json`.
- Server unangetastet (Ausnahme Task 12, nur nach Freigabe).
- Vorhandene Tests nur ändern, wenn dieser Plan es ausdrücklich sagt.
- Commit-Format Conventional Commits, Trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Weiße Kästen auf farbigen Flächen nutzen `--sticker`, nicht `--surface` (Dark-Mode, Spec §8.5).
- Ohne Freigabe **nicht** umsetzen: Rad-Modi zusammenfassen (alle 7 Modi bleiben einzeln), Zifferntasten für Gesten.

## Entscheidungen, die der Plan trifft (bitte gegenlesen)

- **CTA-Wackeln (§8.4):** umgesetzt wie vorgeschlagen: nur Start-Screen, `animation-iteration-count: 5`, Start nach 2 s. Ändert sich mit einer Zeile.
- **`REVEAL_MS` (§8.1):** Task 12 ist **gesperrt**, bis Jan zustimmt. Bis dahin bleibt es bei 4 s.
- **Countdown-Wörter** stapeln sich (Takt 2 zeigt Wort 1 und 2, usw.); jedes Wort poppt beim Erscheinen.
- **Beitreten-Button:** sichtbarer Text `home.join_short` („Rein!“), der zugängliche Name bleibt `home.join` per `aria-label`, weil `Home.test.ts` und E2E (`Join room`) darauf zielen.
- **Statussatz im Countdown:** zeigt weiter den Text von vor dem Reveal (`board.picked` bzw. `board.pick`), erst nach dem Countdown das Ergebnis.
- **Reveal-Ton:** Verzögerung = Countdown-Dauer (Spec §5.3). Die `--impact-at`-Differenz (440 ms) wird nicht addiert, das entspricht dem bisherigen Verhalten.
- **Optionaler `beat`-Ton:** entfällt (YAGNI).
- **Lobby** ist in §0 genannt, aber nirgends gemockt: minimal ableiten (`.card` → `.panel` mit gehängtem Ribbon, Team-Banner bleiben).
- **Pick-Phase behält zwei benannte Regionen** („Du“/„Gegner“ mit Nickname). E2E (`region(page,'You').toContainText('Ben')`) und `Board.test.ts` hängen daran. In der Reveal-Phase darf jeder Name nur einmal vorkommen (`PlayerCard`).

## Review Focus

1. Sehr lange Nicknames (16 Zeichen, ohne Leerzeichen) und lange EN-Texte in Scoreboard, Namensschildern, Modus-Kacheln: umbrechen, nie horizontal scrollen (Task 7, 8, 9).
2. Phasenwechsel `reveal → pick` **während** des Countdowns (Server wechselt, Gegner drückt „Weiter“): Countdown wird verworfen, keine Duelle, kein hängender Timer (Task 9).
3. Zwei `reveal`-Updates mit gleicher Phase (z. B. `lockedSeats`/Connected ändert sich): kein zweiter Countdown (Task 9).
4. Spieler ohne Pick (Timeout) im Reveal: „Nichts gewählt“ statt Geste, Burst und Regel-Satz ohne `undefined` (Task 9).
5. `team2v2` und `wheel15` in Wahl und Aufdecken: nichts läuft über, Regeln/Scoreboard ohne Avatar (Task 7, 8, 9).

---

### Task 1: Branch, Tokens, Bewegungs-Wächter

**Files:**
- Modify: `styles/tokens.css`
- Create: `styles/tokens.test.ts`
- Create: `styles/components-no-motion.test.ts`

**Interfaces:**
- Produces: Tokens `--radius-panel`, `--shadow-panel`, `--gutter`, `--dot-panel`, `--dot-panel-size`, `--dot-on-tile`, `--dur-beat`, `--dur-slam`, `--impact-at`.

- [ ] **Step 1:** `git switch -c feat/comic-panel`.
- [ ] **Step 2: Failing tests.** `styles/tokens.test.ts` liest `tokens.css` von der Platte (wie `animations.test.ts`, `import.meta.dirname`) und prüft: jedes Token aus Spec §2 steht im ersten `:root`-Block mit exakt dem Wert aus dem Handoff; der `@media (prefers-color-scheme: dark)`-Block enthält `--dot-panel: rgb(255 111 181 / 40%)`. `styles/components-no-motion.test.ts` liest alle `components/*.svelte` per `readdirSync` und erwartet, dass der Inhalt jedes `<style>…</style>`-Blocks nicht `/animation|transition|@keyframes/` enthält (Leitplanke §1.2).
- [ ] **Step 3:** `npx vitest run apps/web/src/styles` → tokens.test FAIL, components-no-motion PASS (heute schon sauber).
- [ ] **Step 4:** Tokens aus Spec §2 in `tokens.css` ergänzen (`--dot-panel` im Dark-Block überschreiben). Die Werte stehen im Handoff, nichts anderes erfinden.
- [ ] **Step 5:** Test erneut → PASS.
- [ ] **Step 6: Commit** `feat(web): add comic panel design tokens`.

### Task 2: i18n-Keys

**Files:**
- Modify: `lib/locales/de.json`, `lib/locales/en.json`
- Test: `lib/i18n.test.ts` (neue `it`-Blöcke ergänzen, vorhandene unverändert)

**Interfaces:**
- Produces: Keys `home.caption`, `home.who_heading`, `home.join_short`, `countdown.1|2|3`, `board.rule` (`{winner}`, `{loser}`), `burst.zack`; geändert: `home.create` („Raum erstellen!“ / „Create room!“), `home.code_placeholder` („z. B. K7QXM“ / „e.g. K7QXM“).

- [ ] **Step 1: Failing test:** in beiden Sprachen existieren alle neuen Keys mit den Texten aus Spec §6; der Platzhalter-Code (Text nach „z. B. “/„e.g. “) hat `CODE_LENGTH` Zeichen, alle in `CODE_ALPHABET` (aus `@rps/shared`); `t('board.rule', { winner: 'Stein', loser: 'Schere' })` → „Stein schlägt Schere“.
- [ ] **Step 2:** `npx vitest run apps/web/src/lib/i18n.test.ts` → FAIL.
- [ ] **Step 3:** Keys eintragen (DE/EN identisch benannt, gleiche Reihenfolge).
- [ ] **Step 4:** Test → PASS; `npx vitest run apps/web` muss weiter grün sein (`Raum erstellen`-Selektoren sind Teilstring-Treffer).
- [ ] **Step 5: Commit** `feat(web): add comic panel and countdown texts`.

### Task 3: Countdown-Logik (`motion`, `shouldCountDown`)

**Files:**
- Modify: `lib/motion.ts`, `test/setup.ts`
- Create: `lib/countdown.ts`, `lib/countdown.test.ts`

**Interfaces:**
- Produces in `lib/motion.ts`: `export const motion: { countdownBeatMs: number }` (Default `420`, Kommentar: muss `--dur-beat` entsprechen), `export const COUNTDOWN_BEATS = 3`, `export function countdownMs(): number` (= `motion.countdownBeatMs * COUNTDOWN_BEATS`).
- Produces in `lib/countdown.ts`: `export function shouldCountDown(prev: RoomView | null, next: RoomView | null): boolean`.
- `test/setup.ts` setzt `motion.countdownBeatMs = 0`.

- [ ] **Step 1: Failing tests** (`lib/countdown.test.ts`, `makeRoom` aus `test/fixtures`; `beforeEach` setzt `motion.countdownBeatMs = 420`, `afterEach` zurück auf `0`): `true` für `pick → reveal`; `false` für `prev === null`; `false` für `reveal → reveal`; `false` für `reveal → pick`; `false` wenn eines der beiden `match === null`; `false` bei `countdownBeatMs = 0`; `false` wenn `matchMedia('(prefers-reduced-motion: reduce)').matches` (per `vi.stubGlobal('matchMedia', …)` wie `ComicBurst.test.ts`); `countdownMs()` ist `1260`. Dazu in `styles/tokens.test.ts` (Task 1) einen Fall: `--dur-beat` in `tokens.css` ist `${motion.countdownBeatMs}ms`-Default (Wert 420 aus dem Quelltext der Konstante, nicht aus dem Setup-Override: `vi.importActual` nicht nötig, einfach `420` festschreiben und Kommentar im Test).
- [ ] **Step 2:** `npx vitest run apps/web/src/lib/countdown.test.ts` → FAIL.
- [ ] **Step 3:** Implementieren. `shouldCountDown`: beide Räume mit `match`, `before.phase !== 'reveal' && after.phase === 'reveal'`, `!prefersReducedMotion()`, `countdownMs() > 0`. `test/setup.ts` ergänzen.
- [ ] **Step 4:** Test → PASS; `npx vitest run apps/web` grün.
- [ ] **Step 5: Commit** `feat(web): add reveal countdown timing and trigger rule`.

### Task 4: Ton an den Countdown koppeln

**Files:**
- Modify: `lib/sfx-bridge.ts`
- Test: `lib/sfx-bridge.test.ts` (neue Blöcke ergänzen)

**Interfaces:**
- Consumes: `shouldCountDown`, `countdownMs` (Task 3), `SOUND_LENGTH`.
- Produces: `export function scheduleRoomSounds(prev: RoomView | null, next: RoomView | null): { name: SoundName; delay: number }[]` (`delay` in Sekunden, wie `audio.play(name, delay)`). `diffRoomSounds` bleibt unverändert.

- [ ] **Step 1: Failing tests** (`motion.countdownBeatMs = 420`, danach zurücksetzen): `pick → reveal` (Sieg) ergibt `[{reveal, 1.26}, {win, 1.26 + SOUND_LENGTH.reveal}]`; mit zusätzlichem `lock` (eigener Pick schließt die Runde): `lock` bei `0`, `reveal` bei `1.26`, danach `win`; ohne Countdown (Beat 0) ist der Plan identisch zur alten Kette (`0`, `0.7`, …); `prev === null` → `[]`; Übergang nach `finished` wird **nicht** verzögert. Und: `startSfxBridge` ruft `audio.play` mit diesen Delays (bestehendes Muster mit dem Store-Mock).
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3:** `scheduleRoomSounds` bauen: `diffRoomSounds` aufrufen; `delay` läuft wie bisher kumulativ, springt aber beim Namen `reveal` auf `max(delay, countdownMs()/1000)`, falls `shouldCountDown(prev, next)`. `startSfxBridge` nutzt es statt der Inline-Schleife.
- [ ] **Step 4:** `npx vitest run apps/web/src/lib` → alles grün (alte Bridge-Tests unverändert, da Setup-Beat 0).
- [ ] **Step 5: Commit** `feat(web): delay reveal sounds until the countdown ends`.

### Task 5: Gemeinsame Bausteine in `ui.css` + Burst-Variante `zack`

**Files:**
- Modify: `styles/ui.css`, `components/ComicBurst.svelte`
- Test: `components/ComicBurst.test.ts`, `styles/ui.test.ts` (neu)

**Interfaces:**
- Produces CSS-Klassen (ohne Bewegung): `.panel` (+ `.panel--tint-*` nicht nötig; Farbe pro Screen), gehängtes `.ribbon` (`position: absolute; left: -8px; top: -18px; rotate: -1.5deg`, Panel mit Ribbon: `padding-top: var(--space-6)`), `.ribbon--sky` (Join-Panel), `.segmented` (Pill-Schalter aus `label.segment > input[type=radio]`, Segment 56×44 px, Trenner `var(--outline)`, gewählt: `--red` + weiße Schrift + Häkchen), `.switch` (Checkbox als Schalter 58×34 px, native Checkbox bleibt im DOM), `.dashed-box`.
- Produces `ComicBurst` Variante `'zack'` (`--burst-fill: var(--pink)`, `--burst-text: var(--white)`, Text mit Kontur `--line`), Prop-Typ `Variant` erweitert.

- [ ] **Step 1: Failing tests:** `ComicBurst.test.ts`: `variant: 'zack'` rendert `burst--zack`. `styles/ui.test.ts` (liest `ui.css` von Platte): enthält `.panel` mit `var(--radius-panel)` und `var(--shadow-panel)`, `.ribbon` enthält `position: absolute`, keine Hex-Farben (`/#[0-9a-f]{3,8}\b/i` darf in `ui.css` nicht matchen).
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Umsetzen. `.card` bleibt unverändert. Das alte Ribbon (Margin-Trick) wird ersetzt; alle Nutzer (`Home`, `CreatePanel`) stellen in Task 6 auf `.panel` um, daher in diesem Task die beiden Nutzer **mit** auf `class="panel …"` setzen, damit nichts visuell bricht.
- [ ] **Step 4:** `npx vitest run apps/web` grün.
- [ ] **Step 5: Commit** `feat(web): add panel, hanging ribbon, segmented and switch styles`.

### Task 6: Start-Screen

**Files:**
- Modify: `components/Home.svelte`, `CreatePanel.svelte`, `ModePicker.svelte`, `AvatarPicker.svelte`, `Wordmark.svelte` (nur Klassen für Animation), `styles/animations.css`
- Test: `components/Home.test.ts` (nur ergänzen)

**Interfaces:**
- Produces Animations-Klassen (alle im `no-preference`-Block): `.wm-rps` (`wm-drop`, 620 ms, Delay 150 ms), `.wm-arena` (`wm-swing`, 700 ms, 380 ms), `.hero-caption` (`caption-slide`, 520 ms, 650 ms), `.hero-sticker` (`sticker-pop` 480 ms, dann `bob` 2,4 s ∞; Delay 0/0,2/0,4 s über `style:--i`), `.hero-bubble` (`bubble-pop` 560 ms/700 ms, dann `breathe` 3,2 s ∞, `transform-origin` am Schweif-Eck), `.hero-dots` (`dots-drift` 5 s linear ∞), `.check-badge` (`zack` 380 ms), `.cta` (`cta-wiggle` 3 s, 5 Wiederholungen, Delay 2 s), `.screen > *` bzw. `.panel` (`screen-in` mit `animation-delay: calc(var(--i, 0) * 110ms)`). Die Keyframes stehen wörtlich in Spec §4.1.
- Consumes: `.panel`, `.ribbon`, `.segmented`, `.switch`, Tokens, i18n-Keys aus Task 2.

- [ ] **Step 1: Failing tests** in `Home.test.ts` (neue `it`s, `setLocale('de')`): (a) Hero zeigt `home.caption`, `home.title` ist weiter `heading level 2`; (b) Reihenfolge der Panels: „Wer bist du?“ (`home.who_heading`) vor „Neues Spiel“ vor „Mit Code beitreten“ (`compareDocumentPosition`); (c) Beitreten-Button: sichtbarer Text „Rein!“, `getByRole('button', {name: 'Raum beitreten'})` findet ihn weiter; (d) Code-Feld hat `maxlength="5"` und Platzhalter „z. B. K7QXM“; (e) Best-of bleibt `radio`-Gruppe mit 3 Radios und Name „Best of 5“; der gewählte Modus hat `aria-describedby` auf seine Beschreibung, **nicht gewählte Modi haben kein `aria-describedby`**, alle 7 Radios bleiben (bestehender Test); (f) Avatar-Gruppe hat 8 Radios; (g) die Bot-Checkbox ist weiter `checkbox` mit Name „Gegen Bot spielen“.
- [ ] **Step 2:** `npx vitest run apps/web/src/components/Home.test.ts` → neue FAIL, alte PASS.
- [ ] **Step 3:** Umsetzen nach Spec §3.2: Hero-Panel ersetzt `.hero` (blauer Grund, `--dot-panel`-Raster in `--dot-panel-size`, Caption-Box, drei Sticker 86 px mit −9°/3°/11° und −10 px Überlappung, Sprechblase 170 px breit); Panel „Wer bist du?“ (Nickname + `AvatarPicker` 4×2, Kachel 72 px hoch, Radius 14 px, Badge 24 px mit Häkchen oben rechts über den Rand); `ModePicker`: gewählte Kachel volle Breite mit Name (Bangers 22 px) + Beschreibung, übrige 2 Spalten, min. 48 px hoch, Beschreibung nur beim gewählten Radio per `aria-describedby`; Best-of als `.segmented`; Bot als `.switch` in `.dashed-box`; CTA `.btn-primary.cta`, volle Breite, 60 px, `box-shadow: var(--shadow-panel)`; Join-Panel mit `.ribbon--sky`, Code-Feld Mono 20 px `letter-spacing: .3em`, `maxlength={CODE_LENGTH}`, `autocapitalize="characters"` bleibt. `Wordmark` bekommt `wm-rps`/`wm-arena` als Klassen. Panels bekommen `style:--i={n}` (0…). Sticker-Neigung liegt auf einem Wrapper, `bob` auf dem inneren Element (Spec §4.1, letzter Absatz).
- [ ] **Step 4:** Animationen in `styles/animations.css` (alle Keyframes aus §4.1, die dieser Task nutzt; `screen-in` um die Verzögerung erweitern) → `npx vitest run apps/web` grün, insbesondere `animations.test.ts`.
- [ ] **Step 5: Sichtprüfung:** `npm run dev -w @rps/web` (Netz für `fetch-model.mjs` nötig; sonst `npx vite` im Ordner `apps/web`), `/?demo=home` bei 360, 390, 1280 px, Light und Dark (`emulate_media`/DevTools); Reduced Motion einmal an. Kein horizontaler Scroll, Fokus auf jedem Grund sichtbar, Gewählt nicht nur über Farbe.
- [ ] **Step 6: Commit** `feat(web): comic panel start screen`.

### Task 7: Wahl-Screen (Scoreboard, Timer, Status, Kacheln, Kamera)

**Files:**
- Modify: `components/BoardView.svelte`, `Scoreboard.svelte`, `TimerBar.svelte`, `GesturePad.svelte`, `GestureButton.svelte`, `CameraToggle.svelte`, `styles/animations.css`
- Create: `components/ThinkBubble.svelte` (Denkblase + ZACK-Stern, siehe Interfaces)
- Test: `components/Board.test.ts` (nur ergänzen), `components/Scoreboard.test.ts` (neu)

**Interfaces:**
- `Scoreboard` behält Props `{ left: Side; right: Side; round: number; bestOf: number }` und bekommt `modeName: string` (BoardView übergibt `t('mode.<id>.name')`). Scoreboard rendert Spielstand weiter als `role="group"` mit `aria-label` `board.score_label` und Text `board.score` (`1 : 0`); Meta-Zeile `board.round` links, `home.best_of · Modus` rechts. Wrapper trägt `filter: drop-shadow(5px 5px 0 var(--cast))`, die schrägen `clip-path`s (Spec §3.3) sitzen auf den inneren Panels, dazwischen der rote VS-Stern (56 px).
- `ThinkBubble.svelte`: Props `{ notes: string[]; locked: boolean }`. `locked` → ZACK-Stern (`ComicBurst` Variante `zack`, Text `t('burst.zack')`) **und** sichtbarer Text `board.opponent_locked` aus `notes`; sonst Denkblase mit zwei Kreis-Schweifen (`.think-dot`).
- `GestureButton` bekommt Prop `tone: number` (Index im Pad); Klasse `tone-${tone % 7}` in der Reihenfolge pink, yellow, teal, orange, green, sky, red; `large`-Variante bleibt für ≤ 5 Gesten.
- Neue Klassen in `animations.css`: `.tile-art` (`tile-bob` 2,4 s ∞, `animation-delay: calc(var(--i) * -0.8s)`), `.gesture:hover`/`:active` angeglichen (−5 px, 1,04 / Press 1,08 × 0,86), `.timer .track.urgent` (zittert), `.timer .bar::after`-Streifen (`timer-stripes` 600 ms linear ∞), `.think-dot` (`think-dots`, Delay 0/0,2 s), `.vs-star` (`vs-pulse` 1,4 s ∞), `.zack-star` (`zack` 420 ms).

- [ ] **Step 1: Failing tests:** `Scoreboard.test.ts`: Avatar-Seiten zeigen Avatar; für `team`-Seiten (`avatar: null`) erscheint der Team-Punkt (`.team-dot`) und kein Avatar; Spielstand-Gruppe heißt „Spielstand“ und enthält „1 : 0“; Meta enthält „Runde 2“ und „Best of 3“. `Board.test.ts` (neue `it`s): (a) Gegner hat gewählt → im Bereich „Gegner“ steht `Gegner hat gewählt` **und** ein `.burst--zack` mit „ZACK!“; vorher keins; (b) die Zahl der Sekunden liegt **im** `.track` (`screen.getByRole('timer')` → Text `5 s` ist Nachfahre von `.track`); (c) 15 Gesten (`wheel15`): 15 Radios, jedes Radio hat eine `tone-*`-Klasse; (d) Region „Du“ enthält den Nickname auch in der Pick-Phase; (e) 2v2-Pick-Screen rendert ohne Avatar im Scoreboard den Team-Punkt. Alle bisherigen `Board.test.ts`-Fälle bleiben unverändert grün.
- [ ] **Step 2:** `npx vitest run apps/web/src/components` → neue FAIL.
- [ ] **Step 3:** Umsetzen nach Spec §3.3. Layout-Zwang: In der Nicht-Reveal-Phase gibt es `section aria-label={label(you)}` (Nametag + Statussatz `p[role=status]` links) und `section aria-label={label(opponent)}` (Nametag + `ThinkBubble` rechts); `statusEl.focus()` nach dem Pick bleibt wirksam. Statussatz Bangers 26 px, Text-Schatten `--yellow`, Hintergrund `--sticker`. Timer: Höhe 26 px, Zahl rechts **im** Balken, Streifen per `repeating-linear-gradient(-45deg, transparent 0 8px, rgb(23 15 46 / 14%) 8px 16px)`; `warn`/`urgent`-Logik unverändert, `urgent` setzt zusätzlich eine Klasse am `.track`. Kacheln: farbiger Grund, `--dot-on-tile`-Raster, Sticker 92 px, Label auf `--sticker`-Kasten, Neigung reihum −1,5°/1°/−0,8° (Rotation auf dem äußeren Button wie bisher), mittlere Kachel 8 px höher, ≤ 5 Gesten: 3+2 bzw. eine Reihe, 7–15: heutige kleine Größe mit derselben Farblogik; gewählt = dickerer Versatz + Häkchen (`✓` bleibt). `CameraToggle`: Zeile in `--sticker`-Panel mit Icon, Titel, Unterzeile `camera.badge · camera.privacy`, Schalter; **alle** bisherigen Tests (`CameraToggle*.test.ts`, `Board.camera.test.ts`) bleiben unverändert grün, d. h. `aria-pressed`-Button und `role="alert"`-Bereich bleiben.
- [ ] **Step 4:** Animationen ergänzen; `npx vitest run apps/web` grün.
- [ ] **Step 5: Sichtprüfung:** `/?demo=board`, `&mode=wheel15`, `&mode=team2v2`, `&mode=lizard-spock`, `&picked=1`, `&left=3`; 360/390/1280 px, Light/Dark. Lange Nicknames im Scoreboard brechen um. Schatten sichtbar (Wrapper-Filter).
- [ ] **Step 6: Commit** `feat(web): comic panel pick screen`.

### Task 8: Countdown-Komponente

**Files:**
- Create: `components/Countdown.svelte`, `components/Countdown.test.ts`
- Modify: `styles/animations.css`, `styles/ui.css` (nur Layout/Farben, keine Bewegung)

**Interfaces:**
- Produces: `Countdown.svelte` mit Prop `onDone: () => void`. Wurzel `div.countdown[data-testid="countdown"][aria-hidden="true"]`. Zwei „?“-Sticker (104 px, Gelb und `--sky`, Klasse `.qmark`) und bis zu drei `.word`-Boxen (`countdown.1` weiß, `.2` gelb, `.3` rot mit weißem Text und Kontur `--line`). Zustand `beat` 0…2; ein Timer pro Takt mit `motion.countdownBeatMs`; nach dem dritten Takt genau ein `onDone()`. `motion.countdownBeatMs === 0` → `onDone()` sofort bei Mount. Tippen (`pointerdown`) oder Taste (`keydown`) auf `window` → sofort `onDone()`. Unmount räumt Timer und Listener auf. `onDone` wird höchstens einmal gerufen.
- Animations-Klassen: `.qmark` (`pump`, `--dur-beat` ∞), `.word` (`beat`, `--dur-beat`, `--ease-pop`, `both`).

- [ ] **Step 1: Failing tests** (`vi.useFakeTimers()`, `motion.countdownBeatMs = 420`, `afterEach` zurück auf `0`): (a) Mount zeigt „SCHNICK!“, nicht „SCHNACK!“; nach `advanceTimersByTime(420)` auch „SCHNACK!“; nach 840 auch „SCHNUCK!“; `onDone` noch nicht gerufen; (b) nach 1260 ms genau einmal `onDone`; weitere 5000 ms rufen es nicht erneut; (c) Wurzel hat `aria-hidden="true"`; (d) `fireEvent.keyDown(window)` → sofort `onDone` (einmal), danach löst der Timer nichts mehr aus; ebenso `pointerDown`; (e) Unmount vor Ende → nach `advanceTimersByTime(5000)` kein `onDone`; (f) Beat `0` → `onDone` direkt nach Render, einmal.
- [ ] **Step 2:** Test → FAIL (Datei fehlt).
- [ ] **Step 3:** Implementieren (Svelte-5-`$state`, `$effect` mit Cleanup oder `onMount`/`onDestroy`).
- [ ] **Step 4:** Test → PASS; `npx vitest run apps/web/src/styles` bleibt grün.
- [ ] **Step 5: Commit** `feat(web): add Schnick Schnack Schnuck countdown component`.

### Task 9: Aufdeck-Screen und Verdrahtung des Countdowns

**Files:**
- Modify: `components/BoardView.svelte`, `PlayerCard.svelte`, `ComicBurst.svelte` (nur falls Größe über CSS-Variable nicht reicht), `styles/animations.css`, `lib/board.ts` (nur falls für die Regel-Zeile nötig)
- Create: `components/SpeedLines.svelte` (reines `aria-hidden`-Markup, optional inline in BoardView)
- Test: `components/Board.test.ts`, neue Datei `components/Board.countdown.test.ts`

**Interfaces:**
- Consumes: `Countdown` (Task 8), `shouldCountDown`, `prefersReducedMotion`, `ComicBurst`, `board.rule`, `gestureKey`.
- BoardView-Zustand: `let countingDown = $state(false)`; vorheriger Raum nicht-reaktiv als `let prevRoom: RoomView | null = null`; ein `$effect.pre`, das `shouldCountDown(prevRoom, room)` auswertet, `countingDown = true` setzt, bei `match.phase !== 'reveal'` auf `false` stellt und `prevRoom = room` speichert. `onDone` setzt `countingDown = false`.
- Reveal-Panel: pro Duell ein `div[data-testid="duel"].clash` mit zwei `PlayerCard`-Regionen (Names „Du“/„Gegner“ bzw. Nicknames im 2v2 wie bisher), `SpeedLines`, `.impact-flash`, `ComicBurst`. Eigene Hälfte oben gelb (`clip-path: polygon(0 0,100% 0,100% 38%,0 58%)`), Gegner unten blau (`polygon(0 61%,100% 41%,100% 100%,0 100%)`), Spalt aus `--line`. Eigener Sticker 138 px / −10°, Gegner unten rechts gespiegelt 14°, Namensschild „Du · Stein“ auf `--sticker`. Unter dem Panel: Statussatz (Sprechblase), Button „Weiter“ (`board.next`) und die Regel-Zeile `board.rule` mit Gewinner- und Verlierergeste (bei Unentschieden/fehlendem Pick keine Regel-Zeile). 2v2: zwei Duelle untereinander, je halbe Höhe, kleinerer Burst.
- Animation (alles im `no-preference`-Block): `.slam-left/right` mit `--dur-slam`/`--ease-slam` und den diagonalen Werten aus Spec §4 #17; `.clash` unverändert (`clash-shake`); `.speed-lines` (`speed-lines` 1,1 s Delay `--impact-at`, danach 30 s linear ∞ Rotation); `.impact-flash` (`impact-flash` 650 ms Delay 450 ms, **Grunddeckkraft 0**); `.burst--animated` nutzt `--impact-at` als Delay und danach `throb` 1,1 s ∞; `.loser-droop` (900 ms, Delay 1 s) auf dem Sticker der unterlegenen Seite; `headline-bounce` für den Status 700 ms / 900 ms. Ohne Animation steht `.speed-lines` statisch mit `opacity: .45`.
- Statussatz im Countdown: `prompt` fällt auf den Pick-Text zurück, solange `match.phase === 'reveal' && countingDown`; erst danach `result.round_*`.

- [ ] **Step 1: Failing tests.** `Board.test.ts` (neu, Setup-Beat 0): Regel-Zeile „Stein schlägt Schere“ in der Reveal-Ansicht (Fixture `revealed('a0')`); bei Unentschieden und Timeout (ein Pick fehlt) keine Regel-Zeile und kein Text „undefined“; zwei Duelle in 2v2 behalten ihre Regionen. `Board.countdown.test.ts` (`motion.countdownBeatMs = 420`, Fake-Timer, `connection-mock` wie `Board.test.ts`): (a) Render mit Phase `pick`, dann `roomStore.set(reveal)` → `getByTestId('countdown')` vorhanden, **kein** `getByTestId('duel')`, Statussatz nicht „Runde gewonnen!“; nach `advanceTimersByTime(1260)` + `tick()` Duelle da, Statussatz „Runde gewonnen!“, Countdown weg; (b) Wiederverbinden: erster Render direkt mit `reveal` → kein Countdown, Duelle sofort; (c) ein zweites `reveal`-Update (z. B. `lockedSeats` ändert sich) während des Countdowns startet ihn nicht neu und beendet ihn nicht; (d) Phase wechselt während des Countdowns auf `pick` → kein Countdown, kein Duell, nach weiteren 5 s keine Fehler; (e) Taste während des Countdowns → Duelle sofort; (f) `matchMedia` stub mit `reduce` → Wechsel auf `reveal` zeigt sofort Duelle.
- [ ] **Step 2:** `npx vitest run apps/web/src/components` → FAIL.
- [ ] **Step 3:** Umsetzen nach den Interfaces und Spec §3.4/§4.2. Die Speed-Lines-Maske darf `#000` enthalten (Spec). Dark-Mode: Namensschilder `--sticker`, Panelränder `--line`.
- [ ] **Step 4:** Animationen in `animations.css` ergänzen; alle Tests (`npx vitest run`) grün.
- [ ] **Step 5: Sichtprüfung:** `/?demo=reveal` (Varianten `outcome=win|lose|draw`, `mode=team2v2`, `mode=wheel15`) bei 360/390/1280 px, Light/Dark; einmal mit reduzierter Bewegung (kein Blitz, Speed-Lines statisch, kein Countdown). Den Countdown selbst gegen die laufende App prüfen (Task 11), da der Demo-Modus nur einen Zustand zeigt.
- [ ] **Step 6: Commit** `feat(web): comic panel reveal with countdown and impact effects`.

### Task 10: Ergebnis-Screen und Lobby

**Files:**
- Modify: `components/Result.svelte`, `components/Lobby.svelte`, `styles/animations.css`
- Test: `components/Result.test.ts`, `components/Lobby.test.ts` (bestehende bleiben unverändert grün; nur ergänzen)

**Interfaces:**
- Result: `h2.headline` sitzt in einem weißen Panel-Kasten (`.panel`, Grund `--sticker`) mit `text-shadow: 3px 3px 0 var(--pink)`; Struktur sonst unverändert. Sieger-Avatar `hop`, Verlierer-Avatar nutzt `loser-droop` statt `droop`, falls Task 9 dafür keine eigene Klasse braucht; ansonsten `droop` unverändert lassen.
- Lobby: `section.card.share` → `.panel`; `h2` bleibt; kein neues Verhalten.

- [ ] **Step 1: Failing test** (`Result.test.ts`): die Überschrift (`heading level 2`) liegt in einem Element mit Klasse `panel`; Ergebnis-Texte unverändert. `Lobby.test.ts`: kein neuer Test nötig, vorhandene bleiben grün.
- [ ] **Step 2:** Test → FAIL; **Step 3:** umsetzen; **Step 4:** `npx vitest run apps/web` grün.
- [ ] **Step 5: Sichtprüfung:** `/?demo=result` (`outcome=win|lose`), `/?demo=lobby` (auch `mode=team2v2`), 360/1280 px, Light/Dark.
- [ ] **Step 6: Commit** `feat(web): comic panel result and lobby`.

### Task 11: E2E

**Files:**
- Modify: `e2e/playwright.config.ts`, `e2e/helpers/app.ts`, `e2e/game.spec.ts` (nur Kommentare und der neue Test)

**Interfaces:**
- `newPlayer(browser, options)` bekommt `reducedMotion?: 'reduce' | 'no-preference'` (Default: nichts übergeben, d. h. Konfig-Wert) und reicht es an `browser.newContext` durch.

- [ ] **Step 1:** `use.reducedMotion: 'reduce'` in `playwright.config.ts` (`use`). Kommentare „4 s reveal“ in `game.spec.ts`/`helpers/app.ts` auf „der Reveal läuft nur `REVEAL_MS`“ umformulieren (kein Zahlenwert).
- [ ] **Step 2: Neuer Test** `reveal countdown: with motion the reveal appears after the countdown`: Bot-Raum (`createRoom(page, { nickname: 'Ann', bot: 'Easy' })`), `newPlayer(browser, { reducedMotion: 'no-preference' })`; nach Klick auf `Rock` ist `page.getByTestId('countdown')` sichtbar, danach liefert `captureReveal(page)` einen Status aus `You win the round!|You lose the round!|It's a draw!` und das Countdown-Element ist weg.
- [ ] **Step 3:** `npm run e2e` (baut und startet den Server; bei Port-Konflikt `E2E_PORT` setzen). Erwartet: alle Tests grün, auch `@throttled`.
- [ ] **Step 4: Commit** `test(web): run e2e without motion and cover the reveal countdown`.

### Task 12: `REVEAL_MS` auf 5,5 s — **nur nach Freigabe von Jan (Spec §8.1)**

**Files:**
- Modify: `packages/shared/src/constants.ts`, `apps/web/src/lib/timer.test.ts:22`, `README.md:97`

- [ ] **Step 1:** Ohne ausdrückliche Zustimmung überspringen und im Abschlussbericht vermerken.
- [ ] **Step 2:** `REVEAL_MS = 5_500`; `timer.test.ts` erwartet `phaseDuration('reveal')` = `5_500` (dieser Test pinnt den Wert fest, `constants.test.ts` nicht); README-Zeile auf „5,5 s“.
- [ ] **Step 3:** `npx vitest run` (Server-Tests nutzen die Konstante), danach `npm run e2e`.
- [ ] **Step 4: Commit** `feat(shared): lengthen the reveal to fit the countdown`.

### Task 13: Gesamtabnahme

- [ ] **Step 1:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run e2e`: alle grün (CI führt genau diese aus).
- [ ] **Step 2:** Abnahme-Checkliste Spec §9 abarbeiten: 360/390/1280 px, Light/Dark, Tastatur (Tab Start → Wahl → Weiter, Pfeiltasten im Pad), Kontrast ≥ 4,5:1 für Text auf allen Panel-Farben (insb. weiße Schrift auf `--red` im Best-of-Schalter und im Countdown-Wort 3, Hell-/Dunkelmodus; bei Unterschreitung `--on-bright` auf `--yellow`), Reduced Motion, Wiederverbinden mitten im Reveal (Seite neu laden: kein Countdown, kein doppelter Ton), 2v2 und Rad der 15 einmal gegen die laufende App, Ton: Reveal-Sound setzt mit dem Ende des Countdowns ein.
- [ ] **Step 3:** `git status` sauber, Branch pushen und PR nur auf Anweisung; PR-Titel `feat(web): comic panel look and reveal countdown`.

## Self-Review

- **Spec-Abdeckung:** §2 → T1; §6 → T2; §5.2/5.3/5.5 → T3, T4, T8, T9, T11; §3.1 → T5; §3.2 → T6; §3.3 → T7; §3.4 + §4.2 → T9; §3.5 → T10; §4 komplett → in T6–T10 verteilt (Zuordnung je Task in den Interfaces); §5.4 → T12; §9 → T13. Lücke aus dem Handoff selbst: Mockups fehlen, Lobby ist nicht spezifiziert (siehe „Entscheidungen“).
- **Typkonsistenz:** `motion.countdownBeatMs`, `countdownMs()`, `COUNTDOWN_BEATS`, `shouldCountDown(prev, next)`, `scheduleRoomSounds`, `Countdown` mit `onDone`, `ThinkBubble` mit `{ notes, locked }`, `GestureButton` mit `tone` sind in den jeweiligen Tasks gleich benannt.
- **Proportion:** Der Plan enthält absichtlich keine Funktionskörper und kein CSS; Werte stehen im Handoff.
