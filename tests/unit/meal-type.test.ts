import { describe, it, expect } from "vitest";
import {
  MEAL_TYPES,
  asMealType,
  mealNearest,
} from "../../src/lib/food/meal-type";

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

/**
 * Which meal an hour belongs to (ADR-0101 §2).
 *
 * Swept here rather than through the bar that consumes it, because it takes the
 * moment instead of reading a clock — twenty-four cases and no fake timer. The
 * bounds are settled by hand, so what is worth testing is the shape they make
 * rather than any one of them: no hour without a meal, and no meal that starts
 * before the one before it ends.
 */
describe("mealNearest", () => {
  const at = (hour: number) => mealNearest(new Date(2026, 8, 13, hour, 0, 0));

  it("names the four the day divides on", () => {
    expect(at(8)).toBe("breakfast");
    expect(at(12)).toBe("lunch");
    expect(at(19)).toBe("dinner");
    expect(at(23)).toBe("snack");
  });

  it("answers for every hour, so none opens the bar on nothing", () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(MEAL_TYPES).toContain(at(hour));
    }
  });

  it("runs through the four in order and never goes back", () => {
    // An off-by-one at a boundary shows up here as a meal reappearing after the
    // next has started, which a spot check of four hours cannot see.
    const order = [...Array(24).keys()].map(at);
    const firstSeen = MEAL_TYPES.map((meal) => order.indexOf(meal));

    expect(firstSeen).toEqual([...firstSeen].sort((a, b) => a - b));
    expect(firstSeen).not.toContain(-1);
    expect(new Set(order).size).toBe(MEAL_TYPES.length);
  });

  it("holds the same boundaries the sheet's own labels assume", () => {
    // The edges, named one either side. Breakfast runs to 11, lunch to 15,
    // dinner to 21, and the late hours are the snack.
    expect([at(10), at(11)]).toEqual(["breakfast", "lunch"]);
    expect([at(14), at(15)]).toEqual(["lunch", "dinner"]);
    expect([at(20), at(21)]).toEqual(["dinner", "snack"]);
  });
});
