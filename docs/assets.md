# Assets

Everything the web app ships besides code. No asset is loaded from a third party at runtime.

## Illustrations (self-drawn)

All SVGs are original work by this project, published under the same license as the repository (MIT).
They carry no colors of their own: every part has a class (`red`, `yellow`, `halo`, ...) and
`apps/web/src/styles/art.css` maps those classes to the design tokens in `tokens.css`. Restyling the art
therefore means editing CSS, not the SVG files. Outlines use the fixed `--line` token.

| Path | Content |
| --- | --- |
| `apps/web/src/assets/avatars/{fox,robot,cat,owl,panda,dino,alien,ghost}.svg` | The 8 avatars from `AVATARS` in `packages/shared` |
| `apps/web/src/assets/gestures/{rock,fire,scissors,snake,human,tree,wolf,sponge,paper,air,water,dragon,devil,lightning,gun}.svg` | The 15 gestures of the wheel (also used by the wheel-7 and wheel-9 sets) |
| `apps/web/src/assets/gestures/{lizard,spock}.svg` | The two extra gestures of Lizard & Spock (and Bluff) |

Tests (`apps/web/src/lib/gestures-ui.test.ts`) fail when a gesture of any set or an avatar id has no file.

The favicon is an inline `data:` SVG in `apps/web/index.html` (also original work).

## Fonts (self-hosted, SIL Open Font License 1.1)

Files live in `apps/web/src/assets/fonts/` (converted from the upstream TTF to WOFF2 without changes to the
glyphs) and are declared in `apps/web/src/styles/fonts.css`. The license texts sit next to the files.

| Font | Use | Files | Source | License |
| --- | --- | --- | --- | --- |
| Bangers (c) 2010 The Bangers Project Authors | Display type: headings, buttons, bursts | `Bangers-Regular.woff2`, `OFL-Bangers.txt` | https://github.com/google/fonts/tree/main/ofl/bangers (upstream: https://github.com/googlefonts/bangers) | OFL 1.1 |
| Comic Neue (c) 2014 The Comic Neue Project Authors | Body text (Regular 400, Bold 700) | `ComicNeue-Regular.woff2`, `ComicNeue-Bold.woff2`, `OFL-ComicNeue.txt` | https://github.com/google/fonts/tree/main/ofl/comicneue (upstream: https://github.com/crozynski/comicneue) | OFL 1.1 |

The OFL permits bundling and redistribution with software as long as the license text travels with the fonts and
the fonts are not sold on their own. The font stacks in `tokens.css` keep system fallbacks (Impact, Comic Sans MS,
Trebuchet MS) for the moment before the WOFF2 files have loaded (`font-display: swap`).

## Audio (synthesized)

There are no sound files. The comic sound effects and the optional music loop are generated at runtime with the
Web Audio API (`apps/web/src/lib/audio.ts`), so no third-party audio license applies. Sound only starts after a
user gesture; SFX and music can be muted separately.

## Camera model (not part of the repository)

The experimental camera control uses the official MediaPipe `gesture_recognizer.task` model published by Google and
the WASM files of the npm package `@mediapipe/tasks-vision` (license `Apache-2.0` according to `package-lock.json`).
Neither is committed: `scripts/fetch-model.mjs` downloads the model at build time (SHA-256 verified) and copies the
WASM files, so both end up in the built web app and in the container image, and the server serves them from its
own origin. The license terms of the model are those published by the MediaPipe project; they are not restated here.
