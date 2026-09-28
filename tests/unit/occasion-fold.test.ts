import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "svelte/server";
import { dbClient } from "../../src/lib/db/db.client";
import {
  correctOccasion,
  occasionSizeOf,
  seedOccasionRows,
} from "../../src/lib/stores/recipe.store";
import LoggedRecipeFold from "../../src/lib/views/food/LoggedRecipeFold.svelte";
import type { ConsumptionEvent } from "../../src/lib/stores/calorie.store";
import type { NutritionInfo } from "../../src/lib/food/nutrition";
import type { RecipeIngredient } from "../../src/lib/food/recipe-ingredient";
import type { Datom } from "../../src/lib/db/db.core";

vi.mock("../../src/lib/db/db.client", () => ({
  dbClient: {
    query: vi.fn(),
    append: vi.fn(),
    onInvalidate: vi.fn(() => () => {}),
  },
}));

const PANEL: NutritionInfo = {
  serving_size: "100 g",
  calories: 100,
  protein_content: 5,
  fat_content: 2,
  carbohydrate_content: 10,
};

/** A logged occasion, as the day's projection hands one over. */
function occasion(over: Partial<ConsumptionEvent> = {}): ConsumptionEvent {
  return {
    id: "event:consume_stew",
    time: Date.parse("2026-09-17T12:00:00"),
    type: "consumption",
    target: "recipe:stew",
    quantity: "1 serving",
    meal_type: "dinner",
    foodName: "Chickpea stew",
    calories: 300,
    instantiation: {
      based_on: "recipe:stew",
      yield: 1,
      ingredients: [
        {
          ref: "fdc:chickpeas",
          name: "Chickpeas",
          amount: 240,
          unit: "g",
          calories: 240,
          protein: 12,
          fat: 4,
          carbs: 40,
        },
        {
          ref: "fdc:spinach",
          name: "Spinach",
          amount: 120,
          unit: "g",
          calories: 60,
          protein: 3,
          fat: 1,
          carbs: 5,
        },
      ],
    },
    ...over,
  } as ConsumptionEvent;
}

const ingredient = (entity: string, name: string, amount: number) => ({
  entity,
  name,
  amount,
  unit: "g" as const,
  payload: {
    entity,
    attributes: { "food/name": name, "nutrition/info": PANEL },
  },
});

/**
 * Correcting a logged occasion from the day (#462, ADR-0022 as amended). The
 * fold and the sheet reach one seam, so what is pinned here is the seam: what
 * an occasion's rows open at, what its size survives as, and that a correction
 * lands on the event rather than beside it.
 */
describe("the occasion seam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dbClient.query).mockResolvedValue([]);
    vi.mocked(dbClient.append).mockResolvedValue(undefined);
  });

  describe("occasionSizeOf", () => {
    it("keeps a weighed occasion weighed", () => {
      // Both numbers or neither: the portion is a fraction OF the batch, and the
      // batch is the snapshot's own frozen figure rather than the template's.
      const event = occasion({
        quantity: "220 g",
        instantiation: {
          ...occasion().instantiation!,
          batch_weight: 900,
        },
      });

      expect(occasionSizeOf(event)).toEqual({
        batch_weight: 900,
        portion_weight: 220,
      });
    });

    it("keeps a counted occasion counted", () => {
      expect(occasionSizeOf(occasion({ quantity: "2 servings" }))).toEqual({
        servings: 2,
      });
    });

    it("reads a weight with no batch behind it as the count it can say", () => {
      // A numerator whose denominator is gone divides against nothing, so the
      // occasion falls back rather than claiming a fraction it cannot state.
      expect(occasionSizeOf(occasion({ quantity: "220 g" }))).toEqual({
        servings: 1,
      });
    });
  });

  describe("seedOccasionRows", () => {
    it("opens the rows at one serving", async () => {
      // The snapshot stores the batch over the yield it was divided by; a
      // surface showing a row has to show one serving's worth of it.
      const rows = await seedOccasionRows(
        occasion({
          instantiation: { ...occasion().instantiation!, yield: 4 },
        })
      );

      expect(rows.map((r) => r.amount)).toEqual([60, 30]);
    });

    it("falls back to the frozen row when the twin is gone", async () => {
      const rows = await seedOccasionRows(occasion());

      // An empty ledger: nothing resolves, and every line still opens — at the
      // amount it was logged at, in the unit it was logged in, on a basis
      // fabricated from what it contributed (#462).
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe("Chickpeas");
      expect(rows[0].amount).toBe(240);
      expect(rows[0].unit).toBe("g");
      expect(rows[0].payload.attributes["nutrition/info"]).toMatchObject({
        serving_size: "100 g",
        // 240 kcal at 240 g.
        calories: 100,
      });
    });

    it("has nothing to seed from an event that is not an occasion", async () => {
      expect(
        await seedOccasionRows(occasion({ instantiation: undefined }))
      ).toEqual([]);
    });
  });

  describe("correctOccasion", () => {
    const appended = (): Datom[][] =>
      vi.mocked(dbClient.append).mock.calls.map((call) => call[0]);

    it("appends onto the occasion and mints no second event", async () => {
      await correctOccasion(
        "event:consume_stew",
        "recipe:stew",
        [ingredient("fdc:chickpeas", "Chickpeas", 300)],
        1,
        { servings: 1 }
      );

      const writes = appended();
      // One ingest, then the correction itself (ADR-0111 §1).
      expect(writes).toHaveLength(2);
      const correction = writes[1];
      for (const datom of correction) {
        expect(datom.entity).toBe("event:consume_stew");
      }
      // Nothing is retracted and no successor is named: this is not a
      // retract-and-replace.
      const attributes = correction.map((d) => d.attribute);
      expect(attributes).not.toContain("event/status");
      expect(attributes).not.toContain("event/replaced_by");
      expect(attributes).toContain("event/instantiation");
    });

    it("says the occasion in the size it is handed, not one it derives", async () => {
      // A correction that changed an ingredient must not restate how much of the
      // pot was eaten: 220 g of a 900 g batch stays 220 g.
      await correctOccasion(
        "event:consume_stew",
        "recipe:stew",
        [ingredient("fdc:chickpeas", "Chickpeas", 300)],
        1,
        { batch_weight: 900, portion_weight: 220 }
      );

      const quantity = appended()[1].find(
        (d) => d.attribute === "event/quantity"
      );
      expect(quantity?.value).toBe("220g");
    });

    it("ingests every row's twin before the snapshot references it", async () => {
      await correctOccasion(
        "event:consume_stew",
        "recipe:stew",
        [
          ingredient("fdc:chickpeas", "Chickpeas", 300),
          ingredient("fdc:spinach", "Spinach", 120),
        ],
        1,
        { servings: 1 }
      );

      const writes = appended();
      expect(writes).toHaveLength(3);
      expect(writes[0][0].entity).toBe("fdc:chickpeas");
      expect(writes[1][0].entity).toBe("fdc:spinach");
      expect(writes[2][0].entity).toBe("event:consume_stew");
    });
  });
});

/**
 * The fold's own markup. Server-rendered, so what is asserted is what a reader
 * meets before any twin has resolved — which is the state the day is in for one
 * frame every time a recipe is opened.
 */
describe("the Occasion fold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dbClient.query).mockResolvedValue([]);
  });

  it("names itself by the occasion it belongs to", () => {
    const { body } = render(LoggedRecipeFold, {
      props: { item: occasion(), onOpenOccasion: () => {} },
    });

    expect(body).toContain('data-testid="occasion-fold-event:consume_stew"');
  });

  it("says it is reading rather than saying the dish is empty", () => {
    // The rows are one database read away. An empty fold here would be a false
    // statement about the occasion for exactly as long as that read takes.
    const { body } = render(LoggedRecipeFold, {
      props: { item: occasion(), onOpenOccasion: () => {} },
    });

    expect(body).toContain("Reading the ingredients…");
  });
});
