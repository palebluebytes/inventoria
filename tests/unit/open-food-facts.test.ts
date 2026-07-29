import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapOffProductToPayload,
  lookupBarcode,
  ProductNotFoundError,
  submitToOpenFoodFacts,
  type OFFProduct,
} from "../../src/lib/food/open-food-facts";
import nutellaProduct from "./support/fixtures/off-nutella.json";

// Seam 1 (ADR-0016 isolated-Mapper contract): feed the mapper a saved copy of a
// real Open Food Facts v3 product response and assert the emitted
// `nutrition/info` panel. The fixture is a real captured response, so the
// mapping meets the real field shape — including OFF's quirk that `sodium_100g`
// (0.0428 g) is a separate value from `salt_100g`.

const nutella = nutellaProduct as unknown as OFFProduct;

describe("mapOffProductToPayload", () => {
  it("maps barcode to entity id with gtin: prefix", () => {
    expect(mapOffProductToPayload(nutella).entity).toBe("gtin:3017620422003");
  });

  it("maps product_name to food/name", () => {
    expect(mapOffProductToPayload(nutella).attributes["food/name"]).toBe(
      "Nutella"
    );
  });

  it("emits the nutrition/info panel from the real per-100g nutriments", () => {
    // Nutella carries every macro except fiber, so fiber_content is absent;
    // sodium is OFF's own 0.0428 g, not the salt figure (0.107 g). The fixture's
    // `*_100g` micronutriments (already in grams) map across unchanged.
    const n = mapOffProductToPayload(nutella).attributes["nutrition/info"];
    expect(n).toEqual({
      serving_size: "100 g",
      calories: 539,
      protein_content: 6.3,
      fat_content: 30.9,
      carbohydrate_content: 57.5,
      sugar_content: 56.3,
      sodium_content: 0.0428,
      saturated_fat_content: 10.6,
      calcium: 0.108,
      iron: 0.0079,
      potassium: 0.4,
      magnesium: 0.061,
      zinc: 0.0026,
      vitamin_e: 0.0067,
      vitamin_b6: 0.0002,
    });
    expect(n).not.toHaveProperty("fiber_content");
    // The fixture reports no vitamin A/C/D/B12 or folate, so those stay absent.
    expect(n).not.toHaveProperty("vitamin_a");
    expect(n).not.toHaveProperty("vitamin_c");
    expect(n).not.toHaveProperty("vitamin_d");
    expect(n).not.toHaveProperty("vitamin_b12");
    expect(n).not.toHaveProperty("folate");
  });

  it("maps trans fat, cholesterol and unsaturated (mono+poly) fat", () => {
    const product: OFFProduct = {
      ...nutella,
      product: {
        ...nutella.product,
        nutriments: {
          "trans-fat_100g": 0.2,
          cholesterol_100g: 0.01,
          "monounsaturated-fat_100g": 9.1,
          "polyunsaturated-fat_100g": 3.4,
        },
      },
    };
    const n = mapOffProductToPayload(product).attributes["nutrition/info"];
    expect(n.trans_fat_content).toBe(0.2);
    expect(n.cholesterol_content).toBe(0.01);
    expect(n.unsaturated_fat_content).toBe(12.5); // 9.1 + 3.4
  });

  it("falls back to 'Unknown' when product_name is missing", () => {
    const product: OFFProduct = {
      ...nutella,
      product: { ...nutella.product, product_name: "" },
    };
    expect(mapOffProductToPayload(product).attributes["food/name"]).toBe(
      "Unknown"
    );
  });

  it("emits only the serving basis when no nutriments are present", () => {
    const product: OFFProduct = {
      ...nutella,
      product: { ...nutella.product, nutriments: {} },
    };
    const n = mapOffProductToPayload(product).attributes["nutrition/info"];
    expect(n).toEqual({ serving_size: "100 g" });
  });

  it("maps brands to twin/brand and categories to food/category (ADR-0030)", () => {
    const attrs = mapOffProductToPayload(nutella).attributes;
    expect(attrs["twin/brand"]).toBe("Nutella, Ferrero, Yum yum");
    expect(attrs["food/category"]).toBe(
      "Breakfasts, Spreads, Sweet spreads, Hazelnut spreads, Chocolate spreads, Cocoa and hazelnuts spreads"
    );
  });

  it("maps ingredients_text to a scalar food/ingredients_text", () => {
    // Distinct from a recipe's structured recipe/ingredients references — this
    // is the raw source ingredients string (ADR-0030 §4).
    const attrs = mapOffProductToPayload(nutella).attributes;
    expect(attrs["food/ingredients_text"]).toContain("hazelnuts");
  });

  it("emits the food/assessment blob with the OFF proprietary signals", () => {
    // One atomic blob (ADR-0030 §4), mirroring nutrition/info's corrected-as-a-
    // unit granularity. Nutella carries every sub-field.
    const attrs = mapOffProductToPayload(nutella).attributes;
    expect(attrs["food/assessment"]).toEqual({
      nova_group: 4,
      nutri_score: "e",
      eco_score: "d",
      nutrient_levels: {
        fat: "high",
        salt: "low",
        sugars: "high",
        "saturated-fat": "high",
      },
      allergens: ["en:milk", "en:nuts", "en:soybeans"],
      additives: ["en:e322"],
      labels: ["en:no-gluten"],
    });
  });

  it("includes only the assessment sub-fields the product carries", () => {
    // A product with just a Nutri-Score emits an assessment holding that one
    // key — empty/absent signals are omitted, not zeroed.
    const product: OFFProduct = {
      ...nutella,
      product: {
        ...nutella.product,
        nova_group: undefined,
        ecoscore_grade: undefined,
        nutrient_levels: undefined,
        allergens_tags: [],
        additives_tags: undefined,
        labels_tags: undefined,
      },
    };
    const attrs = mapOffProductToPayload(product).attributes;
    expect(attrs["food/assessment"]).toEqual({ nutri_score: "e" });
  });

  it("omits food/assessment, twin/brand, category and ingredients when absent", () => {
    const product: OFFProduct = {
      ...nutella,
      product: {
        product_name: "Bare Product",
        nutriments: {},
      },
    };
    const attrs = mapOffProductToPayload(product).attributes;
    expect(attrs).not.toHaveProperty("food/assessment");
    expect(attrs).not.toHaveProperty("twin/brand");
    expect(attrs).not.toHaveProperty("food/category");
    expect(attrs).not.toHaveProperty("food/ingredients_text");
  });

  it("stores the raw source response as twin/raw_provenance (ADR-0016)", () => {
    // Provenance keeps the untouched OFF response — every nutriment, not just
    // the eight panel fields — so nutrients absent from the panel today can be
    // backfilled later with no network re-fetch. raw_data is the verbatim
    // fixture (the full response, including code/status/product).
    const prov =
      mapOffProductToPayload(nutella).attributes["twin/raw_provenance"];
    expect(prov.raw_data).toEqual(nutella);
  });

  it("wraps provenance in an extraction-metadata envelope", () => {
    const prov =
      mapOffProductToPayload(nutella).attributes["twin/raw_provenance"];
    expect(prov.source_uri).toBe(
      "https://world.openfoodfacts.org/api/v3/product/3017620422003.json"
    );
    expect(prov.adapter).toBe("off");
    expect(prov.adapter_version).toEqual(expect.any(String));
    // No live timestamp in the pure mapper: the ledger stamps each Datom's
    // `time` at ingest, and that IS the capture basis (keeps this deterministic).
    expect(prov).not.toHaveProperty("timestamp");
    expect(prov).not.toHaveProperty("captured_at");
  });
});

// ---- unit: lookupBarcode ---------------------------------------------------

describe("lookupBarcode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the correct Open Food Facts API URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "737628064502",
        status: "success",
        product: {
          product_name: "Test Food",
          nutriments: { "energy-kcal_100g": 100, proteins_100g: 5 },
        },
      }),
    } as Response);

    await lookupBarcode("737628064502");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://world.openfoodfacts.org/api/v3/product/737628064502.json"
    );
  });

  it("throws ProductNotFoundError when v3 status is 'failure'", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ status: "failure", code: "000", product: {} }),
    } as Response);

    await expect(lookupBarcode("000")).rejects.toThrow(ProductNotFoundError);
  });

  it("throws ProductNotFoundError when legacy v2 status is 0", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ status: 0, code: "000", product: {} }),
    } as Response);

    await expect(lookupBarcode("000")).rejects.toThrow(ProductNotFoundError);
  });

  it("throws ProductNotFoundError on HTTP 404 (unknown barcode)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    await expect(lookupBarcode("9999999")).rejects.toThrow(
      ProductNotFoundError
    );
  });

  it("returns a valid EntityPayload on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "737628064502",
        status: "success",
        product: {
          product_name: "Test Food",
          nutriments: { "energy-kcal_100g": 100, proteins_100g: 5 },
        },
      }),
    } as Response);

    const payload = await lookupBarcode("737628064502");
    expect(payload.entity).toBe("gtin:737628064502");
    expect(payload.attributes["food/name"]).toBe("Test Food");
  });
});

// ---- unit: submitToOpenFoodFacts -------------------------------------------

describe("submitToOpenFoodFacts", () => {
  it("simulates successfully submitting manual product details", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await submitToOpenFoodFacts("3017620422003", {
      name: "Nutella",
      calories: 539,
      protein: 6.3,
      fat: 30.9,
      carbs: 57.5,
    });

    expect(result).toBe(true);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "submitToOpenFoodFacts called for barcode: 3017620422003"
      ),
      expect.any(Object)
    );
    infoSpy.mockRestore();
  });
});
