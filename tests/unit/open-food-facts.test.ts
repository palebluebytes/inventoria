import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapOffProductToPayload,
  lookupBarcode,
  ProductNotFoundError,
  type OFFProduct,
} from "../../src/lib/food/open-food-facts";

// ---- unit: mapOffProductToPayload ----------------------------------------

describe("mapOffProductToPayload", () => {
  const baseProduct: OFFProduct = {
    code: "3017620422003",
    product: {
      product_name: "Nutella",
      nutriments: {
        "energy-kcal_100g": 539,
        proteins_100g: 6.3,
        fat_100g: 30.9,
        carbohydrates_100g: 57.5,
      },
    },
    status: 1,
  };

  it("maps barcode to entity id with gtin: prefix", () => {
    const payload = mapOffProductToPayload(baseProduct);
    expect(payload.entity).toBe("gtin:3017620422003");
  });

  it("maps product_name to food/name", () => {
    const payload = mapOffProductToPayload(baseProduct);
    expect(payload.attributes["food/name"]).toBe("Nutella");
  });

  it("maps energy-kcal to food/calories as string", () => {
    const payload = mapOffProductToPayload(baseProduct);
    expect(payload.attributes["food/calories"]).toBe("539 kcal");
  });

  it("maps proteins to food/protein as string", () => {
    const payload = mapOffProductToPayload(baseProduct);
    expect(payload.attributes["food/protein"]).toBe("6.3 g");
  });

  it("maps fat to food/fat", () => {
    const payload = mapOffProductToPayload(baseProduct);
    expect(payload.attributes["food/fat"]).toBe("30.9 g");
  });

  it("maps carbohydrates to food/carbs", () => {
    const payload = mapOffProductToPayload(baseProduct);
    expect(payload.attributes["food/carbs"]).toBe("57.5 g");
  });

  it("falls back to 'Unknown' when product_name is missing", () => {
    const product: OFFProduct = {
      ...baseProduct,
      product: { ...baseProduct.product, product_name: "" },
    };
    const payload = mapOffProductToPayload(product);
    expect(payload.attributes["food/name"]).toBe("Unknown");
  });

  it("falls back to '0 kcal' when energy is missing", () => {
    const product: OFFProduct = {
      ...baseProduct,
      product: {
        ...baseProduct.product,
        nutriments: {} as any,
      },
    };
    const payload = mapOffProductToPayload(product);
    expect(payload.attributes["food/calories"]).toBe("0 kcal");
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
        status: 1,
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

  it("throws ProductNotFoundError when status is 0", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ status: 0, code: "000", product: {} }),
    } as Response);

    await expect(lookupBarcode("000")).rejects.toThrow(ProductNotFoundError);
  });

  it("returns a valid EntityPayload on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "737628064502",
        status: 1,
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
