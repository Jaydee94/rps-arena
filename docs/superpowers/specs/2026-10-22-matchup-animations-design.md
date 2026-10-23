# Matchup animations: a fitting reveal for every pairing

Date: 2026-10-22. Agreed with Jan in chat. Nothing built yet.

## Intent

At the reveal, the two gestures should not just fly in and collide. The scene should show **what actually happens**: rock crushes scissors, scissors cut paper, water extinguishes fire, lightning zaps a human. This works for every mode (Classic, Lizard & Spock, Wheel of 7/9/15, Bluff, 2v2, tournaments, spectators) without hand-making an animation for each of the 112 distinct winner/loser pairs.

## Decisions (Jan)

- **Building-kit approach.** A pairing is composed from three parts, no bespoke scene per pair: the **attack** of the winning gesture, the **reaction** of the losing gesture, and a small table of **overrides** for pairs where the generic result would look wrong (for example water vs fire: the fire is extinguished, not soaked like paper).
- The scene includes: **comic effect graphics** (drawn flames, drops, bolts, claw marks, thick outline, tokens only), a **verb sentence** instead of "X beats Y" ("Rock crushes Scissors", German and English, written for all 112 pairs), and **sound effects** per attack.
- The comic burst word stays POW/BAM/ZAP (no per-attack onomatopoeia).
- **All modes in one go** (no staged rollout). No prototype first; we tune on the finished result together (a dev-only gallery page makes that easy).

## Model

Distinct pairs: the 15-gesture wheel has 105 winner/loser pairs; Lizard & Spock adds 7 more (rock>lizard, scissors>lizard, lizard>paper, lizard>spock, paper>spock, spock>rock, spock>scissors). The smaller wheels (7 and 9) and Classic are subsets of the 15 wheel.

- `attack(gesture)`: one of about 14 attack archetypes, assigned per **gesture** (not per pair). First assignment (the builder may refine): rock smash, scissors slash, paper wrap, fire burn, water splash, air gust, lightning zap, gun shoot, snake bite, wolf bite, human punch, tree entangle, sponge absorb, devil curse, dragon burn, lizard poison, spock zap.
- `reaction(attack)`: the loser's reaction, one per attack archetype: crumble (smash), split in two (slash), fold up (wrap), char (burn), drench (splash), blow away (gust), shock (zap), perforate (shoot), chomp marks (bite), knock back (punch), bind (entangle), squeeze dry (absorb), curse (curse), wobble green (poison).
- `overrides[winner>loser]`: replaces attack and/or reaction (for example water>fire = `extinguish`, fire>water does not exist; paper>rock = wrap with a "covered" reaction; rock>paper does not exist).
- A **draw** (same gesture on both sides) is its own `clash`: both stickers bounce off each other. A missing pick shows no scene (only the existing "no pick" card).
- Reduced motion: no animation. A static end pose (loser tilted and desaturated, effect graphic shown frozen in its final frame or omitted) plus the verb sentence.
- The scene must fit the existing reveal: the impact moment stays `--impact-at` (440 ms after the clash starts), the effect plays for about 1.2 to 1.6 s after impact, and the result stays readable for the rest of `REVEAL_MS` (5.5 s including the 1.26 s countdown).
- Sound: one short synthesized sound per attack archetype plus `clash`, played at the impact moment (it replaces the generic `reveal` sound where an attack is known; the generic one stays as fallback). The countdown-end sound scheduling from the comic panel work stays the source of timing.

## Goals

- Every legal pairing in every mode has a matching scene, sentence and sound.
- Data lives in `packages/shared` as pure, tested tables (a test proves that every beat relation of every gesture set has a verb entry and an attack/reaction).
- Spectators and 2v2 get the same scenes automatically (they share the reveal panel).

## Non-goals

- No hand-drawn scene per pair. No new gestures. No change to server rules, timings or protocol. No per-attack burst words.

## Constraints

- All motion in `styles/animations.css` inside the single `prefers-reduced-motion: no-preference` block; effect art is SVG using the `art.css` classes (tokens, no hex); no inline styles except `style:--x`; effects use `transform`/`opacity` only; both light and dark mode; effects never widen the page (clip inside the reveal panel). German and English sentences for every pair; docs in English.

## Left to the builder

The final attack/reaction assignment per gesture, the look of each effect, exact timings per archetype, the sound recipes, the override list (start with water>fire and check every pair on the gallery page), the wording of the 112 sentences (short, funny, grammatically correct, no articles needed).

## Risks

- 112 sentences x 2 languages is a lot of text: validate with a coverage test and a human read-through of a printed table.
- Visual consistency across 14 effects built in parallel: one shared effect frame (size, anchor point, outline, timing tokens) defined first.
- German separable verbs ("brennt ... nieder"): sentences are full templates per pair (`{winner}`, `{loser}` placeholders), not verb + glue.
