import { describe, it, expect } from "vitest";
import {
  pastMealsFor,
  partitionCopyable,
  copyTally,
  dayLabel,
  dayKeyOf,
  hasPastMeal,
} from "../../src/lib/food/past-meals";
import type { ConsumptionEvent } from "../../src/lib/food/consumption-state";

// Copying a past meal (ADR-0058). Every rule here is a read over facts the
// ledger already holds, so the narrowing is asserted directly rather than
// through the sheet that renders it.

let seq = 0;

/** A Consumption Event on `daysAgo` at `meal_type`. Negative days are future. */
function ate(
  daysAgo: number,
  meal_type: string,
  foodName: string,
  calories: number,
  extra: Partial<ConsumptionEvent> = {}
): ConsumptionEvent {
  seq += 1;
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(9, seq % 50, 0, 0);
  return {
    id: `event:consume_${seq}`,
    time: d.getTime(),
    type: "ConsumeAction",
    target: `food:${foodName.toLowerCase()}`,
    quantity: "100g",
    meal_type,
    foodName,
    calories,
    ...extra,
  };
}

const today = () => new Date();
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

describe("pastMealsFor", () => {
  it("gathers one day's foods at one meal into a single past meal", () => {
    const log = [
      ate(1, "breakfast", "Oats", 233),
      ate(1, "breakfast", "Milk", 100),
      ate(1, "breakfast", "Banana", 105),
    ];
    const meals = pastMealsFor(log, "breakfast", today());
    expect(meals).toHaveLength(1);
    expect(meals[0].items.map((i) => i.foodName)).toEqual([
      "Oats",
      "Milk",
      "Banana",
    ]);
    expect(meals[0].calories).toBe(438);
    expect(meals[0].meal_type).toBe("breakfast");
  });

  // §4 — the control's position gives it its meaning: this meal, another day.
  it("offers only the meal it was asked for", () => {
    const log = [
      ate(1, "breakfast", "Oats", 233),
      ate(1, "lunch", "Soup", 232),
      ate(1, "dinner", "Salmon", 291),
    ];
    const meals = pastMealsFor(log, "breakfast", today());
    expect(meals).toHaveLength(1);
    expect(meals[0].items).toHaveLength(1);
    expect(meals[0].items[0].foodName).toBe("Oats");
  });

  // §6 — any logged day EXCEPT the one being viewed.
  it("excludes the day being viewed", () => {
    const log = [
      ate(0, "breakfast", "Toast", 198),
      ate(1, "breakfast", "Oats", 233),
    ];
    const meals = pastMealsFor(log, "breakfast", today());
    expect(meals).toHaveLength(1);
    expect(meals[0].items[0].foodName).toBe("Oats");
  });

  // §6 — while back-filling an old day, later days are still meals already eaten.
  it("includes days later than the one being viewed", () => {
    const log = [
      ate(10, "breakfast", "Oats", 233),
      ate(1, "breakfast", "Toast", 198),
    ];
    const meals = pastMealsFor(log, "breakfast", daysAgo(10));
    expect(meals.map((m) => m.items[0].foodName)).toEqual(["Toast"]);
  });

  // §6 — newest first.
  it("orders the days newest first", () => {
    const log = [
      ate(9, "dinner", "Pizza", 638),
      ate(2, "dinner", "Salmon", 291),
      ate(5, "dinner", "Risotto", 517),
    ];
    const meals = pastMealsFor(log, "dinner", today());
    expect(meals.map((m) => m.items[0].foodName)).toEqual([
      "Salmon",
      "Risotto",
      "Pizza",
    ]);
  });

  // §7 keys off this: no history, no control.
  it("returns nothing when that meal was never logged", () => {
    const log = [ate(1, "breakfast", "Oats", 233)];
    expect(pastMealsFor(log, "snack", today())).toEqual([]);
  });

  // §8 — the catalogue rule that filters Recent does not reach here.
  it("keeps a one-off manual entry, which Recent would hide", () => {
    const log = [
      ate(1, "lunch", "Canteen jacket potato", 520, {
        target: "food:manual_canteen",
        quantity: "1 serving",
      }),
    ];
    const meals = pastMealsFor(log, "lunch", today());
    expect(meals[0].items[0].foodName).toBe("Canteen jacket potato");
  });

  // §11 — an absent macro is not a zero, so a calorie-only entry still totals.
  it("totals calories across entries that froze nothing else", () => {
    const log = [
      ate(1, "lunch", "Sandwich", 488),
      ate(1, "lunch", "Guessed pub lunch", 1140),
    ];
    expect(pastMealsFor(log, "lunch", today())[0].calories).toBe(1628);
  });
});

describe("partitionCopyable", () => {
  // The frozen `event/metrics` means a copy needs no twin lookup — except that
  // a twin which no longer resolves leaves `foodName` unset, and copying it
  // would log "Unknown Food".
  it("keeps entries whose twin still resolves", () => {
    const items = [ate(1, "dinner", "Salmon", 291)];
    expect(partitionCopyable(items).copyable).toHaveLength(1);
    expect(partitionCopyable(items).lost).toHaveLength(0);
  });

  it("drops an entry whose twin no longer resolves", () => {
    const items = [
      ate(1, "dinner", "Tofu", 219),
      { ...ate(1, "dinner", "Gone", 71), foodName: undefined },
    ];
    const { copyable, lost } = partitionCopyable(items);
    expect(copyable.map((i) => i.foodName)).toEqual(["Tofu"]);
    expect(lost).toHaveLength(1);
  });

  it("drops an entry that froze no calories, rather than copying it as a zero", () => {
    const items = [{ ...ate(1, "dinner", "Mystery", 0), calories: undefined }];
    expect(partitionCopyable(items).copyable).toHaveLength(0);
    expect(partitionCopyable(items).lost).toHaveLength(1);
  });

  it("drops an entry carrying no target to log against", () => {
    const items = [{ ...ate(1, "dinner", "Orphan", 100), target: undefined }];
    expect(partitionCopyable(items).copyable).toHaveLength(0);
  });
});

describe("copyTally", () => {
  // §11 — a clean run says nothing at all.
  it("says nothing when everything copied", () => {
    expect(copyTally(4, 0)).toBeNull();
  });

  it("names what it did and what it could not", () => {
    expect(copyTally(3, 1)).toBe("3 copied · 1 no longer available");
  });

  it("stays singular-agnostic and still reports a total failure", () => {
    expect(copyTally(0, 2)).toBe("0 copied · 2 no longer available");
  });
});

describe("dayLabel", () => {
  const anchor = new Date(2026, 7, 26); // a Wednesday

  it("names the near days rather than dating them", () => {
    expect(dayLabel(new Date(2026, 7, 25), anchor)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 7, 26), anchor)).toBe("Today");
    expect(dayLabel(new Date(2026, 7, 27), anchor)).toBe("Tomorrow");
  });

  it("uses the weekday inside the surrounding week", () => {
    const monday = new Date(2026, 7, 24);
    expect(dayLabel(monday, anchor)).toBe(
      monday.toLocaleDateString(undefined, { weekday: "long" })
    );
  });

  it("dates anything a week or more away", () => {
    const far = new Date(2026, 7, 12);
    expect(dayLabel(far, anchor)).toBe(
      far.toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    );
  });

  it("reads a time of day, not just a midnight", () => {
    const yesterdayEvening = new Date(2026, 7, 25, 21, 40);
    expect(dayLabel(yesterdayEvening, anchor)).toBe("Yesterday");
  });
});

describe("hasPastMeal", () => {
  // ADR-0058 §7 / ADR-0059 §4 — this is what decides whether the control is
  // rendered at all, so it answers the question the header actually asks.
  it("is false for a meal never logged", () => {
    expect(
      hasPastMeal([ate(1, "breakfast", "Oats", 233)], "snack", today())
    ).toBe(false);
  });

  it("is false for a meal logged only on the day being viewed", () => {
    const log = [ate(0, "breakfast", "Toast", 198)];
    expect(hasPastMeal(log, "breakfast", today())).toBe(false);
  });

  it("is true as soon as one other day carries that meal", () => {
    const log = [
      ate(0, "breakfast", "Toast", 198),
      ate(3, "breakfast", "Oats", 233),
    ];
    expect(hasPastMeal(log, "breakfast", today())).toBe(true);
  });

  it("agrees with pastMealsFor, which is the list it gates", () => {
    const log = [
      ate(2, "lunch", "Soup", 232),
      ate(0, "dinner", "Salmon", 291),
      ate(4, "dinner", "Pizza", 638),
    ];
    for (const meal of ["breakfast", "lunch", "dinner", "snack"] as const)
      expect(hasPastMeal(log, meal, today())).toBe(
        pastMealsFor(log, meal, today()).length > 0
      );
  });
});

describe("dayKeyOf", () => {
  it("gives two instants on one local day the same key", () => {
    expect(dayKeyOf(new Date(2026, 7, 26, 0, 0))).toBe(
      dayKeyOf(new Date(2026, 7, 26, 23, 59))
    );
  });

  it("separates adjacent days", () => {
    expect(dayKeyOf(new Date(2026, 7, 26))).not.toBe(
      dayKeyOf(new Date(2026, 7, 27))
    );
  });

  it("reads an epoch time as readily as a Date", () => {
    const d = new Date(2026, 7, 26, 12, 0);
    expect(dayKeyOf(d.getTime())).toBe(dayKeyOf(d));
  });
});
