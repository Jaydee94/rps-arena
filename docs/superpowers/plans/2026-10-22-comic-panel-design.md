# Comic Panel Design and Reveal Countdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web frontend (`apps/web`) gets the "Comic Panel" look including animations, and a "Schnick, Schnack, Schnuck" countdown before the reveal.

**Architecture:** First tokens, i18n and the pure logic (`motion`, `shouldCountDown`, sound scheduling), then shared building blocks (`.panel`, ribbon, segmented/switch styles), then screen by screen (start → pick → reveal + countdown → result/lobby). Each task brings its own motion into `styles/animations.css`; components only set classes.

**Tech Stack:** Svelte 5 (runes), Vite, Vitest + jsdom + Testing Library, Playwright, plain CSS with tokens.

**Spec:** `docs/superpowers/specs/2026-10-22-comic-panel-design-handoff.md` (copy of the handoff; the § references below refer to it). The `reference/*.dc.html` files mentioned there are **not** available; the numbers in the handoff are authoritative.

## Global Constraints

All paths are relative to `apps/web/src` unless stated otherwise. Branch: `feat/comic-panel` (from `main`).

- No hex values in components; colors, radii, shadows, fonts and durations only from `styles/tokens.css`. (Exceptions per the spec: the stripe color `rgb(23 15 46 / 14%)` in the timer and `#000` in the speed-lines mask.)
- All motion (`animation`, `transition`, `@keyframes`) only in `styles/animations.css`, inside the single block `@media (prefers-reduced-motion: no-preference)`. Neither `ui.css`, `base.css` nor any Svelte `<style>` contains motion.
- Animations use the individual properties `translate`, `rotate`, `scale`. Continuous animation (`bob`, `tile-bob`) goes on the **inner** element, hover/press on the outer one.
- No inline styles except `style:--x`.
- Mode, best-of and bot level stay native `radio` in `fieldset.group`, bot stays `checkbox`; `GesturePad` stays `role="radiogroup"` with roving tabindex; the status sentence stays `role="status"`; a selection is never indicated by color alone.
- Every new text in `de.json` **and** `en.json`.
- Server untouched (exception: Task 12, only after approval).
- Change existing tests only where this plan explicitly says so.
- Commit format Conventional Commits, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- White boxes on colored surfaces use `--sticker`, not `--surface` (dark mode, spec §8.5).
- Do **not** implement without approval: merging the wheel modes (all 7 modes stay separate), number keys for gestures.

## Decisions the plan makes (please review)

- **CTA wiggle (§8.4):** implemented as proposed: start screen only, `animation-iteration-count: 5`, starts after 2 s. Can be changed with one line.
- **`REVEAL_MS` (§8.1):** Task 12 is **blocked** until Jan agrees. Until then it stays at 4 s.
- **Countdown words** stack up (beat 2 shows words 1 and 2, and so on); each word pops when it appears.
- **Join button:** visible text `home.join_short` ("Rein!", i.e. "Go!"), the accessible name stays `home.join` via `aria-label`, because `Home.test.ts` and E2E (`Join room`) target it.
- **Status sentence during the countdown:** keeps showing the text from before the reveal (`board.picked` or `board.pick`), and shows the result only after the countdown.
- **Reveal sound:** delay = countdown duration (spec §5.3). The `--impact-at` difference (440 ms) is not added, which matches the previous behavior.
- **Optional `beat` sound:** dropped (YAGNI).
- **Lobby** is mentioned in §0 but not mocked up anywhere: derive it minimally (`.card` → `.panel` with a hanging ribbon, team banners stay).
- **The pick phase keeps two named regions** ("Du"/"Gegner" with nickname, i.e. "You"/"Opponent"). E2E (`region(page,'You').toContainText('Ben')`) and `Board.test.ts` depend on that. In the reveal phase each name may appear only once (`PlayerCard`).

## Review Focus

1. Very long nicknames (16 characters, no spaces) and long EN texts in the scoreboard, name tags and mode tiles: wrap, never scroll horizontally (Task 7, 8, 9).
2. Phase change `reveal → pick` **during** the countdown (server switches, opponent presses "Weiter"): the countdown is discarded, no duels, no dangling timer (Task 9).
3. Two `reveal` updates with the same phase (e.g. `lockedSeats`/connected changes): no second countdown (Task 9).
4. Player without a pick (timeout) in the reveal: "Nichts gewählt" (Nothing picked) instead of a gesture, burst and rule sentence without `undefined` (Task 9).
5. `team2v2` and `wheel15` in pick and reveal: nothing overflows, rules/scoreboard without avatar (Task 7, 8, 9).

---

### Task 1: Branch, tokens, motion guard

**Files:**
- Modify: `styles/tokens.css`
- Create: `styles/tokens.test.ts`
- Create: `styles/components-no-motion.test.ts`

**Interfaces:**
- Produces: tokens `--radius-panel`, `--shadow-panel`, `--gutter`, `--dot-panel`, `--dot-panel-size`, `--dot-on-tile`, `--dur-beat`, `--dur-slam`, `--impact-at`.

- [ ] **Step 1:** `git switch -c feat/comic-panel`.
- [ ] **Step 2: Failing tests.** `styles/tokens.test.ts` reads `tokens.css` from disk (like `animations.test.ts`, `import.meta.dirname`) and checks: every token from spec §2 is in the first `:root` block with exactly the value from the handoff; the `@media (prefers-color-scheme: dark)` block contains `--dot-panel: rgb(255 111 181 / 40%)`. `styles/components-no-motion.test.ts` reads all `components/*.svelte` via `readdirSync` and expects the content of every `<style>…</style>` block not to match `/animation|transition|@keyframes/` (guardrail §1.2).
- [ ] **Step 3:** `npx vitest run apps/web/src/styles` → tokens.test FAIL, components-no-motion PASS (already clean today).
- [ ] **Step 4:** Add the tokens from spec §2 to `tokens.css` (override `--dot-panel` in the dark block). The values are in the handoff, do not invent anything else.
- [ ] **Step 5:** Run the tests again → PASS.
- [ ] **Step 6: Commit** `feat(web): add comic panel design tokens`.

### Task 2: i18n keys

**Files:**
- Modify: `lib/locales/de.json`, `lib/locales/en.json`
- Test: `lib/i18n.test.ts` (add new `it` blocks, leave existing ones unchanged)

**Interfaces:**
- Produces: keys `home.caption`, `home.who_heading`, `home.join_short`, `countdown.1|2|3`, `board.rule` (`{winner}`, `{loser}`), `burst.zack`; changed: `home.create` ("Raum erstellen!" / "Create room!"), `home.code_placeholder` ("z. B. K7QXM" / "e.g. K7QXM").

- [ ] **Step 1: Failing test:** in both languages all new keys exist with the texts from spec §6; the placeholder code (text after "z. B. "/"e.g. ") has `CODE_LENGTH` characters, all in `CODE_ALPHABET` (from `@rps/shared`); `t('board.rule', { winner: 'Stein', loser: 'Schere' })` → "Stein schlägt Schere" (Rock beats Scissors).
- [ ] **Step 2:** `npx vitest run apps/web/src/lib/i18n.test.ts` → FAIL.
- [ ] **Step 3:** Add the keys (DE/EN named identically, same order).
- [ ] **Step 4:** Test → PASS; `npx vitest run apps/web` must stay green (the `Raum erstellen` selectors are substring matches).
- [ ] **Step 5: Commit** `feat(web): add comic panel and countdown texts`.

### Task 3: Countdown logic (`motion`, `shouldCountDown`)

**Files:**
- Modify: `lib/motion.ts`, `test/setup.ts`
- Create: `lib/countdown.ts`, `lib/countdown.test.ts`

**Interfaces:**
- Produces in `lib/motion.ts`: `export const motion: { countdownBeatMs: number }` (default `420`, comment: must match `--dur-beat`), `export const COUNTDOWN_BEATS = 3`, `export function countdownMs(): number` (= `motion.countdownBeatMs * COUNTDOWN_BEATS`).
- Produces in `lib/countdown.ts`: `export function shouldCountDown(prev: RoomView | null, next: RoomView | null): boolean`.
- `test/setup.ts` sets `motion.countdownBeatMs = 0`.

- [ ] **Step 1: Failing tests** (`lib/countdown.test.ts`, `makeRoom` from `test/fixtures`; `beforeEach` sets `motion.countdownBeatMs = 420`, `afterEach` resets it to `0`): `true` for `pick → reveal`; `false` for `prev === null`; `false` for `reveal → reveal`; `false` for `reveal → pick`; `false` if either of the two has `match === null`; `false` with `countdownBeatMs = 0`; `false` if `matchMedia('(prefers-reduced-motion: reduce)').matches` (via `vi.stubGlobal('matchMedia', …)` like `ComicBurst.test.ts`); `countdownMs()` is `1260`. In addition, add a case to `styles/tokens.test.ts` (Task 1): `--dur-beat` in `tokens.css` equals the default of `${motion.countdownBeatMs}ms` (hard-code the value 420 from the source of the constant, not from the setup override: `vi.importActual` is not needed, just pin `420` and add a comment in the test).
- [ ] **Step 2:** `npx vitest run apps/web/src/lib/countdown.test.ts` → FAIL.
- [ ] **Step 3:** Implement. `shouldCountDown`: both rooms with `match`, `before.phase !== 'reveal' && after.phase === 'reveal'`, `!prefersReducedMotion()`, `countdownMs() > 0`. Extend `test/setup.ts`.
- [ ] **Step 4:** Test → PASS; `npx vitest run apps/web` green.
- [ ] **Step 5: Commit** `feat(web): add reveal countdown timing and trigger rule`.

### Task 4: Tie the sound to the countdown

**Files:**
- Modify: `lib/sfx-bridge.ts`
- Test: `lib/sfx-bridge.test.ts` (add new blocks)

**Interfaces:**
- Consumes: `shouldCountDown`, `countdownMs` (Task 3), `SOUND_LENGTH`.
- Produces: `export function scheduleRoomSounds(prev: RoomView | null, next: RoomView | null): { name: SoundName; delay: number }[]` (`delay` in seconds, like `audio.play(name, delay)`). `diffRoomSounds` stays unchanged.

- [ ] **Step 1: Failing tests** (`motion.countdownBeatMs = 420`, reset afterwards): `pick → reveal` (win) yields `[{reveal, 1.26}, {win, 1.26 + SOUND_LENGTH.reveal}]`; with an additional `lock` (own pick completes the round): `lock` at `0`, `reveal` at `1.26`, then `win`; without a countdown (beat 0) the plan is identical to the old chain (`0`, `0.7`, …); `prev === null` → `[]`; a transition to `finished` is **not** delayed. And: `startSfxBridge` calls `audio.play` with these delays (existing pattern with the store mock).
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3:** Build `scheduleRoomSounds`: call `diffRoomSounds`; `delay` accumulates as before, but jumps at the name `reveal` to `max(delay, countdownMs()/1000)` if `shouldCountDown(prev, next)`. `startSfxBridge` uses it instead of the inline loop.
- [ ] **Step 4:** `npx vitest run apps/web/src/lib` → all green (old bridge tests unchanged, since the setup beat is 0).
- [ ] **Step 5: Commit** `feat(web): delay reveal sounds until the countdown ends`.

### Task 5: Shared building blocks in `ui.css` + burst variant `zack`

**Files:**
- Modify: `styles/ui.css`, `components/ComicBurst.svelte`
- Test: `components/ComicBurst.test.ts`, `styles/ui.test.ts` (new)

**Interfaces:**
- Produces CSS classes (without motion): `.panel` (+ `.panel--tint-*` not needed; color per screen), hanging `.ribbon` (`position: absolute; left: -8px; top: -18px; rotate: -1.5deg`, panel with ribbon: `padding-top: var(--space-6)`), `.ribbon--sky` (join panel), `.segmented` (pill switch from `label.segment > input[type=radio]`, segment 56×44 px, divider `var(--outline)`, selected: `--red` + white text + checkmark), `.switch` (checkbox as a switch 58×34 px, native checkbox stays in the DOM), `.dashed-box`.
- Produces `ComicBurst` variant `'zack'` (`--burst-fill: var(--pink)`, `--burst-text: var(--white)`, text with outline `--line`), prop type `Variant` extended.

- [ ] **Step 1: Failing tests:** `ComicBurst.test.ts`: `variant: 'zack'` renders `burst--zack`. `styles/ui.test.ts` (reads `ui.css` from disk): contains `.panel` with `var(--radius-panel)` and `var(--shadow-panel)`, `.ribbon` contains `position: absolute`, no hex colors (`/#[0-9a-f]{3,8}\b/i` must not match in `ui.css`).
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implement. `.card` stays unchanged. The old ribbon (margin trick) is replaced; all users (`Home`, `CreatePanel`) switch to `.panel` in Task 6, so in this task also switch the two users to `class="panel …"` so that nothing breaks visually.
- [ ] **Step 4:** `npx vitest run apps/web` green.
- [ ] **Step 5: Commit** `feat(web): add panel, hanging ribbon, segmented and switch styles`.

### Task 6: Start screen

**Files:**
- Modify: `components/Home.svelte`, `CreatePanel.svelte`, `ModePicker.svelte`, `AvatarPicker.svelte`, `Wordmark.svelte` (classes for animation only), `styles/animations.css`
- Test: `components/Home.test.ts` (add only)

**Interfaces:**
- Produces animation classes (all in the `no-preference` block): `.wm-rps` (`wm-drop`, 620 ms, delay 150 ms), `.wm-arena` (`wm-swing`, 700 ms, 380 ms), `.hero-caption` (`caption-slide`, 520 ms, 650 ms), `.hero-sticker` (`sticker-pop` 480 ms, then `bob` 2.4 s ∞; delay 0/0.2/0.4 s via `style:--i`), `.hero-bubble` (`bubble-pop` 560 ms/700 ms, then `breathe` 3.2 s ∞, `transform-origin` at the tail corner), `.hero-dots` (`dots-drift` 5 s linear ∞), `.check-badge` (`zack` 380 ms), `.cta` (`cta-wiggle` 3 s, 5 repetitions, delay 2 s), `.screen > *` or `.panel` (`screen-in` with `animation-delay: calc(var(--i, 0) * 110ms)`). The keyframes are given verbatim in spec §4.1.
- Consumes: `.panel`, `.ribbon`, `.segmented`, `.switch`, tokens, i18n keys from Task 2.

- [ ] **Step 1: Failing tests** in `Home.test.ts` (new `it`s, `setLocale('de')`): (a) the hero shows `home.caption`, `home.title` is still `heading level 2`; (b) order of the panels: "Wer bist du?" (`home.who_heading`) before "Neues Spiel" (New game) before "Mit Code beitreten" (Join with code) (`compareDocumentPosition`); (c) join button: visible text "Rein!", `getByRole('button', {name: 'Raum beitreten'})` (Join room) still finds it; (d) code field has `maxlength="5"` and placeholder "z. B. K7QXM"; (e) best-of stays a `radio` group with 3 radios and the name "Best of 5"; the selected mode has `aria-describedby` pointing to its description, **unselected modes have no `aria-describedby`**, all 7 radios remain (existing test); (f) avatar group has 8 radios; (g) the bot checkbox is still a `checkbox` with the name "Gegen Bot spielen" (Play against a bot).
- [ ] **Step 2:** `npx vitest run apps/web/src/components/Home.test.ts` → new ones FAIL, old ones PASS.
- [ ] **Step 3:** Implement per spec §3.2: hero panel replaces `.hero` (blue background, `--dot-panel` grid at `--dot-panel-size`, caption box, three stickers 86 px with −9°/3°/11° and −10 px overlap, speech bubble 170 px wide); panel "Wer bist du?" (nickname + `AvatarPicker` 4×2, tile 72 px high, radius 14 px, badge 24 px with checkmark top right overhanging the edge); `ModePicker`: selected tile full width with name (Bangers 22 px) + description, others in 2 columns, min. 48 px high, description only on the selected radio via `aria-describedby`; best-of as `.segmented`; bot as `.switch` in `.dashed-box`; CTA `.btn-primary.cta`, full width, 60 px, `box-shadow: var(--shadow-panel)`; join panel with `.ribbon--sky`, code field mono 20 px `letter-spacing: .3em`, `maxlength={CODE_LENGTH}`, `autocapitalize="characters"` stays. `Wordmark` gets `wm-rps`/`wm-arena` as classes. Panels get `style:--i={n}` (0…). The sticker tilt sits on a wrapper, `bob` on the inner element (spec §4.1, last paragraph).
- [ ] **Step 4:** Animations in `styles/animations.css` (all keyframes from §4.1 that this task uses; extend `screen-in` with the delay) → `npx vitest run apps/web` green, in particular `animations.test.ts`.
- [ ] **Step 5: Visual check:** `npm run dev -w @rps/web` (network needed for `fetch-model.mjs`; otherwise `npx vite` in the `apps/web` folder), `/?demo=home` at 360, 390, 1280 px, light and dark (`emulate_media`/DevTools); reduced motion on once. No horizontal scroll, focus visible on every background, selection not indicated by color alone.
- [ ] **Step 6: Commit** `feat(web): comic panel start screen`.

### Task 7: Pick screen (scoreboard, timer, status, tiles, camera)

**Files:**
- Modify: `components/BoardView.svelte`, `Scoreboard.svelte`, `TimerBar.svelte`, `GesturePad.svelte`, `GestureButton.svelte`, `CameraToggle.svelte`, `styles/animations.css`
- Create: `components/ThinkBubble.svelte` (thought bubble + ZACK star, see interfaces)
- Test: `components/Board.test.ts` (add only), `components/Scoreboard.test.ts` (new)

**Interfaces:**
- `Scoreboard` keeps the props `{ left: Side; right: Side; round: number; bestOf: number }` and gets `modeName: string` (BoardView passes `t('mode.<id>.name')`). Scoreboard still renders the score as `role="group"` with `aria-label` `board.score_label` and text `board.score` (`1 : 0`); meta row `board.round` on the left, `home.best_of · mode name` on the right. The wrapper carries `filter: drop-shadow(5px 5px 0 var(--cast))`, the diagonal `clip-path`s (spec §3.3) sit on the inner panels, between them the red VS star (56 px).
- `ThinkBubble.svelte`: props `{ notes: string[]; locked: boolean }`. `locked` → ZACK star (`ComicBurst` variant `zack`, text `t('burst.zack')`) **and** visible text `board.opponent_locked` from `notes`; otherwise a thought bubble with two circle tails (`.think-dot`).
- `GestureButton` gets the prop `tone: number` (index in the pad); class `tone-${tone % 7}` in the order pink, yellow, teal, orange, green, sky, red; the `large` variant stays for ≤ 5 gestures.
- New classes in `animations.css`: `.tile-art` (`tile-bob` 2.4 s ∞, `animation-delay: calc(var(--i) * -0.8s)`), `.gesture:hover`/`:active` aligned (−5 px, 1.04 / press 1.08 × 0.86), `.timer .track.urgent` (shakes), `.timer .bar::after` stripes (`timer-stripes` 600 ms linear ∞), `.think-dot` (`think-dots`, delay 0/0.2 s), `.vs-star` (`vs-pulse` 1.4 s ∞), `.zack-star` (`zack` 420 ms).

- [ ] **Step 1: Failing tests:** `Scoreboard.test.ts`: avatar sides show an avatar; for `team` sides (`avatar: null`) the team dot (`.team-dot`) appears and no avatar; the score group is named "Spielstand" (Score) and contains "1 : 0"; meta contains "Runde 2" (Round 2) and "Best of 3". `Board.test.ts` (new `it`s): (a) opponent has picked → in the "Gegner" (Opponent) region there is `Gegner hat gewählt` (Opponent has picked) **and** a `.burst--zack` with "ZACK!"; none beforehand; (b) the number of seconds is **inside** the `.track` (`screen.getByRole('timer')` → text `5 s` is a descendant of `.track`); (c) 15 gestures (`wheel15`): 15 radios, each radio has a `tone-*` class; (d) region "Du" (You) contains the nickname in the pick phase as well; (e) the 2v2 pick screen renders the team dot in the scoreboard without an avatar. All previous `Board.test.ts` cases stay green unchanged.
- [ ] **Step 2:** `npx vitest run apps/web/src/components` → new ones FAIL.
- [ ] **Step 3:** Implement per spec §3.3. Layout constraint: in the non-reveal phase there is `section aria-label={label(you)}` (name tag + status sentence `p[role=status]` on the left) and `section aria-label={label(opponent)}` (name tag + `ThinkBubble` on the right); `statusEl.focus()` after the pick stays effective. Status sentence Bangers 26 px, text shadow `--yellow`, background `--sticker`. Timer: height 26 px, number on the right **inside** the bar, stripes via `repeating-linear-gradient(-45deg, transparent 0 8px, rgb(23 15 46 / 14%) 8px 16px)`; `warn`/`urgent` logic unchanged, `urgent` additionally sets a class on the `.track`. Tiles: colored background, `--dot-on-tile` grid, sticker 92 px, label on a `--sticker` box, tilt in turn −1.5°/1°/−0.8° (rotation on the outer button as before), middle tile 8 px higher, ≤ 5 gestures: 3+2 or one row, 7–15: today's small size with the same color logic; selected = thicker offset + checkmark (`✓` stays). `CameraToggle`: row in a `--sticker` panel with icon, title, sub-line `camera.badge · camera.privacy`, switch; **all** existing tests (`CameraToggle*.test.ts`, `Board.camera.test.ts`) stay green unchanged, i.e. the `aria-pressed` button and the `role="alert"` region stay.
- [ ] **Step 4:** Add animations; `npx vitest run apps/web` green.
- [ ] **Step 5: Visual check:** `/?demo=board`, `&mode=wheel15`, `&mode=team2v2`, `&mode=lizard-spock`, `&picked=1`, `&left=3`; 360/390/1280 px, light/dark. Long nicknames in the scoreboard wrap. Shadow visible (wrapper filter).
- [ ] **Step 6: Commit** `feat(web): comic panel pick screen`.

### Task 8: Countdown component

**Files:**
- Create: `components/Countdown.svelte`, `components/Countdown.test.ts`
- Modify: `styles/animations.css`, `styles/ui.css` (layout/colors only, no motion)

**Interfaces:**
- Produces: `Countdown.svelte` with prop `onDone: () => void`. Root `div.countdown[data-testid="countdown"][aria-hidden="true"]`. Two "?" stickers (104 px, yellow and `--sky`, class `.qmark`) and up to three `.word` boxes (`countdown.1` white, `.2` yellow, `.3` red with white text and outline `--line`). State `beat` 0…2; one timer per beat with `motion.countdownBeatMs`; after the third beat exactly one `onDone()`. `motion.countdownBeatMs === 0` → `onDone()` immediately on mount. Tap (`pointerdown`) or key (`keydown`) on `window` → `onDone()` immediately. Unmount cleans up timers and listeners. `onDone` is called at most once.
- Animation classes: `.qmark` (`pump`, `--dur-beat` ∞), `.word` (`beat`, `--dur-beat`, `--ease-pop`, `both`).

- [ ] **Step 1: Failing tests** (`vi.useFakeTimers()`, `motion.countdownBeatMs = 420`, `afterEach` back to `0`): (a) mount shows "SCHNICK!", not "SCHNACK!"; after `advanceTimersByTime(420)` also "SCHNACK!"; after 840 also "SCHNUCK!"; `onDone` not yet called; (b) after 1260 ms exactly one `onDone`; a further 5000 ms does not call it again; (c) root has `aria-hidden="true"`; (d) `fireEvent.keyDown(window)` → `onDone` immediately (once), afterwards the timer triggers nothing; likewise `pointerDown`; (e) unmount before the end → no `onDone` after `advanceTimersByTime(5000)`; (f) beat `0` → `onDone` right after render, once.
- [ ] **Step 2:** Test → FAIL (file missing).
- [ ] **Step 3:** Implement (Svelte 5 `$state`, `$effect` with cleanup or `onMount`/`onDestroy`).
- [ ] **Step 4:** Test → PASS; `npx vitest run apps/web/src/styles` stays green.
- [ ] **Step 5: Commit** `feat(web): add Schnick Schnack Schnuck countdown component`.

### Task 9: Reveal screen and wiring up the countdown

**Files:**
- Modify: `components/BoardView.svelte`, `PlayerCard.svelte`, `ComicBurst.svelte` (only if size via CSS variable is not enough), `styles/animations.css`, `lib/board.ts` (only if needed for the rule line)
- Create: `components/SpeedLines.svelte` (plain `aria-hidden` markup, optionally inline in BoardView)
- Test: `components/Board.test.ts`, new file `components/Board.countdown.test.ts`

**Interfaces:**
- Consumes: `Countdown` (Task 8), `shouldCountDown`, `prefersReducedMotion`, `ComicBurst`, `board.rule`, `gestureKey`.
- BoardView state: `let countingDown = $state(false)`; previous room non-reactive as `let prevRoom: RoomView | null = null`; one `$effect.pre` that evaluates `shouldCountDown(prevRoom, room)`, sets `countingDown = true`, sets it to `false` when `match.phase !== 'reveal'`, and stores `prevRoom = room`. `onDone` sets `countingDown = false`.
- Reveal panel: per duel one `div[data-testid="duel"].clash` with two `PlayerCard` regions (names "Du"/"Gegner" or nicknames in 2v2 as before), `SpeedLines`, `.impact-flash`, `ComicBurst`. Own half on top in yellow (`clip-path: polygon(0 0,100% 0,100% 38%,0 58%)`), opponent below in blue (`polygon(0 61%,100% 41%,100% 100%,0 100%)`), gap from `--line`. Own sticker 138 px / −10°, opponent bottom right mirrored 14°, name tag "Du · Stein" (You · Rock) on `--sticker`. Below the panel: status sentence (speech bubble), button "Weiter" (Next, `board.next`) and the rule line `board.rule` with the winner and loser gesture (no rule line on a draw or missing pick). 2v2: two duels one below the other, each half the height, smaller burst.
- Animation (all in the `no-preference` block): `.slam-left/right` with `--dur-slam`/`--ease-slam` and the diagonal values from spec §4 #17; `.clash` unchanged (`clash-shake`); `.speed-lines` (`speed-lines` 1.1 s delay `--impact-at`, then 30 s linear ∞ rotation); `.impact-flash` (`impact-flash` 650 ms delay 450 ms, **base opacity 0**); `.burst--animated` uses `--impact-at` as the delay and then `throb` 1.1 s ∞; `.loser-droop` (900 ms, delay 1 s) on the sticker of the losing side; `headline-bounce` for the status 700 ms / 900 ms. Without animation `.speed-lines` is shown statically with `opacity: .45`.
- Status sentence during the countdown: `prompt` falls back to the pick text as long as `match.phase === 'reveal' && countingDown`; only afterwards `result.round_*`.

- [ ] **Step 1: Failing tests.** `Board.test.ts` (new, setup beat 0): rule line "Stein schlägt Schere" (Rock beats Scissors) in the reveal view (fixture `revealed('a0')`); on a draw and on a timeout (one pick missing) no rule line and no text "undefined"; two duels in 2v2 keep their regions. `Board.countdown.test.ts` (`motion.countdownBeatMs = 420`, fake timers, `connection-mock` like `Board.test.ts`): (a) render with phase `pick`, then `roomStore.set(reveal)` → `getByTestId('countdown')` present, **no** `getByTestId('duel')`, status sentence not "Runde gewonnen!" (Round won!); after `advanceTimersByTime(1260)` + `tick()` duels are there, status sentence "Runde gewonnen!", countdown gone; (b) reconnecting: first render directly with `reveal` → no countdown, duels immediately; (c) a second `reveal` update (e.g. `lockedSeats` changes) during the countdown neither restarts nor ends it; (d) phase switches to `pick` during the countdown → no countdown, no duel, no errors after another 5 s; (e) key press during the countdown → duels immediately; (f) `matchMedia` stub with `reduce` → switching to `reveal` shows duels immediately.
- [ ] **Step 2:** `npx vitest run apps/web/src/components` → FAIL.
- [ ] **Step 3:** Implement according to the interfaces and spec §3.4/§4.2. The speed-lines mask may contain `#000` (spec). Dark mode: name tags `--sticker`, panel borders `--line`.
- [ ] **Step 4:** Add the animations in `animations.css`; all tests (`npx vitest run`) green.
- [ ] **Step 5: Visual check:** `/?demo=reveal` (variants `outcome=win|lose|draw`, `mode=team2v2`, `mode=wheel15`) at 360/390/1280 px, light/dark; once with reduced motion (no flash, speed lines static, no countdown). Check the countdown itself against the running app (Task 11), since the demo mode only shows one state.
- [ ] **Step 6: Commit** `feat(web): comic panel reveal with countdown and impact effects`.

### Task 10: Result screen and lobby

**Files:**
- Modify: `components/Result.svelte`, `components/Lobby.svelte`, `styles/animations.css`
- Test: `components/Result.test.ts`, `components/Lobby.test.ts` (existing ones stay green unchanged; add only)

**Interfaces:**
- Result: `h2.headline` sits in a white panel box (`.panel`, background `--sticker`) with `text-shadow: 3px 3px 0 var(--pink)`; structure otherwise unchanged. Winner avatar `hop`, loser avatar uses `loser-droop` instead of `droop` if Task 9 needs no separate class for it; otherwise leave `droop` unchanged.
- Lobby: `section.card.share` → `.panel`; `h2` stays; no new behavior.

- [ ] **Step 1: Failing test** (`Result.test.ts`): the heading (`heading level 2`) sits in an element with class `panel`; result texts unchanged. `Lobby.test.ts`: no new test needed, existing ones stay green.
- [ ] **Step 2:** Test → FAIL; **Step 3:** implement; **Step 4:** `npx vitest run apps/web` green.
- [ ] **Step 5: Visual check:** `/?demo=result` (`outcome=win|lose`), `/?demo=lobby` (also `mode=team2v2`), 360/1280 px, light/dark.
- [ ] **Step 6: Commit** `feat(web): comic panel result and lobby`.

### Task 11: E2E

**Files:**
- Modify: `e2e/playwright.config.ts`, `e2e/helpers/app.ts`, `e2e/game.spec.ts` (comments and the new test only)

**Interfaces:**
- `newPlayer(browser, options)` gets `reducedMotion?: 'reduce' | 'no-preference'` (default: pass nothing, i.e. the config value) and passes it through to `browser.newContext`.

- [ ] **Step 1:** `use.reducedMotion: 'reduce'` in `playwright.config.ts` (`use`). Rephrase the comments "4 s reveal" in `game.spec.ts`/`helpers/app.ts` to "the reveal only lasts `REVEAL_MS`" (no numeric value).
- [ ] **Step 2: New test** `reveal countdown: with motion the reveal appears after the countdown`: bot room (`createRoom(page, { nickname: 'Ann', bot: 'Easy' })`), `newPlayer(browser, { reducedMotion: 'no-preference' })`; after clicking `Rock`, `page.getByTestId('countdown')` is visible, afterwards `captureReveal(page)` returns a status matching `You win the round!|You lose the round!|It's a draw!` and the countdown element is gone.
- [ ] **Step 3:** `npm run e2e` (builds and starts the server; on a port conflict set `E2E_PORT`). Expected: all tests green, including `@throttled`.
- [ ] **Step 4: Commit** `test(web): run e2e without motion and cover the reveal countdown`.

### Task 12: `REVEAL_MS` to 5.5 s — **only after approval from Jan (spec §8.1)**

**Files:**
- Modify: `packages/shared/src/constants.ts`, `apps/web/src/lib/timer.test.ts:22`, `README.md:97`

- [ ] **Step 1:** Skip without explicit approval and note it in the final report.
- [ ] **Step 2:** `REVEAL_MS = 5_500`; `timer.test.ts` expects `phaseDuration('reveal')` = `5_500` (this test pins the value, `constants.test.ts` does not); change the README line to "5.5 s".
- [ ] **Step 3:** `npx vitest run` (server tests use the constant), then `npm run e2e`.
- [ ] **Step 4: Commit** `feat(shared): lengthen the reveal to fit the countdown`.

### Task 13: Final acceptance

- [ ] **Step 1:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run e2e`: all green (CI runs exactly these).
- [ ] **Step 2:** Work through the acceptance checklist, spec §9: 360/390/1280 px, light/dark, keyboard (tab start → pick → next, arrow keys in the pad), contrast ≥ 4.5:1 for text on all panel colors (in particular white text on `--red` in the best-of switch and in countdown word 3, light/dark mode; if it falls short, use `--on-bright` on `--yellow`), reduced motion, reconnecting in the middle of the reveal (reload the page: no countdown, no duplicate sound), 2v2 and wheel of 15 once against the running app, sound: the reveal sound starts when the countdown ends.
- [ ] **Step 3:** `git status` clean; push the branch and open the PR only on instruction; PR title `feat(web): comic panel look and reveal countdown`.

### Task 14: Rule hints and rules view (addendum from Jan)

An additional request made during the implementation, not part of the handoff: the player should see **before** picking which gestures a gesture beats, and be able to look up the rules of the current mode in the game. Runs after Task 9 (BoardView) and Task 7 (GestureButton).

**Files:**
- Modify: `packages/shared/src/gestures.ts` (+ `gestures.test.ts`), `apps/web/src/components/GestureButton.svelte`, `GesturePad.svelte`, `BoardView.svelte`, `Lobby.svelte`, `lib/locales/de.json`, `en.json`, `styles/animations.css` (only if the fade-in is animated, otherwise nothing)
- Create: `apps/web/src/components/RulesPanel.svelte` (+ `RulesPanel.test.ts`)

**Interfaces:**
- Produces in `@rps/shared`: `export function gestureBeats(set: GestureSet, gesture: string): string[]` – the gestures that `gesture` beats, in circle order. The source is the same circle rule as `duel` (each gesture beats the next `(n-1)/2`). Throws on an unknown gesture, like `duel`.
- `RulesPanel.svelte`: props `{ mode: ModeId }`. A native `<details class="rules">` with `<summary>` `rules.title`, inside it `mode.<id>.desc` and one line per gesture `rules.beats` (`{gesture}` beats `{list}`) with small `GestureIcon`s; Bluff uses Lizard-Spock, 2v2 Classic (`gestureSetFor`). No JS state needed, no motion.
- Hint on the tile: `GestureButton` gets the prop `beats: string[]`; a visually revealed hint "schlägt: …" (beats: …) on `:hover` and `:focus-visible` (CSS, no motion) and the same text via `aria-describedby` for screen readers. There is no hover on touch: the rules view (`RulesPanel`) in the pick screen and the lobby serves that purpose.
- New keys DE/EN: `rules.title`, `rules.beats` (`{gesture}`, `{list}`), `rules.hint` (short form "schlägt: {list}", i.e. "beats: {list}").

- [ ] **Step 1: Failing tests:** `gestures.test.ts`: `gestureBeats(classic,'rock')` = `['scissors']`, `paper` = `['rock']`, `scissors` = `['paper']`; Lizard-Spock: each gesture beats exactly 2; wheel15: exactly 7; for all sets and all pairs `duel(set,a,b)==='a'` ⇔ `b ∈ gestureBeats(set,a)`; an unknown gesture throws. `RulesPanel.test.ts`: `<details>` with the title "Regeln" (Rules), one line per gesture, texts from `rules.beats`, Classic shows 3 lines, wheel15 15 lines with 7 names each. `Board.test.ts` (add only): every tile has an `aria-describedby` pointing to a text "schlägt: …"; Rock shows "Schere" (Scissors); the rules view is present in the pick screen and in the lobby.
- [ ] **Step 2:** Tests → FAIL. **Step 3:** Derive `gestureBeats` from the circle rule (do not store it twice); build components and texts; make the hint visible without layout shift and without motion (only `opacity`/`visibility` via `:hover`/`:focus-visible` is state, no `transition`). **Step 4:** `npx vitest run`, lint, typecheck green. **Step 5: Commit** `feat(web): show what each gesture beats and a rules panel`.

## Self-Review

- **Spec coverage:** §2 → T1; §6 → T2; §5.2/5.3/5.5 → T3, T4, T8, T9, T11; §3.1 → T5; §3.2 → T6; §3.3 → T7; §3.4 + §4.2 → T9; §3.5 → T10; §4 in full → distributed across T6–T10 (assignment per task in the interfaces); §5.4 → T12; §9 → T13. Gap in the handoff itself: the mockups are missing, the lobby is not specified (see "Decisions the plan makes").
- **Type consistency:** `motion.countdownBeatMs`, `countdownMs()`, `COUNTDOWN_BEATS`, `shouldCountDown(prev, next)`, `scheduleRoomSounds`, `Countdown` with `onDone`, `ThinkBubble` with `{ notes, locked }`, `GestureButton` with `tone` are named identically in the respective tasks.
- **Proportion:** The plan deliberately contains no function bodies and no CSS; the values are in the handoff.
