import { describe, it, expect } from "vitest";
import {
  computeConsumption,
  totalNutrition,
} from "../../src/lib/food/consumption-state";
import { compareHlc } from "../../src/lib/db/hlc";
import type { Datom, StoredDatom } from "../../src/lib/db/db.core";
import { asStored } from "./support/stored";

/**
 * ADR-0111 §5: an event that appears as the value of any `event/replaced_by`
 * datom was minted as a replacement, and a replacement is live only where it is
 * the folded winner for at least one predecessor. Every fixture here is a pair
 * of the user's own devices that never saw each other before acting — a
 * sleeping peer (ADR-0096) — because that is the only way two live events come
 * to claim the same predecessor.
 *
 * The rule belongs to the projection and nowhere else (ADR-0111 §7), so these
 * are datoms in, Consumption Events out.
 */
const s = (v: unknown) => JSON.stringify(v);

const T = 1717070000000;

/**
 * One logged Consumption Event, trimmed to what the fold reads. No fixture here
 * carries a food twin, so the events name a target and the twin join has
 * nothing to enrich them with — these tests are about which events survive, not
 * what they are called.
 */
const logged = (
  id: string,
  target: string,
  { at, grams, calories }: { at: number; grams: number; calories: number }
): Datom[] => [
  { entity: id, attribute: "event/type", value: s("ConsumeAction"), time: at },
  { entity: id, attribute: "event/target", value: s(target), time: at },
  { entity: id, attribute: "event/quantity", value: s(`${grams}g`), time: at },
  { entity: id, attribute: "event/meal_type", value: s("lunch"), time: at },
  { entity: id, attribute: "event/metrics", value: s({ calories }), time: at },
];

/**
 * The two datoms written onto a superseded event: a pre-ADR-0111 correction and
 * a Consolidate write the same pair, and the link names the successor **event**
 * (ADR-0111 §6).
 */
const supersededBy = (id: string, successor: string, at: number): Datom[] => [
  { entity: id, attribute: "event/status", value: s("retracted"), time: at },
  { entity: id, attribute: "event/replaced_by", value: s(successor), time: at },
];

/**
 * The union of several devices' streams in the order the ledger reads them back
 * in — HLC, not wall clock (ADR-0020). Each device stamps its own rows, which is
 * what the fold's latest-wins then resolves: whichever device wrote the later
 * stamp onto an attribute holds it.
 */
const converged = (...streams: StoredDatom[][]): StoredDatom[] =>
  streams.flat().sort(compareHlc);

describe("an unclaimed replacement is not live (ADR-0111 §5)", () => {
  describe("two devices correcting one event", () => {
    // The measured #463 fixture. A banana logged at 100 g / 89 kcal that both
    // devices hold, corrected on each before either has seen the other. Under
    // retract-and-replace both corrections survive the fold — one banana shows
    // twice and the day reads 445 kcal where the truth is 267.
    const banana = asStored(
      logged("event:consume_e1", "fdc:banana", {
        at: T,
        grams: 100,
        calories: 89,
      }),
      "phone"
    );
    const phone = asStored(
      [
        ...logged("event:consume_e2", "fdc:banana", {
          at: T + 10,
          grams: 200,
          calories: 178,
        }),
        ...supersededBy("event:consume_e1", "event:consume_e2", T + 10),
      ],
      "phone"
    );
    const laptop = asStored(
      [
        ...logged("event:consume_e3", "fdc:banana", {
          at: T + 11,
          grams: 300,
          calories: 267,
        }),
        ...supersededBy("event:consume_e1", "event:consume_e3", T + 11),
      ],
      "laptop"
    );

    it("keeps the one correction the predecessor's folded link names", () => {
      const events = computeConsumption(converged(banana, phone, laptop));

      expect(events.map((e) => e.id)).toEqual(["event:consume_e3"]);
      expect(totalNutrition(events).calories).toBe(267);
    });

    it("leaves an ordinary log alone, since no predecessor names it", () => {
      const apple = asStored(
        logged("event:consume_apple", "fdc:apple", {
          at: T + 1,
          grams: 150,
          calories: 78,
        }),
        "phone"
      );

      const events = computeConsumption(
        converged(banana, apple, phone, laptop)
      );

      expect(events.map((e) => e.id)).toEqual([
        "event:consume_e3",
        "event:consume_apple",
      ]);
      expect(totalNutrition(events).calories).toBe(345);
    });
  });

  // Both #463 controls. Neither involves a second device, so every replacement
  // is claimed and the rule changes nothing — which is what makes the two-row
  // result above the divergence rather than the fixture.
  describe("one device correcting", () => {
    it("gives one row when it corrects once", () => {
      const events = computeConsumption(
        asStored([
          ...logged("event:consume_e1", "fdc:banana", {
            at: T,
            grams: 100,
            calories: 89,
          }),
          ...logged("event:consume_e2", "fdc:banana", {
            at: T + 10,
            grams: 200,
            calories: 178,
          }),
          ...supersededBy("event:consume_e1", "event:consume_e2", T + 10),
        ])
      );

      expect(events.map((e) => e.id)).toEqual(["event:consume_e2"]);
      expect(totalNutrition(events).calories).toBe(178);
    });

    it("gives one row when it corrects twice in a chain", () => {
      // Each link in a chain is its predecessor's winner, so neither
      // replacement is unclaimed.
      const events = computeConsumption(
        asStored([
          ...logged("event:consume_e1", "fdc:banana", {
            at: T,
            grams: 100,
            calories: 89,
          }),
          ...logged("event:consume_e2", "fdc:banana", {
            at: T + 10,
            grams: 200,
            calories: 178,
          }),
          ...supersededBy("event:consume_e1", "event:consume_e2", T + 10),
          ...logged("event:consume_e3", "fdc:banana", {
            at: T + 20,
            grams: 300,
            calories: 267,
          }),
          ...supersededBy("event:consume_e2", "event:consume_e3", T + 20),
        ])
      );

      expect(events.map((e) => e.id)).toEqual(["event:consume_e3"]);
      expect(totalNutrition(events).calories).toBe(267);
    });
  });

  describe("two devices consolidating", () => {
    // Consolidate is N → 1 and cannot become an append (ADR-0111 §4), so it
    // goes on minting replacements after §1 and is the lasting source of an
    // unclaimed one. Both devices hold the same three logged foods; each turns
    // some of them into a dish.
    const day = asStored(
      [
        ...logged("event:consume_oats", "fdc:oats", {
          at: T,
          grams: 50,
          calories: 190,
        }),
        ...logged("event:consume_milk", "gtin:milk", {
          at: T + 1,
          grams: 200,
          calories: 128,
        }),
        ...logged("event:consume_apple", "fdc:apple", {
          at: T + 2,
          grams: 150,
          calories: 78,
        }),
      ],
      "phone"
    );

    // The phone's act, shared by both fixtures below: the oats and the milk
    // become one dish. What changes is what the laptop did meanwhile.
    const phone = asStored(
      [
        ...logged("event:consume_dish_p", "recipe:oatmeal", {
          at: T + 10,
          grams: 250,
          calories: 318,
        }),
        ...supersededBy("event:consume_oats", "event:consume_dish_p", T + 10),
        ...supersededBy("event:consume_milk", "event:consume_dish_p", T + 10),
      ],
      "phone"
    );

    // The laptop turning the same two foods into its own dish, unaware of the
    // phone's. One of the two wins every predecessor; the other is claimed by
    // none.
    const laptopSameFoods = asStored(
      [
        ...logged("event:consume_dish_l", "recipe:oatmeal", {
          at: T + 11,
          grams: 250,
          calories: 318,
        }),
        ...supersededBy("event:consume_oats", "event:consume_dish_l", T + 11),
        ...supersededBy("event:consume_milk", "event:consume_dish_l", T + 11),
      ],
      "laptop"
    );

    it("converges to one recipe, leaving no ingredient stranded", () => {
      const events = computeConsumption(converged(day, phone, laptopSameFoods));

      // One dish and the apple nobody touched. The oats and the milk are inside
      // the dish rather than stranded beside it, and the day is the 396 kcal it
      // was before either device consolidated anything.
      expect(new Set(events.map((e) => e.id))).toEqual(
        new Set(["event:consume_dish_l", "event:consume_apple"])
      );
      expect(totalNutrition(events).calories).toBe(396);
    });

    it("lands the surviving dish where its first ingredient sat", () => {
      // The `event/replaced_by` slot walk, on the population it was written for
      // and could not reach until §6's link named an event (ADR-0111 §6). The
      // dish reads as the oats being adjusted, not as a dish arriving after
      // everything else in the meal.
      const events = computeConsumption(converged(day, phone, laptopSameFoods));

      expect(events.map((e) => e.id)).toEqual([
        "event:consume_dish_l",
        "event:consume_apple",
      ]);
    });

    it("stays two recipes where they overlap only partly", () => {
      // The decided behaviour, not a bug (ADR-0111 §5): two genuinely different
      // acts, and every alternative shape loses a food rather than
      // double-counting the shared one.
      const laptop = asStored(
        [
          ...logged("event:consume_dish_l", "recipe:fruit_milk", {
            at: T + 11,
            grams: 350,
            calories: 206,
          }),
          ...supersededBy("event:consume_milk", "event:consume_dish_l", T + 11),
          ...supersededBy(
            "event:consume_apple",
            "event:consume_dish_l",
            T + 11
          ),
        ],
        "laptop"
      );

      const events = computeConsumption(converged(day, phone, laptop));

      expect(events.map((e) => e.id)).toEqual([
        "event:consume_dish_p",
        "event:consume_dish_l",
      ]);
      // The milk's 128 kcal is inside both dishes: 318 + 206 against the 396
      // the day really was.
      expect(totalNutrition(events).calories).toBe(524);
    });
  });
});
