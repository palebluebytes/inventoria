/**
 * The meal a payload turns out to be (ADR-0073 §5 and §10, ADR-0074 §4).
 *
 * The property the receiving surface rests on: what a person is shown is
 * exactly what accepting would land, because both read the payload through one
 * fold. A panel that counted a food accept then dropped would be lying about
 * the only thing the person is deciding on.
 */
import { describe, it, expect } from "vitest";
import { readReceivedMeal } from "../../src/lib/p2p/received-meal";
import { mealPayloadEnvelope } from "../../src/lib/p2p/meal-payload";
import type { ReceivedMealPayload } from "../../src/lib/p2p/meal-reader";
import type { LedgerRow } from "../../src/lib/db/db.core";
import { row } from "./support/ledger-rows";

const EATEN_AT = new Date("2026-08-30T12:30:00").getTime();

function payloadOf(rows: LedgerRow[], roots: string[]): ReceivedMealPayload {
  return { envelope: mealPayloadEnvelope(roots), roots, rows };
}

/** One logged food, whole: the smallest meal a payload can carry. */
function loggedFood(
  id: string,
  twin: string,
  name: string,
  calories: number,
  time: number,
  meal_type = "lunch"
): LedgerRow[] {
  return [
    row(id, "event/type", "ConsumeAction", { time }),
    row(id, "event/target", twin, { time }),
    row(id, "event/quantity", "90g", { time }),
    row(id, "event/meal_type", meal_type, { time }),
    row(id, "event/metrics", { calories }, { time }),
    row(twin, "food/name", name, { time }),
  ];
}

describe("a payload read as the meal it is", () => {
  it("is the meal the sender logged, in the meal type they logged it in", () => {
    const meal = readReceivedMeal(
      payloadOf(
        loggedFood("event:consume_a", "fdc:1001", "Kale, raw", 32, EATEN_AT),
        ["event:consume_a"]
      )
    );

    expect(meal?.meal_type).toBe("lunch");
    expect(meal?.items.map((item) => item.foodName)).toEqual(["Kale, raw"]);
    expect(meal?.calories).toBe(32);
  });

  it("carries the day it was eaten on, not an instant", () => {
    const meal = readReceivedMeal(
      payloadOf(
        loggedFood("event:consume_a", "fdc:1001", "Kale, raw", 32, EATEN_AT),
        ["event:consume_a"]
      )
    );

    expect(meal?.date).toEqual(new Date("2026-08-30T00:00:00"));
  });

  it("lists the foods in the order they were logged, and totals them", () => {
    const meal = readReceivedMeal(
      payloadOf(
        [
          ...loggedFood("event:consume_b", "fdc:2", "Rice", 200, EATEN_AT + 60),
          ...loggedFood("event:consume_a", "fdc:1", "Kale", 32, EATEN_AT),
        ],
        ["event:consume_a", "event:consume_b"]
      )
    );

    expect(meal?.items.map((item) => item.foodName)).toEqual(["Kale", "Rice"]);
    expect(meal?.calories).toBe(232);
  });

  it("narrows a meal type off another device's ledger to one of the four", () => {
    const meal = readReceivedMeal(
      payloadOf(
        loggedFood(
          "event:consume_a",
          "fdc:1",
          "Kale",
          32,
          EATEN_AT,
          "elevenses"
        ),
        ["event:consume_a"]
      )
    );

    expect(meal?.meal_type).toBe("snack");
  });
});

describe("a payload that survived every refusal and still has no meal in it", () => {
  it("is null rather than an empty meal with an offer under it", () => {
    // A root the lines carry — ADR-0073 §8.4 is satisfied — whose rows fold to
    // an event pointing at no food.
    const meal = readReceivedMeal(
      payloadOf(
        [
          row("event:consume_a", "event/type", "ConsumeAction"),
          row("event:consume_a", "event/meal_type", "lunch"),
        ],
        ["event:consume_a"]
      )
    );

    expect(meal).toBeNull();
  });

  it("drops the food accept could not reproduce, so the count cannot lie", () => {
    const meal = readReceivedMeal(
      payloadOf(
        [
          ...loggedFood("event:consume_a", "fdc:1", "Kale", 32, EATEN_AT),
          // A second event whose twin never crossed: no name resolves, so
          // `copyPastMeal` would mint an Unknown Food rather than reproduce it.
          row("event:consume_b", "event/type", "ConsumeAction"),
          row("event:consume_b", "event/target", "fdc:9"),
          row("event:consume_b", "event/quantity", "10g"),
          row("event:consume_b", "event/metrics", { calories: 5 }),
        ],
        ["event:consume_a", "event:consume_b"]
      )
    );

    expect(meal?.items).toHaveLength(1);
    expect(meal?.calories).toBe(32);
  });
});
