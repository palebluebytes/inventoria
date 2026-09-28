import { describe, it, expect, vi, beforeEach } from "vitest";
import { dbClient } from "../../src/lib/db/db.client";
import { consolidateIntoRecipe } from "../../src/lib/stores/recipe.store";
import type { RecipeIngredient } from "../../src/lib/food/recipe-ingredient";
import type { NutritionInfo } from "../../src/lib/food/nutrition";
import type { Datom } from "../../src/lib/db/db.core";

vi.mock("../../src/lib/db/db.client", () => {
  return {
    dbClient: {
      query: vi.fn(),
      append: vi.fn(),
      onInvalidate: vi.fn(() => () => {}),
    },
  };
});

/**
 * Consolidate as one act (ADR-0022 §4): the sequence both entry points run —
 * the builder's form and the Selection bar's one-tap verb (ADR-0088's
 * 2026-09-17 amendment). What is asserted here is the sequence itself, which is
 * what having one owner is for; `saveRecipe`'s own rules about the derived id
 * are covered where that function is tested.
 */
describe("consolidateIntoRecipe", () => {
  const panel = (calories: number): NutritionInfo => ({
    serving_size: "100 g",
    calories,
    protein_content: 5,
    fat_content: 2,
    carbohydrate_content: 30,
  });

  const ingredient = (
    entity: string,
    name: string,
    event_ids: string[]
  ): RecipeIngredient => ({
    entity,
    name,
    amount: 100,
    unit: "g",
    payload: {
      entity,
      attributes: { "food/name": name, "nutrition/info": panel(200) },
    },
    event_ids,
  });

  const day = new Date("2026-09-17T12:00:00");
  const dressing = () => [
    ingredient("fdc:olive_oil", "Olive oil", ["event:consume_a"]),
    ingredient("fdc:lemon", "Lemon", ["event:consume_b", "event:consume_c"]),
  ];

  /** Every datom the run appended, in the order it appended them. */
  const appended = (): Datom[][] =>
    vi.mocked(dbClient.append).mock.calls.map((call) => call[0]);

  beforeEach(() => {
    vi.clearAllMocks();
    // An empty ledger: the derived id names no twin yet, so the run mints.
    vi.mocked(dbClient.query).mockResolvedValue([]);
    vi.mocked(dbClient.append).mockResolvedValue(undefined);
  });

  it("ingests the twins, saves the dish, logs it, then retracts its sources", async () => {
    const logged = await consolidateIntoRecipe(dressing(), "dinner", day);

    expect(logged).toMatch(/^event:consume_/);
    const writes = appended();
    // Two ingests, one twin, one occasion, three retractions: the two sources
    // of the second ingredient are both replaced (ADR-0024).
    expect(writes).toHaveLength(7);

    const attributesOf = (index: number) =>
      new Set(writes[index].map((d) => d.attribute));
    expect(writes[0][0].entity).toBe("fdc:olive_oil");
    expect(writes[1][0].entity).toBe("fdc:lemon");
    // The twin exists before anything references it.
    expect(attributesOf(2)).toContain("recipe/ingredients");
    expect(writes[2][0].entity).toMatch(/^recipe:/);
    expect(attributesOf(3)).toContain("event/instantiation");

    // The link names the event this consolidation just logged, not the twin it
    // was seeded from (#468) — and there is no id to name before the log.
    const retractions = writes.slice(4);
    expect(retractions.map((datoms) => datoms[0].entity)).toEqual([
      "event:consume_a",
      "event:consume_b",
      "event:consume_c",
    ]);
    for (const datoms of retractions) {
      expect(datoms.find((d) => d.attribute === "event/status")?.value).toBe(
        "retracted"
      );
      expect(
        datoms.find((d) => d.attribute === "event/replaced_by")?.value
      ).toBe(logged);
    }
  });

  it("names nothing, so the dish stays out of the library", async () => {
    await consolidateIntoRecipe(dressing(), "dinner", day);

    const twin = appended()[2];
    // Not "": absence is the whole discriminant (ADR-0110 §1).
    expect(twin.find((d) => d.attribute === "recipe/name")).toBeUndefined();
    expect(twin[0].entity).toMatch(/^recipe:[0-9a-f]{32}$/);
  });

  it("carries a name through when the builder passes one", async () => {
    await consolidateIntoRecipe(dressing(), "dinner", day, {
      name: "House dressing",
      description: "Shaken, not stirred",
    });

    const twin = appended()[2];
    expect(twin.find((d) => d.attribute === "recipe/name")?.value).toBe(
      "House dressing"
    );
    // A named dish is its name as much as its refs, so it is never id-derived.
    expect(twin[0].entity).not.toMatch(/^recipe:[0-9a-f]{32}$/);
  });

  it("divides the occasion by the same yield it stores on the dish", async () => {
    await consolidateIntoRecipe(dressing(), "dinner", day, { yield: 4 });

    const twin = appended()[2];
    const occasion = appended()[3];
    expect(twin.find((d) => d.attribute === "recipe/yield")?.value).toBe(4);
    // 2 × 200 kcal at 100 g of a 100 g panel, over four servings.
    expect(
      (
        occasion.find((d) => d.attribute === "event/metrics")?.value as {
          calories: number;
        }
      ).calories
    ).toBe(100);
  });

  it("reuses a dish those ingredients already minted, writing no twin", async () => {
    const first = await consolidateIntoRecipe(dressing(), "dinner", day);
    const twinId = appended()[2][0].entity;

    vi.clearAllMocks();
    vi.mocked(dbClient.append).mockResolvedValue(undefined);
    // The ledger now holds that twin, which is what `saveRecipe` reads before
    // it writes — the same refs land on it rather than minting a second dish.
    vi.mocked(dbClient.query).mockResolvedValue([
      { entity: twinId, attribute: "recipe/ingredients", value: "[]", time: 1 },
    ]);

    const second = await consolidateIntoRecipe(dressing(), "lunch", day);

    expect(second).not.toBe(first);
    const writes = appended();
    // Two ingests, NO twin write, one occasion, three retractions.
    expect(writes).toHaveLength(6);
    expect(
      writes.some((datoms) =>
        datoms.some((d) => d.attribute === "recipe/ingredients")
      )
    ).toBe(false);
    expect(writes[2].find((d) => d.attribute === "event/target")?.value).toBe(
      twinId
    );
  });
});
