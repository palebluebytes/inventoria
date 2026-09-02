/**
 * What the food sheets' Dock holds, and when (ADR-0089 §8, CONTEXT.md "Dock").
 *
 * With a keyboard raised the dock competes with the result list for the last
 * rows on the screen, so everything in it has to earn its height. The rule this
 * pins is the record's first: **a control that cannot act does not hold space.**
 *
 * The commit button is the one that failed it. In Search with nothing staged
 * `canPrimary` requires a staged food — the other two disjuncts name the Custom
 * and Scan methods — so the button was *always* disabled there, holding roughly
 * 85px of the scarcest space on the screen to say nothing.
 *
 * Rendered server-side, which is enough for a question about which controls the
 * dock emits at all. Where they end up on a screen is the `visualViewport`
 * fake's (`tests/keyboard-invariants.spec.ts`), which can move the band.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import FoodStager from "../../src/lib/views/food/FoodStager.svelte";
import type { FoodResult } from "../../src/lib/food/food-search";
import { styleOf, rulesOf, decl, type Rule } from "./support/stylesheet";

const oats: FoodResult = {
  entity: "food:usda_mock_oats",
  name: "Mock Oats",
  calories: 389,
  protein: 16.9,
  fat: 6.9,
  carbs: 66.3,
  basis: "100 g",
  payload: {
    entity: "food:usda_mock_oats",
    attributes: {
      "food/name": "Mock Oats",
      "nutrition/info": {
        calories: 389,
        protein: 16.9,
        fat: 6.9,
        carbs: 66.3,
        basis: "100 g",
      },
    },
  },
};

/** The two ids the host hands down that this file asks about. */
const ids = {
  search: "stager-search",
  barcode: "stager-barcode",
  primary: "stager-primary",
  customName: "stager-custom-name",
  customCal: "stager-cal",
  customProt: "stager-prot",
  customFat: "stager-fat",
  customCarb: "stager-carb",
};

function dock(props: {
  initialMethod?: string;
  staged?: FoodResult | null;
}): string {
  return render(FoodStager, {
    props: {
      ids,
      onChoose: () => ({ ok: true }),
      primaryLabel: () => "Log",
      ...props,
    } as never,
  }).body;
}

const holdsCommit = (body: string) => body.includes(`id="${ids.primary}"`);

describe("the dock's commit button", () => {
  it("does not hold space while searching, where it could never act", () => {
    const body = dock({ initialMethod: "search" });

    expect(holdsCommit(body)).toBe(false);
    // Proving an absence is only worth anything if the dock rendered at all.
    expect(body).toContain(`id="${ids.search}"`);
  });

  it("returns the moment a food is staged", () => {
    expect(holdsCommit(dock({ initialMethod: "search", staged: oats }))).toBe(
      true
    );
  });

  it("stays on Scan with nothing staged, where it looks a barcode up", () => {
    // The same "always disabled" argument does not reach here: `canPrimary`
    // takes a typed barcode without a staged food, so this button can act.
    const body = dock({ initialMethod: "scan" });

    expect(holdsCommit(body)).toBe(true);
    expect(body).toContain(`id="${ids.barcode}"`);
  });
});

describe("the dock's field", () => {
  it("survives the commit button leaving — it is the guaranteed one", () => {
    // ADR-0089 §8: the header and the dock's field are what stay on screen.
    // Dropping the button beside it must not take the search box with it.
    expect(dock({ initialMethod: "search" })).toContain(`id="${ids.search}"`);
  });
});

/**
 * The commit button's own height, read out of its `<style>` block. A rendered
 * pixel height is beyond the unit tier — the values are `clamp()`s against a
 * viewport width — so what is pinned here is which measures the button names,
 * and at which width it names them.
 *
 * `--space-xs` + `--step-0` + a 3px edge either side lands it near 51px on a
 * phone, against the ~64px `--space-s` + `--step-1` + a 60px floor was giving:
 * a whole result row of the scarcest space on the screen, for a one-word button.
 */
describe("the commit button is sized for a phone", () => {
  const RULES = rulesOf(styleOf("src/lib/views/food/CommitButton.svelte"));
  const EVERY_WIDTH = null;
  const WIDE = "@media (min-width: 768px)";

  function rule(at: string | null): Rule {
    const found = RULES.filter(
      (r) => r.at === at && r.selectors.includes(".commit")
    );
    expect(found).toHaveLength(1);
    return found[0];
  }

  it("writes the phone as the base rule, not as an override", () => {
    const base = rule(EVERY_WIDTH);

    expect(decl(base, "padding")).toBe("var(--space-xs)");
    expect(decl(base, "font-size")).toBe("var(--step-0)");
  });

  it("floors at a touch target rather than above one", () => {
    // The floor is what a finger needs, which is `--tap-min`. 60px was a
    // guess sitting 12px above it, and the button clears the floor anyway.
    expect(decl(rule(EVERY_WIDTH), "min-height")).toBe("var(--tap-min)");
  });

  it("gives the full size back above 768px — one design that widens", () => {
    const wide = rule(WIDE);

    expect(decl(wide, "padding")).toBe("var(--space-s)");
    expect(decl(wide, "font-size")).toBe("var(--step-1)");
    expect(decl(wide, "min-height")).toBe("60px");
  });

  it("carries no max-width media query — the breakpoint only ever widens", () => {
    // A `max-width` rule would mean the phone is the exception again, which is
    // the shape ADR-0089 §5 turned around.
    expect(RULES.map((r) => r.at).filter(Boolean)).toEqual([WIDE]);
  });
});
