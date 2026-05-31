import { describe, it, expect, vi, beforeEach } from "vitest";
import { dbClient } from "../../src/lib/db/db.client";
import {
  getDayBounds,
  logFoodConsumption,
  saveCustomFood,
  saveRecipe,
  getEventsForDay,
} from "../../src/lib/stores/calorie.store";

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
      expect(appendedDatoms.length).toBeGreaterThanOrEqual(8);

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

      const mealTypeDatom = appendedDatoms.find(
        (d) => d.attribute === "event/meal_type"
      );
      expect(mealTypeDatom?.value).toBe("breakfast");

      const caloriesDatom = appendedDatoms.find(
        (d) => d.attribute === "event/calories"
      );
      expect(caloriesDatom?.value).toBe(250);
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

      const recipeId = await saveRecipe(
        "Oatmeal",
        "Healthy breakfast oatmeal",
        "https://example.com/oats",
        ingredients,
        310,
        12,
        6,
        52
      );

      expect(recipeId).toMatch(/^recipe:/);
      expect(mockAppend).toHaveBeenCalledTimes(1);

      const datoms = mockAppend.mock.calls[0][0];
      const nameDatom = datoms.find((d) => d.attribute === "food/name");
      expect(nameDatom?.value).toBe("Oatmeal");

      const descDatom = datoms.find(
        (d) => d.attribute === "recipe/description"
      );
      expect(descDatom?.value).toBe("Healthy breakfast oatmeal");

      const scrapeUrlDatom = datoms.find(
        (d) => d.attribute === "recipe/scrape_url"
      );
      expect(scrapeUrlDatom?.value).toBe("https://example.com/oats");

      const ingredientsDatom = datoms.find(
        (d) => d.attribute === "recipe/ingredients"
      );
      expect(ingredientsDatom?.value).toEqual(ingredients);
    });
  });

  describe("getEventsForDay", () => {
    it("returns empty array if no events are logged", async () => {
      vi.spyOn(dbClient, "query").mockResolvedValue([]);
      const events = await getEventsForDay(new Date());
      expect(events).toEqual([]);
    });

    it("fetches, groups, and maps consumption events and twin details", async () => {
      // Mock dbClient.query to return:
      // 1. Consumption events
      // 2. Twin food details
      const querySpy = vi.spyOn(dbClient, "query");

      querySpy.mockImplementation(async (sql: string) => {
        if (sql.includes("event:consume_%")) {
          return [
            {
              entity: "event:consume_123",
              attribute: "event/type",
              value: '"ConsumeAction"',
              time: 1717070000000,
            },
            {
              entity: "event:consume_123",
              attribute: "event/target",
              value: '"fdc:456"',
              time: 1717070000000,
            },
            {
              entity: "event:consume_123",
              attribute: "event/quantity",
              value: '"100g"',
              time: 1717070000000,
            },
            {
              entity: "event:consume_123",
              attribute: "event/meal_type",
              value: '"lunch"',
              time: 1717070000000,
            },
            {
              entity: "event:consume_123",
              attribute: "event/calories",
              value: "200",
              time: 1717070000000,
            },
          ] as any;
        } else if (sql.includes("IN (?)") || sql.includes("IN (")) {
          return [
            {
              entity: "fdc:456",
              attribute: "food/name",
              value: '"Banana"',
            },
            {
              entity: "fdc:456",
              attribute: "food/photo_base64",
              value: '"data:image/png;base64,banana_pic"',
            },
          ] as any;
        }
        return [];
      });

      const events = await getEventsForDay(new Date());
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        id: "event:consume_123",
        time: 1717070000000,
        type: "ConsumeAction",
        target: "fdc:456",
        quantity: "100g",
        meal_type: "lunch",
        calories: 200,
        foodName: "Banana",
        photoBase64: "data:image/png;base64,banana_pic",
        description: undefined,
        scrapeUrl: undefined,
        ingredients: undefined,
      });
    });
  });
});
