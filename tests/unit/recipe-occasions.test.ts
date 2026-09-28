import { describe, it, expect } from "vitest";
import {
  impromptuOccasions,
  occasionsOf,
} from "../../src/lib/food/recipe-occasions";
import type { ConsumptionEvent } from "../../src/lib/food/consumption-state";
import type { InstantiationRow } from "../../src/lib/food/recipe-instantiation";

// The two reads behind the Recipes screen (ADR-0110 §6, §7). Both are folds
// over the Consumption Events the ledger already holds, so the rules are
// asserted here rather than through the lists that render them.

let seq = 0;

function row(name: string): InstantiationRow {
  return {
    ref: `food:${name.toLowerCase()}`,
    name,
    amount: 10,
    unit: "g",
    calories: 90,
    protein: 0,
    fat: 10,
    carbs: 0,
  };
}

/** A recipe occasion: `target` was instantiated `daysAgo`, at `meal_type`. */
function made(
  daysAgo: number,
  meal_type: string,
  target: string,
  names: string[],
  hour = 9
): ConsumptionEvent {
  seq += 1;
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, seq % 50, 0, 0);
  return {
    id: `event:consume_${seq}`,
    time: d.getTime(),
    type: "ConsumeAction",
    target,
    quantity: "1 serving",
    meal_type,
    foodName: names.join(", "),
    calories: 90,
    instantiation: {
      based_on: target,
      yield: 1,
      ingredients: names.map(row),
    },
  };
}

/** A plain food log — no instantiation, so no occasion. */
function ate(daysAgo: number, meal_type: string, name: string) {
  seq += 1;
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, seq % 50, 0, 0);
  return {
    id: `event:consume_${seq}`,
    time: d.getTime(),
    type: "ConsumeAction",
    target: `food:${name.toLowerCase()}`,
    quantity: "100g",
    meal_type,
    foodName: name,
    calories: 100,
  } satisfies ConsumptionEvent;
}

const DRESSING = "recipe:a1b2c3";
const OATS = "recipe:d4e5f6";

describe("impromptuOccasions", () => {
  // §6 — one row per occasion, not per twin.
  it("gives a twin made on two days two rows, both opening it", () => {
    const log = [
      made(4, "lunch", DRESSING, ["Olive oil", "Lemon"]),
      made(1, "lunch", DRESSING, ["Olive oil", "Lemon"]),
    ];
    const rows = impromptuOccasions(log, new Set());
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.target)).toEqual([DRESSING, DRESSING]);
  });

  // §6 — not collapsed by composition, and the date repeats (ADR-0058 §12).
  it("gives two dishes assembled on one day two rows on that day", () => {
    const log = [
      made(1, "lunch", DRESSING, ["Olive oil", "Lemon"], 13),
      made(1, "dinner", OATS, ["Oats", "Milk"], 19),
    ];
    const rows = impromptuOccasions(log, new Set());
    expect(rows).toHaveLength(2);
    expect(rows[0].date.getTime()).toBe(rows[1].date.getTime());
    expect(rows.map((r) => r.meal_type)).toEqual(["dinner", "lunch"]);
  });

  it("orders newest first, flat and uncapped", () => {
    const log = Array.from({ length: 30 }, (_, i) =>
      made(i, "dinner", `recipe:x${i}`, ["Rice"])
    );
    const rows = impromptuOccasions(log, new Set());
    expect(rows).toHaveLength(30);
    const times = rows.map((r) => r.date.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  // §1 / §2 — the absence of a name is the whole discriminant, and the named
  // twins are exactly what `recipeTwinsStore` holds.
  it("leaves out every occasion of a twin that carries a name", () => {
    const log = [
      made(2, "lunch", DRESSING, ["Olive oil", "Lemon"]),
      made(1, "dinner", OATS, ["Oats", "Milk"]),
    ];
    const rows = impromptuOccasions(log, new Set([OATS]));
    expect(rows.map((r) => r.target)).toEqual([DRESSING]);
  });

  // Acceptance: naming a dish moves it, and every past occasion goes with it.
  it("drops all of a twin's rows the moment it is named", () => {
    const log = [
      made(4, "lunch", DRESSING, ["Olive oil", "Lemon"]),
      made(1, "lunch", DRESSING, ["Olive oil", "Lemon"]),
    ];
    expect(impromptuOccasions(log, new Set([DRESSING]))).toEqual([]);
  });

  it("is not a list of logged foods", () => {
    const log = [
      ate(1, "breakfast", "Banana"),
      made(1, "lunch", DRESSING, ["Lemon"]),
    ];
    const rows = impromptuOccasions(log, new Set());
    expect(rows.map((r) => r.target)).toEqual([DRESSING]);
  });

  // §3 — the lines are the occasion's own frozen rows, so two occasions of one
  // twin may legitimately read differently.
  it("carries each occasion's own frozen ingredient rows", () => {
    const first = made(2, "lunch", DRESSING, ["Olive oil", "Lemon"]);
    const second = made(1, "lunch", DRESSING, ["Olive oil", "Lemon"]);
    second.instantiation!.ingredients[1].amount = 25;
    const rows = impromptuOccasions([first, second], new Set());
    expect(rows[0].ingredients[1].amount).toBe(25);
    expect(rows[1].ingredients[1].amount).toBe(10);
  });
});

describe("occasionsOf", () => {
  it("gives every day one twin was made, newest first", () => {
    const log = [
      made(4, "lunch", DRESSING, ["Olive oil", "Lemon"]),
      made(2, "dinner", OATS, ["Oats"]),
      made(1, "breakfast", DRESSING, ["Olive oil", "Lemon"]),
    ];
    const history = occasionsOf(log, DRESSING);
    expect(history).toHaveLength(2);
    expect(history.map((o) => o.meal_type)).toEqual(["breakfast", "lunch"]);
  });

  // §7 — the screen is shared, so the history reads the same for both kinds.
  it("reads a named twin's history the same way", () => {
    const log = [made(1, "dinner", OATS, ["Oats", "Milk"])];
    expect(occasionsOf(log, OATS)).toHaveLength(1);
  });

  it("is empty for a twin nothing was ever logged against", () => {
    const log = [made(1, "dinner", OATS, ["Oats"])];
    expect(occasionsOf(log, DRESSING)).toEqual([]);
  });
});
