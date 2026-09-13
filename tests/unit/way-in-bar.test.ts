/**
 * The day's Way-in bar (ADR-0101).
 *
 * Two kinds of claim live here and they are tested differently. The DOM ones —
 * that the rail is a real panel, that a folded bar is `inert`, that a meal with
 * no past shows four cells — are rendered. The geometry ones are read off the
 * stylesheet, for `sheet-geometry.test.ts`'s reason: what is decided is which
 * properties this box may name and at which width, and that is a property of the
 * CSS rather than of any rendered pixel.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "svelte/server";
import { decl, ruleOf, rulesOf, styleOf } from "./support/stylesheet";
import { BREAKPOINTS } from "../../src/lib/ui/breakpoints";
import {
  mealNearest,
  MEAL_TYPES,
  type MealType,
} from "../../src/lib/food/meal-type";
import { WAYS_IN, wayInCaption, wayInLabel } from "../../src/lib/food/ways-in";
import WayInBar from "../../src/lib/views/food/WayInBar.svelte";
import WayInRail from "../../src/lib/views/food/WayInRail.svelte";

const BAR = "src/lib/views/food/WayInBar.svelte";
const RAIL = "src/lib/views/food/WayInRail.svelte";
const WIDE = `@media (min-width: ${BREAKPOINTS.sheet}px)`;
const CALM = "@media (prefers-reduced-motion: reduce)";

const allPast: Record<MealType, boolean> = {
  breakfast: true,
  lunch: true,
  dinner: true,
  snack: true,
};

const bar = (folded = false) =>
  render(WayInBar, {
    props: {
      folded,
      dbReady: true,
      mealHasPast: allPast,
      onEnterMeal: () => {},
    },
  }).body;

/** The meal on the one tab bits-ui marked active. */
const activeTabOf = (body: string) =>
  /role="tab" data-state="active" data-value="(\w+)"/.exec(body)?.[1];

/** Each rendered panel, in markup order, split off the body. */
const panelsOf = (body: string) =>
  body.split(/(?=<div [^>]*role="tabpanel")/).slice(1);

afterEach(() => vi.useRealTimers());

describe("the rail is the panel, which is what makes this a tab list (§1)", () => {
  it("draws a tab per meal and a panel behind each one", () => {
    const body = bar();

    // The misuse this guards against is a `role="tab"` with no `role="tabpanel"`
    // behind it — a row of toggles wearing tab clothes.
    expect(body.match(/role="tab"/g)).toHaveLength(MEAL_TYPES.length);
    expect(body.match(/role="tabpanel"/g)).toHaveLength(MEAL_TYPES.length);
  });

  it("keeps ADR-0059's five in every panel, labels untouched", () => {
    const body = bar();

    // The roster, the order and the labels are ADR-0059's and this record
    // revises none of them. Every control still states its meal, which is what
    // makes twenty labels twenty distinct strings — and is why a spec reaching
    // one of them is reaching the meal it named and no other.
    for (const meal of MEAL_TYPES) {
      for (const kind of WAYS_IN) {
        expect(body).toContain(`aria-label="${wayInLabel(kind, meal)}"`);
      }
    }
  });

  it("shows one meal's five and hides the other fifteen", () => {
    // What "the day loses fifteen controls" means with bits' own presence
    // handling, which keeps every panel mounted rather than unmounting three:
    // the markup carries twenty and three panels wear `hidden`. `hidden` is
    // `display: none`, so on screen, in the tab order and to a screen reader
    // there are five — and a spec that asks for another meal's control finds a
    // hidden element and fails, rather than clicking into the wrong meal.
    const panels = panelsOf(bar());
    const shown = panels.filter((p) => !/^<div [^>]*\bhidden=""/.test(p));

    expect(panels).toHaveLength(MEAL_TYPES.length);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain(`data-value="${activeTabOf(bar())}"`);
  });
});

describe("the meal is chosen and never inferred (§2)", () => {
  // The boundaries themselves are `food/meal-type.ts`'s and are swept there,
  // over a function that takes the moment rather than reading a clock. What is
  // this bar's to prove is that it consults them, once, and that what comes back
  // is the tab bits-ui marks active — so a change of heart about when lunch
  // starts cannot quietly stop reaching the control it decides.
  it("opens on the meal nearest the clock, and on that one only", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 13, 12, 30, 0));

    const body = bar();
    expect(activeTabOf(body)).toBe(mealNearest(new Date()));
    // Scoped to the tabs: the panel behind the selected one carries the same
    // `data-state`, so an unscoped count is two and says nothing.
    expect(body.match(/role="tab" data-state="active"/g)).toHaveLength(1);
  });

  it("is a starting value and not a subscription", () => {
    // §2's actual claim: nothing moves under you once the screen is up. The
    // clock is read at mount and never again, so a bar rendered before noon is
    // still on breakfast at one — only a tab moves the target.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 13, 9, 0, 0));
    const morning = bar();

    vi.setSystemTime(new Date(2026, 8, 13, 13, 0, 0));
    expect(activeTabOf(morning)).toBe("breakfast");
  });
});

describe("the bar is anchored at the edge the hand is on (§3)", () => {
  it("writes one anchor, and it is the band minus the shell's own floor", () => {
    // `SelectionBar`'s rule read one surface across: a second `bottom` — under a
    // breakpoint, on a child, anywhere — means the bar has started deriving a
    // geometry instead of consuming one.
    const anchors = rulesOf(styleOf(BAR))
      .filter((r) => decl(r, "bottom") !== undefined)
      .map((r) => `${r.at ?? "every width"} — ${r.selectors.join(", ")}`);

    expect(anchors).toEqual(["every width — .way-in-bar"]);
    expect(decl(ruleOf(BAR, ".way-in-bar"), "bottom")).toBe(
      "calc(var(--vv-bottom) + var(--shell-floor))"
    );
  });

  it("adds no breakpoint of its own", () => {
    // §3's claim in full: a way-in bar asks `BREAKPOINTS.sheet`'s question about
    // a different surface, so it takes the same answer and the roster in
    // `lib/ui/breakpoints.ts` gains nothing. Read from the roster rather than
    // written as 768, which is the pair `breakpoints.test.ts` holds from the
    // other end.
    const widths = [
      ...new Set(
        rulesOf(styleOf(BAR))
          .map((r) => r.at)
          .filter((at): at is string => at !== null && at.includes("min-width"))
      ),
    ];

    expect(widths).toEqual([WIDE]);
  });

  it("stops being pinned above it, and hands the sticky to the slot", () => {
    expect(decl(ruleOf(BAR, ".way-in-bar", WIDE), "position")).toBe("static");
  });

  it("drops the phone's cap and its auto margin above 768", () => {
    // An AUTO inline margin on a flex item overrides `stretch`, so the pair the
    // full-bleed phone bar needs is the pair that made the desktop bar stand
    // narrow and centred inside its own column. Both are the phone's.
    const wide = ruleOf(BAR, ".way-in-bar", WIDE);
    expect(decl(wide, "max-width")).toBe("none");
    expect(decl(wide, "margin-inline")).toBe("0");
  });
});

describe("the bar's own corner is the slot's corner (§5)", () => {
  it("drops its top and side padding above 768", () => {
    // The groove's corner is then the bar's corner, which is the point the
    // Selection bar's corner lands on when it takes the slot. An inset here is
    // drift you can see every time the mode changes.
    expect(decl(ruleOf(BAR, ".way-in-bar", WIDE), "padding")).toBe(
      "0 0 var(--space-2xs)"
    );
  });

  it("takes the page's ground up there and paper down here", () => {
    // On a phone the bar is in front of something and white says so. Stuck at
    // the head of the column it is in front of nothing: the day slides under it
    // and reappears the colour it went in.
    expect(decl(ruleOf(BAR, ".way-in-bar", WIDE), "background")).toBe(
      "var(--bg-base)"
    );
    expect(decl(ruleOf(BAR, ".way-in-bar"), "background")).toBe("var(--paper)");
  });
});

describe("the fold (§6)", () => {
  it("is inert while folded, not merely short", () => {
    // A folded bar still holds nine controls, and a tab stop inside a box nobody
    // can see is worse than a visible one.
    expect(bar(true)).toMatch(/\binert\b/);
    expect(bar(false)).not.toMatch(/\binert\b/);
  });

  it("animates to a height nobody has measured", () => {
    // `grid-template-rows: 1fr -> 0fr` is the only way to do that, and the
    // height is genuinely unknown: the rail drops a cell for a meal with no past
    // (ADR-0059 §4), so a `max-height` would need a number wrong for one meal.
    expect(decl(ruleOf(BAR, ".folder"), "grid-template-rows")).toBe("1fr");
    expect(
      decl(ruleOf(BAR, ".way-in-bar.folded .folder"), "grid-template-rows")
    ).toBe("0fr");
  });

  it("travels on a box that is not the grid item", () => {
    // The grid item's used height IS the row's height, so `translateY(-100%)`
    // there is a percentage of a box collapsing at the same time — 12px of
    // travel against a 134px bar, which read as the bar being squashed rather
    // than leaving. `.folder-slide` is not a grid item and keeps its natural
    // height the whole way.
    expect(
      decl(ruleOf(BAR, ".way-in-bar.folded .folder-slide"), "transform")
    ).toBe("translateY(-100%)");
    expect(decl(ruleOf(BAR, ".folder-window"), "overflow")).toBe("hidden");
    expect(decl(ruleOf(BAR, ".folder-window"), "min-height")).toBe("0");
  });

  it("is one duration everywhere, and zero under prefers-reduced-motion", () => {
    // One token for the row, the padding, the margins and the rules, so the fold
    // is one gesture rather than four that agree by coincidence — and one place
    // for the opt-out to land, which is `app.css`'s own shape: the state change
    // survives and the gesture does not.
    expect(decl(ruleOf(BAR, ".way-in-bar"), "--fold")).toBe(
      "0.22s var(--ease-snap)"
    );
    expect(decl(ruleOf(BAR, ".way-in-bar", CALM), "--fold")).toBe("0s");

    // And no transition names a duration of its own beside the token, which is
    // how three of the four would drift out of step with the fourth.
    const durations = (styleOf(BAR).match(/transition:[^;]*/g) ?? []).filter(
      (t) => /\d+m?s/.test(t)
    );
    expect(durations).toEqual([]);
  });
});

describe("the rail, which is ADR-0059's roster in a line", () => {
  const rail = (hasPast: boolean) =>
    render(WayInRail, {
      props: {
        meal_type: "lunch" as MealType,
        dbReady: true,
        hasPast,
        onEnterMeal: () => {},
      },
    }).body;

  it("drops the past-meal cell rather than disabling it (ADR-0059 §4)", () => {
    expect(rail(true)).toContain(wayInLabel("past", "lunch"));
    expect(rail(false)).not.toContain(wayInLabel("past", "lunch"));
  });

  it("still fills the line at four cells", () => {
    // `grid-auto-columns: 1fr` rather than `repeat(5, 1fr)`, so a meal with no
    // past shows four cells across the line instead of a gap where the fifth
    // would have been.
    expect(decl(ruleOf(RAIL, ".rail"), "grid-auto-columns")).toBe("1fr");
    expect(decl(ruleOf(RAIL, ".rail"), "grid-auto-flow")).toBe("column");
  });

  it("carries the floor on the cell, restated because :global outranks it", () => {
    // ADR-0098 §5: a `ui/Button` reshaped from outside needs the floor written
    // here, because a `:global` rule outranks the primitive's own. The width is
    // no longer square — that is the point of the line — so only the height
    // names the token, plus room for the caption.
    const cell = ruleOf(RAIL, ".rail :global(.way-in-cell)");
    expect(decl(cell, "min-width")).toBe("var(--tap-min)");
    expect(decl(cell, "min-height")).toBe("calc(var(--tap-min) + 0.75rem)");
  });

  it("captions each cell with the fourth gloss, not a truncated third", () => {
    // "Ingredient search" would clip to "Ingredient" and "Quick entry" to
    // "Quick": the wrong half of one and a coincidence in the other.
    const body = rail(true);
    for (const kind of WAYS_IN) {
      expect(body).toContain(wayInCaption(kind));
    }
  });
});
