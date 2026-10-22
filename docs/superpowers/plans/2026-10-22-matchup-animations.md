# Matchup Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every reveal shows a fitting scene for the actual pairing (attack of the winner, reaction of the loser, comic effect graphic, verb sentence, sound), for all gesture sets, from one pure data model.

**Architecture:** A pure table module in `packages/shared` maps `(winner, loser)` to `{ attack, reaction, overrides }`. The web reveal panel renders an effect layer (SVG per attack archetype) and puts attack/reaction classes on the stickers; all motion lives in `animations.css`. Verb sentences are i18n templates per pair. Sounds are synthesized per attack and chosen by a pure function in the sound bridge.

**Tech Stack:** TypeScript, Svelte 5, CSS animations (individual `translate`/`rotate`/`scale`), WebAudio synth, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-matchup-animations-design.md`. **Base:** the branch that already contains the shared reveal panel `apps/web/src/components/RevealPanel.svelte` (Stage 1 of the tournament work, which also has the comic panel redesign); create `feat/matchup-animations` from `feat/tournament` after merging the latest `feat/comic-panel` into it. Until then the reveal markup lives in `BoardView.svelte`.

## Global Constraints

- All motion only in `apps/web/src/styles/animations.css`, inside the single `@media (prefers-reduced-motion: no-preference)` block, using individual `translate`, `rotate`, `scale`, `opacity`; none in `ui.css`, `base.css` or component `<style>` (the guard tests enforce it). Effects never create layout shift or horizontal overflow (clip inside the reveal panel).
- Colours only from tokens (`art.css` classes `red`, `yellow`, `blue`, `teal`, `orange`, `green`, `white`, `line`, ... or CSS custom properties); no hex; no inline styles except `style:--x`; light and dark mode (effects sit on yellow and blue halves).
- Timing: the impact moment stays `--impact-at` (440 ms); the effect plays about 1.2 to 1.6 s after impact; keep new timing tokens in `tokens.css`.
- Reduced motion: no animation at all; static end pose (loser tilted/desaturated) plus the verb sentence; nothing relies on motion.
- German and English text for every pair; all repo text English (docs, comments, commit messages); app copy bilingual.
- Existing tests stay unchanged unless this plan names them; the reveal panel behaviour, `data-testid="duel"`, `aria-label` regions, `data-gesture`, the persistent `role="status"` node and the countdown/held-score logic must not change.
- Commits: Conventional Commits, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Coverage: every beat relation of every gesture set (classic, lizard-spock, wheel7/9/15) resolves to an attack, a reaction and a verb sentence in both languages (tests enumerate `gestureBeats`).
2. Draws, missing picks, 2v2 (two scenes), bluff, spectators: no scene errors, no `undefined` text, no scene when a pick is missing.
3. Skipping the countdown, phase change during the scene (Next pressed), reconnect mid-reveal: no stuck classes, no leftover timers, sound at the impact moment only once.
4. Visual: effects readable on the yellow and blue halves in light and dark, no overflow at 360 px, no overlap with name tags/status; reduced motion shows the static pose.
5. Performance: no animation of layout properties; at most one scene per duel running at a time.

---

### Task 1: Pure matchup model (`packages/shared`)

**Files:** Create `packages/shared/src/matchups.ts`, `matchups.test.ts`; Modify `packages/shared/src/index.ts`.

**Interfaces:**
- Produces: `export type Attack = 'smash' | 'slash' | 'wrap' | 'burn' | 'splash' | 'gust' | 'zap' | 'shoot' | 'bite' | 'punch' | 'entangle' | 'absorb' | 'curse' | 'poison'`.
- `export type Reaction = 'crumble' | 'split' | 'fold' | 'char' | 'drench' | 'blow' | 'shock' | 'perforate' | 'chomp' | 'knockback' | 'bind' | 'squeeze' | 'hexed' | 'wobble' | 'extinguish'` (one reaction per attack plus `extinguish` for overrides; the builder may add more overrides' reactions).
- `export interface Matchup { attack: Attack; reaction: Reaction; key: string }` with `key = `${winner}>${loser}``.
- `export const GESTURE_ATTACK: Readonly<Record<string, Attack>>` (the first assignment from the spec, all 17 gestures).
- `export const PAIR_OVERRIDES: Readonly<Record<string, Partial<Pick<Matchup, 'attack' | 'reaction'>>>>` (start with `'water>fire'` → `{ reaction: 'extinguish' }`).
- `export function matchupFor(winner: string, loser: string): Matchup` (throws on an unknown gesture; does not check that winner really beats loser).
- `export function allRelations(): { winner: string; loser: string }[]` (every distinct winner/loser pair of every gesture set, derived from `gestureBeats` over all five sets; 112 entries).

- [ ] **Step 1: Failing tests:** `allRelations()` has 112 unique pairs and includes `rock>scissors`, `spock>rock`, `lizard>spock`, `water>fire`; `matchupFor` returns a defined attack and reaction for every relation; the override for `water>fire` applies; `GESTURE_ATTACK` has an entry for every gesture id of every set and uses only the 14 attacks; unknown gesture throws; a table of reaction-per-attack has no gaps (every attack maps to a reaction).
- [ ] **Step 2:** `npx vitest run packages/shared` → FAIL. **Step 3:** implement. **Step 4:** tests, typecheck, eslint green. **Step 5: Commit** `feat(shared): add the pure matchup model`.

### Task 2: Verb sentences (i18n, 112 pairs, DE and EN)

**Files:** Modify `apps/web/src/lib/locales/de.json`, `en.json`; Test `apps/web/src/lib/i18n.test.ts` (new `it` blocks only).

**Interfaces:**
- Keys `rule.<winner>.<loser>` for every relation from `allRelations()`: a full sentence template with `{winner}` and `{loser}` placeholders, e.g. EN `"{winner} crushes {loser}"`, DE `"{winner} zerquetscht {loser}"`, DE separable: `"{winner} brennt {loser} nieder"`. Plus `rule.generic` (`"{winner} beats {loser}"` / `"{winner} schlägt {loser}"`, the existing `board.rule` text moves/aliases here; keep `board.rule` until Task 3 replaces its use).
- Tone: short, playful, correct grammar, no articles, singular present tense; avoid repeating the same verb for neighbouring pairs; classic and Lizard & Spock pairs use the well-known verbs (rock crushes scissors, scissors cut paper, paper covers rock, rock crushes lizard, lizard poisons Spock, Spock smashes scissors, scissors decapitate lizard, lizard eats paper, paper disproves Spock, Spock vaporizes rock).

- [ ] **Step 1: Failing tests:** for every relation of `allRelations()` both locale files contain `rule.<w>.<l>` with both placeholders exactly once and non-empty text; no duplicate sentence template within one locale for the same winner (variety check: at most 2 pairs of one winner share the same verb); key order stable. **Step 2–4:** implement (an agent generates the 224 strings; a printed table `winner | loser | DE | EN` is part of the report so a human can read it) → green. **Step 5: Commit** `feat(web): add verb sentences for every matchup`.

### Task 3: Effect framework in the reveal panel

**Files:** Modify `apps/web/src/components/RevealPanel.svelte` (+ the reveal markup in `BoardView.svelte` only if the panel does not exist yet), `PlayerCard.svelte`, `styles/animations.css`, `styles/tokens.css`; Create `apps/web/src/components/ClashFx.svelte`, `ClashFx.test.ts`, `components/fx/` (one Svelte file per attack, markup only); Test `Board.test.ts` (additions only).

**Interfaces:**
- `ClashFx.svelte`: props `{ attack: Attack | 'clash'; side: 'mine' | 'theirs' }`; renders the SVG effect graphic of that attack inside the duel panel at the impact point (`aria-hidden`), using `art.css` classes; one wrapper class `fx fx--<attack>`.
- `PlayerCard` gets `data-fx="winner|loser|draw"` plus classes `attack-<attack>` (on the winner's sticker) and `react-<reaction>` (on the loser's sticker); the existing `loser-droop` becomes the default `react-*` fallback.
- The rule line shows `t('rule.<winner>.<loser>', { winner, loser })` (fallback `rule.generic`); no line for draws and missing picks as today.
- New tokens: `--fx-dur: 1400ms`, `--fx-delay: var(--impact-at)`.
- Static end pose without motion: `.react-*` rules without animation (opacity/filter/rotate set statically) in `ui.css`-free component styles or plain CSS outside the motion block (no `animation`/`transition` there).
- This task ships the framework plus ONE complete attack/reaction pair (smash/crumble) as the reference implementation that the other tasks copy.

- [ ] **Step 1: Failing tests:** `ClashFx` renders the effect for each attack name and nothing for unknown; a rock-vs-scissors reveal puts `attack-smash` on the winner and `react-crumble` on the loser, shows "Rock crushes Scissors" in English and the German sentence in German, a draw gets `clash` and no sentence, a missing pick shows no `ClashFx`; 2v2 renders two scenes; reduced motion (matchMedia stub) renders the static pose classes; existing Board tests unchanged. **Step 2–4:** implement; layout check in headless Chromium (360/390/1280, light/dark) for the smash scene; **Step 5: Commit** `feat(web): add the matchup effect framework with the smash scene`.

### Task 4a/4b/4c: Effects and reactions (three parallel groups, disjoint files)

Each group copies the Task 3 reference: one `components/fx/<attack>.svelte` per attack (SVG, tokens), `@keyframes` and rules for the attack effect, the winner's attack motion and the loser's reaction inside its **own marked section** of the reveal part of `animations.css` (pre-seed three section headers before dispatching), plus static end poses outside the motion block.
- **4a physical:** slash/split, wrap/fold, shoot/perforate, bite/chomp, punch/knockback.
- **4b elemental:** burn/char (plus `extinguish` override), splash/drench, gust/blow, zap/shock, absorb/squeeze.
- **4c other:** curse/hexed, poison/wobble, entangle/bind, `clash` (draw: both stickers bounce apart), plus the override list review (every pair on the gallery page).

- [ ] **Step 1: Failing tests (per group):** `ClashFx` renders each of the group's attacks; the sticker classes exist; the CSS text contains `.fx--<attack>` and `@keyframes` for each attack inside the no-preference block (read from disk) and the static `.react-<reaction>` rules outside it without `animation`; `components-no-motion` guard stays green. **Step 2–4:** implement; real-browser check per attack at the impact moment and at +1.4 s (screenshots), 360 px, light/dark. **Step 5: Commit** `feat(web): add <group> matchup effects`.

### Task 5: Sounds per attack

**Files:** Modify `apps/web/src/lib/audio.ts`, `audio.test.ts`, `lib/sfx-bridge.ts`, `sfx-bridge.test.ts`.

**Interfaces:**
- `SoundName` gains `attack-<attack>` for the 14 attacks and `clash`; `SOUND_LENGTH` entries (seconds); `RECIPES` synthesized with WebAudio (short, comic: crunch, snip, whoosh, sizzle, splash, zap, bang, ...).
- `export function revealSoundsFor(prev: RoomView | null, next: RoomView | null): SoundName[]` in `sfx-bridge.ts` (pure): for a `pick → reveal` transition returns the attack sound of the first decided duel (or `clash` for a draw) followed by the round-result sound; falls back to the existing `reveal` sound when no matchup is known. The attack sound plays at the impact moment (`--impact-at` after the countdown end) using the polished countdown-end pending mechanism.

- [ ] **Step 1: Failing tests:** every `attack-*` name has a recipe and a length; `revealSoundsFor` returns `attack-smash` for rock vs scissors, `clash` for a draw, the old `reveal` for a missing pick; timing: with fake timers the attack sound starts `impact-at` after the countdown end and exactly once; skip and phase-change cases from the existing tests stay green. **Step 2–4:** implement. **Step 5: Commit** `feat(web): play an attack sound at the impact`.

### Task 6: Dev gallery and tuning pass

**Files:** Modify `apps/web/src/lib/demo.ts`; Create a throwaway QA script outside the repo.

- [ ] **Step 1:** `?demo=fx&winner=rock&loser=scissors` shows a looping reveal of that pair (dev-only, tree-shaken like the other demos); `?demo=fxgallery` lists all 112 pairs plus draws as a grid of small static end poses with a link to the looping demo. **Step 2:** headless screenshots of all 112 pairs at the impact frame and the end pose (390 px, light and dark) as contact sheets; a human review round with Jan (interactive: Jan names the pairs that look wrong; fixes go to the override table or the effect art). **Step 3: Commit** `feat(web): add the matchup effect gallery demo`.

### Task 7: Docs and end-to-end

**Files:** Modify `README.md` (one feature bullet, English), `docs/assets.md` (effect art), `e2e/game.spec.ts` (additions only).

- [ ] **Step 1:** E2E: Rock vs Scissors in a bot or two-player room with motion shows the English sentence "Rock crushes Scissors" in the reveal and `attack-smash`/`react-crumble` classes; with reduced motion the sentence is shown and no animation runs (`document.getAnimations().length === 0`). **Step 2:** full lint, typecheck, vitest, e2e green. **Step 3: Commit** `test(e2e): cover the matchup scene and sentence`.

## Order and parallelism

Task 1 first. Then Tasks 2 and 3 in parallel (data vs component; different files). After Task 3: Tasks 4a, 4b, 4c and 5 in parallel (disjoint files; pre-seeded animation sections). Task 6 after 4a-4c and 5. Task 7 last.

## Self-Review

- Spec coverage: model and overrides (T1), sentences DE/EN (T2), framework, static pose, rule line, draw/missing pick/2v2 (T3), all 14 attacks and reactions plus clash (T4a-c), sounds (T5), tuning with Jan (T6), docs/e2e (T7).
- Type consistency: `Attack`, `Reaction`, `Matchup`, `matchupFor`, `allRelations`, `GESTURE_ATTACK`, `PAIR_OVERRIDES`, `ClashFx` props, `revealSoundsFor`, token names are used identically across tasks.
- Proportion: signatures and test cases, no function bodies or CSS.
