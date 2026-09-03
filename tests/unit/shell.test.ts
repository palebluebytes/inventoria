import { describe, it, expect } from "vitest";
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
