import { describe, it, expect, vi, beforeEach } from "vitest";
import { dbClient } from "../../src/lib/db/db.client";
import {
  getDayBounds,
  logFoodConsumption,
  saveCustomFood,
  saveRecipe,
  logRecipeConsumption,
  correctInstantiation,
  retractConsumptionEvent,
  changeLoggedFoodAmount,
  consumptionForDay,
} from "../../src/lib/stores/calorie.store";
import type { NutritionInfo } from "../../src/lib/food/nutrition";
import {
  computeConsumption,
  totalNutrition,
} from "../../src/lib/food/consumption-state";
import type { ReferenceIngredient } from "../../src/lib/food/recipe-nutrition";
import { roundFood, scaleNutrition } from "../../src/lib/food/nutrition";
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

      // Nutrition is a single atomic panel — no food/* macro attributes.
      const nutritionDatom = datoms.find(
        (d) => d.attribute === "nutrition/info"
      );
      expect(nutritionDatom?.value).toEqual({
        serving_size: "1 serving",
        calories: 350,
        protein_content: 8,
        fat_content: 15,
        carbohydrate_content: 30,
      });
      expect(
        datoms.find((d) => d.attribute === "food/calories")
      ).toBeUndefined();
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
    it("stores a schema.org recipe twin with reference ingredients and no macros", async () => {
      const mockAppend = vi
        .spyOn(dbClient, "append")
        .mockResolvedValue(undefined);
      // Ingredients are pure references — name and nutrition resolve from the
      // referenced food twin, never duplicated on the recipe (ADR-0021).
      const ingredients: ReferenceIngredient[] = [
        { ref: "fdc:oats", amount: 50, unit: "g" },
        { ref: "food:custom_milk", amount: 1, unit: "serving" },
      ];

      const recipeId = await saveRecipe({
        name: "Oatmeal",
        ingredients,
        url: "https://example.com/oats",
        description: "Healthy breakfast oatmeal",
        instructions: ["Boil water", "Add oats"],
      });

      expect(recipeId).toMatch(/^recipe:/);
      expect(mockAppend).toHaveBeenCalledTimes(1);

      const datoms = mockAppend.mock.calls[0][0];

      // schema.org-faithful recipe/* vocabulary.
      expect(datoms.find((d) => d.attribute === "recipe/name")?.value).toBe(
        "Oatmeal"
      );
      expect(
        datoms.find((d) => d.attribute === "recipe/description")?.value
      ).toBe("Healthy breakfast oatmeal");
      expect(datoms.find((d) => d.attribute === "recipe/url")?.value).toBe(
        "https://example.com/oats"
      );
      expect(
        datoms.find((d) => d.attribute === "recipe/instructions")?.value
      ).toEqual(["Boil water", "Add oats"]);
      expect(datoms.find((d) => d.attribute === "recipe/yield")?.value).toBe(1);
      expect(
        datoms.find((d) => d.attribute === "recipe/ingredients")?.value
      ).toEqual(ingredients);

      // Old ad-hoc vocabulary is gone, and a recipe carries no name/macros of
      // its own — nutrition is derived from the referenced ingredient twins.
      for (const dead of [
        "recipe/source",
        "recipe/notes",
        "recipe/steps",
        "food/name",
        "food/calories",
        "nutrition/info",
      ]) {
        expect(datoms.find((d) => d.attribute === dead)).toBeUndefined();
      }
    });

    // Editing a Recipe Twin (#13, ADR-0022): a template edit is an append of
    // newer recipe/* datoms to the SAME entity, so latest-wins re-seeds FUTURE
    // instantiations only. Passing an existing `entity` selects edit-in-place;
    // no new id is minted, and logged history — being snapshots — never moves.
    it("edits a template in place: appends to the passed entity, minting no new id", async () => {
      const mockAppend = vi
        .spyOn(dbClient, "append")
        .mockResolvedValue(undefined);
      const ingredients: ReferenceIngredient[] = [
        { ref: "fdc:oats", amount: 80, unit: "g" },
      ];

      const returnedId = await saveRecipe(
        { name: "Oatmeal", ingredients, yield: 2 },
        "recipe:existing_123"
      );

      // The passed entity is reused verbatim — no fresh `recipe:<rand>` id.
      expect(returnedId).toBe("recipe:existing_123");
      const datoms = mockAppend.mock.calls[0][0];
      expect(datoms.every((d) => d.entity === "recipe:existing_123")).toBe(
        true
      );
      expect(datoms.find((d) => d.attribute === "recipe/name")?.value).toBe(
        "Oatmeal"
      );
      expect(
        datoms.find((d) => d.attribute === "recipe/ingredients")?.value
      ).toEqual(ingredients);
      expect(datoms.find((d) => d.attribute === "recipe/yield")?.value).toBe(2);
    });

    // Append-only has no delete, so an omitted optional attribute would leave its
    // OLD value winning. On edit the optional schema.org fields are therefore
    // written unconditionally — an empty value clears the field for future logs.
    it("clears an optional field on edit by writing an empty value", async () => {
      const mockAppend = vi
        .spyOn(dbClient, "append")
        .mockResolvedValue(undefined);

      await saveRecipe(
        {
          name: "Oatmeal",
          ingredients: [{ ref: "fdc:oats", amount: 80, unit: "g" }],
          description: "",
          url: "",
          instructions: [],
        },
        "recipe:existing_123"
      );

      const datoms = mockAppend.mock.calls[0][0];
      expect(
        datoms.find((d) => d.attribute === "recipe/description")?.value
      ).toBe("");
      expect(datoms.find((d) => d.attribute === "recipe/url")?.value).toBe("");
      expect(
        datoms.find((d) => d.attribute === "recipe/instructions")?.value
      ).toEqual([]);
    });

    // A fresh Define (no entity) still keeps the ledger clean: empty optional
    // fields are skipped rather than written as blanks.
    it("skips empty optional fields when defining a new twin", async () => {
      const mockAppend = vi
        .spyOn(dbClient, "append")
        .mockResolvedValue(undefined);

      const id = await saveRecipe({
        name: "Oatmeal",
        ingredients: [{ ref: "fdc:oats", amount: 80, unit: "g" }],
        description: "",
        url: "",
        instructions: [],
      });

      expect(id).toMatch(/^recipe:/);
      const datoms = mockAppend.mock.calls[0][0];
      for (const skipped of [
        "recipe/description",
        "recipe/url",
        "recipe/instructions",
        "recipe/image",
      ]) {
        expect(datoms.find((d) => d.attribute === skipped)).toBeUndefined();
      }
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

describe("correctInstantiation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  const PANELS: Record<string, NutritionInfo> = {
    "fdc:oats": {
      serving_size: "100 g",
      calories: 379,
      protein_content: 13.1,
      fat_content: 6.5,
      carbohydrate_content: 67.7,
    },
  };
  const resolve = (ref: string) => PANELS[ref];
  const resolveName = (ref: string) =>
    ref === "fdc:oats" ? "Oats" : undefined;

  it("logs a freshly-derived instantiation and retracts the old event (ADR-0008)", async () => {
    const mockAppend = vi
      .spyOn(dbClient, "append")
      .mockResolvedValue(undefined);

    const newId = await correctInstantiation(
      "event:consume_old",
      "recipe:oatmeal",
      [{ ref: "fdc:oats", amount: 100, unit: "g" }],
      1,
      resolve,
      resolveName,
      "breakfast",
      new Date("2026-05-31T08:00:00")
    );

    expect(newId).toMatch(/^event:consume_/);
    expect(newId).not.toBe("event:consume_old");
    // Two appends: (1) the superseding instantiation, (2) the retraction.
    expect(mockAppend).toHaveBeenCalledTimes(2);

    // (1) The new event re-derives its snapshot from the CURRENT twins.
    const newDatoms = mockAppend.mock.calls[0][0];
    expect(newDatoms.find((d) => d.attribute === "event/target")?.value).toBe(
      "recipe:oatmeal"
    );
    const inst = newDatoms.find((d) => d.attribute === "event/instantiation")
      ?.value as any;
    expect(inst.based_on).toBe("recipe:oatmeal");
    expect(inst.ingredients[0]).toMatchObject({
      ref: "fdc:oats",
      name: "Oats",
      amount: 100,
      calories: 379,
    });
    expect(
      newDatoms.find((d) => d.attribute === "event/metrics")?.value
    ).toMatchObject({ calories: 379 });

    // (2) The old event is retracted and linked to its replacement.
    const retract = mockAppend.mock.calls[1][0];
    expect(retract.find((d) => d.attribute === "event/status")?.entity).toBe(
      "event:consume_old"
    );
    expect(retract.find((d) => d.attribute === "event/status")?.value).toBe(
      "retracted"
    );
    expect(
      retract.find((d) => d.attribute === "event/replaced_by")?.value
    ).toBe(newId);
  });
});

describe("changeLoggedFoodAmount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  const OATS_PANEL: NutritionInfo = {
    serving_size: "100 g",
    calories: 379,
    protein_content: 13.1,
    fat_content: 6.5,
    carbohydrate_content: 67.7,
  };

  it("re-derives macros at the new amount and retracts the old event (ADR-0008)", async () => {
    // getLocalFoodTwin reads the twin's datoms; return its nutrition panel.
    vi.spyOn(dbClient, "query").mockResolvedValue([
      { attribute: "nutrition/info", value: JSON.stringify(OATS_PANEL) },
    ] as any);
    const mockAppend = vi
      .spyOn(dbClient, "append")
      .mockResolvedValue(undefined);

    await changeLoggedFoodAmount(
      {
        id: "event:consume_old",
        target: "fdc:oats",
        quantity: "50g",
        meal_type: "breakfast",
        time: new Date("2026-05-31T08:00:00").getTime(),
      } as any,
      100 // 100 g of a 379 kcal/100 g food → 379 kcal
    );

    // Two appends: (1) the re-logged event at the new amount, (2) the retraction.
    expect(mockAppend).toHaveBeenCalledTimes(2);
    const newDatoms = mockAppend.mock.calls[0][0];
    expect(newDatoms.find((d) => d.attribute === "event/target")?.value).toBe(
      "fdc:oats"
    );
    expect(newDatoms.find((d) => d.attribute === "event/quantity")?.value).toBe(
      "100g"
    );
    expect(
      newDatoms.find((d) => d.attribute === "event/meal_type")?.value
    ).toBe("breakfast");
    expect(
      newDatoms.find((d) => d.attribute === "event/metrics")?.value
    ).toMatchObject({ calories: 379, protein: 13.1 });

    const retract = mockAppend.mock.calls[1][0];
    expect(retract.find((d) => d.attribute === "event/status")?.entity).toBe(
      "event:consume_old"
    );
    expect(retract.find((d) => d.attribute === "event/status")?.value).toBe(
      "retracted"
    );
  });

  it("no-ops when the twin carries no nutrition panel (can't re-derive)", async () => {
    vi.spyOn(dbClient, "query").mockResolvedValue([] as any);
    const mockAppend = vi
      .spyOn(dbClient, "append")
      .mockResolvedValue(undefined);

    await changeLoggedFoodAmount(
      { id: "event:x", target: "fdc:ghost", quantity: "50g", time: 0 } as any,
      100
    );

    expect(mockAppend).not.toHaveBeenCalled();
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

  it("joins a recipe twin's display identity but reads the breakdown from the event's snapshot, not the template", () => {
    const t = 1717080000000;
    // The frozen snapshot the event carries — 200 g beans as actually cooked.
    const instantiation = {
      based_on: "recipe:abc",
      yield: 1,
      ingredients: [
        {
          ref: "fdc:beans",
          name: "Beans",
          amount: 200,
          unit: "g",
          calories: 350,
          protein: 12,
          fat: 8,
          carbs: 55,
        },
      ],
    };
    const datoms = [
      {
        entity: "event:consume_r",
        attribute: "event/target",
        value: s("recipe:abc"),
        time: t,
      },
      {
        entity: "event:consume_r",
        attribute: "event/metrics",
        value: s({ calories: 350, protein: 12, fat: 8, carbs: 55 }),
        time: t,
      },
      {
        entity: "event:consume_r",
        attribute: "event/instantiation",
        value: s(instantiation),
        time: t,
      },
      {
        entity: "recipe:abc",
        attribute: "recipe/name",
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
        attribute: "recipe/url",
        value: s("https://example.com/chili"),
        time: 1717000000000,
      },
      {
        entity: "recipe:abc",
        attribute: "recipe/instructions",
        value: s(["Soak the beans", "Simmer for an hour"]),
        time: 1717000000000,
      },
      // The template has since drifted — a different yield and a bumped amount.
      // The logged event must ignore all of this and read its own snapshot.
      {
        entity: "recipe:abc",
        attribute: "recipe/yield",
        value: s(5),
        time: 1717000000000,
      },
      {
        entity: "recipe:abc",
        attribute: "recipe/ingredients",
        value: s([{ ref: "fdc:beans", amount: 999, unit: "g" }]),
        time: 1717000000000,
      },
    ];

    const events = computeConsumption(asStored(datoms));
    expect(events).toHaveLength(1);
    // Display identity joins live from the template…
    expect(events[0]).toMatchObject({
      target: "recipe:abc",
      calories: 350,
      foodName: "Chili",
      description: "Hearty bean chili",
      url: "https://example.com/chili",
      instructions: ["Soak the beans", "Simmer for an hour"],
      instantiation,
    });
    // …but the mutable template breakdown never leaks onto the logged event.
    expect(events[0]).not.toHaveProperty("ingredients");
    expect(events[0]).not.toHaveProperty("yield");
    expect(events[0].instantiation?.yield).toBe(1);
  });
});

describe("store action → computeConsumption round-trip (Seam 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // Values are JSON-encoded at the ledger boundary and parsed back by the
  // projection. Round-trip the captured write-datoms through that encoding so
  // the fold sees exactly what the DB would return on read.
  const asLedger = (datoms: any[]) =>
    asStored(datoms.map((d) => ({ ...d, value: JSON.stringify(d.value) })));

  function captureAppends() {
    const appended: any[] = [];
    vi.spyOn(dbClient, "append").mockImplementation(async (d: any) => {
      appended.push(...d);
    });
    return appended;
  }

  it("logs a custom food and derives a Consumption Event carrying its macros", async () => {
    const appended = captureAppends();

    const twinId = await saveCustomFood("Avocado Toast", 350, 8, 15, 30);
    await logFoodConsumption(
      twinId,
      "1 serving",
      "breakfast",
      350,
      8,
      15,
      30,
      new Date("2026-05-31T12:00:00")
    );

    const events = computeConsumption(asLedger(appended));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      target: twinId,
      meal_type: "breakfast",
      foodName: "Avocado Toast",
      calories: 350,
      protein: 8,
      fat: 15,
      carbs: 30,
    });
  });

  it.each([
    ["USDA", "fdc:171705"],
    ["Open Food Facts", "gtin:3017620422003"],
  ])(
    "logs a %s food and folds it correctly into the day's totals",
    async (_source, target) => {
      const appended = captureAppends();

      await logFoodConsumption(
        target,
        "150g",
        "lunch",
        134,
        1.7,
        0.5,
        34.2,
        new Date("2026-05-31T12:00:00")
      );

      const events = computeConsumption(asLedger(appended));
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        target,
        meal_type: "lunch",
        calories: 134,
        protein: 1.7,
        fat: 0.5,
        carbs: 34.2,
      });
    }
  );

  it("logs a recipe end-to-end: store freezes the instantiation snapshot, projection reads it, and neither a template edit nor an ingredient-twin correction can move it", async () => {
    const appended = captureAppends();
    const day = new Date("2026-05-31T12:00:00");

    // Two ingredient food twins with real per-100g nutrition panels — the ledger
    // context the recipe is seeded from. The store reads their panels at log time
    // to freeze the snapshot; the projection never re-reads them (ADR-0022).
    const oatsPanel = {
      serving_size: "100 g",
      calories: 380,
      protein_content: 13,
      fat_content: 7,
      carbohydrate_content: 67,
    };
    const milkPanel = {
      serving_size: "100 g",
      calories: 64,
      protein_content: 3.4,
      fat_content: 3.6,
      carbohydrate_content: 4.7,
    };
    const twinDatoms = [
      { entity: "fdc:oats", attribute: "food/name", value: "Oats", time: 1 },
      {
        entity: "fdc:oats",
        attribute: "nutrition/info",
        value: oatsPanel,
        time: 1,
      },
      { entity: "gtin:milk", attribute: "food/name", value: "Milk", time: 1 },
      {
        entity: "gtin:milk",
        attribute: "nutrition/info",
        value: milkPanel,
        time: 1,
      },
    ];

    // 50 g oats (×0.5) + 200 g milk (×2), yield 1. Per-row (round-then-sum):
    // oats = 190/6.5/3.5/33.5 ; milk = 128/6.8/7.2/9.4 → headline Σ = 318/13.3/10.7/42.9.
    const refs: ReferenceIngredient[] = [
      { ref: "fdc:oats", amount: 50, unit: "g" },
      { ref: "gtin:milk", amount: 200, unit: "g" },
    ];
    const headline = { calories: 318, protein: 13.3, fat: 10.7, carbs: 42.9 };
    const panels = new Map([
      ["fdc:oats", oatsPanel],
      ["gtin:milk", milkPanel],
    ]);
    const names = new Map([
      ["fdc:oats", "Oats"],
      ["gtin:milk", "Milk"],
    ]);

    // An ingredient logged earlier, then replaced by the recipe built from it.
    const ingredientEventId = await logFoodConsumption(
      "fdc:oats",
      "50 g",
      "breakfast",
      190,
      6.5,
      3.5,
      33.5,
      day
    );
    // Save + log through the real store actions. The store derives the frozen
    // headline AND the snapshot rows itself from the ingredient panels/names
    // (via the resolvers) — the test never calls the derivation helpers.
    const recipeId = await saveRecipe({ name: "Oatmeal", ingredients: refs });
    await logRecipeConsumption(
      recipeId,
      refs,
      1,
      (ref) => panels.get(ref),
      (ref) => names.get(ref),
      "breakfast",
      day
    );
    // logRecipeConsumption logs only — Consolidate's retraction is a separate act.
    await retractConsumptionEvent(ingredientEventId, recipeId);

    const events = computeConsumption(asLedger([...twinDatoms, ...appended]));
    // Retraction hides the replaced ingredient event — only the recipe remains.
    expect(events).toHaveLength(1);
    const recipeEvent = events[0];
    // (a) The store froze the headline into event/metrics.
    expect(recipeEvent).toMatchObject({
      target: recipeId,
      foodName: "Oatmeal",
    });
    expect({
      calories: recipeEvent.calories,
      protein: recipeEvent.protein,
      fat: recipeEvent.fat,
      carbs: recipeEvent.carbs,
    }).toEqual(headline);
    // (b) The store wrote a self-contained event/instantiation snapshot: the
    // template it was seeded from, the yield, and per-row frozen macros with the
    // ingredient name denormalized for display resilience.
    expect(recipeEvent.instantiation).toEqual({
      based_on: recipeId,
      yield: 1,
      ingredients: [
        {
          ref: "fdc:oats",
          name: "Oats",
          amount: 50,
          unit: "g",
          calories: 190,
          protein: 6.5,
          fat: 3.5,
          carbs: 33.5,
        },
        {
          ref: "gtin:milk",
          name: "Milk",
          amount: 200,
          unit: "g",
          calories: 128,
          protein: 6.8,
          fat: 7.2,
          carbs: 9.4,
        },
      ],
    });
    // (c) The per-row macros sum to the headline event/metrics (yield 1).
    const rows = recipeEvent.instantiation!.ingredients;
    for (const key of ["calories", "protein", "fat", "carbs"] as const) {
      const rowSum = rows.reduce((a, r) => a + r[key], 0);
      expect(roundFood(rowSum)).toBe(headline[key]);
    }

    // (d) A later template edit re-seeds only future logs — the logged event's
    // frozen headline and snapshot never move.
    const templateEdit = [
      {
        entity: recipeId,
        attribute: "recipe/ingredients",
        value: [{ ref: "fdc:oats", amount: 500, unit: "g" }],
        time: day.getTime() + 1000,
      },
      {
        entity: recipeId,
        attribute: "recipe/yield",
        value: 4,
        time: day.getTime() + 1000,
      },
    ];
    const afterTemplateEdit = computeConsumption(
      asLedger([...twinDatoms, ...appended, ...templateEdit])
    ).find((e) => e.target === recipeId)!;
    expect(afterTemplateEdit.calories).toBe(318);
    expect(afterTemplateEdit.instantiation).toEqual(recipeEvent.instantiation);

    // (e) Correcting an ingredient twin (a newer, different panel + rename) leaves
    // the already-logged instantiation and headline untouched.
    const correction = [
      {
        entity: "fdc:oats",
        attribute: "nutrition/info",
        value: { ...oatsPanel, calories: 9999 },
        time: day.getTime() + 2000,
      },
      {
        entity: "fdc:oats",
        attribute: "food/name",
        value: "Steel-cut oats",
        time: day.getTime() + 2000,
      },
    ];
    const afterCorrection = computeConsumption(
      asLedger([...twinDatoms, ...appended, ...correction])
    ).find((e) => e.target === recipeId)!;
    expect(afterCorrection.calories).toBe(318);
    expect(afterCorrection.instantiation).toEqual(recipeEvent.instantiation);

    // (f) Even if the ingredient twins vanish from the stream entirely (deleted),
    // the snapshot's breakdown — names and macros — survives self-contained.
    const withoutTwins = computeConsumption(asLedger([...appended])).find(
      (e) => e.target === recipeId
    )!;
    expect(withoutTwins.instantiation).toEqual(recipeEvent.instantiation);
  });

  it("keeps a >1-yield instantiation self-describing: its rows ÷ its own yield reconstruct the stored headline", async () => {
    const appended = captureAppends();
    const day = new Date("2026-05-31T12:00:00");

    // A double batch (yield 2): the snapshot rows are the batch as cooked, while
    // the headline event/metrics is that batch ÷ yield. The two are reconciled
    // by the snapshot's OWN `yield`, so the event stays self-describing without
    // the template.
    const oatsPanel = {
      serving_size: "100 g",
      calories: 380,
      protein_content: 13,
      fat_content: 7,
      carbohydrate_content: 67,
    };
    const refs: ReferenceIngredient[] = [
      { ref: "fdc:oats", amount: 200, unit: "g" },
    ];
    const recipeId = await saveRecipe({
      name: "Batch oats",
      ingredients: refs,
      yield: 2,
    });
    await logRecipeConsumption(
      recipeId,
      refs,
      2,
      () => oatsPanel,
      () => "Oats",
      "breakfast",
      day
    );

    const event = computeConsumption(asLedger([...appended])).find(
      (e) => e.target === recipeId
    )!;
    const inst = event.instantiation!;
    expect(inst.yield).toBe(2);

    // Reconstruct the per-serving headline from the snapshot alone, applying the
    // snapshot's own yield with deriveRecipeNutrition's per-field rounding. It
    // must equal the frozen event/metrics — proving AC4's row↔headline relation
    // holds at any yield, not just yield 1.
    const y = inst.yield;
    const sum = inst.ingredients.reduce(
      (a, r) => ({
        calories: a.calories + r.calories,
        protein: a.protein + r.protein,
        fat: a.fat + r.fat,
        carbs: a.carbs + r.carbs,
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );
    expect({
      calories: Math.round(sum.calories / y),
      protein: Math.round((sum.protein / y) * 10) / 10,
      fat: Math.round((sum.fat / y) * 10) / 10,
      carbs: Math.round((sum.carbs / y) * 10) / 10,
    }).toEqual({
      calories: event.calories,
      protein: event.protein,
      fat: event.fat,
      carbs: event.carbs,
    });
  });

  // ---- Full-breakdown freeze + day total (ADR-0030 / #28) -------------------

  // A reputable per-100g panel with macros + a spread of extras + a micronutrient.
  const OATS_FULL: NutritionInfo = {
    serving_size: "100 g",
    calories: 380,
    protein_content: 13,
    fat_content: 7,
    carbohydrate_content: 67,
    fiber_content: 10,
    sodium_content: 0.006,
    iron: 0.0047,
  };

  it("freezes a logged food's full panel (scaled to amount) into event/metrics; the four-macro headline is unchanged", async () => {
    const appended = captureAppends();
    // 150 g of a per-100g food → ×1.5, exactly what LogFoodSheet computes.
    const breakdown = scaleNutrition(OATS_FULL, 150 / 100);
    await logFoodConsumption(
      "fdc:oats",
      "150g",
      "breakfast",
      breakdown.calories,
      breakdown.protein,
      breakdown.fat,
      breakdown.carbs,
      new Date("2026-05-31T12:00:00"),
      undefined,
      breakdown
    );

    const events = computeConsumption(asLedger(appended));
    expect(events).toHaveLength(1);
    // Headline (flat fields) unchanged — the four macros the dashboard reads.
    expect(events[0]).toMatchObject({
      calories: 570,
      protein: 19.5,
      fat: 10.5,
      carbs: 100.5,
    });
    // The frozen metrics blob carries the WHOLE panel scaled: headline + extras
    // under their panel names, and nothing the food didn't report.
    expect(events[0].metrics).toEqual({
      calories: 570,
      protein: 19.5,
      fat: 10.5,
      carbs: 100.5,
      fiber_content: 15,
      sodium_content: 0.009,
      iron: 0.007, // 0.0047 × 1.5 = 0.00705 → 0.007 at 3 dp
    });
  });

  it("the day total sums a non-macro nutrient (fibre, sodium) across the day's events", async () => {
    const appended = captureAppends();
    const day = new Date("2026-05-31T12:00:00");
    const oats = scaleNutrition(OATS_FULL, 50 / 100); // ×0.5
    const berries = scaleNutrition(
      {
        serving_size: "100 g",
        calories: 57,
        protein_content: 0.7,
        fat_content: 0.3,
        carbohydrate_content: 14,
        fiber_content: 2.4,
      },
      1
    );

    for (const [target, b] of [
      ["fdc:oats", oats],
      ["fdc:berries", berries],
    ] as const) {
      await logFoodConsumption(
        target,
        "portion",
        "breakfast",
        b.calories,
        b.protein,
        b.fat,
        b.carbs,
        day,
        undefined,
        b
      );
    }

    const total = totalNutrition(computeConsumption(asLedger(appended)));
    // Macros total as before.
    expect(total.calories).toBe(247); // 190 + 57
    // Fibre summed across BOTH events; sodium came only from the oats.
    expect(total.fiber_content).toBe(7.4); // 5 + 2.4
    expect(total.sodium_content).toBe(0.003); // oats only
  });

  it("projects a pre-change four-macro event without inventing zeros, and the day total reflects only what each event froze", async () => {
    const appended = captureAppends();
    const day = new Date("2026-05-31T12:00:00");
    // (1) A pre-change food: logged the old way, four macros, NO breakdown arg.
    await logFoodConsumption(
      "fdc:legacy",
      "150g",
      "lunch",
      134,
      1.7,
      0.5,
      34.2,
      day
    );
    // (2) A new food carrying fibre.
    const full = scaleNutrition(OATS_FULL, 0.5);
    await logFoodConsumption(
      "fdc:oats",
      "50g",
      "lunch",
      full.calories,
      full.protein,
      full.fat,
      full.carbs,
      day,
      undefined,
      full
    );

    const events = computeConsumption(asLedger(appended));
    const legacy = events.find((e) => e.target === "fdc:legacy")!;
    // The legacy event froze exactly four macros — no fabricated extras.
    expect(legacy.metrics).toEqual({
      calories: 134,
      protein: 1.7,
      fat: 0.5,
      carbs: 34.2,
    });

    const total = totalNutrition(events);
    // Fibre is the new event's value ALONE — the legacy event contributes no
    // zero, so the day total is never diluted by an un-measured nutrient.
    expect(total.fiber_content).toBe(5);
    // A nutrient neither event froze stays absent, not 0.
    expect("cholesterol_content" in total).toBe(false);
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
