import { describe, it, expect } from "vitest";
import {
  WAYS_IN,
  wayInLabel,
  wayInTitle,
  wayInLegend,
  type WayIn,
} from "../../src/lib/food/ways-in";
import { MEAL_TYPES } from "../../src/lib/food/meal-type";

// The ways into a meal (ADR-0059 §1). The order is load-bearing — it is what
// the header renders — so it is asserted rather than left to the array.

describe("WAYS_IN", () => {
  it("is the five ways in, in header order", () => {
    expect([...WAYS_IN]).toEqual([
      "past",
      "custom",
      "recipe",
      "scan",
      "search",
    ]);
  });

  it("leads with the past meal, nearest the meal name", () => {
    expect(WAYS_IN[0]).toBe("past");
  });

  // Four of the five share their id with a FoodStager method, so a header
  // control can open the log sheet straight onto it with no mapping table.
  it("names its four staging methods exactly as the stager does", () => {
    expect(WAYS_IN.filter((k) => k !== "past")).toEqual([
      "custom",
      "recipe",
      "scan",
      "search",
    ]);
  });
});

describe("wayInLabel", () => {
  it("names the meal in every label", () => {
    expect(wayInLabel("past", "breakfast")).toBe("Copy a past breakfast");
    expect(wayInLabel("search", "dinner")).toBe("Search for a dinner food");
    expect(wayInLabel("custom", "lunch")).toBe("Enter a lunch yourself");
  });

  it("names the meal even where the action does not need it", () => {
    expect(wayInLabel("scan", "breakfast")).toBe(
      "Scan a barcode for breakfast"
    );
    expect(wayInLabel("recipe", "dinner")).toBe("Log a recipe for dinner");
  });

  // The regression that made this rule explicit: the header repeats for all
  // four meals, so a label that omits the meal is worn by four buttons on one
  // screen — four identical announcements, and a by-name lookup that resolves
  // to whichever meal comes first.
  it("gives no two controls on the screen the same name", () => {
    const labels = WAYS_IN.flatMap((kind) =>
      MEAL_TYPES.map((meal) => wayInLabel(kind as WayIn, meal))
    );
    expect(new Set(labels).size).toBe(labels.length);
  });

  // ADR-0059 §2 makes this the sheet's title too, so every combination has to
  // read as a sentence rather than fall through to a placeholder.
  it("gives every way in a label for every meal", () => {
    for (const kind of WAYS_IN)
      for (const meal of MEAL_TYPES) {
        const label = wayInLabel(kind as WayIn, meal);
        expect(label.length).toBeGreaterThan(0);
        expect(label).not.toMatch(/undefined/);
      }
  });
});

describe("wayInTitle", () => {
  // The sheet has no siblings to be told apart from — you reached it by tapping
  // one control in one meal's header — so it drops the meal the control named.
  it("names the action without the meal", () => {
    expect(wayInTitle("past")).toBe("Past meal");
    expect(wayInTitle("custom")).toBe("Quick entry");
    expect(wayInTitle("recipe")).toBe("Log a recipe");
    expect(wayInTitle("scan")).toBe("Scan a barcode");
    expect(wayInTitle("search")).toBe("Ingredient search");
  });

  it("gives every way in a title", () => {
    for (const kind of WAYS_IN) {
      const title = wayInTitle(kind as WayIn);
      expect(title.length).toBeGreaterThan(0);
      expect(title).not.toMatch(/undefined/);
    }
  });

  // The two functions answer different questions, and the header's uniqueness
  // rule belongs to the control alone. A title that had to be unique across
  // meals would be back to naming the meal.
  it("never names a meal, unlike the control's own label", () => {
    for (const kind of WAYS_IN)
      for (const meal of MEAL_TYPES) {
        expect(wayInTitle(kind as WayIn)).not.toContain(meal);
        expect(wayInLabel(kind as WayIn, meal)).toContain(meal);
      }
  });
});

// The third gloss, for the legend the food screen's ⓘ unfolds. It is read by
// someone deciding whether to tap at all, so it says what the door leads to
// rather than naming the door.
describe("wayInLegend", () => {
  it("glosses every way in", () => {
    for (const kind of WAYS_IN) {
      const gloss = wayInLegend(kind as WayIn);
      expect(gloss.length).toBeGreaterThan(0);
      expect(gloss).not.toMatch(/undefined/);
    }
  });

  // Same reason as wayInTitle: the legend is written once for a header that
  // repeats per meal, so naming one meal would be wrong for the other three.
  it("names no meal", () => {
    for (const kind of WAYS_IN)
      for (const meal of MEAL_TYPES)
        expect(wayInLegend(kind as WayIn)).not.toContain(meal);
  });

  // A legend that merely restated the title would earn nothing over rendering
  // the title twice.
  it("says more than the title it sits beside", () => {
    for (const kind of WAYS_IN) {
      const gloss = wayInLegend(kind as WayIn);
      expect(gloss).not.toBe(wayInTitle(kind as WayIn));
      expect(gloss.length).toBeGreaterThan(wayInTitle(kind as WayIn).length);
    }
  });

  // The two that come and go say so, because a reader who cannot find the mark
  // on screen is exactly the reader who opened the legend.
  it("says where the past-meal control is when it is absent", () => {
    expect(wayInLegend("past")).toMatch(/appears only/i);
  });
});
