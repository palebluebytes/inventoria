import { describe, it, expect } from "vitest";
import {
  MEAL_ENTRY_KINDS,
  mealEntryLabel,
  type MealEntryKind,
} from "../../src/lib/food/meal-entry";
import { MEAL_TYPES } from "../../src/lib/food/meal-type";

// The ways into a meal (ADR-0059 §1). The order is load-bearing — it is what
// the header renders — so it is asserted rather than left to the array.

describe("MEAL_ENTRY_KINDS", () => {
  it("is the five ways in, in header order", () => {
    expect([...MEAL_ENTRY_KINDS]).toEqual([
      "past",
      "custom",
      "recipe",
      "scan",
      "search",
    ]);
  });

  it("leads with the past meal, nearest the meal name", () => {
    expect(MEAL_ENTRY_KINDS[0]).toBe("past");
  });

  // Four of the five share their id with a FoodStager method, so a header
  // control can open the log sheet straight onto it with no mapping table.
  it("names its four staging methods exactly as the stager does", () => {
    expect(MEAL_ENTRY_KINDS.filter((k) => k !== "past")).toEqual([
      "custom",
      "recipe",
      "scan",
      "search",
    ]);
  });
});

describe("mealEntryLabel", () => {
  it("names the meal where naming it helps", () => {
    expect(mealEntryLabel("past", "breakfast")).toBe("Copy a past breakfast");
    expect(mealEntryLabel("search", "dinner")).toBe("Search for a dinner food");
    expect(mealEntryLabel("custom", "lunch")).toBe("Enter a lunch yourself");
  });

  it("leaves the meal out where it would only add noise", () => {
    expect(mealEntryLabel("scan", "breakfast")).toBe("Scan a barcode");
    expect(mealEntryLabel("recipe", "dinner")).toBe("Log a recipe");
  });

  // ADR-0059 §2 makes this the sheet's title too, so every combination has to
  // read as a sentence rather than fall through to a placeholder.
  it("gives every way in a label for every meal", () => {
    for (const kind of MEAL_ENTRY_KINDS)
      for (const meal of MEAL_TYPES) {
        const label = mealEntryLabel(kind as MealEntryKind, meal);
        expect(label.length).toBeGreaterThan(0);
        expect(label).not.toMatch(/undefined/);
      }
  });
});
