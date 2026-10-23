# Matchup Scenes

At the reveal, the round does not just say "X beats Y". It shows what happens: rock crushes scissors, water puts
out fire. This works in every mode (also 2v2, tournaments and for spectators), because they all share one reveal
panel.

## What a scene is made of

A scene is built from parts, not drawn per pair:

- **Attack** of the winning gesture. There are 14: smash, slash, wrap, burn, splash, gust, zap, shoot, bite,
  punch, entangle, absorb, curse, poison. Each gesture has one (`GESTURE_ATTACK`).
- **Reaction** of the losing gesture. Each attack has its usual reaction (smash makes the loser crumble, wrap
  covers it, burn chars it, ...). There is one extra reaction, `extinguish`, for fire that goes out.
- **Overrides** for pairs where the usual result would look wrong (`PAIR_OVERRIDES`), for example water vs fire:
  the fire is put out, not soaked.
- **Sentence** under the panel, one per pair, in English and German ("Rock crushes Scissors"). Keys are
  `rule.<winner>.<loser>` in `apps/web/src/lib/locales/{en,de}.json`.
- **Sound**: one short synthesized sound per attack (`apps/web/src/lib/audio.ts`). Its hit lands on the visible
  contact, 0.70 s after the countdown ends (the impact at 0.44 s plus 0.26 s). Slash and curse start a little
  earlier, because their hit is inside the sound. The draw's clash sound plays at the impact.

All 112 winner/loser pairs of all gesture sets have an attack, a reaction and a sentence (`allRelations()`; a test
checks this). A **draw** gets its own scene, the clash: both stickers bounce off each other. A missing pick gets
no scene.

**Reduced motion:** nothing moves. The loser shows a still end pose (tilted, greyed, cracked, ...) and the
sentence is shown as usual.

## Where the code lives

- `packages/shared/src/matchups.ts`: the tables (attacks, reactions, overrides) and `matchupFor()`.
- `apps/web/src/lib/matchup-fx.ts`: picks the scene and the sentence for a duel.
- `apps/web/src/components/fx/`: the effect art, see [assets](assets.md#effect-art).
- `apps/web/src/styles/animations.css`: all motion (one `fx: <attack> / <reaction>` section per scene) and the
  still end poses (`FX static end poses`).

## Dev gallery

In the Vite dev server:

```text
http://localhost:5173/?demo=fx&winner=rock&loser=scissors    one pair, full size, replays in a loop (live=0: end pose)
http://localhost:5173/?demo=fxgallery                         all pairs and the draw, grouped by attack
```

The same gesture twice (`winner=rock&loser=rock`) is the draw. `fxgallery` takes `attack=<attack>|draw|all` and
`live=1`.

## Adding a scene

1. **Art:** add `components/fx/<attack>.svelte` (the attack graphic) and, if the loser needs drawn parts,
   `components/fx/react-<reaction>.svelte`. They are picked up by file name.
2. **Motion:** add an `fx: <attack> / <reaction>` section inside the motion block of `animations.css`, using the
   class names and timing variables described at the top of the `fx: framework` section.
3. **Still pose:** add an `fx static: <attack> / <reaction>` section after the motion block. It must equal the
   last keyframe.
4. **Model:** add the attack and reaction to the types in `matchups.ts`, then assign it to a gesture in
   `GESTURE_ATTACK` or to single pairs in `PAIR_OVERRIDES`. A new attack also needs its sound in `audio.ts`.
5. **Test and check:** extend the scene tests in `components/fx/*.test.ts`, then look at every affected pair in
   `?demo=fxgallery`, with and without reduced motion.
