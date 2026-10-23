/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import type { Reaction, RoomView, RoundResult } from "@rps/shared";
import Board from "../Board.svelte";
import ClashFx from "../ClashFx.svelte";
import PlayerCard from "../PlayerCard.svelte";
import { setLocale } from "../../lib/i18n";
import { resetConnectionMock, roomStore } from "../../test/connection-mock";
import { makeRoom } from "../../test/fixtures";

vi.mock(
  "../../lib/connection",
  async () => (await import("../../test/connection-mock")).connectionMock,
);

/*
 * Tuning round B: the parts that make absorb, burn, gust, slash and the char / squeeze / hexed end poses read,
 * and the 2v2 aim hook of the aimed scenes.
 */

const css = readFileSync(
  join(import.meta.dirname, "..", "..", "styles", "animations.css"),
  "utf8",
);
const start = css.indexOf("@media (prefers-reduced-motion: no-preference)");
const end = css.indexOf("\n}\n", start);
const inside = css.slice(start, end);
const outside = (css.slice(0, start) + css.slice(end)).replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
/** The body of the one static rule with exactly this selector. */
const staticRule = (selector: string): string => {
  const rule = [...outside.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
    (m) => (m[1] ?? "").trim() === selector,
  );
  return rule?.[2] ?? "";
};
const source = (file: string): string =>
  readFileSync(join(import.meta.dirname, file), "utf8");

function overlay(reaction: Reaction, gesture = "paper"): Element {
  const { container } = render(PlayerCard, {
    label: "Gegner",
    gesture,
    side: "theirs",
    loser: true,
    fx: {
      role: "loser",
      className: `react-${reaction}`,
      reaction,
      attack: "burn",
    },
  });
  const art = container.querySelector(`.reveal-art > .${reaction}`);
  expect(art).not.toBeNull();
  return art as Element;
}

describe("absorb: juice streams round the burst", () => {
  it("draws two juice streams and drops that carry the stops of their arc", () => {
    const { container } = render(ClashFx, { attack: "absorb", side: "theirs" });
    expect(
      container.querySelectorAll(".absorb-aim .absorb-stream"),
    ).toHaveLength(2);
    const drops = [
      ...container.querySelectorAll<SVGElement>(".absorb-aim .absorb-drop"),
    ];
    expect(drops.length).toBeGreaterThanOrEqual(6);
    for (const drop of drops) {
      for (const v of ["--x4", "--y4", "--r0", "--r4", "--s", "--d"])
        expect(drop.style.getPropertyValue(v), v).not.toBe("");
    }
  });

  it("runs the drops along those stops in the motion block", () => {
    expect(inside).toMatch(
      /\.fx--absorb \.absorb-stream \{\s*animation: fx-absorb-stream/,
    );
    expect(inside).toMatch(
      /@keyframes fx-absorb-drop \{[\s\S]*?translate: var\(--x2\) var\(--y2\)/,
    );
  });
});

describe("char: fire in front of the sticker, a charred end pose", () => {
  it("stacks flames, a ragged burnt rim, embers and smoke on the struck sticker", () => {
    const char = overlay("char");
    expect(
      char.querySelectorAll(".char-fire .char-flame").length,
    ).toBeGreaterThanOrEqual(3);
    expect(char.querySelector(".char-rim")).not.toBeNull();
    expect(char.querySelectorAll(".char-ember").length).toBeGreaterThan(0);
    expect(char.querySelectorAll(".char-wisp")).toHaveLength(2);
  });

  it("lets the flames flicker only while motion is allowed and puts them out in the end pose", () => {
    expect(inside).toMatch(
      /\.react-char \.char-flame \{\s*animation: fx-char-flame/,
    );
    expect(staticRule(".react-char .char-flame")).toMatch(/opacity:\s*0;/);
  });

  it("draws the burn smoke dark, so it shows on the light panel half", () => {
    expect(source("burn.svelte")).toMatch(/class="line burn-smoke"/);
  });
});

describe("squeeze: wrung narrow, pinched and crumpled", () => {
  it("stacks pinch marks and crumpled rim creases on the struck sticker", () => {
    const squeeze = overlay("squeeze");
    expect(squeeze.querySelectorAll(".squeeze-twist")).toHaveLength(4);
    expect(squeeze.querySelectorAll(".squeeze-crease").length).toBeGreaterThan(
      0,
    );
  });

  it("ends squashed narrower than it is tall", () => {
    const scale = staticRule(".player.loser .reveal-art.react-squeeze").match(
      /scale:\s*([\d.]+)\s+([\d.]+)/,
    );
    expect(scale).not.toBeNull();
    expect(Number(scale?.[1])).toBeLessThan(Number(scale?.[2]) - 0.08);
  });
});

describe("hexed: a sealed end pose with rune marks", () => {
  it("brands rune marks and a seal into the circling star layer (so the motion is unchanged)", () => {
    const hexed = overlay("hexed", "rock");
    const orbit = hexed.querySelector(".hexed-orbit");
    expect(orbit?.querySelector(".hexed-seal")).not.toBeNull();
    expect(orbit?.querySelectorAll(".hexed-rune")).toHaveLength(5);
  });
});

describe("blow: a visible trace", () => {
  it("leaves bold swoosh marks and a wind curl on the blown sticker", () => {
    expect(overlay("blow", "rock").querySelectorAll(".blow-line")).toHaveLength(
      4,
    );
  });
});

describe("2v2 aim of the aimed scenes", () => {
  beforeEach(() => {
    setLocale("en");
    resetConnectionMock();
  });

  for (const [file, part] of [
    ["gust.svelte", "gust-aim"],
    ["absorb.svelte", "absorb-aim"],
  ] as const) {
    it(`${file} turns .${part} for the side-by-side 2v2 panel`, () => {
      const text = source(file);
      expect(text).toMatch(
        new RegExp(
          `:global\\(\\.compact \\.fx--at-mine\\) \\.${part} \\{\\s*rotate: \\d+deg`,
        ),
      );
      expect(text).toMatch(
        new RegExp(
          `:global\\(\\.compact \\.fx--at-theirs\\) \\.${part} \\{\\s*rotate: \\d+deg`,
        ),
      );
    });
  }

  it("renders the effect frame of a 2v2 duel inside a compact player card (the hook the aim reads)", () => {
    const lastRound: RoundResult = {
      picks: { a0: "air", b0: "rock", a1: "paper", b1: "paper" },
      duels: [
        { seats: ["a0", "b0"], result: "a" },
        { seats: ["a1", "b1"], result: "draw" },
      ],
      winner: "a",
    };
    const room: RoomView = makeRoom({
      config: { mode: "team2v2", bestOf: 3 },
      match: { phase: "reveal", score: { a: 1, b: 0 }, lastRound },
    });
    roomStore.set(room);
    render(Board);
    const [first] = screen.getAllByTestId("duel");
    const fx = first?.querySelector(".fx.fx--gust.fx--at-theirs");
    expect(fx).not.toBeNull();
    expect(fx?.closest(".player")).toHaveClass("compact");
  });
});
