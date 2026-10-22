# RPS Arena – Design-Handoff „Comic-Panel“ (Variante A)

Für: Coding-Agent, der das Design im Repo `Jaydee94/rps-arena` umsetzt (`apps/web`).
Stand: 2026-10-22. Freigegeben von Jan: Variante A mit Animationen.
Referenz-Mockups: `reference/*.dc.html` neben dieser Datei. Sie sind statisches HTML mit Inline-Styles und zeigen nur Werte und Verhalten. **Den Code nicht übernehmen**, sondern in die Struktur des Repos übersetzen (siehe §1).

> Hinweis zum Repo: Die Mockups `reference/*.dc.html` lagen dem Handoff nicht bei (Stand der Umsetzung). Maßgeblich sind die Werte in diesem Dokument.

---

## 0. Auftrag und Definition of Done

Das Web-Frontend bekommt den Look „Comic-Panel“: Jeder Screen ist wie eine Comicseite aus Panels gebaut. Dazu kommen ein neuer Countdown vor dem Aufdecken („Schnick, Schnack, Schnuck“) und ein stärkerer Aufprall beim Aufdecken. Farben, Schriften und Avatar-/Gesten-Art bleiben unverändert.

Fertig ist es, wenn:

- alle Screens (Start, Lobby, Wahl, Aufdecken, Ergebnis) dem Panel-Look aus §3 folgen, auf 360 px Breite und auf dem Desktop (max. 48rem Inhalt);
- alle Animationen aus §4 vorhanden sind und mit `prefers-reduced-motion: reduce` komplett entfallen;
- der Countdown aus §5 läuft, übersprungen werden kann und weder Tests noch Ton aus dem Takt bringt;
- `npm test`, `npm run lint` und die Playwright-E2E grün sind (vorhandene Tests nur anpassen, wenn §5 das ausdrücklich verlangt);
- Light- **und** Dark-Mode geprüft sind. Die Mockups zeigen nur Light, siehe §8.

---

## 1. Leitplanken (nicht verhandelbar, ergeben sich aus dem Repo)

1. **Tokens zuerst.** Alle Farben, Radien, Schatten, Schriften und Zeiten kommen aus `src/styles/tokens.css`. Keine Hex-Werte in Komponenten. Neue Tokens nur nach §2.
2. **Alle Bewegung steht in `src/styles/animations.css`,** innerhalb des einen Blocks `@media (prefers-reduced-motion: no-preference) { … }`. `styles/animations.test.ts` prüft das. `ui.css` und `base.css` dürfen kein `animation`, kein `transition` und kein `@keyframes` enthalten. Auch die `<style>`-Blöcke der Svelte-Komponenten bleiben frei von Bewegung. Komponenten setzen nur Klassen.
3. **Keine Inline-Styles,** außer CSS-Custom-Properties per `style:--x`, wie in `Confetti.svelte`.
4. **Semantik bleibt erhalten:**
   - Modus, Best-of und Bot-Stufe bleiben native `<input type="radio">` in `fieldset.group`. Die Bot-Option bleibt eine Checkbox. Im Mockup stehen dort Buttons mit `aria-pressed`, das ist nur Mockup-Vereinfachung.
   - `GesturePad` bleibt `role="radiogroup"` mit Roving-Tabindex.
   - Der Statussatz bleibt `role="status"`.
   - Auswahl wird nie nur über Farbe gezeigt (Häkchen, dickerer Versatz).
5. **i18n:** Jeder neue Text kommt in `de.json` **und** `en.json`. `i18n.test.ts` prüft, dass beide dieselben Keys haben.
6. **Server unangetastet,** bis auf die optionale Konstante in §5.4.
7. **Transform-Disziplin:** `animations.css` nutzt die Einzel-Properties `translate`, `rotate` und `scale`. Daran halten. Ein Element mit Dauer-Animation (Wippen) verliert seinen Hover-Versatz, weil die Animation die Property überschreibt. Deshalb wippt das **innere** Element (Sticker), und Hover und Press sitzen auf dem **äußeren** (Button).

---

## 2. Tokens

Die Farbpalette bleibt komplett. Neu oder geändert in `tokens.css`, mit Dark-Mode-Werten im bestehenden `@media (prefers-color-scheme: dark)`:

```css
/* Panels: kantiger als Karten, wie gezeichnete Comic-Rahmen */
--radius-panel: 6px;
--shadow-panel: 6px 6px 0 var(--cast);
--gutter: var(--space-5);              /* Abstand zwischen Panels */

/* Raster */
--dot-panel: rgb(255 79 163 / 55%);    /* große pinke Punkte im Hero-Panel */
--dot-panel-size: 16px;
--dot-on-tile: rgb(255 255 255 / 38%); /* helle Punkte auf farbigen Gesten-Kacheln */

/* Bewegung (zusätzlich zu --dur-fast/--dur/--dur-slow, --ease-pop, --ease-slam) */
--dur-beat: 420ms;                     /* ein Takt im Countdown */
--dur-slam: 520ms;
--impact-at: 440ms;                    /* Moment des Aufpralls nach Reveal-Start */
```

Dark-Mode: `--dot-panel: rgb(255 111 181 / 40%)`. Alle anderen Werte erben. Farbige Panels (Gelb, Blau, Pink, Teal) bleiben im Dark-Mode farbig. Text darauf nutzt `--on-bright`, das sich nicht umdreht. Genau so macht es das Repo heute schon.

**Panel-Farben (bestehende Tokens):**

| Einsatz | Token |
| --- | --- |
| Hero-Panel Grund | `--blue` + Punkte `--dot-panel` |
| Eigene Seite (Scoreboard, Aufdecken oben) | `--yellow`, Punkte `--red` 45 % |
| Gegner-Seite | `--sky` (Scoreboard) bzw. `--blue` mit `--sky`-Punkten (Aufdecken) |
| Caption-Box / Ribbon | `--yellow`; „Mit Code beitreten“ in `--sky` |
| Gesten-Kacheln, reihum | `--pink`, `--yellow`, `--teal`, dann `--orange`, `--green`, `--sky`, `--red` (für Sets mit 5–15) |
| Burst Sieg / Niederlage / Unentschieden | wie heute in `ComicBurst` (`pow`/`bam`/`zap`) |

---

## 3. Bausteine und Screens

Maße beziehen sich auf 390 px Breite. Seitenrand `--space-4`, Panel-Abstand `--gutter`.

### 3.1 Panel (neue Klasse `.panel` in `ui.css`)
- `border: var(--border)`, `border-radius: var(--radius-panel)`, `background: var(--surface)`, `box-shadow: var(--shadow-panel)`, Innenabstand `--space-4`, oben `--space-6` wenn ein Ribbon drin sitzt.
- Die Überschrift ist das vorhandene `.ribbon`: −1,5° gedreht und an die linke obere Ecke **gehängt** (`position: absolute; left: -8px; top: -18px`). Nicht in den Fluss gestellt. Das Panel braucht dafür `position: relative`.
- `.card` bleibt für kleine Elemente, `.panel` ist für Screen-Abschnitte.

### 3.2 Start (`Home.svelte`, `CreatePanel.svelte`, `ModePicker.svelte`, `AvatarPicker.svelte`, `Wordmark.svelte`)
Reihenfolge: Kopfzeile → Hero-Panel → Panel „Wer bist du?“ → Panel „Neues Spiel“ → Panel „Mit Code beitreten“.
- **Hero-Panel** (Höhe ca. 252 px): blauer Grund mit pinkem Großraster. Oben links eine Caption-Box in Gelb, die über den Rand ragt (`left: -6px`, −2°), Text `home.caption`. Unten links die drei Gesten-Sticker (86 px, −9° / 3° / 11°, je −10 px überlappend). Rechts eine Sprechblase (170 px breit, `--radius-lg`, 2°) mit `home.title` (Bangers 27 px, Text-Schatten `--yellow`) und `home.tagline`. Der Hero ersetzt die heutige `.hero`-Struktur. `home.title` bleibt die Überschrift der Seite.
- **Avatar-Raster** 4 × 2, Kachel 72 px hoch, Radius 14 px. Ausgewählt: Grund `--yellow`, `--shadow-sm` und ein rotes Häkchen-Badge (24 px, oben rechts, über den Rand ragend).
- **Modus-Auswahl:**
  - Der gewählte Modus nimmt die ganze Breite ein, mit Name (Bangers 22 px) und Beschreibung.
  - Die übrigen Modi stehen als kompakte Kacheln in 2 Spalten, nur mit Namen, mindestens 48 px hoch.
  - Bleibt eine Radiogruppe. Die Beschreibung des gewählten Modus hängt per `aria-describedby` dran.
- **Best-of:** ein zusammenhängender Pill-Schalter (3 Segmente à 56 × 44 px, Trennlinien `--outline`). Gewählt ist rot hinterlegt, Text in Weiß. Der Kontrast reicht für die Schrift in Bangers fett. Trotzdem prüfen, notfalls `--on-bright` auf `--yellow` nehmen.
- **Bot:** Die Checkbox wird als Schalter gestaltet (58 × 34 px) und sitzt in einer gestrichelten Box. Die Stufen erscheinen darunter wie heute.
- **CTA** „Raum erstellen!“: `.btn-primary`, volle Breite, 60 px hoch, `--shadow-panel`.
- **Beitreten:** Code-Feld in Monospace, 20 px, `letter-spacing: .3em`, `maxlength={CODE_LENGTH}`. Button „Rein!“ (`home.join_short`) daneben in `.btn-blue`.
- **Wordmark:** bleibt wie es ist, bekommt nur die Einflug-Animation (§4).

### 3.3 Wahl (`BoardView.svelte`, `Scoreboard.svelte`, `TimerBar.svelte`, `GesturePad.svelte`, `GestureButton.svelte`, `PlayerCard.svelte`)
- **Scoreboard:** zwei Panels nebeneinander. Links eigene Seite in Gelb, rechts Gegner in `--sky`. Die inneren Kanten sind schräg geschnitten: links `clip-path: polygon(0 0,100% 0,92% 100%,0 100%)`, rechts gespiegelt. In der Mitte sitzt ein roter „VS“-Stern (56 px).
  - ⚠ `clip-path` schneidet `box-shadow` ab. Den Schatten deshalb auf einen Wrapper setzen, mit `filter: drop-shadow(5px 5px 0 var(--cast))`. Im Mockup fehlt der Schatten aus genau diesem Grund.
  - Avatar 48 px, Punktzahl in Bangers 40 px.
  - In 2v2 statt Avatar den Team-Punkt wie heute.
- **Meta-Zeile** unter dem Scoreboard: links „Runde n“, rechts „Best of n · Modus“, in Bangers 18 px.
- **Timer:** bleibt die Komponente mit ihrer `warn`/`urgent`-Logik. Neu sind Diagonalstreifen auf dem Balken (`repeating-linear-gradient(-45deg, transparent 0 8px, rgb(23 15 46 / 14%) 8px 16px)`), die Höhe 26 px und die Zahl **im** Balken rechts.
- **Status und Gegner:** Links die Status-Sprechblase (Bangers 26 px, Schatten `--yellow`). Rechts eine kleine Denkblase mit zwei Kreisen als Schweif und dem Gegner-Status. Sobald der Gegner gewählt hat, erscheint statt der Denkblase der „ZACK!“-Stern (§4) mit `board.opponent_locked`.
- **Gesten-Kacheln:**
  - Panels mit farbigem Grund (Reihenfolge §2) und hellem Punkteraster. Darin der Gesten-Sticker (92 px) und darunter das Label auf weißem Kasten.
  - Leichte Neigung reihum (−1,5° / 1° / −0,8°). Die mittlere Kachel sitzt 8 px höher.
  - Bei ≤ 5 Gesten in einer Reihe bzw. 3 + 2. Bei 7–15 Gesten kleinere Kacheln (heutige Größe) mit derselben Farblogik.
- **Kamera-Toggle:** eine Zeile in weißem Panel: Icon, Titel, Unterzeile `camera.badge · camera.privacy` (Kurzform) und Schalter.

### 3.4 Aufdecken (`BoardView.svelte` im Reveal-Zweig, `PlayerCard.svelte`, `ComicBurst.svelte`)
- **Ein großes Panel** (ca. 520 px hoch), diagonal geteilt. Oben die eigene Hälfte in Gelb (`clip-path: polygon(0 0,100% 0,100% 38%,0 58%)`), unten die Gegner-Hälfte in Blau (`polygon(0 61%,100% 41%,100% 100%,0 100%)`). Dazwischen bleibt ein schmaler dunkler Spalt aus dem `--line`-Grund.
- **Eigene Geste:** oben links, Sticker 138 px, −10°, darüber das Namensschild „Du · Stein“.
- **Gegner:** unten rechts, gespiegelt, 14°.
- **Mitte:** Speed-Lines (§4.2), Raster-Blitz und darüber `ComicBurst` (ca. 216 px breit).
- **Unter dem Panel:** Status-Sprechblase („Runde gewonnen!“), daneben der Button „Weiter“ und darunter der Regel-Satz („Stein schlägt Schere“, neuer Key `board.rule`).
- **2v2:** Zwei Duelle untereinander, jedes Panel halb so hoch, Burst kleiner. Das ist nicht gemockt und darf frei abgeleitet werden.

### 3.5 Ergebnis (`Result.svelte`)
Struktur bleibt. Die Überschrift kommt in einen weißen Panel-Kasten mit Text-Schatten `--pink`. Bei Sieg Konfetti und hüpfender Avatar (gibt es schon), bei Niederlage sackt er ab (gibt es schon).

---

## 4. Motion-Spezifikation

Alles innerhalb des `no-preference`-Blocks in `animations.css`. „Neu“ heißt hinzufügen, „vorhanden“ heißt den bestehenden Namen weiter nutzen.

| # | Name | Element / Auslöser | Dauer · Verzögerung · Easing | Status |
| --- | --- | --- | --- | --- |
| 1 | `screen-in` | jedes Panel beim Mount, versetzt +110 ms je Panel (`style:--i`) | `--dur` · `calc(var(--i) * 110ms)` · `--ease-pop` | vorhanden, um Verzögerung erweitern |
| 2 | `wm-drop` / `wm-swing` | Wordmark: „RPS“ fällt von oben, „ARENA“ schwingt von rechts | 620 ms / 700 ms · 150 / 380 ms · `--ease-pop` | neu |
| 3 | `caption-slide` | Caption-Box im Hero gleitet von links rein | 520 ms · 650 ms · `--ease-pop` | neu |
| 4 | `sticker-pop` + `bob` | Hero-Sticker poppen und wippen dann dauerhaft (versetzt 0 / 0,2 / 0,4 s) | 480 ms Pop, danach 2,4 s ∞ | neu |
| 5 | `bubble-pop` + `breathe` | Hero-Sprechblase poppt aus dem Schweif-Eck und atmet dann leicht | 560 ms · 700 ms, dann 3,2 s ∞ | neu |
| 6 | `dots-drift` | Großraster im Hero-Panel wandert (`background-position`) | 5 s linear ∞ | neu |
| 7 | `zack` | Häkchen-Badge am gewählten Avatar und ZACK-Stern bei Gegner-Lock | 380–420 ms · `--ease-pop` | neu |
| 8 | `cta-wiggle` | „Raum erstellen!“ wackelt kurz alle 3 s | 3 s ∞, Start nach 2 s | neu, siehe §8 |
| 9 | `tile-bob` | Gesten-Kachel wippt im Ruhezustand (inneres Element!) | 2,4 s ∞, Versatz −0,8 s je Kachel | neu |
| 10 | Hover/Press | Kachel hebt sich (−5 px, 1,04), Press staucht (1,08 / 0,86) | `--dur-fast` · `--ease-pop` | vorhanden (`.gesture`), Werte angleichen |
| 11 | `stamp` | gewählte Geste knallt aufs Pad | 420 ms | vorhanden |
| 12 | `timer-stripes` | Streifen laufen über den Balken | 600 ms linear ∞ | neu |
| 13 | `timer-*` | warn/urgent wie heute; urgent zittert zusätzlich der ganze Track | wie heute | vorhanden, erweitern |
| 14 | `think-dots` | Denkblasen-Kreise blinken versetzt | 1 s ∞, 0 / 0,2 s | neu |
| 15 | `vs-pulse` | VS-Stern pulsiert (1,15, 12°) | 1,4 s ∞ | neu |
| 16 | **Countdown** | siehe §5 | 3 × `--dur-beat` | neu |
| 17 | `slam-left/right` | Gesten fliegen ein, jetzt diagonal (±190 % / ∓30 %, ±40°) | `--dur-slam` · `--ease-slam` | vorhanden, Werte ändern |
| 18 | `clash-shake` | Panel wackelt beim Aufprall | 380 ms · 480 ms | vorhanden |
| 19 | **`speed-lines`** | Strahlen vom Aufprallpunkt: erscheinen, skalieren 0,3 → 1,3, drehen dann langsam weiter | 1,1 s · `--impact-at`, dann 30 s linear ∞ | neu |
| 20 | **`impact-flash`** | Punkteraster-Kreis (220 px) blitzt auf und dehnt sich aus (0,2 → 2,4, Deckkraft 0 → 1 → 0) | 650 ms · 450 ms | neu |
| 21 | `burst-pop` + `throb` | Burst poppt, danach leichtes Pulsieren | 520 ms · `--impact-at`, dann 1,1 s ∞ | vorhanden + neu |
| 22 | `loser-droop` | Verlierer-Sticker kippt weg (16°, 12 px runter, `saturate(.25)`) | 900 ms · 1 s | neu (ähnlich `droop`) |
| 23 | `headline-bounce` | Status nach dem Aufdecken springt rein | 700 ms · 900 ms | vorhanden |
| 24 | Konfetti / `hop` / `droop` | Ergebnis-Screen | wie heute | vorhanden |

### 4.1 Keyframes zum Einfügen (neue Einträge)

```css
@keyframes wm-drop { 0% { translate: 0 -140%; rotate: -25deg; opacity: 0 } 60% { translate: 0 8%; rotate: 4deg; opacity: 1 } }
@keyframes wm-swing { 0% { translate: 160% 0; rotate: 30deg; opacity: 0 } 65% { translate: -6% 0; rotate: -4deg; opacity: 1 } }
@keyframes caption-slide { from { translate: -115% 0 } }
@keyframes sticker-pop { 0% { scale: 0; opacity: 0 } 70% { scale: 1.08; opacity: 1 } }
@keyframes bob { 50% { translate: 0 -8px } }
@keyframes breathe { 50% { scale: 1.03 } }
@keyframes dots-drift { to { background-position: 32px 32px } }
@keyframes zack { 0% { scale: 0; rotate: 40deg } 70% { scale: 1.2; rotate: -8deg } 100% { scale: 1; rotate: -6deg } }
@keyframes cta-wiggle { 0%, 84%, 100% { rotate: 0deg } 88% { rotate: -3deg } 92% { rotate: 3deg } 96% { rotate: -2deg } }
@keyframes tile-bob { 0%, 100% { translate: 0 -2px } 50% { translate: 0 -10px } }
@keyframes timer-stripes { to { background-position: 22.6px 0 } }
@keyframes think-dots { 0%, 100% { opacity: .3; translate: 0 0 } 50% { opacity: 1; translate: 0 -4px } }
@keyframes vs-pulse { 50% { scale: 1.15; rotate: 12deg } }
@keyframes beat { 0% { scale: .2; opacity: 0; rotate: -16deg } 55% { scale: 1.18; opacity: 1 } 100% { scale: 1; rotate: -5deg } }
@keyframes pump { 0%, 100% { translate: 0 0; rotate: -8deg } 45% { translate: 0 -44px; rotate: 8deg } }
@keyframes speed-lines { 0% { opacity: 0; scale: .3 } 25% { opacity: 1 } 100% { opacity: .5; scale: 1.3; rotate: 14deg } }
@keyframes impact-flash { 0% { opacity: 0; scale: .2 } 25% { opacity: 1 } 100% { opacity: 0; scale: 2.4 } }
@keyframes throb { 50% { scale: 1.07 } }
@keyframes loser-droop { to { rotate: 16deg; translate: 0 12px; filter: saturate(.25) } }
```

Für Keyframes, die auf einem Element mit eigener Grundneigung laufen (Sticker mit `rotate: -9deg`): Die Animation überschreibt `rotate`. Entweder die Neigung auf einen Wrapper legen oder die Grundneigung per `var(--tilt)` in die Keyframes einbauen.

### 4.2 Neue visuelle Bausteine
- **Speed-Lines:** ein `aria-hidden`-Div (760 × 760 px), zentriert hinter dem Burst. Grund: `repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--line) 85%, transparent) 0 2.5deg, transparent 2.5deg 13deg)`. Maske: `radial-gradient(circle, transparent 0 20%, #000 34%)`, damit die Mitte frei bleibt. Statisch, also bei reduzierter Bewegung, steht es mit 45 % Deckkraft.
- **Raster-Blitz:** ein Kreis von 220 px, `background: var(--white)` plus Punkte `radial-gradient(circle, var(--pink) 30%, transparent 33%)` / 16 px. **Grunddeckkraft 0.** Er ist nur über die Animation sichtbar und fehlt damit bei reduzierter Bewegung.
- **ZACK-Stern:** derselbe Stern-Generator wie `ComicBurst`, als neue Variante `zack` (Füllung `--pink`, Text weiß mit Kontur `--line`). Nicht neu bauen.

---

## 5. Neuer Ablauf: Countdown „Schnick, Schnack, Schnuck“

### 5.1 Verhalten
1. Ich wähle: Stempel (vorhanden), Status „Gewählt – warte …“.
2. Der Gegner wählt: Der ZACK-Stern ersetzt die Denkblase. Kommt jetzt vom Server.
3. Server-Phase wechselt auf `reveal`: Der Client zeigt **zuerst** den Countdown und erst danach das Aufdeck-Panel.
   - Zwei „?“-Sticker (104 px, Gelb und `--sky`) pumpen im Takt (`pump`, `--dur-beat`, ∞).
   - Drei Wort-Boxen erscheinen nacheinander, jede `beat`, je `--dur-beat`: `countdown.1` (weiß), `countdown.2` (gelb), `countdown.3` (rot, Text weiß mit Kontur).
   - Nach 3 × 420 ms = 1 260 ms kommt das Aufdeck-Panel mit §4 #17–23.
4. **Tippen oder eine Taste** während des Countdowns springt sofort zum Aufdecken.

### 5.2 Umsetzung
- Neue Komponente `Countdown.svelte` mit Prop `onDone`. Bei Mount startet ein Timer-Zustand `beat 0…2`, und nach dem dritten Takt wird `onDone()` aufgerufen. Bei Unmount aufräumen.
- In `BoardView.svelte`: lokaler Zustand `countingDown`. Er wird beim Übergang `phase !== 'reveal' → 'reveal'` gesetzt, als primitiver Key wie das vorhandene `phaseKey`. Solange er gesetzt ist, steht dort `<Countdown>` statt der Duelle.
- **Reduzierte Bewegung:** `prefersReducedMotion()` (aus `lib/motion.ts`) → kein Countdown, sofort aufdecken.
- **Barrierefreiheit:** Der Countdown ist `aria-hidden="true"`. Der Statussatz (`role="status"`) wechselt erst mit dem Ergebnis, damit Screenreader nicht drei Takte vorlesen.
- **Wiederverbinden:** Kommt der Client mitten in `reveal` an (`prev === null`), läuft kein Countdown. Gleiche Regel wie `diffRoomSounds`.

### 5.3 Ton
`sfx-bridge.ts` spielt `reveal` und `win`/`lose`/`draw` heute sofort beim Phasenwechsel. Mit Countdown kämen die Töne 1,26 s zu früh. Lösung: In `startSfxBridge` die Reveal-Töne um die Countdown-Dauer verzögern, sofern der Countdown läuft (gleiche Bedingung wie in 5.2, am besten eine gemeinsame Funktion `shouldCountDown(prev, next)` in `lib/`). Optional ein kurzer `beat`-Ton pro Takt, das braucht einen neuen Sound in `audio.ts`. `diffRoomSounds` bleibt eine reine Funktion und bekommt einen Test für den verzögerten Fall.

### 5.4 Zeitfenster – Entscheidung nötig (siehe §8)
`REVEAL_MS` (4 s, `packages/shared/src/constants.ts`) startet auf dem Server mit dem Aufdecken. Der Countdown frisst davon 1,26 s, sichtbar bleiben also nur ca. 2,7 s. Die Empfehlung ist `REVEAL_MS = 5_500`. Die Server-Tests nutzen die Konstante und bleiben grün. Prüfen, ob `constants.test.ts` den Wert fest erwartet.

### 5.5 Tests
- **Unit (`Board.test.ts`)** erwartet die Duelle sofort nach `phase: 'reveal'`. jsdom hat kein `matchMedia`, also liefert `prefersReducedMotion()` dort `false` und der Countdown würde laufen. Lösung: Die Countdown-Dauer kommt aus einem kleinen exportierten Setting (z. B. `motion.countdownBeatMs`). `test/setup.ts` setzt es auf `0`, und `Countdown` ruft bei 0 sofort `onDone`. Dazu ein eigener Test, der mit Fake-Timern den Countdown prüft: drei Takte, Überspringen, `aria-hidden`.
- **E2E:** `e2e/game.spec.ts` hält die Aufdeck-Ansicht für ca. 4 s. Die Kommentare dort und der `@throttled`-Test hängen daran. Funktionstests mit `reducedMotion: 'reduce'` in `playwright.config.ts` (`use`) laufen lassen, damit der Countdown entfällt. Einen eigenen kleinen Test ohne Reduktion ergänzen, der nur prüft, dass nach dem Countdown aufgedeckt wird.

---

## 6. Texte (neue Keys, DE / EN)

| Key | DE | EN |
| --- | --- | --- |
| `home.caption` | Ohne Account. Link teilen, losspielen. | No account. Share a link, start playing. |
| `home.who_heading` | Wer bist du? | Who are you? |
| `home.join_short` | Rein! | Go! |
| `home.create` | Raum erstellen! *(Ausrufezeichen ergänzen)* | Create room! |
| `countdown.1` | SCHNICK! | ROCK! |
| `countdown.2` | SCHNACK! | PAPER! |
| `countdown.3` | SCHNUCK! | SCISSORS! |
| `board.rule` | {winner} schlägt {loser} | {winner} beats {loser} |
| `burst.zack` | ZACK! | ZAP! |

**Fix:** `home.code_placeholder` zeigt 4 Zeichen, `CODE_LENGTH` ist aber 5. Neu: „z. B. K7QXM“ / „e.g. K7QXM“ (nur Zeichen aus `CODE_ALPHABET`).

---

## 7. Betroffene Dateien

| Datei | Änderung |
| --- | --- |
| `styles/tokens.css` | Tokens aus §2 |
| `styles/ui.css` | `.panel`, Ribbon als Hänge-Variante, Segment-Schalter, Switch-Optik für Checkbox (alles ohne Bewegung) |
| `styles/animations.css` | §4 komplett |
| `components/Home.svelte`, `CreatePanel.svelte`, `ModePicker.svelte`, `AvatarPicker.svelte`, `Wordmark.svelte` | §3.2 |
| `components/BoardView.svelte`, `Scoreboard.svelte`, `TimerBar.svelte`, `GesturePad.svelte`, `GestureButton.svelte`, `PlayerCard.svelte`, `CameraToggle.svelte` | §3.3 / §3.4 |
| `components/ComicBurst.svelte` | Variante `zack` |
| `components/Countdown.svelte` *(neu)*, `components/SpeedLines.svelte` *(neu, optional als reines Markup in BoardView)* | §4.2 / §5 |
| `components/Result.svelte` | §3.5 |
| `lib/sfx-bridge.ts`, `lib/motion.ts` | §5.3 / §5.5 |
| `lib/locales/de.json`, `en.json` | §6 |
| `test/setup.ts`, `e2e/playwright.config.ts`, neue Tests | §5.5 |
| `packages/shared/src/constants.ts` | nur falls §8 Punkt 1 freigegeben |

---

## 8. Offene Entscheidungen (nicht allein treffen, Jan fragen)

1. **`REVEAL_MS` von 4 s auf 5,5 s?** Ohne die Änderung bleibt das Ergebnis nur ca. 2,7 s stehen (§5.4).
2. **Rad-Modi zusammenfassen?** Das Mockup zeigt „Rad der 7 · 9 · 15“ als eine Kachel. Das braucht eine Unterauswahl, die nicht gezeichnet ist. Ohne Freigabe alle 7 Modi einzeln lassen.
3. **Zifferntasten 1–n für Gesten?** Das Mockup zeigt `kbd`-Hinweise. Das wäre ein globaler Key-Handler und damit eine neue Funktion, kein Styling. Ohne Freigabe weglassen.
4. **CTA-Wackeln:** Dauernde Bewegung kann nerven. Vorschlag: nur auf dem Start-Screen und höchstens fünfmal.
5. **Dark-Mode:** Die Mockups sind nur in Light. Die Token-Regeln in §2 sollten tragen. Schwachstelle sind die weißen Kästen (`--surface` wird im Dark-Mode dunkel, die Namensschilder auf den Aufdeck-Hälften müssen aber hell bleiben). Dort `--sticker` statt `--surface` nehmen.

---

## 9. Abnahme-Checkliste

- [ ] 360 px, 390 px und 1280 px Breite: kein horizontales Scrollen, kein abgeschnittener Text (lange Nicknames, EN-Texte).
- [ ] Tastatur: Tab-Reihenfolge Start → Wahl → Weiter. Pfeiltasten im Pad. Der Fokus ist auf jedem Panel-Grund sichtbar.
- [ ] Kontrast ≥ 4,5:1 für Text auf allen Panel-Farben, in beiden Modi.
- [ ] `prefers-reduced-motion: reduce`: keine Bewegung, kein Countdown, Raster-Blitz unsichtbar, alles andere vollständig da.
- [ ] Ton: Der Reveal-Sound fällt mit dem Aufprall zusammen, nicht mit dem Countdown-Start.
- [ ] Wiederverbinden mitten im Reveal: kein Countdown, kein doppelter Ton.
- [ ] 2v2 und Rad der 15 einmal manuell durchspielen. Diese Fälle sind nicht gemockt.
- [ ] `npm test`, `npm run lint`, E2E grün. Commit-Titel im Conventional-Commit-Format (`pr-title.yml`), z. B. `feat(web): comic panel look and reveal countdown`.

---

## 10. Referenz-Dateien

| Datei | Zeigt |
| --- | --- |
| `reference/comic-start.dc.html` | Start mit allen Einstiegs-Animationen |
| `reference/comic-pick.dc.html` | Wahl: Scoreboard, Timer, Kacheln, Denkblase |
| `reference/comic-reveal.dc.html` | Aufdecken: Panel, Speed-Lines, Blitz, Burst |
| `reference/comic-flow.dc.html` | **Kompletter Rundenablauf inkl. Countdown und Match-Ende** – die Timings im `<script>` sind die Soll-Werte |

Die Dateien laufen nur im Design-Canvas. Für den Agenten sind sie Lesematerial (Werte, Reihenfolgen, Timings), keine Vorlage zum Kopieren.
