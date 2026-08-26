import { describe, it, expect } from "vitest";
import {
  recentCandidatesForMeal,
  emptyMealDefaultHint,
  type RecentCandidate,
} from "../../src/lib/food/recent-foods";
import type { ConsumptionEvent } from "../../src/lib/food/consumption-state";

// The meal's default content (ADR-0057): opening `breakfast` offers the foods
// logged at breakfast. Pure and datoms-in/result-out, so the rule is asserted
// here rather than through the sheet that renders it.
//
// The walk is deliberately uncapped — a meal's default cannot be computed from
// the newest N events, since the Nth+1 may be the only breakfast in the history.
// The twelve-slot cap lives downstream, where the twin resolution that decides
// `isCatalogueFood` happens.

let seq = 0;

/**
 * A Consumption Event at `meal_type`, `time` ascending with each call so that
 * "newest" is simply "declared last" unless a test pins `time` itself.
 */
function ate(
  target: string,
  meal_type: string,
  quantity = "100g"
): ConsumptionEvent {
  seq += 1;
  return {
    id: `event:consume_${seq}`,
    time: seq * 1000,
    type: "ConsumeAction",
    target,
    quantity,
    meal_type,
  };
}

/** The targets of `candidates`, in order — what most cases actually assert. */
function targets(candidates: RecentCandidate[]): string[] {
  return candidates.map((c) => c.target);
}

describe("recentCandidatesForMeal", () => {
  it("offers only foods logged at the meal being logged", () => {
    const events = [
      ate("food:porridge", "breakfast"),
      ate("food:steak", "dinner"),
      ate("food:banana", "breakfast"),
    ];

    expect(targets(recentCandidatesForMeal(events, "breakfast"))).toEqual([
      "food:banana",
      "food:porridge",
    ]);
    expect(targets(recentCandidatesForMeal(events, "dinner"))).toEqual([
      "food:steak",
    ]);
  });

  it("orders newest first", () => {
    const events = [
      ate("food:first", "lunch"),
      ate("food:second", "lunch"),
      ate("food:third", "lunch"),
    ];

    expect(targets(recentCandidatesForMeal(events, "lunch"))).toEqual([
      "food:third",
      "food:second",
      "food:first",
    ]);
  });

  it("lists a repeatedly logged food once, at its most recent position", () => {
    const events = [
      ate("food:banana", "breakfast"),
      ate("food:toast", "breakfast"),
      ate("food:banana", "breakfast"),
    ];

    expect(targets(recentCandidatesForMeal(events, "breakfast"))).toEqual([
      "food:banana",
      "food:toast",
    ]);
  });

  it("offers a food logged at two meals as a default for both", () => {
    const events = [
      ate("food:banana", "breakfast"),
      ate("food:banana", "snack"),
    ];

    expect(targets(recentCandidatesForMeal(events, "breakfast"))).toEqual([
      "food:banana",
    ]);
    expect(targets(recentCandidatesForMeal(events, "snack"))).toEqual([
      "food:banana",
    ]);
  });

  it("treats snack as a meal, not as a catch-all for the other three", () => {
    // Every Consumption Event carries the meal_type of the button that opened
    // the sheet (`calorie.store.ts`), so snack holds what was logged AS a snack
    // and nothing else. `asMealType`'s "snack" is a read-side guard against an
    // out-of-set string, not a bucket meal-less events fall into.
    const events = [
      ate("food:crisps", "snack"),
      ate("food:steak", "dinner"),
      ate("food:porridge", "breakfast"),
    ];

    expect(targets(recentCandidatesForMeal(events, "snack"))).toEqual([
      "food:crisps",
    ]);
  });

  it("takes the logged unit from the newest event AT THAT MEAL", () => {
    // The unit decides `isCatalogueFood` downstream, so reading it from the
    // newest event overall would let a dinner serving-log govern how the same
    // food qualifies at breakfast.
    const events = [
      ate("food:soup", "breakfast", "250g"),
      ate("food:soup", "dinner", "1 serving"),
    ];

    expect(recentCandidatesForMeal(events, "breakfast")).toEqual([
      { target: "food:soup", unit: "g" },
    ]);
    expect(recentCandidatesForMeal(events, "dinner")).toEqual([
      { target: "food:soup", unit: "serving" },
    ]);
  });

  it("skips an event with no target", () => {
    const untargeted: ConsumptionEvent = {
      id: "event:consume_untargeted",
      time: 999_999,
      meal_type: "breakfast",
    };

    expect(
      targets(
        recentCandidatesForMeal(
          [untargeted, ate("food:egg", "breakfast")],
          "breakfast"
        )
      )
    ).toEqual(["food:egg"]);
  });

  it("is empty for a meal with no history", () => {
    expect(
      recentCandidatesForMeal([ate("food:steak", "dinner")], "breakfast")
    ).toEqual([]);
  });

  it("is empty for an empty ledger", () => {
    expect(recentCandidatesForMeal([], "breakfast")).toEqual([]);
  });

  it("walks past the fortieth event to reach an older food at this meal", () => {
    // The regression the old `RECENT_CANDIDATES = 40` cap would have caused: a
    // user who logs three meals a day pushes their breakfast foods out of the
    // newest forty events within a fortnight, and their breakfast default would
    // have come back empty while the history plainly holds one.
    const events = [ate("food:porridge", "breakfast")];
    for (let i = 0; i < 60; i += 1)
      events.push(ate(`food:dinner_${i}`, "dinner"));

    expect(targets(recentCandidatesForMeal(events, "breakfast"))).toEqual([
      "food:porridge",
    ]);
  });

  it("returns every distinct food at the meal, leaving the cap to the caller", () => {
    const events = [];
    for (let i = 0; i < 50; i += 1) events.push(ate(`food:${i}`, "breakfast"));

    // Fifty back, not twelve: the caller stops once twelve survive
    // `isCatalogueFood`, and cannot do that without candidates to test.
    expect(recentCandidatesForMeal(events, "breakfast")).toHaveLength(50);
  });

  it("does not mutate the events it is given", () => {
    // The caller hands it the consumption store's array directly.
    const events = [
      ate("food:late", "breakfast"),
      ate("food:early", "breakfast"),
    ];
    const order = events.map((e) => e.id);

    recentCandidatesForMeal(events, "breakfast");

    expect(events.map((e) => e.id)).toEqual(order);
  });
});

describe("emptyMealDefaultHint", () => {
  it("names the meal, so the blank reads as scoped rather than broken", () => {
    // The distinction the line exists for: a user with months of history opening
    // a meal they have never logged must be able to tell "nothing HERE" from
    // "nothing at all".
    for (const meal_type of ["breakfast", "lunch", "dinner", "snack"]) {
      expect(emptyMealDefaultHint(meal_type)).toContain(meal_type);
    }
  });

  it("says what fills it, since the empty surface does not show the mechanism", () => {
    expect(emptyMealDefaultHint("breakfast")).toMatchInlineSnapshot(
      `"Nothing logged at breakfast yet. Foods you log here will be waiting next time."`
    );
  });
});

describe("recentCandidatesForMeal over a synthetic ledger", () => {
  /**
   * A ledger of `count` events spread evenly across the four meals and 200
   * distinct foods — a heavier history than a real user accumulates in years of
   * daily logging, so a budget met here is met comfortably in the app.
   */
  function syntheticLedger(count: number): ConsumptionEvent[] {
    const meals = ["breakfast", "lunch", "dinner", "snack"];
    const events: ConsumptionEvent[] = [];
    for (let i = 0; i < count; i += 1) {
      events.push({
        id: `event:consume_${i}`,
        time: i * 1000,
        type: "ConsumeAction",
        target: `food:${i % 200}`,
        quantity: `${100 + (i % 50)}g`,
        meal_type: meals[i % meals.length],
      });
    }
    return events;
  }

  it("stays correct at ledger scale", () => {
    const events = syntheticLedger(5_000);
    const candidates = recentCandidatesForMeal(events, "breakfast");

    // 200 distinct foods, of which every fourth index lands on breakfast.
    expect(candidates).toHaveLength(50);
    expect(candidates[0].target).toBe("food:196");
    expect(new Set(targets(candidates)).size).toBe(candidates.length);
  });

  it("costs no more per call than the unscoped walk it replaces", () => {
    // The pin behind #128's performance criterion. The bound is deliberately
    // loose: this runs on shared CI where wall-clock is noisy, and the claim
    // being defended is only that removing the forty-candidate cap did not
    // change the shape of the work. It did not — both walks sort the same array
    // once, and the sort dominates the linear pass either way.
    //
    // Worth recording alongside it: this derivation recomputes when the
    // consumption store CHANGES — a log or a retraction — not on render.
    const events = syntheticLedger(5_000);

    const started = performance.now();
    for (let i = 0; i < 50; i += 1)
      recentCandidatesForMeal(events, "breakfast");
    const perCall = (performance.now() - started) / 50;

    expect(perCall).toBeLessThan(20);
  });
});
