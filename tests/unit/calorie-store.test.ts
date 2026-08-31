import { describe, it, expect, vi, beforeEach } from "vitest";
import { dbClient } from "../../src/lib/db/db.client";
import {
  getDayBounds,
  logFoodConsumption,
  saveCustomFood,
  saveLabelFood,
  getLocalFoodTwin,
  saveRecipe,
  logRecipeConsumption,
  correctInstantiation,
  retractConsumptionEvent,
  type ConsumptionEvent,
  changeLoggedFoodAmount,
  consumptionForDay,
  copyPastMeal,
} from "../../src/lib/stores/calorie.store";
import type { CopyableEvent } from "../../src/lib/food/past-meals";
import type { NutritionInfo, Portion } from "../../src/lib/food/nutrition";
import { buildLabelCapture } from "../../src/lib/food/provenance";
import {
  computeConsumption,
  totalNutrition,
} from "../../src/lib/food/consumption-state";
import type { ReferenceIngredient } from "../../src/lib/food/recipe-nutrition";
import {
  basisUnit,
  parseBasisQuantity,
  roundFood,
  scaleNutrition,
} from "../../src/lib/food/nutrition";
import { buildLabelPanel } from "../../src/lib/food/label-form";
import { parseLoggedQuantity } from "../../src/lib/food/recipe-ingredient";
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

describe("saveLabelFood (ADR-0034 §6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // Captures the datoms a save appends, then folds them back through the SAME
  // latest-wins read the app uses (getLocalFoodTwin), so the tests assert
  // external behaviour — the twin a fold yields — never a private write shape.
  function captureAppends() {
    const appended: any[] = [];
    vi.spyOn(dbClient, "append").mockImplementation(async (d: any) => {
      appended.push(...d);
    });
    return appended;
  }
  // getLocalFoodTwin JSON-parses each row's value; datoms carry plain values, so
  // re-encode them exactly as the ledger would return them, in ascending order.
  const asRows = (datoms: any[]) =>
    datoms.map((d) => ({
      attribute: d.attribute,
      value: JSON.stringify(d.value),
    }));

  const PANEL: NutritionInfo = {
    serving_size: "100 g",
    calories: 250,
    protein_content: 15,
    fat_content: 8,
    carbohydrate_content: 30,
    iron: 0.0026,
    // vitamin_b12 deliberately ABSENT — a row the label didn't carry. It must
    // stay absent in the fold, never written as 0 (ADR-0030 / #28).
  };
  const PORTIONS: Portion[] = [
    { label: "1 cup", amount: 1, unit: "cup", grams: 60 },
  ];
  const CAPTURE = buildLabelCapture({
    method: "manual",
    basis: "100 g",
    fields: ["name", "nutriments", "portions"],
  });

  it("mints a food:custom_ twin with the full panel, brand, portions, photos array + photo_base64 mirror, and label_capture", async () => {
    const appended = captureAppends();

    const id = await saveLabelFood({
      name: "Homemade Granola",
      brand: "Acme",
      category: "en:granolas",
      ingredientsText: "Oats, honey, almonds",
      nutrition: PANEL,
      portions: PORTIONS,
      labelPhotos: [
        "data:image/png;base64,front",
        "data:image/png;base64,back",
      ],
      labelCapture: CAPTURE,
    });

    // Barcode-less → a minted custom twin, and a single plain append (no RMW).
    expect(id).toMatch(/^food:custom_/);
    expect(dbClient.append).toHaveBeenCalledTimes(1);

    vi.spyOn(dbClient, "query").mockResolvedValue(asRows(appended) as any);
    const twin = await getLocalFoodTwin(id);

    expect(twin.attributes["food/name"]).toBe("Homemade Granola");
    expect(twin.attributes["twin/brand"]).toBe("Acme");
    expect(twin.attributes["food/category"]).toBe("en:granolas");
    // Canonical OFF ingredients (ADR-0043 §5) — NOT `food/ingredients`.
    expect(twin.attributes["food/ingredients_text"]).toBe(
      "Oats, honey, almonds"
    );
    expect(twin.attributes["nutrition/info"]).toEqual(PANEL);
    expect(twin.attributes["food/portions"]).toEqual(PORTIONS);
    expect(twin.attributes["food/label_photos"]).toEqual([
      "data:image/png;base64,front",
      "data:image/png;base64,back",
    ]);
    // The singular photo mirrors the first of the array (§5 display-compat).
    expect(twin.attributes["food/photo_base64"]).toBe(
      "data:image/png;base64,front"
    );
    expect(twin.attributes["food/label_capture"]).toEqual(CAPTURE);

    // absent ≠ 0 — an untouched micro key is omitted, never stored as 0.
    expect("vitamin_b12" in twin.attributes["nutrition/info"]).toBe(false);
    expect(twin.attributes["nutrition/info"].iron).toBe(0.0026);
  });

  it("enriches a found-but-poor gtin: twin in place — the correction wins the fold while OFF's raw_provenance survives beside the new label_capture", async () => {
    // A poor OFF twin already on the ledger: a blank-ish name, a thin panel, and
    // OFF's own raw_provenance blob.
    const offProvenance = {
      raw_data: { code: "8410010812345", product_name: "Aceite" },
      source_uri:
        "https://world.openfoodfacts.org/api/v2/product/8410010812345.json",
      adapter: "off",
      adapter_version: "3",
    };
    const poorOff = [
      { attribute: "food/name", value: JSON.stringify("Unknown") },
      {
        attribute: "nutrition/info",
        value: JSON.stringify({ serving_size: "100 g", calories: 800 }),
      },
      {
        attribute: "twin/raw_provenance",
        value: JSON.stringify(offProvenance),
      },
    ];

    const appended = captureAppends();
    const corrected: NutritionInfo = {
      serving_size: "100 g",
      calories: 92,
      protein_content: 0,
      fat_content: 100,
      carbohydrate_content: 0,
    };
    const capture = buildLabelCapture({
      method: "manual",
      basis: "100 g",
      fields: ["name", "nutriments"],
    });

    const returned = await saveLabelFood({
      name: "Extra Virgin Olive Oil",
      nutrition: corrected,
      labelPhotos: ["data:image/png;base64,front"],
      labelCapture: capture,
      entityId: "gtin:8410010812345",
    });

    // The passed gtin: is used verbatim — no fresh food:custom_ id minted.
    expect(returned).toBe("gtin:8410010812345");
    expect(dbClient.append).toHaveBeenCalledTimes(1);

    // Fold poor-OFF (earlier) then the correction (later) in ascending order.
    vi.spyOn(dbClient, "query").mockResolvedValue([
      ...poorOff,
      ...asRows(appended),
    ] as any);
    const twin = await getLocalFoodTwin("gtin:8410010812345");

    // Latest-wins: the user's name + panel supersede the poor OFF values.
    expect(twin.attributes["food/name"]).toBe("Extra Virgin Olive Oil");
    expect(twin.attributes["nutrition/info"]).toEqual(corrected);
    // OFF's provenance is NOT clobbered — the sibling attributes coexist.
    expect(twin.attributes["twin/raw_provenance"]).toEqual(offProvenance);
    expect(twin.attributes["food/label_capture"]).toEqual(capture);
  });

  it("writes no photo attributes for a photo-less manual entry (empty labelPhotos, §5)", async () => {
    const appended = captureAppends();

    await saveLabelFood({
      name: "Grandma's Dal",
      nutrition: PANEL,
      labelPhotos: [],
      labelCapture: CAPTURE,
    });

    expect(
      appended.find((d) => d.attribute === "food/label_photos")
    ).toBeUndefined();
    expect(
      appended.find((d) => d.attribute === "food/photo_base64")
    ).toBeUndefined();
    // The label_capture provenance is still written — a manual entry has origin.
    expect(
      appended.find((d) => d.attribute === "food/label_capture")?.value
    ).toEqual(CAPTURE);
  });

  it("appends no food/ingredients_text datom when the field is absent or whitespace (ADR-0043 §5 suppress-when-empty)", async () => {
    const appended = captureAppends();

    // Absent field — nothing to write back, so no blank datom appended.
    await saveLabelFood({
      name: "No Ingredients",
      nutrition: PANEL,
      labelPhotos: [],
      labelCapture: CAPTURE,
    });
    // Whitespace-only field — still suppressed (an untouched read-along field).
    await saveLabelFood({
      name: "Blank Ingredients",
      ingredientsText: "   ",
      nutrition: PANEL,
      labelPhotos: [],
      labelCapture: CAPTURE,
    });

    expect(
      appended.find((d) => d.attribute === "food/ingredients_text")
    ).toBeUndefined();
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

    const newId = await changeLoggedFoodAmount(
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

    // The replacement's id comes back so a caller holding the retracted id (the
    // dashboard's selection) can follow the food to its new event.
    expect(newId).toBe(newDatoms[0].entity);
    expect(
      retract.find((d) => d.attribute === "event/replaced_by")?.value
    ).toBe(newId);
  });

  it("re-logs a drink in its panel's own unit, never as a gram weight", async () => {
    // The twin already resolved here declares the unit, so the edit path reads
    // it off `serving_size` (ADR-0060 §1) — otherwise a drink corrected on the
    // amount picker comes back spelled as a weight it was never measured in,
    // and goes uneditable once the amount screen starts naming its unit.
    // Nothing converts: 330 against the panel's own 100 is the same division a
    // gram basis gets (§2).
    const COLA_PANEL: NutritionInfo = {
      serving_size: "100 ml",
      calories: 42,
      carbohydrate_content: 10.6,
    };
    vi.spyOn(dbClient, "query").mockResolvedValue([
      { attribute: "nutrition/info", value: JSON.stringify(COLA_PANEL) },
    ]);
    const mockAppend = vi
      .spyOn(dbClient, "append")
      .mockResolvedValue(undefined);

    const cola: ConsumptionEvent = {
      id: "event:consume_old",
      target: "gtin:cola",
      quantity: "500ml",
      meal_type: "lunch",
      time: new Date("2026-05-31T12:00:00").getTime(),
    };
    await changeLoggedFoodAmount(cola, 330);

    const newDatoms = mockAppend.mock.calls[0][0];
    expect(newDatoms.find((d) => d.attribute === "event/quantity")?.value).toBe(
      "330ml"
    );
    expect(
      newDatoms.find((d) => d.attribute === "event/metrics")?.value
    ).toMatchObject({ calories: 138.6, carbs: 34.98 });
  });

  it("no-ops when the twin carries no nutrition panel (can't re-derive)", async () => {
    vi.spyOn(dbClient, "query").mockResolvedValue([] as any);
    const mockAppend = vi
      .spyOn(dbClient, "append")
      .mockResolvedValue(undefined);

    const newId = await changeLoggedFoodAmount(
      { id: "event:x", target: "fdc:ghost", quantity: "50g", time: 0 } as any,
      100
    );

    expect(mockAppend).not.toHaveBeenCalled();
    // null, not a fabricated id: the food was left exactly as it was.
    expect(newId).toBeNull();
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
      iron: 0.00705, // 0.0047 × 1.5 — kept at micronutrient precision, not 3 dp
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

  it("projects a macro-only event (no breakdown arg) without inventing zeros, and the day total reflects only what each event froze", async () => {
    const appended = captureAppends();
    const day = new Date("2026-05-31T12:00:00");
    // (1) A macro-only food: logged with four macros and NO breakdown arg (a
    // custom food carries no source panel).
    await logFoodConsumption(
      "fdc:macro_only",
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
    const macroOnly = events.find((e) => e.target === "fdc:macro_only")!;
    // The macro-only event froze exactly four macros — no fabricated extras.
    expect(macroOnly.metrics).toEqual({
      calories: 134,
      protein: 1.7,
      fat: 0.5,
      carbs: 34.2,
    });

    const total = totalNutrition(events);
    // Fibre is the new event's value ALONE — the macro-only event contributes no
    // zero, so the day total is never diluted by an un-measured nutrient.
    expect(total.fiber_content).toBe(5);
    // A nutrient neither event froze stays absent, not 0.
    expect("cholesterol_content" in total).toBe(false);
  });
});

// Regression: after the OFF update flow (saveLabelFood on a gtin: twin), tapping
// the food used to reopen the full updater seeded ONLY from the event's four
// frozen macros — dropping the basis and the rest of the panel. The fix routes
// such a food to the shared amount screen, rebuilt from the TWIN. This proves
// everything that screen needs is recoverable from the twin.
//
// The capture is per 100 ml here because that is now the shape the form writes:
// its toggle offers only the two per-100 bases (ADR-0060's 2026-08-30
// Amendment), so a captured panel always names the divisor the amount screen
// scales by. `servingSizeGrams` / `servingSizePortion`, which the per-serving
// version of this test also exercised, are covered directly in nutrition.test.ts.
describe("label-food edit is lossless (basis + panel survive on the twin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  const asLedger = (datoms: any[]) =>
    asStored(datoms.map((d) => ({ ...d, value: JSON.stringify(d.value) })));
  const asRows = (datoms: any[]) =>
    datoms.map((d) => ({
      attribute: d.attribute,
      value: JSON.stringify(d.value),
    }));

  it("recovers the corrected name, the millilitre basis and the full panel", async () => {
    const appended: any[] = [];
    vi.spyOn(dbClient, "append").mockImplementation(async (d: any) => {
      appended.push(...d);
    });

    // The user set name "Peanut Butter" and read the label per 100 ml.
    const panel = buildLabelPanel({
      values: {
        calories: "190",
        protein_content: "7",
        fat_content: "16",
        carbohydrate_content: "6",
      },
      basis: "per_100ml",
      skipped: new Set(),
    }).nutrition;

    // A poor OFF twin already on the ledger; the correction enriches it in place.
    const gtin = "gtin:8410010812345";
    appended.push(
      { entity: gtin, attribute: "food/name", value: "Unknown", time: 1 },
      {
        entity: gtin,
        attribute: "nutrition/info",
        value: { serving_size: "100 g", calories: 800 },
        time: 1,
      }
    );

    const twinId = await saveLabelFood({
      name: "Peanut Butter",
      nutrition: panel,
      portions: [],
      labelPhotos: [],
      labelCapture: buildLabelCapture({
        method: "manual",
        basis: "100 ml",
        fields: ["name", "nutriments"],
      }),
      entityId: gtin,
    });
    await logFoodConsumption(
      twinId,
      "100ml",
      "snack",
      190,
      7,
      16,
      6,
      new Date("2026-08-01T12:00:00")
    );

    // The dashboard's view of the logged food: a millilitre event named right.
    const ev = computeConsumption(asLedger(appended)).find(
      (e) => e.target === gtin
    )!;
    expect(parseLoggedQuantity(ev.quantity!)).toEqual({
      amount: 100,
      unit: "ml",
    });
    expect(ev.foodName).toBe("Peanut Butter");

    // editItem re-loads the twin to build the amount screen — the fix. Everything
    // the old event-only seed dropped is recoverable here.
    vi.spyOn(dbClient, "query").mockResolvedValue(asRows(appended) as any);
    const twin = await getLocalFoodTwin(gtin);
    const twinPanel = twin.attributes["nutrition/info"] as NutritionInfo;

    // The basis drives the amount routing: the unit the screen enters in, and
    // the divisor it scales by — neither of them recoverable from the event.
    expect(basisUnit(twinPanel.serving_size)).toBe("ml");
    expect(parseBasisQuantity(twinPanel.serving_size)).toBe(100);
    // The corrected name won the fold; the full panel is intact (not 4 macros only).
    expect(twin.attributes["food/name"]).toBe("Peanut Butter");
    expect(twinPanel.calories).toBe(190);
    expect(twinPanel.protein_content).toBe(7);
    expect(twinPanel.fat_content).toBe(16);
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

describe("copyPastMeal (ADR-0058)", () => {
  const appendMock = dbClient.append as unknown as ReturnType<typeof vi.fn>;

  /** A logged entry as `foldConsumptionEvents` hands one back. */
  function logged(over: Partial<CopyableEvent> = {}): CopyableEvent {
    return {
      id: "event:consume_src",
      time: new Date("2026-08-20T08:14:00").getTime(),
      type: "ConsumeAction",
      target: "fdc:oats",
      quantity: "60g",
      meal_type: "breakfast",
      foodName: "Oats, raw",
      calories: 233,
      protein: 8.1,
      fat: 4.2,
      carbs: 39.6,
      ...over,
    } as CopyableEvent;
  }

  /** The attribute map of the one entity appended by a call. */
  function appendedAttributes(call: number): Record<string, any> {
    const datoms = appendMock.mock.calls[call][0] as any[];
    const attrs: Record<string, any> = {};
    for (const d of datoms) attrs[d.attribute] = d.value;
    return attrs;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    appendMock.mockResolvedValue(undefined);
  });

  // §2 — a copy that silently changed how much you ate would not be a copy.
  it("carries the amount across exactly as logged", async () => {
    await copyPastMeal(
      [logged({ quantity: "63.5g" })],
      "breakfast",
      new Date()
    );
    expect(appendedAttributes(0)["event/quantity"]).toBe("63.5g");
  });

  // §10 — a copied entry takes now's clock on the day being viewed, not the
  // day it was originally eaten.
  it("stamps the viewed day, not the source day", async () => {
    const viewed = new Date("2026-08-26T00:00:00");
    await copyPastMeal([logged()], "breakfast", viewed);
    const when = new Date(appendMock.mock.calls[0][0][0].time);
    expect(when.getFullYear()).toBe(2026);
    expect(when.getMonth()).toBe(7);
    expect(when.getDate()).toBe(26);
    expect(when.getHours()).not.toBe(8); // not the source's 08:14
  });

  // §4 — a past breakfast copied into breakfast, never into another meal.
  it("logs into the meal it was asked for", async () => {
    await copyPastMeal([logged()], "breakfast", new Date());
    expect(appendedAttributes(0)["event/meal_type"]).toBe("breakfast");
  });

  // §1 — wholesale: every food in the meal, one event each.
  it("logs one event per food in the meal", async () => {
    await copyPastMeal(
      [
        logged({ id: "a", target: "fdc:oats", foodName: "Oats" }),
        logged({ id: "b", target: "fdc:milk", foodName: "Milk" }),
        logged({ id: "c", target: "fdc:banana", foodName: "Banana" }),
      ],
      "breakfast",
      new Date()
    );
    expect(appendMock).toHaveBeenCalledTimes(3);
    expect([0, 1, 2].map((i) => appendedAttributes(i)["event/target"])).toEqual(
      ["fdc:oats", "fdc:milk", "fdc:banana"]
    );
  });

  // §11 / ADR-0035 §7 — an absent macro stays absent. A manual entry froze
  // calories only, and copying it must not invent three zeroes.
  it("leaves a macro the source never froze out of the copy", async () => {
    await copyPastMeal(
      [
        logged({
          foodName: "Canteen jacket potato",
          quantity: "1 serving",
          calories: 520,
          protein: undefined,
          fat: undefined,
          carbs: undefined,
        }),
      ],
      "lunch",
      new Date()
    );
    const metrics = appendedAttributes(0)["event/metrics"];
    expect(metrics.calories).toBe(520);
    expect(metrics).not.toHaveProperty("protein");
    expect(metrics).not.toHaveProperty("fat");
    expect(metrics).not.toHaveProperty("carbs");
  });

  // §9 — the frozen snapshot travels as it was cooked. Re-deriving it from a
  // since-edited template would log something the user did not eat.
  it("copies a recipe serving's instantiation verbatim", async () => {
    const instantiation = {
      based_on: "recipe:bolognese",
      yield: 4,
      ingredients: [
        {
          ref: "fdc:mince",
          name: "Beef mince",
          amount: 500,
          unit: "g" as const,
          calories: 1090,
        },
      ],
    };
    await copyPastMeal(
      [
        logged({
          target: "recipe:bolognese",
          foodName: "Beef bolognese",
          quantity: "1 serving",
          instantiation: instantiation as any,
        }),
      ],
      "dinner",
      new Date()
    );
    expect(appendedAttributes(0)["event/instantiation"]).toEqual(instantiation);
  });

  // §11 — loop per item, catch per item, so one failure does not abort the run
  // half-applied. `scaleSelected`'s contract.
  it("keeps copying after one append fails, and counts it", async () => {
    appendMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("append failed"))
      .mockResolvedValueOnce(undefined);
    const result = await copyPastMeal(
      [
        logged({ id: "a", foodName: "Oats" }),
        logged({ id: "b", foodName: "Milk" }),
        logged({ id: "c", foodName: "Banana" }),
      ],
      "breakfast",
      new Date()
    );
    expect(result).toEqual({ copied: 2, lost: 1 });
    expect(appendMock).toHaveBeenCalledTimes(3);
  });

  it("reports a clean run so the caller can stay silent", async () => {
    const result = await copyPastMeal([logged()], "breakfast", new Date());
    expect(result).toEqual({ copied: 1, lost: 0 });
  });
});
