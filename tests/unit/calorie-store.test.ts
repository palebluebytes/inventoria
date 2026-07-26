import { describe, it, expect, vi, beforeEach } from "vitest";
import { dbClient } from "../../src/lib/db/db.client";
import {
  getDayBounds,
  logFoodConsumption,
  saveCustomFood,
  saveRecipe,
  retractConsumptionEvent,
  consumptionForDay,
} from "../../src/lib/stores/calorie.store";
import { computeConsumption } from "../../src/lib/food/consumption-state";
import { asStored } from "./support/stored";

vi.mock("../../src/lib/db/db.client", () => {
  return {
    dbClient: {
      query: vi.fn(),
      append: vi.fn(),
      onInvalidate: vi.fn(() => () => {}),
    },
  };
});

describe("Calorie Store Helper - getDayBounds", () => {
  it("calculates start and end bounds of a day in local time", () => {
    const testDate = new Date("2026-05-31T14:30:00");
    const { start, end } = getDayBounds(testDate);

    const startDate = new Date(start);
    const endDate = new Date(end);

    expect(startDate.getHours()).toBe(0);
    expect(startDate.getMinutes()).toBe(0);
    expect(startDate.getSeconds()).toBe(0);
    expect(startDate.getMilliseconds()).toBe(0);

    expect(endDate.getHours()).toBe(23);
    expect(endDate.getMinutes()).toBe(59);
    expect(endDate.getSeconds()).toBe(59);
    expect(endDate.getMilliseconds()).toBe(999);
  });
});

describe("Calorie Store Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("logFoodConsumption", () => {
    it("appends consume event datoms to the ledger", async () => {
      const mockAppend = vi
        .spyOn(dbClient, "append")
        .mockResolvedValue(undefined);
      const testDate = new Date("2026-05-31T12:00:00");

      const entityId = await logFoodConsumption(
        "fdc:12345",
        "150g",
        "breakfast",
        250,
        5,
        2,
        45,
        testDate
      );

      expect(entityId).toMatch(/^event:consume_/);
      expect(mockAppend).toHaveBeenCalledTimes(1);

      const appendedDatoms = mockAppend.mock.calls[0][0];
      expect(appendedDatoms.length).toBeGreaterThanOrEqual(5);

      const typeDatom = appendedDatoms.find(
        (d) => d.attribute === "event/type"
      );
      expect(typeDatom?.value).toBe("ConsumeAction");

      const targetDatom = appendedDatoms.find(
        (d) => d.attribute === "event/target"
      );
      expect(targetDatom?.value).toBe("fdc:12345");

      const quantityDatom = appendedDatoms.find(
        (d) => d.attribute === "event/quantity"
      );
      expect(quantityDatom?.value).toBe("150g");

      const meal_typeDatom = appendedDatoms.find(
        (d) => d.attribute === "event/meal_type"
      );
      expect(meal_typeDatom?.value).toBe("breakfast");

      const metricsDatom = appendedDatoms.find(
        (d) => d.attribute === "event/metrics"
      );
      expect(metricsDatom?.value).toEqual({
        calories: 250,
        protein: 5,
        fat: 2,
        carbs: 45,
      });
    });
  });

  describe("saveCustomFood", () => {
    it("appends custom food twin to the ledger", async () => {
      const mockAppend = vi
        .spyOn(dbClient, "append")
        .mockResolvedValue(undefined);

      const foodId = await saveCustomFood(
        "Avocado Toast",
        350,
        8,
        15,
        30,
        "data:image/png;base64,dummy"
      );

      expect(foodId).toMatch(/^food:custom_/);
      expect(mockAppend).toHaveBeenCalledTimes(1);

      const datoms = mockAppend.mock.calls[0][0];
      const nameDatom = datoms.find((d) => d.attribute === "food/name");
      expect(nameDatom?.value).toBe("Avocado Toast");

      const photoDatom = datoms.find(
        (d) => d.attribute === "food/photo_base64"
      );
      expect(photoDatom?.value).toBe("data:image/png;base64,dummy");

      const calsDatom = datoms.find((d) => d.attribute === "food/calories");
      expect(calsDatom?.value).toBe("350 kcal");
    });

    it("appends custom food without photo", async () => {
      const mockAppend = vi
        .spyOn(dbClient, "append")
        .mockResolvedValue(undefined);

      const foodId = await saveCustomFood("Simple Rice", 200, 4, 1, 40);

      expect(foodId).toMatch(/^food:custom_/);
      const datoms = mockAppend.mock.calls[0][0];
      const photoDatom = datoms.find(
        (d) => d.attribute === "food/photo_base64"
      );
      expect(photoDatom).toBeUndefined();
    });
  });

  describe("saveRecipe", () => {
    it("appends recipe twin to the ledger", async () => {
      const mockAppend = vi
        .spyOn(dbClient, "append")
        .mockResolvedValue(undefined);
      const ingredients = [
        { name: "Oats", quantity: "50g", calories: 190 },
        { name: "Milk", quantity: "200ml", calories: 120 },
      ];

      const recipeId = await saveRecipe({
        name: "Oatmeal",
        ingredients,
        calories: 310,
        protein: 12,
        fat: 6,
        carbs: 52,
        source: "https://example.com/oats",
        notes: "Healthy breakfast oatmeal",
        steps: ["Boil water", "Add oats"],
      });

      expect(recipeId).toMatch(/^recipe:/);
      expect(mockAppend).toHaveBeenCalledTimes(1);

      const datoms = mockAppend.mock.calls[0][0];
      const nameDatom = datoms.find((d) => d.attribute === "food/name");
      expect(nameDatom?.value).toBe("Oatmeal");

      const notesDatom = datoms.find((d) => d.attribute === "recipe/notes");
      expect(notesDatom?.value).toBe("Healthy breakfast oatmeal");

      const sourceDatom = datoms.find((d) => d.attribute === "recipe/source");
      expect(sourceDatom?.value).toBe("https://example.com/oats");

      const stepsDatom = datoms.find((d) => d.attribute === "recipe/steps");
      expect(stepsDatom?.value).toEqual(["Boil water", "Add oats"]);

      const ingredientsDatom = datoms.find(
        (d) => d.attribute === "recipe/ingredients"
      );
      expect(ingredientsDatom?.value).toEqual(ingredients);
    });
  });

  describe("retractConsumptionEvent", () => {
    it("appends a retracted status + replaced_by link", async () => {
      const mockAppend = vi
        .spyOn(dbClient, "append")
        .mockResolvedValue(undefined);

      await retractConsumptionEvent("event:consume_abc", "recipe:xyz");

      const datoms = mockAppend.mock.calls[0][0];
      const status = datoms.find((d) => d.attribute === "event/status");
      expect(status?.entity).toBe("event:consume_abc");
      expect(status?.value).toBe("retracted");
      const link = datoms.find((d) => d.attribute === "event/replaced_by");
      expect(link?.value).toBe("recipe:xyz");
    });
  });
});

describe("computeConsumption", () => {
  const s = (v: unknown) => JSON.stringify(v);

  it("returns empty array for no datoms", () => {
    expect(computeConsumption(asStored([]))).toEqual([]);
  });

  it("hides events whose latest status is retracted", () => {
    const t = 1717070000000;
    const datoms = [
      {
        entity: "event:consume_a",
        attribute: "event/type",
        value: s("ConsumeAction"),
        time: t,
      },
      {
        entity: "event:consume_a",
        attribute: "event/meal_type",
        value: s("lunch"),
        time: t,
      },
      {
        entity: "event:consume_b",
        attribute: "event/type",
        value: s("ConsumeAction"),
        time: t,
      },
      {
        entity: "event:consume_b",
        attribute: "event/meal_type",
        value: s("lunch"),
        time: t,
      },
      // b is retracted by a later datom (append-only "delete").
      {
        entity: "event:consume_b",
        attribute: "event/status",
        value: s("retracted"),
        time: t + 1,
      },
      {
        entity: "event:consume_b",
        attribute: "event/replaced_by",
        value: s("recipe:z"),
        time: t + 1,
      },
    ];
    const events = computeConsumption(asStored(datoms));
    expect(events.map((e) => e.id)).toEqual(["event:consume_a"]);
  });

  it("groups events, unpacks the metrics blob, and joins the food twin", () => {
    const t = 1717070000000;
    const datoms = [
      {
        entity: "event:consume_123",
        attribute: "event/type",
        value: s("ConsumeAction"),
        time: t,
      },
      {
        entity: "event:consume_123",
        attribute: "event/target",
        value: s("fdc:456"),
        time: t,
      },
      {
        entity: "event:consume_123",
        attribute: "event/quantity",
        value: s("100g"),
        time: t,
      },
      {
        entity: "event:consume_123",
        attribute: "event/meal_type",
        value: s("lunch"),
        time: t,
      },
      {
        entity: "event:consume_123",
        attribute: "event/metrics",
        value: s({ calories: 200, protein: 5, fat: 1, carbs: 40 }),
        time: t,
      },
      // Food twin (heterogeneous fdc: entity, attribute-scoped into the projection)
      {
        entity: "fdc:456",
        attribute: "food/name",
        value: s("Banana"),
        time: 1717000000000,
      },
      {
        entity: "fdc:456",
        attribute: "food/photo_base64",
        value: s("data:image/png;base64,banana_pic"),
        time: 1717000000000,
      },
    ];

    const events = computeConsumption(asStored(datoms));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "event:consume_123",
      time: t,
      type: "ConsumeAction",
      target: "fdc:456",
      quantity: "100g",
      meal_type: "lunch",
      calories: 200,
      protein: 5,
      fat: 1,
      carbs: 40,
      foodName: "Banana",
      photoBase64: "data:image/png;base64,banana_pic",
    });
  });

  it("joins a recipe twin across both food/ and recipe/ prefixes", () => {
    const t = 1717080000000;
    const datoms = [
      {
        entity: "event:consume_r",
        attribute: "event/target",
        value: s("recipe:abc"),
        time: t,
      },
      {
        entity: "event:consume_r",
        attribute: "event/calories",
        value: s(350),
        time: t,
      },
      {
        entity: "recipe:abc",
        attribute: "food/name",
        value: s("Chili"),
        time: 1717000000000,
      },
      {
        entity: "recipe:abc",
        attribute: "recipe/description",
        value: s("Hearty bean chili"),
        time: 1717000000000,
      },
      {
        entity: "recipe:abc",
        attribute: "recipe/ingredients",
        value: s([{ name: "beans" }]),
        time: 1717000000000,
      },
    ];

    const events = computeConsumption(asStored(datoms));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      target: "recipe:abc",
      calories: 350,
      foodName: "Chili",
      description: "Hearty bean chili",
      ingredients: [{ name: "beans" }],
    });
  });
});

describe("consumptionForDay", () => {
  it("keeps only events whose local time falls on the given day", () => {
    const day = new Date("2026-05-31T09:00:00");
    const inDay = new Date("2026-05-31T20:00:00").getTime();
    const nextDay = new Date("2026-06-01T00:30:00").getTime();
    const events = [
      { id: "a", time: inDay },
      { id: "b", time: nextDay },
    ] as any;

    const result = consumptionForDay(events, day);
    expect(result.map((e) => e.id)).toEqual(["a"]);
  });
});
