import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  appSheet,
  decl,
  rulesOf,
  ruleIn,
  ruleOf,
  styleOf,
  tokenOf,
} from "./support/stylesheet";
import { BREAKPOINTS } from "../../src/lib/ui/breakpoints";

/**
 * The shell, read as data (ADR-0091 §2, §3, §4, §8).
 *
 * Source-level for the reason `sheet-geometry.test.ts` is: a screenshot
 * baseline can be frozen with a bug in it, and this work's whole defect —
 * `max-width` with no `margin-inline` — survived thirteen desktop baselines by
 * being what every one of them was taken against. What the record decides here
 * is which rule owns a width and where it is written, and both are properties of
 * the stylesheet rather than of any rendered pixel.
 *
 * `appSheet()` and `styleOf` strip comments first, so a sentence naming `72rem`
 * or `grid` cannot satisfy or break a rule below.
 */

const APP_SHELL = "src/App.svelte";
const RATIONS_SHELL = "src/Rations.svelte";
const DAY = "src/lib/views/food/DailyDashboard.svelte";

const WIDE = `@media (min-width: ${BREAKPOINTS.sheet}px)`;
const SHELL = `@media (min-width: ${BREAKPOINTS.shell}px)`;
const WIDEST = `@media (min-width: ${BREAKPOINTS.wide}px)`;

/** The one `src/app.css` rule for `selector`, under the at-rule `at`. */
const appRule = (selector: string, at: string | null = null) =>
  ruleIn(appSheet(), selector, at, "src/app.css");

describe("one shell rule, written once and shared by both Facets", () => {
  it("declares the measures as tokens, widest first when the shell splits", () => {
    // The numbers the prototype settled (#337), and the two the third region
    // added. They are tokens rather than literals because the files that read
    // them are not the files that declare them — the shell's three caps, the
    // rail's column and the flank opposite it — and a flank whose width
    // disagreed with the column it sits in is a gap nobody declared.
    expect(tokenOf("--measure-solo")).toBe("54rem");
    expect(tokenOf("--measure")).toBe("72rem");
    expect(tokenOf("--measure-wide")).toBe("88rem");
    expect(tokenOf("--rail")).toBe("22rem");
    // Equal to the rail by decision rather than by accident: the widest day is
    // a timeline between two flanks, and two flanks of one width is what makes
    // the timeline read as centred. Two tokens, so either may move alone.
    expect(tokenOf("--way")).toBe("22rem");
  });

  it("caps the column and scrolls the box around it", () => {
    // The two used to be one box, and the scrollbar was the tell: `.main`
    // carried `overflow-y: auto` and `max-width` together, so on a wide screen
    // a full-height scrollbar was drawn down the middle of the window with grey
    // either side of it, reading as a pane inside the app rather than as the
    // page's own. The cap and the centring moved onto a wrapper; the scroll
    // stayed outside it.
    //
    // Both halves are asserted, because either one drifting back onto `.main`
    // brings the bar back inboard.
    const column = appRule(".shell-column");
    expect(decl(column, "max-width")).toBe("var(--measure-solo)");
    expect(decl(column, "margin-inline")).toBe("auto");

    const main = appRule(".main");
    expect(decl(main, "overflow-y")).toBe("auto");
    expect(decl(main, "max-width")).toBeUndefined();
    expect(decl(main, "margin-inline")).toBeUndefined();

    // The wrapper is minted in the two shells, so the rule and the element are
    // held together here the way `.rations` and the day's grid are below: a
    // renamed wrapper would leave the cap applying to nothing, with the app
    // looking merely wide and the suite green.
    for (const shell of [APP_SHELL, RATIONS_SHELL]) {
      expect(readFileSync(shell, "utf8")).toContain('class="shell-column"');
    }
  });

  it("widens the measure where the shell splits, and only the measure", () => {
    const wide = appRule(".shell-column", SHELL);
    expect(decl(wide, "max-width")).toBe("var(--measure)");
    // §3: the grid is the day's shape. Written here it would outlive the screen
    // it was drawn for and auto-place a page into the timeline's column.
    expect(decl(wide, "display")).toBeUndefined();
  });

  it("widens Rations alone where the day grows its third region", () => {
    // Unlike the two caps above, which both Facets take. The third region is
    // the day screen's shape and no root screen has one: the root renders the
    // same day behind a navigation sidebar and keeps the two-region grid, so
    // widening its shell here would buy six single-column screens nothing and
    // stretch their measure past a comfortable line.
    const widest = appRule(".rations .shell-column", WIDEST);
    expect(decl(widest, "max-width")).toBe("var(--measure-wide)");
    expect(
      appSheet().filter(
        (r) => r.at === WIDEST && r.selectors.includes(".shell-column")
      )
    ).toEqual([]);
  });
});

describe("Rations' own box, which no picture defends", () => {
  it("scrolls in `.main` and nowhere else", () => {
    // The shell is the height box and `.main` is the scroll box. Two scroll
    // boxes would be a nested scroll a thumb has to guess between — and, on the
    // camera, a full-page capture of one screenful with the whole day hidden
    // inside it, which is exactly what `visual-catalog.spec.ts` flattens these
    // two declarations to avoid (#348). A test that reads the flattening's
    // premise is what stops the picture from being the only thing holding it.
    const shell = ruleOf(RATIONS_SHELL, ".rations");
    expect(decl(shell, "height")).toBe("100svh");
    expect(decl(shell, "overflow-y")).toBeUndefined();
    expect(decl(appRule(".main"), "overflow-y")).toBe("auto");
  });

  it("reserves all four safe areas, where the root reserves three", () => {
    // ADR-0089 §2 and ADR-0078 §1, which only make sense together. The root
    // hands the bottom inset to its nav, because the nav is the thing at the
    // foot of the screen and reserves the home indicator itself. Rations has no
    // nav — that absence is the whole shape of the Facet — so nothing stands
    // between this box and the indicator, and the fourth inset is its own.
    //
    // Two shells that disagree about one edge is precisely the drift the shared
    // `.main` rule was written to end, so the disagreement that IS intended is
    // named here rather than left looking like the one that was not.
    const rations = decl(ruleOf(RATIONS_SHELL, ".rations"), "padding");
    for (const side of ["top", "right", "bottom", "left"]) {
      expect(rations).toContain(`env(safe-area-inset-${side}, 0px)`);
    }

    const root = ruleOf(APP_SHELL, ".app");
    expect(decl(root, "padding-top")).toBe("env(safe-area-inset-top, 0px)");
    expect(decl(root, "padding-right")).toBe("env(safe-area-inset-right, 0px)");
    expect(decl(root, "padding-left")).toBe("env(safe-area-inset-left, 0px)");
    expect(decl(root, "padding-bottom")).toBeUndefined();
    expect(decl(root, "padding")).toBeUndefined();
  });
});

describe("the two regions are the day's shape, not the shell's", () => {
  it("puts the grid on the day screen, inside Rations' shell only", () => {
    // Scoped twice over, and each scope answers a different failure. `.day` is
    // the day screen's own element, so a page (#345) cannot inherit the grid by
    // standing where the day stood. `:global(.rations)` is the Facet: the root
    // renders this same component in its Food tab behind a sidebar, and gets
    // the shell rule and nothing else (ADR-0091, Consequences).
    const day = ruleOf(DAY, ":global(.rations) .day", SHELL);
    expect(decl(day, "display")).toBe("grid");
    // The timeline holds the reading edge and the rail is beside it, so the
    // rail's own width is the second track and the timeline takes the slack.
    // `minmax(0, 1fr)` rather than `1fr` so a long food name shrinks that track
    // instead of pushing the rail off the screen.
    expect(decl(day, "grid-template-columns")).toBe(
      "minmax(0, 1fr) var(--rail)"
    );
  });

  it("holds the shell's class name and the day's selector together", () => {
    // The one thing `:global()` gives up: `.rations` is minted in another file,
    // so the compiler will not tell anyone who renames it that a grid stopped
    // applying. Nothing about the day would look wrong — it would just be one
    // column again, at every width, with a green suite. So the shell's class is
    // read here rather than assumed.
    expect(readFileSync(RATIONS_SHELL, "utf8")).toContain('class="rations"');
  });

  it("is one column at every width below the shell breakpoint", () => {
    // The mobile-first floor: `.day` is a plain block wrapper, and the grid is
    // the override. Anything unconditional here would reach a phone.
    const unconditional = rulesOf(styleOf(DAY)).filter(
      (r) => r.at === null && r.selectors.includes(":global(.rations) .day")
    );
    expect(unconditional).toEqual([]);
  });

  it("puts the timeline in the left region, holding the reading edge", () => {
    const timeline = ruleOf(DAY, ":global(.rations) .day > .timeline", SHELL);
    expect(decl(timeline, "grid-area")).toBe("meals");
  });

  it("does not pin the rail", () => {
    // ADR-0091 §4, decided rather than deferred: the rail's blocks are siblings
    // of the timeline, so there is no unit to pin. A `sticky` here would be
    // pinning them separately, which either overlaps them or needs the block
    // above as a constant. The trigger for reopening it is a real rail element.
    const wide = rulesOf(styleOf(DAY)).filter((r) => r.at === SHELL);
    expect(wide.map((r) => decl(r, "position")).filter(Boolean)).toEqual([]);
  });
});

describe("the widest day is a timeline between two flanks", () => {
  it("lays the timeline on its side and gives the ways in a fixed flank", () => {
    // ADR-0101's Amendment: above `wide` the ways into the day leave the head
    // of the timeline for a column of their own, opposite the rail. The flank
    // is fixed for the rail's reason — what it holds is sized by what it says,
    // five ways in at the tap floor and four meal names — and the meals take
    // the slack.
    const timeline = ruleOf(DAY, ":global(.rations) .timeline", WIDEST);
    expect(decl(timeline, "flex-direction")).toBe("row");
    // The flank is as tall as its contents, the meals as tall as the day.
    // Without this they stretch to each other, which both puts a column of
    // white under the bar and takes the sticky's travel away: an item already
    // the height of its container has nowhere to go.
    expect(decl(timeline, "align-items")).toBe("flex-start");

    const slot = ruleOf(
      DAY,
      ":global(.rations) .timeline > .way-in-slot",
      WIDEST
    );
    expect(decl(slot, "flex")).toBe("0 0 var(--way)");

    const meals = ruleOf(DAY, ":global(.rations) .timeline > .meals", WIDEST);
    expect(decl(meals, "flex")).toBe("1");
    // `minmax(0, 1fr)`'s flexbox spelling, and there for the reason the day's
    // grid gives it: a long food name shrinks this box rather than pushing the
    // flank off the screen.
    expect(decl(meals, "min-width")).toBe("0");
  });

  it("keeps the meals in a box of their own, so the flank has something to stick against", () => {
    // The wrapper is what makes the flank stickable at all. A grid item's
    // containing block is its own grid area, so a slot placed in one cell of a
    // grid over the meals has no travel; a flex item's is the flex container,
    // and the container is as tall as this box. It is invisible below `wide`:
    // it carries the gap the timeline used to carry directly.
    const meals = ruleOf(DAY, ".meals");
    expect(decl(meals, "display")).toBe("flex");
    expect(decl(meals, "flex-direction")).toBe("column");
    expect(decl(meals, "gap")).toBe("var(--space-m)");
    expect(readFileSync(DAY, "utf8")).toContain('<div class="meals">');
  });

  it("adds a shape rather than changing one, so every baseline below it still holds", () => {
    // `wide` is above the `chromium` project's 1280, which `shell` may never be
    // (#337 Q21). The difference is that this shape is purely additive: at 1439
    // the day is exactly the two-region screen the desktop baselines were taken
    // against, so nothing below the query is un-photographed. What defends the
    // query itself is `layout-invariants.spec.ts`, which sweeps Rations at
    // 1920x1080 and therefore stands inside it.
    expect(BREAKPOINTS.wide).toBeGreaterThan(BREAKPOINTS.shell);
    expect(readFileSync("tests/layout-invariants.spec.ts", "utf8")).toContain(
      "1920"
    );
  });
});

describe("a media query means the shape changes here", () => {
  /** Every rule in `file` under a `min-width: 768px` query. */
  const bumps = (file: string) =>
    rulesOf(styleOf(file))
      .filter((r) => r.at === WIDE)
      .map((r) => r.selectors.join(", "));

  it("deletes the seven step changes onto a scale that is already fluid", () => {
    // A media query that steps a `clamp()` token up to a larger one is the
    // Utopia scale being distrusted (ADR-0091 §8). No element changed position,
    // column count or role in any of the seven.
    expect(bumps("src/lib/views/FoodView.svelte")).toEqual([]);
    expect(bumps("src/lib/views/food/CommitButton.svelte")).toEqual([]);

    // The day's three are named rather than swept to empty, because every one of
    // them is the thing this section tests FOR: at 768 the Way-in bar stops
    // being pinned to the band's bottom edge and becomes sticky at the head of
    // the column (ADR-0101 §3), so the slot it shares with the Selection bar
    // changes from a plain block to a clipped one-cell grid, the two bars stack
    // in that cell, and the day stops reserving the foot of the screen for a bar
    // that is no longer standing on it. Position, role and stacking all change;
    // no token steps.
    expect(bumps(DAY)).toEqual([
      ".way-in-slot",
      ".way-in-slot > :global(.way-in-bar), .way-in-slot > :global(.selbar)",
      ".timeline",
    ]);
  });

  it("keeps the ones the roster of seven did not name", () => {
    // Named positively so the sweep above cannot pass by deleting everything.
    //
    // The first of the three is the honest one to look at: #342 kept the `.main`
    // block calling it a real shape rule, and what is left inside it after the
    // cap became unconditional is a padding step — `--space-m`/`--space-s` to
    // `--space-l`/`--space-xl`, both fluid tokens. By this section's own test
    // that is an eighth bump wearing the word "gutter", and it survives because
    // the roster of seven was enumerated and this was not on it, not because it
    // passes. Deleting it changes the desktop inset of every screen in both
    // Facets, which is a decision somebody should make on purpose.
    expect(
      appSheet().filter((r) => r.at === WIDE && r.selectors.includes(".main"))
    ).toHaveLength(1);
    expect(bumps("src/lib/ui/BottomSheet.svelte").length).toBeGreaterThan(0);
    expect(bumps("src/lib/views/food/WeekStrip.svelte")).toContain(
      ".day-label-narrow"
    );
  });
});
