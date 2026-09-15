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
import { WAYS_IN, wayInLabel } from "../../src/lib/food/ways-in";
import WayInBar from "../../src/lib/views/food/WayInBar.svelte";
import WayInRail from "../../src/lib/views/food/WayInRail.svelte";

const BAR = "src/lib/views/food/WayInBar.svelte";
const NAV = "src/lib/layout/Sidebar.svelte";
const PICKER = "src/lib/views/food/MealPicker.svelte";
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

/** The meal the chip is on, off the one tile the panel marks pressed. */
const targetOf = (body: string): MealType | undefined => {
  const value = /class="mp-tile[^"]*" aria-pressed="true">(\w+)</.exec(
    body
  )?.[1];
  return MEAL_TYPES.find((meal) => meal === value?.toLowerCase());
};

afterEach(() => vi.useRealTimers());

describe("one line, and the tab list it gave up (amended 2026-09-15)", () => {
  it("holds one meal control and five ways in, and no tab list at all", () => {
    const body = bar();

    // The shape the 2026-09-15 amendment bought: four tabs and twenty mounted
    // controls become one picker and five buttons. A `role="tab"` reappearing
    // here is the old bar coming back, and with it 104px of band — the groove,
    // its padding, the seam under it and a caption on every cell.
    expect(body).not.toMatch(/role="tab"/);
    // The chip, the four meals in its panel, and the five ways in. The panel's
    // four are in the markup rather than mounted-and-hidden like the old tab
    // list's twenty: a popover is display:none until it is shown, and it holds
    // four buttons rather than four panels of five.
    expect(body.match(/<button/g)).toHaveLength(
      1 + MEAL_TYPES.length + WAYS_IN.length
    );
  });

  it("opens its own panel, on the platform's popover and not a portal", () => {
    // The chip stopped being `ui/Select` at #453: the platform draws a native
    // select's list, and on a device that meant Android's Material dialog inside
    // a brutalist app. What replaced it is `popover="auto"` — Baseline 2024, so
    // both platforms — which is the top layer and light dismiss for free.
    //
    // Asserted in the server tier, which is the point: a bits-ui portal renders
    // nothing here (#235), so choosing bits for this would have cost the panel
    // its cheapest test layer. The element is in the tree, so the markup is.
    const body = bar();
    expect(body).toMatch(/popover="auto"/);
    expect(body).toMatch(/popovertarget="meal-picker-/);
    // The trigger says a panel exists and whether it is up. Not `role="menu"`:
    // four buttons do not owe a menu's full keyboard contract.
    expect(body).toMatch(/aria-controls="meal-picker-/);
    expect(body).not.toMatch(/role="menu"/);
  });

  it("leaves the closed panel's `display` to the user agent", () => {
    // **The bug this exists for shipped to a device and was reported as "the
    // popover will not collapse".** It was never collapsing: a closed popover is
    // hidden by the UA stylesheet's `[popover]:not(:popover-open)
    // { display: none }`, an AUTHOR rule beats a UA rule, and `.mp-panel` had
    // `display: grid` on its base selector — so the panel was drawn open from
    // the first paint and the chip toggled a state nothing could see.
    //
    // It passed every check before it: `:popover-open` was correctly false the
    // whole time, so state was right and paint was wrong, and nothing but a
    // screen says so. This is the assertion that would have said so instead.
    const base = ruleOf(PICKER, ".mp-panel");
    expect(decl(base, "display")).toBeUndefined();
    expect(decl(ruleOf(PICKER, ".mp-panel:popover-open"), "display")).toBe(
      "grid"
    );
  });

  it("holds the chip at its widest word, whichever meal it is on", () => {
    // Reported from a device: the chip's label changes with the meal, and a box
    // that resizes with its contents moved the five marks beside it every time.
    // Every name is rendered into one grid cell with all but the live one
    // hidden, so the cell is as wide as the widest — measured by the browser in
    // the real font rather than guessed at in `ch`.
    //
    // EVERY name and not the longest one: "longest string" is not "widest word"
    // in a proportional face. It happens to be, for these four, and it would
    // stop being true the first time one changed.
    const body = bar();
    for (const meal of MEAL_TYPES) {
      expect(body).toContain(`>${meal.toUpperCase()}</span>`);
    }
    const ghosts = body.match(/class="mp-ghost[^"]*" aria-hidden="true"/g);
    expect(ghosts).toHaveLength(MEAL_TYPES.length);
  });

  it("keeps ADR-0059's five and their labels, for the one meal on screen", () => {
    // The roster, the order and the labels are ADR-0059's and neither record
    // revises them. What changed is that the OTHER fifteen are not in the
    // markup at all: the bar used to mount four panels and hide three, and now
    // the rail is rendered for the target meal only — so a spec reaching a
    // control by name is reaching the meal the chip is on, and finds nothing
    // when it forgets to set it.
    const body = bar();
    const target = targetOf(body)!;

    for (const kind of WAYS_IN) {
      expect(body).toContain(`aria-label="${wayInLabel(kind, target)}"`);
    }
    for (const meal of MEAL_TYPES.filter((m) => m !== target)) {
      expect(body).not.toContain(`aria-label="${wayInLabel("scan", meal)}"`);
    }
  });

  it("draws a mark per way in and no caption under it", () => {
    // `wayInCaption` lost its only consumer here, which is the other 12px. The
    // mark is the whole cell and `wayInLabel` is still its accessible name.
    const body = bar();
    expect(body.match(/class="entry-icon/g)).toHaveLength(WAYS_IN.length);
    expect(body).not.toMatch(/class="caption/);
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
    expect(targetOf(body)).toBe(mealNearest(new Date()));
    // One tile pressed and not two, which is the same claim the old
    // `<option selected>` count made: two would make the target a function of
    // markup order.
    expect(body.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it("is a starting value and not a subscription", () => {
    // §2's actual claim: nothing moves under you once the screen is up. The
    // clock is read at mount and never again, so a bar rendered before noon is
    // still on breakfast at one — only the chip moves the target.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 13, 9, 0, 0));
    const morning = bar();

    vi.setSystemTime(new Date(2026, 8, 13, 13, 0, 0));
    expect(targetOf(morning)).toBe("breakfast");
  });
});

describe("nothing pinned at the foot sits flush against the system's buttons", () => {
  // Reported from a device on 2026-09-15: on Android with three-button
  // navigation the bar's marks stood on the last row of pixels, directly
  // against the recents button. `env(safe-area-inset-bottom)` is 0 there and is
  // right to be — the nav bar is not an overlay, so the viewport ends above it
  // and nothing is hidden. The inset alone therefore cannot express this
  // hazard, which is proximity rather than occlusion.
  //
  // The floor's size is Material's own accessibility rule: 48dp targets
  // "separated by 8dp of space or more", and the system's buttons are touch
  // targets like any other. `--space-xs` is the smallest token on this app's
  // fluid scale that clears 8dp at every root size.
  const FLOOR = "max(env(safe-area-inset-bottom, 0px), var(--space-xs))";

  it("floors the Way-in bar's reserve, and takes the larger of the two", () => {
    // `max` and not `+`: the inset is already a clearance, so adding to an
    // iPhone's 34pt would reserve 48 against a hazard the platform has handled.
    expect(decl(ruleOf(BAR, ".way-in-bar"), "padding-bottom")).toBe(FLOOR);
  });

  it("floors the root shell's nav the same way, because it shares that edge", () => {
    // The two surfaces that can be the last thing above the system's buttons,
    // held to one rule. In the root shell the bar stands on `--shell-floor`,
    // which is this nav's measured height — so there the NAV is what touches
    // the buttons, and fixing the bar alone would leave the tab bar flush.
    expect(decl(ruleOf(NAV, ".sidebar"), "padding-bottom")).toBe(FLOOR);
  });

  it("gives the reserve up while folded, like every other part of the box", () => {
    // A folded bar holds no controls, so it owes the system's buttons no gap,
    // and a surface that collapsed to a strip of ink would read as a bug.
    expect(decl(ruleOf(BAR, ".way-in-bar.folded"), "padding-block")).toBe("0");
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
    // The phone bar is the plate's ink and not paper: what stands over the day
    // down there is a rectangle of rules with tiles in it, and the ground
    // between them is the rule.
    expect(decl(ruleOf(BAR, ".way-in-bar"), "background")).toBe("var(--ink)");
    expect(decl(ruleOf(BAR, ".plate"), "background")).toBe("var(--ink)");
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
    // (ADR-0059 §4) and the plate wraps onto two rows where one line will not
    // fit, so a `max-height` would need a number wrong for one of those.
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

describe("the rail, and the plate that draws it", () => {
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

  it("carries the floor on both axes, on the cell itself", () => {
    // The cell is a bare `<button>` now rather than a `ui/Button` reshaped from
    // outside, so the floor is not inherited from a primitive and has to be
    // here. Both axes: ADR-0093 §1 binds the box, and the height is no longer
    // padded out by a caption.
    const door = ruleOf(RAIL, ".door");
    expect(decl(door, "min-width")).toBe("var(--tap-min)");
    expect(decl(door, "min-height")).toBe("var(--tap-min)");
  });

  it("draws every rule as one gap over one ink ground", () => {
    // What "balanced" means: the seam between two marks, the seam beside the
    // chip and the bar's own outer edge are one weight of one colour drawn
    // once. Two adjacent borders would make a 4px seam beside a 2px edge, and
    // no `border-right: 0` bookkeeping survives a row whose cell count changes
    // with the meal.
    expect(decl(ruleOf(RAIL, ".rail"), "gap")).toBe("var(--edge-width)");
    expect(decl(ruleOf(BAR, ".plate"), "gap")).toBe("var(--edge-width)");
    // And the cells draw no edge of their own.
    expect(decl(ruleOf(RAIL, ".door"), "border")).toBe("0");
  });

  it("wraps on its contents rather than at a written width", () => {
    // The narrow fallback is flex wrap and not a query, because a threshold
    // here would have to encode a sum that moves: the app's root font size is a
    // clamp against the viewport, so `rem` is not a fixed number of pixels, and
    // ADR-0059 §4 changes the cell count under it. The rail's automatic minimum
    // IS five floored cells and their seams, so the line breaks exactly when
    // they stop fitting beside the chip.
    expect(decl(ruleOf(BAR, ".plate"), "flex-wrap")).toBe("wrap");
    expect(styleOf(BAR)).not.toMatch(/@container/);
  });
});
