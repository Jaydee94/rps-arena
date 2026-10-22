# RPS Arena – Design Handoff "Comic Panel" (Variant A)

For: the coding agent implementing the design in the repo `Jaydee94/rps-arena` (`apps/web`).
Date: 2026-10-22. Approved by Jan: variant A with animations.
Reference mockups: `reference/*.dc.html` next to this file. They are static HTML with inline styles and only show values and behavior. **Do not copy the code**; translate it into the structure of the repo (see §1).

> Note on the repo: the mockups `reference/*.dc.html` were not included with the handoff (as of the implementation). The values in this document are authoritative.

---

## 0. Assignment and definition of done

The web frontend gets the "Comic Panel" look: every screen is built like a comic page made of panels. In addition there is a new countdown before the reveal ("Schnick, Schnack, Schnuck", the German rock-paper-scissors chant) and a stronger impact on reveal. Colors, fonts and the avatar/gesture style stay unchanged.

It is done when:

- all screens (start, lobby, pick, reveal, result) follow the panel look from §3, at 360 px width and on desktop (content max. 48rem);
- all animations from §4 are present and are removed entirely under `prefers-reduced-motion: reduce`;
- the countdown from §5 runs, can be skipped, and throws neither tests nor sound out of sync;
- `npm test`, `npm run lint` and the Playwright E2E tests are green (adapt existing tests only where §5 explicitly requires it);
- light **and** dark mode have been checked. The mockups only show light, see §8.

---

## 1. Guardrails (non-negotiable, derived from the repo)

1. **Tokens first.** All colors, radii, shadows, fonts and durations come from `src/styles/tokens.css`. No hex values in components. New tokens only per §2.
2. **All motion lives in `src/styles/animations.css`,** inside the single block `@media (prefers-reduced-motion: no-preference) { … }`. `styles/animations.test.ts` checks this. `ui.css` and `base.css` must not contain `animation`, `transition` or `@keyframes`. The `<style>` blocks of the Svelte components also stay free of motion. Components only set classes.
3. **No inline styles,** except CSS custom properties via `style:--x`, as in `Confetti.svelte`.
4. **Semantics are preserved:**
   - Mode, best-of and bot level stay native `<input type="radio">` in `fieldset.group`. The bot option stays a checkbox. The mockup shows buttons with `aria-pressed` there; that is only a mockup simplification.
   - `GesturePad` stays `role="radiogroup"` with roving tabindex.
   - The status sentence stays `role="status"`.
   - A selection is never indicated by color alone (checkmark, thicker offset).
5. **i18n:** every new text goes into `de.json` **and** `en.json`. `i18n.test.ts` checks that both have the same keys.
6. **Server untouched,** except for the optional constant in §5.4.
7. **Transform discipline:** `animations.css` uses the individual properties `translate`, `rotate` and `scale`. Stick to that. An element with a continuous animation (bobbing) loses its hover offset because the animation overrides the property. That is why the **inner** element (sticker) bobs, while hover and press sit on the **outer** one (button).

---

## 2. Tokens

The color palette stays complete. New or changed in `tokens.css`, with dark-mode values in the existing `@media (prefers-color-scheme: dark)`:

```css
/* Panels: more angular than cards, like drawn comic frames */
--radius-panel: 6px;
--shadow-panel: 6px 6px 0 var(--cast);
--gutter: var(--space-5);              /* gap between panels */

/* Dot grid */
--dot-panel: rgb(255 79 163 / 55%);    /* large pink dots in the hero panel */
--dot-panel-size: 16px;
--dot-on-tile: rgb(255 255 255 / 38%); /* light dots on colored gesture tiles */

/* Motion (in addition to --dur-fast/--dur/--dur-slow, --ease-pop, --ease-slam) */
--dur-beat: 420ms;                     /* one beat in the countdown */
--dur-slam: 520ms;
--impact-at: 440ms;                    /* moment of impact after reveal start */
```

Dark mode: `--dot-panel: rgb(255 111 181 / 40%)`. All other values are inherited. Colored panels (yellow, blue, pink, teal) stay colored in dark mode. Text on them uses `--on-bright`, which does not invert. This is exactly how the repo already does it today.

**Panel colors (existing tokens):**

| Use | Token |
| --- | --- |
| Hero panel background | `--blue` + dots `--dot-panel` |
| Own side (scoreboard, top of reveal) | `--yellow`, dots `--red` 45 % |
| Opponent side | `--sky` (scoreboard) or `--blue` with `--sky` dots (reveal) |
| Caption box / ribbon | `--yellow`; "Mit Code beitreten" (Join with code) in `--sky` |
| Gesture tiles, in turn | `--pink`, `--yellow`, `--teal`, then `--orange`, `--green`, `--sky`, `--red` (for sets with 5–15) |
| Burst win / loss / draw | as today in `ComicBurst` (`pow`/`bam`/`zap`) |

---

## 3. Building blocks and screens

Dimensions refer to 390 px width. Page margin `--space-4`, panel gap `--gutter`.

### 3.1 Panel (new class `.panel` in `ui.css`)
- `border: var(--border)`, `border-radius: var(--radius-panel)`, `background: var(--surface)`, `box-shadow: var(--shadow-panel)`, padding `--space-4`, top `--space-6` when a ribbon sits inside.
- The heading is the existing `.ribbon`: rotated −1.5° and **hung** on the top left corner (`position: absolute; left: -8px; top: -18px`). Not placed in the flow. The panel needs `position: relative` for this.
- `.card` stays for small elements, `.panel` is for screen sections.

### 3.2 Start (`Home.svelte`, `CreatePanel.svelte`, `ModePicker.svelte`, `AvatarPicker.svelte`, `Wordmark.svelte`)
Order: header row → hero panel → panel "Wer bist du?" (Who are you?) → panel "Neues Spiel" (New game) → panel "Mit Code beitreten" (Join with code).
- **Hero panel** (height approx. 252 px): blue background with a large pink dot grid. Top left a yellow caption box that overhangs the edge (`left: -6px`, −2°), text `home.caption`. Bottom left the three gesture stickers (86 px, −9° / 3° / 11°, overlapping by −10 px each). On the right a speech bubble (170 px wide, `--radius-lg`, 2°) with `home.title` (Bangers 27 px, text shadow `--yellow`) and `home.tagline`. The hero replaces the current `.hero` structure. `home.title` stays the heading of the page.
- **Avatar grid** 4 × 2, tile 72 px high, radius 14 px. Selected: background `--yellow`, `--shadow-sm` and a red checkmark badge (24 px, top right, overhanging the edge).
- **Mode selection:**
  - The selected mode takes the full width, with name (Bangers 22 px) and description.
  - The other modes appear as compact tiles in 2 columns, name only, at least 48 px high.
  - Stays a radio group. The description of the selected mode is attached via `aria-describedby`.
- **Best-of:** a connected pill switch (3 segments of 56 × 44 px, dividers `--outline`). The selected one has a red background, text in white. The contrast is sufficient for text in bold Bangers. Check it anyway; if necessary use `--on-bright` on `--yellow`.
- **Bot:** the checkbox is styled as a switch (58 × 34 px) and sits in a dashed box. The levels appear below it as today.
- **CTA** "Raum erstellen!" (Create room!): `.btn-primary`, full width, 60 px high, `--shadow-panel`.
- **Join:** code field in monospace, 20 px, `letter-spacing: .3em`, `maxlength={CODE_LENGTH}`. Button "Rein!" (Go!, `home.join_short`) next to it in `.btn-blue`.
- **Wordmark:** stays as it is, only gets the fly-in animation (§4).

### 3.3 Pick (`BoardView.svelte`, `Scoreboard.svelte`, `TimerBar.svelte`, `GesturePad.svelte`, `GestureButton.svelte`, `PlayerCard.svelte`)
- **Scoreboard:** two panels side by side. On the left the own side in yellow, on the right the opponent in `--sky`. The inner edges are cut diagonally: on the left `clip-path: polygon(0 0,100% 0,92% 100%,0 100%)`, on the right mirrored. In the middle sits a red "VS" star (56 px).
  - ⚠ `clip-path` cuts off `box-shadow`. Therefore put the shadow on a wrapper, using `filter: drop-shadow(5px 5px 0 var(--cast))`. The mockup lacks the shadow for exactly this reason.
  - Avatar 48 px, score in Bangers 40 px.
  - In 2v2, show the team dot instead of the avatar, as today.
- **Meta row** below the scoreboard: on the left "Runde n" (Round n), on the right "Best of n · mode", in Bangers 18 px.
- **Timer:** stays the component with its `warn`/`urgent` logic. New are diagonal stripes on the bar (`repeating-linear-gradient(-45deg, transparent 0 8px, rgb(23 15 46 / 14%) 8px 16px)`), the height of 26 px, and the number **inside** the bar on the right.
- **Status and opponent:** on the left the status speech bubble (Bangers 26 px, shadow `--yellow`). On the right a small thought bubble with two circles as its tail and the opponent status. As soon as the opponent has picked, the "ZACK!" star (§4) with `board.opponent_locked` appears instead of the thought bubble.
- **Gesture tiles:**
  - Panels with a colored background (order in §2) and a light dot grid. Inside, the gesture sticker (92 px) and below it the label on a white box.
  - Slight tilt in turn (−1.5° / 1° / −0.8°). The middle tile sits 8 px higher.
  - For ≤ 5 gestures in one row or 3 + 2. For 7–15 gestures, smaller tiles (today's size) with the same color logic.
- **Camera toggle:** a row in a white panel: icon, title, sub-line `camera.badge · camera.privacy` (short form) and switch.

### 3.4 Reveal (`BoardView.svelte` in the reveal branch, `PlayerCard.svelte`, `ComicBurst.svelte`)
- **One large panel** (approx. 520 px high), split diagonally. On top the own half in yellow (`clip-path: polygon(0 0,100% 0,100% 38%,0 58%)`), below the opponent half in blue (`polygon(0 61%,100% 41%,100% 100%,0 100%)`). Between them remains a narrow dark gap from the `--line` background.
- **Own gesture:** top left, sticker 138 px, −10°, above it the name tag "Du · Stein" (You · Rock).
- **Opponent:** bottom right, mirrored, 14°.
- **Center:** speed lines (§4.2), dot-grid flash and on top of it `ComicBurst` (approx. 216 px wide).
- **Below the panel:** status speech bubble ("Runde gewonnen!", Round won!), next to it the button "Weiter" (Next) and below that the rule sentence ("Stein schlägt Schere", Rock beats Scissors, new key `board.rule`).
- **2v2:** two duels one below the other, each panel half as high, smaller burst. This is not mocked up and may be derived freely.

### 3.5 Result (`Result.svelte`)
The structure stays. The heading goes into a white panel box with text shadow `--pink`. On a win, confetti and a hopping avatar (already exist); on a loss it sags (already exists).

---

## 4. Motion specification

Everything inside the `no-preference` block in `animations.css`. "New" means add, "existing" means keep using the existing name.

| # | Name | Element / trigger | Duration · delay · easing | Status |
| --- | --- | --- | --- | --- |
| 1 | `screen-in` | every panel on mount, staggered +110 ms per panel (`style:--i`) | `--dur` · `calc(var(--i) * 110ms)` · `--ease-pop` | existing, extend with delay |
| 2 | `wm-drop` / `wm-swing` | wordmark: "RPS" drops in from above, "ARENA" swings in from the right | 620 ms / 700 ms · 150 / 380 ms · `--ease-pop` | new |
| 3 | `caption-slide` | caption box in the hero slides in from the left | 520 ms · 650 ms · `--ease-pop` | new |
| 4 | `sticker-pop` + `bob` | hero stickers pop and then bob continuously (staggered 0 / 0.2 / 0.4 s) | 480 ms pop, then 2.4 s ∞ | new |
| 5 | `bubble-pop` + `breathe` | hero speech bubble pops out of the tail corner and then breathes gently | 560 ms · 700 ms, then 3.2 s ∞ | new |
| 6 | `dots-drift` | large dot grid in the hero panel drifts (`background-position`) | 5 s linear ∞ | new |
| 7 | `zack` | checkmark badge on the selected avatar and ZACK star on opponent lock | 380–420 ms · `--ease-pop` | new |
| 8 | `cta-wiggle` | "Raum erstellen!" wiggles briefly every 3 s | 3 s ∞, starts after 2 s | new, see §8 |
| 9 | `tile-bob` | gesture tile bobs at rest (inner element!) | 2.4 s ∞, offset −0.8 s per tile | new |
| 10 | hover/press | tile lifts (−5 px, 1.04), press squashes (1.08 / 0.86) | `--dur-fast` · `--ease-pop` | existing (`.gesture`), align values |
| 11 | `stamp` | selected gesture slams onto the pad | 420 ms | existing |
| 12 | `timer-stripes` | stripes run across the bar | 600 ms linear ∞ | new |
| 13 | `timer-*` | warn/urgent as today; on urgent the whole track additionally shakes | as today | existing, extend |
| 14 | `think-dots` | thought bubble circles blink in turn | 1 s ∞, 0 / 0.2 s | new |
| 15 | `vs-pulse` | VS star pulses (1.15, 12°) | 1.4 s ∞ | new |
| 16 | **Countdown** | see §5 | 3 × `--dur-beat` | new |
| 17 | `slam-left/right` | gestures fly in, now diagonally (±190 % / ∓30 %, ±40°) | `--dur-slam` · `--ease-slam` | existing, change values |
| 18 | `clash-shake` | panel shakes on impact | 380 ms · 480 ms | existing |
| 19 | **`speed-lines`** | rays from the impact point: appear, scale 0.3 → 1.3, then keep rotating slowly | 1.1 s · `--impact-at`, then 30 s linear ∞ | new |
| 20 | **`impact-flash`** | dot-grid circle (220 px) flashes up and expands (0.2 → 2.4, opacity 0 → 1 → 0) | 650 ms · 450 ms | new |
| 21 | `burst-pop` + `throb` | burst pops, then pulses slightly | 520 ms · `--impact-at`, then 1.1 s ∞ | existing + new |
| 22 | `loser-droop` | loser sticker tips away (16°, 12 px down, `saturate(.25)`) | 900 ms · 1 s | new (similar to `droop`) |
| 23 | `headline-bounce` | status after the reveal bounces in | 700 ms · 900 ms | existing |
| 24 | confetti / `hop` / `droop` | result screen | as today | existing |

### 4.1 Keyframes to insert (new entries)

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

For keyframes that run on an element with its own base tilt (a sticker with `rotate: -9deg`): the animation overrides `rotate`. Either put the tilt on a wrapper or build the base tilt into the keyframes via `var(--tilt)`.

### 4.2 New visual building blocks
- **Speed lines:** an `aria-hidden` div (760 × 760 px), centered behind the burst. Background: `repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--line) 85%, transparent) 0 2.5deg, transparent 2.5deg 13deg)`. Mask: `radial-gradient(circle, transparent 0 20%, #000 34%)` so that the center stays clear. Static, meaning under reduced motion it is displayed at 45 % opacity.
- **Dot-grid flash:** a circle of 220 px, `background: var(--white)` plus dots `radial-gradient(circle, var(--pink) 30%, transparent 33%)` / 16 px. **Base opacity 0.** It is only visible through the animation and is therefore absent under reduced motion.
- **ZACK star:** the same star generator as `ComicBurst`, as a new variant `zack` (fill `--pink`, text white with `--line` outline). Do not build a new one.

---

## 5. New flow: countdown "Schnick, Schnack, Schnuck"

### 5.1 Behavior
1. I pick: stamp (existing), status "Gewählt – warte …" (Picked – waiting …).
2. The opponent picks: the ZACK star replaces the thought bubble. This now comes from the server.
3. The server phase switches to `reveal`: the client shows the countdown **first** and only afterwards the reveal panel.
   - Two "?" stickers (104 px, yellow and `--sky`) pump in the beat (`pump`, `--dur-beat`, ∞).
   - Three word boxes appear one after another, each `beat`, each `--dur-beat`: `countdown.1` (white), `countdown.2` (yellow), `countdown.3` (red, text white with outline).
   - After 3 × 420 ms = 1,260 ms the reveal panel appears with §4 #17–23.
4. **Tapping or a key press** during the countdown jumps to the reveal immediately.

### 5.2 Implementation
- New component `Countdown.svelte` with prop `onDone`. On mount a timer state `beat 0…2` starts, and after the third beat `onDone()` is called. Clean up on unmount.
- In `BoardView.svelte`: local state `countingDown`. It is set on the transition `phase !== 'reveal' → 'reveal'`, as a primitive key like the existing `phaseKey`. As long as it is set, `<Countdown>` is rendered there instead of the duels.
- **Reduced motion:** `prefersReducedMotion()` (from `lib/motion.ts`) → no countdown, reveal immediately.
- **Accessibility:** the countdown is `aria-hidden="true"`. The status sentence (`role="status"`) only changes with the result, so that screen readers do not read out three beats.
- **Reconnecting:** if the client arrives in the middle of `reveal` (`prev === null`), no countdown runs. Same rule as `diffRoomSounds`.

### 5.3 Sound
`sfx-bridge.ts` plays `reveal` and `win`/`lose`/`draw` immediately on the phase change today. With a countdown the sounds would come 1.26 s too early. Solution: in `startSfxBridge`, delay the reveal sounds by the countdown duration if the countdown is running (same condition as in 5.2, ideally a shared function `shouldCountDown(prev, next)` in `lib/`). Optionally a short `beat` sound per beat; that needs a new sound in `audio.ts`. `diffRoomSounds` stays a pure function and gets a test for the delayed case.

### 5.4 Time window – decision needed (see §8)
`REVEAL_MS` (4 s, `packages/shared/src/constants.ts`) starts on the server together with the reveal. The countdown eats 1.26 s of that, so only approx. 2.7 s remain visible. The recommendation is `REVEAL_MS = 5_500`. The server tests use the constant and stay green. Check whether `constants.test.ts` expects the value hard-coded.

### 5.5 Tests
- **Unit (`Board.test.ts`)** expects the duels immediately after `phase: 'reveal'`. jsdom has no `matchMedia`, so `prefersReducedMotion()` returns `false` there and the countdown would run. Solution: the countdown duration comes from a small exported setting (e.g. `motion.countdownBeatMs`). `test/setup.ts` sets it to `0`, and `Countdown` calls `onDone` immediately at 0. In addition a dedicated test that verifies the countdown with fake timers: three beats, skipping, `aria-hidden`.
- **E2E:** `e2e/game.spec.ts` holds the reveal view for approx. 4 s. The comments there and the `@throttled` test depend on that. Run functional tests with `reducedMotion: 'reduce'` in `playwright.config.ts` (`use`) so that the countdown is skipped. Add a small test of its own without reduction that only checks that the reveal appears after the countdown.

---

## 6. Texts (new keys, DE / EN)

| Key | DE | EN |
| --- | --- | --- |
| `home.caption` | Ohne Account. Link teilen, losspielen. | No account. Share a link, start playing. |
| `home.who_heading` | Wer bist du? | Who are you? |
| `home.join_short` | Rein! | Go! |
| `home.create` | Raum erstellen! *(add the exclamation mark)* | Create room! |
| `countdown.1` | SCHNICK! | ROCK! |
| `countdown.2` | SCHNACK! | PAPER! |
| `countdown.3` | SCHNUCK! | SCISSORS! |
| `board.rule` | {winner} schlägt {loser} | {winner} beats {loser} |
| `burst.zack` | ZACK! | ZAP! |

**Fix:** `home.code_placeholder` shows 4 characters, but `CODE_LENGTH` is 5. New: "z. B. K7QXM" / "e.g. K7QXM" (only characters from `CODE_ALPHABET`).

---

## 7. Affected files

| File | Change |
| --- | --- |
| `styles/tokens.css` | Tokens from §2 |
| `styles/ui.css` | `.panel`, ribbon as hanging variant, segment switch, switch look for checkbox (all without motion) |
| `styles/animations.css` | §4 in full |
| `components/Home.svelte`, `CreatePanel.svelte`, `ModePicker.svelte`, `AvatarPicker.svelte`, `Wordmark.svelte` | §3.2 |
| `components/BoardView.svelte`, `Scoreboard.svelte`, `TimerBar.svelte`, `GesturePad.svelte`, `GestureButton.svelte`, `PlayerCard.svelte`, `CameraToggle.svelte` | §3.3 / §3.4 |
| `components/ComicBurst.svelte` | Variant `zack` |
| `components/Countdown.svelte` *(new)*, `components/SpeedLines.svelte` *(new, optionally as plain markup in BoardView)* | §4.2 / §5 |
| `components/Result.svelte` | §3.5 |
| `lib/sfx-bridge.ts`, `lib/motion.ts` | §5.3 / §5.5 |
| `lib/locales/de.json`, `en.json` | §6 |
| `test/setup.ts`, `e2e/playwright.config.ts`, new tests | §5.5 |
| `packages/shared/src/constants.ts` | only if §8 item 1 is approved |

---

## 8. Open decisions (do not decide alone, ask Jan)

1. **`REVEAL_MS` from 4 s to 5.5 s?** Without the change the result stays visible for only approx. 2.7 s (§5.4).
2. **Merge the wheel modes?** The mockup shows "Rad der 7 · 9 · 15" (Wheel of 7 · 9 · 15) as a single tile. That needs a sub-selection that is not drawn. Without approval, keep all 7 modes separate.
3. **Number keys 1–n for gestures?** The mockup shows `kbd` hints. That would be a global key handler and thus a new feature, not styling. Without approval, leave it out.
4. **CTA wiggle:** continuous motion can be annoying. Proposal: only on the start screen and at most five times.
5. **Dark mode:** the mockups are light only. The token rules in §2 should hold. The weak spot is the white boxes (`--surface` turns dark in dark mode, but the name tags on the reveal halves must stay light). Use `--sticker` instead of `--surface` there.

---

## 9. Acceptance checklist

- [ ] 360 px, 390 px and 1280 px width: no horizontal scrolling, no truncated text (long nicknames, EN texts).
- [ ] Keyboard: tab order start → pick → next. Arrow keys in the pad. Focus is visible on every panel background.
- [ ] Contrast ≥ 4.5:1 for text on all panel colors, in both modes.
- [ ] `prefers-reduced-motion: reduce`: no motion, no countdown, dot-grid flash invisible, everything else fully present.
- [ ] Sound: the reveal sound coincides with the impact, not with the start of the countdown.
- [ ] Reconnecting in the middle of the reveal: no countdown, no duplicate sound.
- [ ] Play through 2v2 and wheel of 15 manually once. These cases are not mocked up.
- [ ] `npm test`, `npm run lint`, E2E green. Commit title in Conventional Commit format (`pr-title.yml`), e.g. `feat(web): comic panel look and reveal countdown`.

---

## 10. Reference files

| File | Shows |
| --- | --- |
| `reference/comic-start.dc.html` | Start with all entry animations |
| `reference/comic-pick.dc.html` | Pick: scoreboard, timer, tiles, thought bubble |
| `reference/comic-reveal.dc.html` | Reveal: panel, speed lines, flash, burst |
| `reference/comic-flow.dc.html` | **Complete round flow incl. countdown and match end** – the timings in the `<script>` are the target values |

The files only run in the design canvas. For the agent they are reading material (values, sequences, timings), not a template to copy.
