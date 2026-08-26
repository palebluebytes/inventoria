import { describe, it, expect } from "vitest";
import { MEAL_TYPES, asMealType } from "../../src/lib/food/meal-type";

// The single read boundary between an arbitrary stored `event/meal_type` string
// and the four-member union everything downstream is typed against.

describe("asMealType", () => {
  it("passes through every meal it recognises", () => {
    for (const meal_type of MEAL_TYPES) {
      expect(asMealType(meal_type, "snack")).toBe(meal_type);
    }
  });

  it("falls back for a string outside the set, rather than casting it through", () => {
    // The reason it validates instead of asserting: a ledger written by an older
    // build, or by hand, must not surface typed as valid.
    expect(asMealType("brunch", "snack")).toBe("snack");
    expect(asMealType("", "dinner")).toBe("dinner");
  });

  it("falls back for an absent value, which no live writer produces", () => {
    // `calorie.store.ts` is the only writer of a Consumption Event and always
    // writes the meal of the button that opened the sheet, so this branch guards
    // a population that does not exist (ADR-0057). It is here so that stays true
    // by test rather than by memory.
    expect(asMealType(undefined, "breakfast")).toBe("breakfast");
  });
});
