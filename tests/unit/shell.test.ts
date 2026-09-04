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

/** The one `src/app.css` rule for `selector`, under the at-rule `at`. */
const appRule = (selector: string, at: string | null = null) =>
  ruleIn(appSheet(), selector, at, "src/app.css");

describe("one shell rule, written once and shared by both Facets", () => {
  it("declares the three measures as tokens, widest first when the shell splits", () => {
    // The numbers the prototype settled (#337). They are tokens rather than
    // literals because three files read them — the shell's two caps and the
    // rail's column — and a rail whose width disagreed with the column it sits
    // in is a gap nobody declared.
    expect(tokenOf("--measure-solo")).toBe("54rem");
    expect(tokenOf("--measure")).toBe("72rem");
    expect(tokenOf("--rail")).toBe("22rem");
  });

  it("centres and caps `.main` at every width", () => {
    // The reported defect: `max-width` with no `margin-inline`, so a 1920px
    // screen drew an ~864px column hugging the left edge. Both halves are
    // unconditional now — a cap that only exists above a breakpoint is a cap
    // that is missing wherever it was not thought about.
    const main = appRule(".main");
    expect(decl(main, "max-width")).toBe("var(--measure-solo)");
    expect(decl(main, "margin-inline")).toBe("auto");
  });

  it("widens the measure where the shell splits, and only the measure", () => {
    const wide = appRule(".main", SHELL);
    expect(decl(wide, "max-width")).toBe("var(--measure)");
    // §3: the grid is the day's shape. Written here it would outlive the screen
    // it was drawn for and auto-place a page into the timeline's column.
    expect(decl(wide, "display")).toBeUndefined();
  });

  it("gives the last meal room under it, on the last child at every width", () => {
    // Not a desktop rule, although the desktop shell is where it was noticed:
    // the reason is about boxes rather than widths, and the timeline is the last
    // child of the day at every one of them.
    const timeline = ruleOf(DAY, ".timeline");
    expect(decl(timeline, "padding-bottom")).toBe("var(--space-2xl)");
  });

  it("keeps the room under the last meal off the scroll container", () => {
    // `.main` is the `overflow-y: auto` box, and its own bottom padding at the
    // end of the scroll range is the one piece of box geometry browsers have
    // historically disagreed about. The room goes on the last child instead.
    //
    // The rules are counted before they are read: an empty list satisfies "none
    // of these declares a bottom padding" while proving nothing, and a renamed
    // or moved `.main` is exactly how the list would empty.
    const mains = appSheet().filter((r) => r.selectors.includes(".main"));
    expect(mains.map((r) => r.at)).toEqual([null, WIDE, SHELL]);
    expect(
      mains.filter((r) => decl(r, "padding-bottom") !== undefined)
    ).toEqual([]);
  });

  it("leaves neither shell declaring `.main` itself", () => {
    // The defect was duplicated character for character between the two, which
    // is the same defect twice and was fixed once. A component rule would also
    // beat the shared one: Svelte scopes it to 0,2,0 against this rule's 0,1,0.
    for (const shell of [APP_SHELL, RATIONS_SHELL]) {
      const own = rulesOf(styleOf(shell)).filter((r) =>
        r.selectors.includes(".main")
      );
      expect(own).toEqual([]);
    }
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
    expect(bumps(DAY)).toEqual([]);
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
