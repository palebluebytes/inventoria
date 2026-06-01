import type { EntityPayload } from "../ingestion/ingest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OFFNutriments {
  "energy-kcal_100g"?: number;
  proteins_100g?: number;
  fat_100g?: number;
  carbohydrates_100g?: number;
}

export interface OFFProduct {
  code: string;
  /** v3 API uses string status: "success" | "failure" */
  status: "success" | "failure" | 0 | 1;
  product: {
    product_name?: string;
    nutriments?: OFFNutriments;
  };
}

export class ProductNotFoundError extends Error {
  constructor(barcode: string) {
    super(`Product not found for barcode: ${barcode}`);
    this.name = "ProductNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

/**
 * Maps an Open Food Facts product response to an EntityPayload ready for
 * ingestion into the EAVT ledger.
 */
export function mapOffProductToPayload(product: OFFProduct): EntityPayload {
  const p = product.product;
  const n = p.nutriments ?? {};

  return {
    entity: `gtin:${product.code}`,
    attributes: {
      "food/name": p.product_name || "Unknown",
      "food/calories":
        n["energy-kcal_100g"] != null
          ? `${n["energy-kcal_100g"]} kcal`
          : "0 kcal",
      "food/protein": n.proteins_100g != null ? `${n.proteins_100g} g` : "0 g",
      "food/fat": n.fat_100g != null ? `${n.fat_100g} g` : "0 g",
      "food/carbs":
        n.carbohydrates_100g != null ? `${n.carbohydrates_100g} g` : "0 g",
    },
  };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const OFF_BASE = "https://world.openfoodfacts.org/api/v3/product";

/**
 * Fetches product data from the Open Food Facts API for a given barcode and
 * returns it as an EntityPayload.
 *
 * @throws ProductNotFoundError when the product is not in the OFF database.
 */
export async function lookupBarcode(barcode: string): Promise<EntityPayload> {
  const res = await fetch(`${OFF_BASE}/${barcode}.json`);

  // v3 returns HTTP 404 for unknown barcodes (empty body), catch it first
  if (!res.ok) {
    throw new ProductNotFoundError(barcode);
  }

  const data: OFFProduct = await res.json();

  // v3 uses string "failure"; v2 used integer 0 — handle both
  if (data.status === "failure" || data.status === 0) {
    throw new ProductNotFoundError(barcode);
  }

  return mapOffProductToPayload(data);
}

// ---------------------------------------------------------------------------
// V2 STUB: Submit to Open Food Facts
// ---------------------------------------------------------------------------

/**
 * V2 Feature Stub: Submits manually entered product data back to the Open Food
 * Facts database to contribute to the global dataset.
 */
export async function submitToOpenFoodFacts(
  barcode: string,
  details: {
    name: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  }
): Promise<boolean> {
  console.info(
    `[V2 STUB] submitToOpenFoodFacts called for barcode: ${barcode}`,
    details
  );

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  // In a real implementation, this would use the OFF v3 product write API
  // https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-write/
  console.info("[V2 STUB] Successfully simulated submission to OFF.");

  return true;
}
