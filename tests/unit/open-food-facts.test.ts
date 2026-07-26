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
    // Real Nutella carries every field except fiber, so fiber_content is
    // absent; sodium is OFF's own 0.0428 g, not the salt figure (0.107 g).
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
    });
    expect(n).not.toHaveProperty("fiber_content");
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
