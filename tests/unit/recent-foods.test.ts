import { describe, it, expect } from "vitest";
import {
  recentCandidatesForMeal,
  emptyMealDefaultHint,
  rememberedAmount,
  rememberedIngredientUnit,
  rememberedUnit,
  type RecentCandidate,
} from "../../src/lib/food/recent-foods";
import type { ConsumptionEvent } from "../../src/lib/food/consumption-state";
import { parseLoggedQuantity } from "../../src/lib/food/recipe-ingredient";
import { MEAL_TYPES } from "../../src/lib/food/meal-type";

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

/**
 * A Recipe Instantiation: a Consumption Event targeting a Recipe Twin and
 * carrying the frozen `event/instantiation` snapshot that makes it one. Its
 * quantity is a real serving count, because #424 stopped it being a literal.
 */
function cooked(target: string, meal_type: string): ConsumptionEvent {
  const event = ate(target, meal_type, "2 servings");
  return {
    ...event,
    instantiation: {
      based_on: target,
      yield: 1,
      ingredients: [
        {
          ref: "fdc:1",
          name: "Mock Oats",
          amount: 200,
          unit: "g",
          calories: 200,
          protein: 10,
          fat: 4,
          carbs: 20,
        },
      ],
    },
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

describe("rememberedAmount", () => {
  it("answers the amount this food was last logged at", () => {
    const events = [
      ate("food:oats", "breakfast", "40g"),
      ate("food:oats", "breakfast", "55g"),
    ];

    expect(rememberedAmount(events, "food:oats", "g")).toBe(55);
  });

  it("reads the newest by time, not by position in the array", () => {
    // The consumption projection sorts by its own slot order, not by the clock
    // (`consumption-state.ts`), so the store's array is not a timeline. A walk
    // that trusted position would answer 40 here.
    const older = { ...ate("food:oats", "breakfast", "55g"), time: 9_000 };
    const newer = { ...ate("food:oats", "breakfast", "40g"), time: 8_000 };

    expect(rememberedAmount([newer, older], "food:oats", "g")).toBe(55);
  });

  it("is null for a food with nothing behind it, which takes the default", () => {
    const events = [ate("food:oats", "breakfast", "40g")];

    expect(rememberedAmount(events, "food:banana", "g")).toBeNull();
    expect(rememberedAmount([], "food:oats", "g")).toBeNull();
  });

  it("refuses to seed a gram field from a millilitre log, and the reverse", () => {
    // ADR-0060 §1/§2: nothing converts. 330 is a true amount and the wrong one,
    // and a control opened on it would be pre-filled with a number measured
    // against something else. Still true on a food carrying a density: what
    // unit to open in is `rememberedUnit`'s question, asked first.
    const events = [ate("food:cola", "dinner", "330ml")];

    expect(rememberedAmount(events, "food:cola", "ml")).toBe(330);
    expect(rememberedAmount(events, "food:cola", "g")).toBeNull();
  });

  it("refuses a whole-serving log, which names no measurement at all", () => {
    // `parseLoggedQuantity` reads anything unmeasured as one serving (ADR-0035
    // §6), so the 1 that comes back is a count and not a gram.
    const events = [ate("food:soup", "lunch", "1 serving")];

    expect(rememberedAmount(events, "food:soup", "g")).toBeNull();
    expect(rememberedAmount(events, "food:soup", "ml")).toBeNull();
  });

  it("remembers across meals, where the Recent walk beside it does not", () => {
    // The two folds scope differently on purpose: what a meal OFFERS is about
    // breakfast, but how much of one food a person eats is not — the same 40 g
    // of oats is 40 g whenever it is logged.
    const events = [ate("food:oats", "breakfast", "40g")];

    expect(targets(recentCandidatesForMeal(events, "dinner"))).toEqual([]);
    expect(rememberedAmount(events, "food:oats", "g")).toBe(40);
  });

  it("keeps the amount's stored precision, having parsed rather than rounded", () => {
    // A typed sum (`65 / 2`) reaches the ledger as its computed value, and the
    // control it re-opens must hold what the user actually logged.
    const events = [ate("food:cream", "dinner", "32.5g")];

    expect(rememberedAmount(events, "food:cream", "g")).toBe(32.5);
  });
});

describe("rememberedUnit", () => {
  it("answers which unit this food was last logged in", () => {
    // The memory half of ADR-0105 §7's opening-unit rule, and a reader of its
    // own: the amount above refuses a mismatch and must keep refusing, which a
    // single function choosing the unit could not report.
    const older = { ...ate("food:oil", "dinner", "250ml"), time: 8_000 };
    const newer = { ...ate("food:oil", "dinner", "30g"), time: 9_000 };

    expect(rememberedUnit([older, newer], "food:oil")).toBe("g");
  });

  it("is null for a food with no measured log, so the context decides", () => {
    expect(rememberedUnit([], "food:oats")).toBeNull();
    expect(
      rememberedUnit([ate("food:soup", "lunch", "1 serving")], "food:soup")
    ).toBeNull();
  });
});

describe("rememberedIngredientUnit", () => {
  const oilInMl = [{ ref: "food:oil", amount: 15, unit: "ml" as const }];
  const oilInG = [{ ref: "food:oil", amount: 14, unit: "g" as const }];

  it("answers from the newest recipe holding this food", () => {
    // The lists arrive newest first, so the first one holding the food is the
    // last one it was put into.
    expect(rememberedIngredientUnit([oilInG, oilInMl], "food:oil")).toBe("g");
    expect(rememberedIngredientUnit([oilInMl, oilInG], "food:oil")).toBe("ml");
  });

  it("is null for a food no recipe uses, which takes the recipe default", () => {
    // What this food was last DRUNK in is not consulted here: a can of Coke
    // logged in millilitres for months is still a thing measured into something
    // the first time it reaches an ingredient list (ADR-0105 §7, as amended).
    expect(rememberedIngredientUnit([oilInMl], "food:cola")).toBeNull();
    expect(rememberedIngredientUnit([], "food:oil")).toBeNull();
  });

  it("ignores a whole-serving row, which names no measured unit", () => {
    expect(
      rememberedIngredientUnit(
        [[{ ref: "food:dish", amount: 1, unit: "serving" }]],
        "food:dish"
      )
    ).toBeNull();
  });
});

describe("emptyMealDefaultHint", () => {
  it("names the meal, so the blank reads as scoped rather than broken", () => {
    // The distinction the line exists for: a user with months of history opening
    // a meal they have never logged must be able to tell "nothing HERE" from
    // "nothing at all".
    for (const meal_type of MEAL_TYPES) {
      expect(emptyMealDefaultHint(meal_type, "none")).toContain(meal_type);
      expect(emptyMealDefaultHint(meal_type, "nothing-reusable")).toContain(
        meal_type
      );
    }
  });

  it("says what fills it, since the empty surface does not show the mechanism", () => {
    expect(emptyMealDefaultHint("breakfast", "none")).toMatchInlineSnapshot(
      `"Nothing logged at breakfast yet. Foods you log here will be waiting next time."`
    );
  });

  it("does not claim nothing was logged when the catalogue rule emptied the list", () => {
    // A user who logs breakfast only as quick-estimate one-offs has candidates
    // and no offerable foods (ADR-0035 §6). Telling them "nothing logged yet" is
    // false, and re-creates the reads-as-broken failure the line exists to stop.
    const hint = emptyMealDefaultHint("breakfast", "nothing-reusable");

    expect(hint).not.toContain("Nothing logged");
    expect(hint).toMatchInlineSnapshot(
      `"Nothing you've logged at breakfast can be offered again. Search to add a food."`
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

  /**
   * The walk this replaced, kept here so the bench below has something to
   * compare against: unscoped, and stopping at forty distinct candidates.
   * `RECENT_CANDIDATES = 40` is gone from the app (ADR-0057 §4) and this is the
   * only surviving copy — it is a measuring stick, not a fallback.
   */
  function cappedUnscopedWalk(
    events: readonly ConsumptionEvent[]
  ): RecentCandidate[] {
    const seen = new Set<string>();
    const candidates: RecentCandidate[] = [];
    for (const event of [...events].sort((a, b) => b.time - a.time)) {
      if (candidates.length >= 40) break;
      if (!event.target || seen.has(event.target)) continue;
      seen.add(event.target);
      candidates.push({
        target: event.target,
        unit: parseLoggedQuantity(event.quantity).unit,
      });
    }
    return candidates;
  }

  it("costs no more per call than the capped walk it replaces", () => {
    // The pin behind #128's performance criterion, stated as a RATIO against the
    // old implementation rather than an absolute millisecond bound — an absolute
    // bound loose enough to survive shared CI is loose enough to survive any
    // regression worth catching, and a ratio between two walks over the same
    // array cancels the noise that makes wall-clock unreliable here.
    //
    // The claim being defended: removing the forty-candidate cap did not change
    // the shape of the work, because both walks copy and sort the entire history
    // once and the sort dominates the linear pass either way. What this would
    // catch is a future edit that reintroduces per-candidate work — an I/O call,
    // or a scan that turns the dedupe quadratic.
    //
    // Worth recording alongside it: this derivation recomputes when the
    // consumption store CHANGES — a log or a retraction — not on render.
    const events = syntheticLedger(5_000);
    const RUNS = 50;

    // Warm both paths first, so neither pays the other's JIT cost.
    for (let i = 0; i < 10; i += 1) {
      recentCandidatesForMeal(events, "breakfast");
      cappedUnscopedWalk(events);
    }

    const beforeCapped = performance.now();
    for (let i = 0; i < RUNS; i += 1) cappedUnscopedWalk(events);
    const cappedPerCall = (performance.now() - beforeCapped) / RUNS;

    const beforeScoped = performance.now();
    for (let i = 0; i < RUNS; i += 1)
      recentCandidatesForMeal(events, "breakfast");
    const scopedPerCall = (performance.now() - beforeScoped) / RUNS;

    // Four times the old walk. Both should land within a hair of each other; the
    // headroom is for a loaded CI box, not for a real cost difference.
    expect(scopedPerCall).toBeLessThan(cappedPerCall * 4);
  });
});

// #165: the meal default is a PREDICTION, so it is ordered by frecency rather
// than by recency. Strict newest-first offers the sardines logged once yesterday
// above the banana logged forty times, which is the defect the ticket names.
describe("recentCandidatesForMeal is ordered by frecency (#165)", () => {
  it("offers the habitual food above yesterday's one-off", () => {
    const events = [
      ...Array.from({ length: 40 }, () => ate("fdc:banana", "breakfast")),
      ate("fdc:sardines", "breakfast"),
      // Two more breakfasts after the sardines, so the sardines are no longer
      // the newest thing and recency stops carrying them.
      ate("fdc:banana", "breakfast"),
      ate("fdc:banana", "breakfast"),
    ];
    expect(targets(recentCandidatesForMeal(events, "breakfast"))).toEqual([
      "fdc:banana",
      "fdc:sardines",
    ]);
  });

  it("still lets the newest food lead, because recency outranks frequency", () => {
    // prescient's order, and the reason for it: what you ate this morning is
    // evidence about today, what you ate forty times is evidence about you.
    const events = [
      ...Array.from({ length: 40 }, () => ate("fdc:banana", "breakfast")),
      ate("fdc:sardines", "breakfast"),
    ];
    expect(targets(recentCandidatesForMeal(events, "breakfast"))).toEqual([
      "fdc:sardines",
      "fdc:banana",
    ]);
  });

  it("counts frequency at THIS meal only, so dinner cannot order breakfast", () => {
    // The oats are eaten once at breakfast and forty times at dinner. Letting
    // the dinner count speak here would leak the meal scope straight back out
    // through the ordering.
    const events = [
      ate("fdc:oats", "breakfast"),
      ...Array.from({ length: 40 }, () => ate("fdc:oats", "dinner")),
      ate("fdc:toast", "breakfast"),
      ate("fdc:toast", "breakfast"),
      ate("fdc:toast", "breakfast"),
    ];
    expect(targets(recentCandidatesForMeal(events, "breakfast"))).toEqual([
      "fdc:toast",
      "fdc:oats",
    ]);
  });

  it("still reads the unit off the newest log, whatever the order does", () => {
    // The ordering key moved; the amount seed did not. `rememberedAmount` opens
    // the control on what this food was last logged in, and only the most recent
    // log can answer that.
    const events = [
      ate("fdc:oats", "breakfast", "40g"),
      ...Array.from({ length: 10 }, () =>
        ate("fdc:milk", "breakfast", "200ml")
      ),
      ate("fdc:oats", "breakfast", "60g"),
    ];
    const candidates = recentCandidatesForMeal(events, "breakfast");
    expect(candidates[0].target).toBe("fdc:oats");
    expect(candidates[0].unit).toBe(parseLoggedQuantity("60g").unit);
  });
});

describe("Recipe Instantiations are not Recent candidates", () => {
  it("offers the foods of a meal but not the recipes cooked in it", () => {
    const events = [
      ate("fdc:oats", "breakfast"),
      cooked("recipe:dinner_combo", "breakfast"),
      ate("gtin:milk", "breakfast", "200ml"),
    ];
    expect(targets(recentCandidatesForMeal(events, "breakfast"))).toEqual([
      "gtin:milk",
      "fdc:oats",
    ]);
  });

  it("keeps a recipe out however much of it was weighed", () => {
    // The exclusion used to ride on every instantiation writing the literal
    // "1 serving", which sent the catalogue rule down its whole-serving arm. A
    // weighed instantiation takes the measured arm, so the rule has to be about
    // what a recipe is rather than about how its quantity was spelled.
    const events = [cooked("recipe:dinner_combo", "lunch")];
    expect(recentCandidatesForMeal(events, "lunch")).toEqual([]);
  });

  it("does not let a recipe's frecency order the foods around it", () => {
    // The exclusion sits ahead of the frecency walk, so a recipe cooked forty
    // times at a meal is not evidence about what gets eaten there.
    const events = [
      ...Array.from({ length: 40 }, () => cooked("recipe:combo", "dinner")),
      ate("fdc:rice", "dinner"),
    ];
    expect(targets(recentCandidatesForMeal(events, "dinner"))).toEqual([
      "fdc:rice",
    ]);
  });
});
